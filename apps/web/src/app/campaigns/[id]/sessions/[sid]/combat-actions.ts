"use server";
import { revalidatePath } from "next/cache";
import { createClient, getUser } from "@/lib/supabase/server";
import {
  startCombat, setPick, resolveRound, endCombat, redrawHand, seedFromString,
  type CombatState, type UnitInput, type CharacterData, type EnemyData, type Pick, type Skill, type Unit, type Effect,
} from "@limbus/rules";
import { formatRound, unitNames } from "@/lib/combat-log";
import { getCampaignRules } from "@/lib/rules";

type Json = Record<string, unknown>;

async function requireGm(campaignId: string) {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return { error: "로그인이 필요합니다" } as const;
  const { data: m } = await supabase.from("campaign_members").select("role").eq("campaign_id", campaignId).eq("user_id", user.id).maybeSingle();
  if (!m || (m.role !== "gm" && m.role !== "temp_gm")) return { error: "GM만 가능합니다" } as const;
  return { supabase, user } as const;
}

async function post(supabase: Awaited<ReturnType<typeof createClient>>, sessionId: string, sceneId: string | null, content: string, payload?: Json) {
  await supabase.from("messages").insert({ session_id: sessionId, scene_id: sceneId, kind: "system", content, payload: (payload ?? null) as never });
}

const toSkill = (s: CharacterData["skills"][number]): Skill => ({ ...s, tier: s.tier });
const fx = (list: { effects?: Effect[] }[]): Effect[] => list.flatMap((x) => x.effects ?? []);

export async function startCombatAction(campaignId: string, sessionId: string, sceneId: string, allyIds: string[], enemies: { enemyId: string; count: number }[]): Promise<{ error?: string }> {
  const g = await requireGm(campaignId); if ("error" in g) return g;
  const { supabase } = g;
  if (allyIds.length === 0) return { error: "아군 캐릭터를 고르세요" };
  if (enemies.length === 0) return { error: "적을 고르세요" };
  const [{ data: chars }, { data: foes }, { data: session }] = await Promise.all([
    supabase.from("characters").select("id, name, owner_id, portrait_url, data").in("id", allyIds),
    supabase.from("enemies").select("id, name, portrait_url, data").in("id", enemies.map((e) => e.enemyId)),
    supabase.from("sessions").select("seed").eq("id", sessionId).single(),
  ]);
  const inputs: UnitInput[] = [];
  const { rules } = await getCampaignRules(campaignId);
  for (const c of chars ?? []) {
    const d = c.data as unknown as CharacterData;
    const dice: 1 | 2 = (d.sync ?? 1) >= 3 || d.speed.dice === 2 ? 2 : 1;   // 동기화 3단계부터 속도 다이스 2개
    inputs.push({
      id: `c_${c.id}`, name: c.name, side: "ally", maxHp: d.maxHp, hp: d.hp, sanity: d.sanity, speed: { ...d.speed, dice },
      skills: [...d.skills.map(toSkill), ...(d.ego ?? []).map(toSkill)],
      passives: fx(d.traits ?? []), light: d.light ?? 0, erosion: d.erosion ?? 0,
      portraitUrl: c.portrait_url, source: { kind: "character", id: c.id, ownerId: c.owner_id },
    });
  }
  for (const spec of enemies) {
    const f = (foes ?? []).find((x) => x.id === spec.enemyId); if (!f) continue;
    const d = f.data as unknown as EnemyData;
    for (let i = 0; i < Math.max(1, Math.min(10, spec.count)); i++) {
      const suffix = spec.count > 1 ? ` ${String.fromCharCode(65 + i)}` : "";
      inputs.push({
        id: `e_${f.id}_${i}`, name: f.name + suffix, side: "enemy", maxHp: d.maxHp, hp: d.maxHp,
        sanity: d.hasSanity ? d.sanity : 0, sanityLocked: !d.hasSanity, speed: { min: d.speed.min, max: d.speed.max, dice: Math.min(2, d.speed.dice) as 1 | 2 },
        skills: d.skills.map(toSkill), resist: d.resist, passives: fx(d.gimmicks ?? []),
        portraitUrl: f.portrait_url, source: { kind: "enemy", id: f.id },
      });
    }
  }
  const seed = seedFromString(`${session?.seed ?? sessionId}:${Date.now()}`);
  const state = startCombat(inputs, seed, rules);
  const { data: row, error } = await supabase.from("combats").insert({ session_id: sessionId, scene_id: sceneId, round: state.round, phase: state.phase, state: JSON.parse(JSON.stringify(state)), rng_state: state.rngState }).select("id").single();
  if (error) return { error: error.message };
  // 캐릭터 잠금, 적 조우 기록
  await supabase.from("characters").update({ locked: true }).in("id", allyIds);
  for (const spec of enemies) for (const cid of allyIds) {
    await supabase.from("enemy_reveals").upsert({ enemy_id: spec.enemyId, character_id: cid }, { onConflict: "enemy_id,character_id", ignoreDuplicates: true });
  }
  await post(supabase, sessionId, sceneId, `── 전투 시작 ── ${inputs.filter((u) => u.side === "enemy").map((u) => u.name).join(", ")}`, { type: "combat", combatId: row.id });
  revalidatePath(`/campaigns/${campaignId}/sessions/${sessionId}`);
  return {};
}

async function loadState(supabase: Awaited<ReturnType<typeof createClient>>, combatId: string) {
  const { data } = await supabase.from("combats").select("id, session_id, scene_id, state, updated_at").eq("id", combatId).single();
  return data ? { ...data, state: data.state as unknown as CombatState } : null;
}

async function saveState(supabase: Awaited<ReturnType<typeof createClient>>, combatId: string, state: CombatState, expectUpdatedAt?: string) {
  let q = supabase.from("combats").update({ state: JSON.parse(JSON.stringify(state)), round: state.round, phase: state.phase, rng_state: state.rngState }).eq("id", combatId);
  if (expectUpdatedAt) q = q.eq("updated_at", expectUpdatedAt);
  const { data, error } = await q.select("id");
  if (error) return error.message;
  if (!data || data.length === 0) return "conflict";
  return null;
}

export async function setPickAction(campaignId: string, combatId: string, unitId: string, slot: number, pick: Pick | null): Promise<{ error?: string; state?: CombatState }> {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return { error: "로그인이 필요합니다" };
  const { data: m } = await supabase.from("campaign_members").select("role").eq("campaign_id", campaignId).eq("user_id", user.id).maybeSingle();
  const isGm = m?.role === "gm" || m?.role === "temp_gm";
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await loadState(supabase, combatId);
    if (!row) return { error: "전투가 없습니다" };
    const unit = row.state.units.find((u: Unit) => u.id === unitId);
    if (!unit) return { error: "유닛이 없습니다" };
    const owns = unit.source.kind === "character" && unit.source.ownerId === user.id;
    if (!owns && !isGm) return { error: "자기 캐릭터만 선택할 수 있습니다" };
    const { rules } = await getCampaignRules(campaignId);
    const err = setPick(row.state, unitId, slot, pick, rules);
    if (err) return { error: err };
    const r = await saveState(supabase, combatId, row.state, row.updated_at);
    if (r === null) return { state: row.state };
    if (r !== "conflict") return { error: r };
  }
  return { error: "동시에 수정 중입니다. 다시 시도하세요" };
}

export async function resolveRoundAction(campaignId: string, combatId: string): Promise<{ error?: string; state?: CombatState }> {
  const g = await requireGm(campaignId); if ("error" in g) return g;
  const { supabase } = g;
  const row = await loadState(supabase, combatId);
  if (!row) return { error: "전투가 없습니다" };
  if (row.state.phase !== "select") return { error: "진행할 수 있는 단계가 아닙니다" };
  const state = row.state;
  const roundNo = state.round;
  const { rules } = await getCampaignRules(campaignId);
  const events = resolveRound(state, rules);
  const r = await saveState(supabase, combatId, state, row.updated_at);
  if (r) return { error: r === "conflict" ? "누군가 선택을 바꾸는 중입니다. 다시 눌러주세요" : r };

  const { count } = await supabase.from("combat_events").select("id", { count: "exact", head: true }).eq("combat_id", combatId);
  await supabase.from("combat_events").insert({ combat_id: combatId, seq: (count ?? 0) + 1, event: JSON.parse(JSON.stringify({ round: roundNo, events })) });

  // 적이 사용한 스킬 공개
  const used = new Map<string, Set<string>>();
  for (const e of events) {
    const pairs: [string, string][] = e.type === "clash" ? [[e.actor, e.actorSkill], [e.target, e.targetSkill]] : e.type === "attack" ? [[e.actor, e.skill]] : [];
    for (const [uid, skillName] of pairs) {
      const u = state.units.find((x) => x.id === uid);
      if (!u || u.source.kind !== "enemy") continue;
      const s = u.skills.find((x) => x.name === skillName); if (!s) continue;
      if (!used.has(u.source.id)) used.set(u.source.id, new Set());
      used.get(u.source.id)!.add(s.id);
    }
  }
  const allyCharIds = state.units.filter((u) => u.source.kind === "character").map((u) => (u.source as { id: string }).id);
  for (const [enemyId, skillIds] of used) for (const cid of allyCharIds) {
    const { data: ex } = await supabase.from("enemy_reveals").select("revealed_skills").eq("enemy_id", enemyId).eq("character_id", cid).maybeSingle();
    const merged = Array.from(new Set([...(ex?.revealed_skills ?? []), ...skillIds]));
    await supabase.from("enemy_reveals").upsert({ enemy_id: enemyId, character_id: cid, revealed_skills: merged }, { onConflict: "enemy_id,character_id" });
  }

  const lines = formatRound(events, unitNames(state));
  await post(supabase, row.session_id, row.scene_id, lines.join("\n"), { type: "round", combatId, round: roundNo });
  if (state.phase === "ended") await finish(supabase, state, allyCharIds);
  revalidatePath(`/campaigns/${campaignId}/sessions/${row.session_id}`);
  return { state };
}

async function finish(supabase: Awaited<ReturnType<typeof createClient>>, state: CombatState, allyCharIds: string[]) {
  // 체력/정신력 반영, 잠금 해제
  for (const u of state.units) {
    if (u.source.kind !== "character") continue;
    const { data: c } = await supabase.from("characters").select("data").eq("id", u.source.id).single();
    if (!c) continue;
    const d = c.data as unknown as CharacterData;
    await supabase.from("characters").update({ data: JSON.parse(JSON.stringify({ ...d, hp: u.hp, sanity: u.sanity, light: u.light, erosion: u.erosion })), locked: false }).eq("id", u.source.id);
  }
  if (allyCharIds.length) await supabase.from("characters").update({ locked: false }).in("id", allyCharIds);
}

export async function endCombatAction(campaignId: string, combatId: string): Promise<{ error?: string; state?: CombatState }> {
  const g = await requireGm(campaignId); if ("error" in g) return g;
  const { supabase } = g;
  const row = await loadState(supabase, combatId);
  if (!row) return { error: "전투가 없습니다" };
  endCombat(row.state);
  const r = await saveState(supabase, combatId, row.state);
  if (r) return { error: r };
  const allyCharIds = row.state.units.filter((u) => u.source.kind === "character").map((u) => (u.source as { id: string }).id);
  await finish(supabase, row.state, allyCharIds);
  await post(supabase, row.session_id, row.scene_id, "── 전투 종료 (GM) ──", { type: "combatEnd", combatId });
  revalidatePath(`/campaigns/${campaignId}/sessions/${row.session_id}`);
  return { state: row.state };
}

/** GM 수동 조정: 체력, 정신력, 상태 */
export async function gmAdjustUnitAction(campaignId: string, combatId: string, unitId: string, patch: { hp?: number; sanity?: number; statuses?: Unit["statuses"] }): Promise<{ error?: string; state?: CombatState }> {
  const g = await requireGm(campaignId); if ("error" in g) return g;
  const { supabase } = g;
  const row = await loadState(supabase, combatId);
  if (!row) return { error: "전투가 없습니다" };
  const u = row.state.units.find((x) => x.id === unitId); if (!u) return { error: "유닛 없음" };
  if (patch.hp !== undefined) { u.hp = Math.max(0, Math.min(u.maxHp, Math.floor(patch.hp))); u.incapacitated = u.hp <= 0; }
  if (patch.sanity !== undefined) u.sanity = Math.max(-45, Math.min(45, Math.floor(patch.sanity)));
  if (patch.statuses) u.statuses = Object.fromEntries(Object.entries(patch.statuses).filter(([, v]) => (v ?? 0) > 0));
  const r = await saveState(supabase, combatId, row.state);
  if (r) return { error: r };
  return { state: row.state };
}

/** 빛을 써서 손패 교체 (자기 캐릭터 또는 GM) */
export async function redrawHandAction(campaignId: string, combatId: string, unitId: string): Promise<{ error?: string; state?: CombatState }> {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) return { error: "로그인이 필요합니다" };
  const { data: m } = await supabase.from("campaign_members").select("role").eq("campaign_id", campaignId).eq("user_id", user.id).maybeSingle();
  const isGm = m?.role === "gm" || m?.role === "temp_gm";
  const { rules } = await getCampaignRules(campaignId);
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await loadState(supabase, combatId);
    if (!row) return { error: "전투가 없습니다" };
    const unit = row.state.units.find((u: Unit) => u.id === unitId);
    if (!unit) return { error: "유닛이 없습니다" };
    const owns = unit.source.kind === "character" && unit.source.ownerId === user.id;
    if (!owns && !isGm) return { error: "자기 캐릭터만 가능합니다" };
    const err = redrawHand(row.state, unitId, rules);
    if (err) return { error: err };
    const r = await saveState(supabase, combatId, row.state, row.updated_at);
    if (r === null) return { state: row.state };
    if (r !== "conflict") return { error: r };
  }
  return { error: "동시에 수정 중입니다. 다시 시도하세요" };
}
