"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, getUser } from "@/lib/supabase/server";
import { validateCharacter, parseEffectText, levelUpCost, maxHpAt, syncMinLevel, DEFAULT_PROGRESSION, type CharacterData } from "@limbus/rules";
import { getCampaignRules } from "@/lib/rules";

export interface SaveInput {
  id?: string;
  campaignId: string | null;
  name: string;
  portraitUrl: string | null;
  data: CharacterData;
}

export async function saveCharacter(input: SaveInput): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/");
  if (!input.name.trim()) return { error: "이름을 입력하세요" };
  const errors = validateCharacter(input.data).filter((i) => i.level === "error");
  if (errors.length) return { error: errors.map((e) => e.message).join(" / ") };

  // 자연어 효과 → 구조화 효과 (저장 시점에 해석)
  const parsed: CharacterData = {
    ...input.data,
    skills: input.data.skills.map((s) => ({ ...s, effects: parseEffectText(s.effectText ?? "", "skill").effects })),
    ego: input.data.ego.map((s) => ({ ...s, effects: parseEffectText(s.effectText ?? "", "skill").effects })),
    traits: input.data.traits.map((t) => ({ ...t, effects: parseEffectText(t.description ?? "", "passive").effects })),
    passives: (input.data.passives ?? []).map((t) => ({ ...t, effects: parseEffectText(t.description ?? "", "passive").effects })),
  };
  const data = JSON.parse(JSON.stringify(parsed));
  if (input.id) {
    const { error } = await supabase.from("characters")
      .update({ name: input.name.trim(), portrait_url: input.portraitUrl, data, campaign_id: input.campaignId })
      .eq("id", input.id);
    if (error) return { error: error.message };
    revalidatePath(`/characters/${input.id}`);
    return { id: input.id };
  }
  const { data: row, error } = await supabase.from("characters")
    .insert({ owner_id: user.id, campaign_id: input.campaignId, name: input.name.trim(), portrait_url: input.portraitUrl, data })
    .select("id").single();
  if (error) return { error: error.message };
  return { id: row.id };
}

/** GM 전용: 레벨/체력/정신력/빛/침식도/동기화/경험치/승인 조정 */
export async function gmAdjust(characterId: string, patch: Partial<Pick<CharacterData, "level" | "hp" | "maxHp" | "sanity" | "light" | "erosion" | "sync" | "exp">>, approved?: boolean) {
  const supabase = await createClient();
  const { data: row, error: e1 } = await supabase.from("characters").select("data, campaign_id").eq("id", characterId).single();
  if (e1 || !row) return { error: e1?.message ?? "not found" };
  const data = { ...(row.data as unknown as CharacterData), ...patch };
  const { progression } = row.campaign_id ? await getCampaignRules(row.campaign_id) : { progression: DEFAULT_PROGRESSION };
  if (data.sync > 1 && data.level < syncMinLevel(data.sync, progression)) return { error: `동기화 ${data.sync}단계는 ${syncMinLevel(data.sync, progression)}레벨부터입니다` };
  const update: { data: unknown; approved?: boolean } = { data: JSON.parse(JSON.stringify(data)) };
  if (approved !== undefined) update.approved = approved;
  const { error } = await supabase.from("characters").update(update as never).eq("id", characterId);
  if (error) return { error: error.message };
  revalidatePath(`/characters/${characterId}`);
  return {};
}

/** GM: 캠페인 캐릭터들에게 경험치 지급 (세션 뒤) */
export async function awardExp(campaignId: string, characterIds: string[], amount: number): Promise<{ error?: string; count?: number }> {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/");
  if (!Number.isFinite(amount) || amount === 0) return { error: "지급할 경험치를 입력하세요" };
  const { data: me } = await supabase.from("campaign_members").select("role").eq("campaign_id", campaignId).eq("user_id", user.id).maybeSingle();
  if (!me || (me.role !== "gm" && me.role !== "temp_gm")) return { error: "GM만 지급할 수 있습니다" };
  const { data: rows, error } = await supabase.from("characters").select("id, data").eq("campaign_id", campaignId).in("id", characterIds);
  if (error) return { error: error.message };
  let count = 0;
  for (const r of rows ?? []) {
    const d = r.data as unknown as CharacterData;
    const next = { ...d, exp: Math.max(0, (d.exp ?? 0) + amount) };
    const { error: e2 } = await supabase.from("characters").update({ data: JSON.parse(JSON.stringify(next)) }).eq("id", r.id);
    if (!e2) { count += 1; revalidatePath(`/characters/${r.id}`); }
  }
  revalidatePath(`/campaigns/${campaignId}`);
  return { count };
}

/** 레벨업: 경험치를 쓰고 레벨 +1, 최대 체력 재계산(차이만큼 현재 체력도 회복). 소유자(잠금 전) 또는 GM. RLS 가 권한을 막는다 */
export async function levelUp(characterId: string): Promise<{ error?: string; level?: number; unlocked?: string[] }> {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/");
  const { data: row, error: e1 } = await supabase.from("characters").select("data, campaign_id").eq("id", characterId).single();
  if (e1 || !row) return { error: e1?.message ?? "캐릭터를 찾을 수 없습니다" };
  const d = row.data as unknown as CharacterData;
  const { progression: p } = row.campaign_id ? await getCampaignRules(row.campaign_id) : { progression: DEFAULT_PROGRESSION };
  if (d.level >= p.maxLevel) return { error: "최고 레벨입니다" };
  const cost = levelUpCost(d.level, p);
  if ((d.exp ?? 0) < cost) return { error: `경험치가 부족합니다 (필요 ${cost}, 보유 ${d.exp ?? 0})` };
  const level = d.level + 1;
  const maxHp = maxHpAt(level, p);
  const next: CharacterData = { ...d, level, exp: (d.exp ?? 0) - cost, maxHp, hp: Math.min(maxHp, d.hp + Math.max(0, maxHp - d.maxHp)) };
  const { data: updated, error } = await supabase.from("characters").update({ data: JSON.parse(JSON.stringify(next)) }).eq("id", characterId).select("id");
  if (error) return { error: error.message };
  if (!updated?.length) return { error: "잠긴(전투 중) 캐릭터는 GM만 올릴 수 있습니다" };
  const unlocked: string[] = [];
  const { gradeIndexOf, traitSlotsAt, passiveSlotsAt, statPointsAt } = await import("@limbus/rules");
  if (gradeIndexOf(level, p) !== gradeIndexOf(d.level, p)) {
    unlocked.push(`등급 상승: 능력치 총점 ${statPointsAt(level, p)}, 특기 칸 ${traitSlotsAt(level, p)}`);
    if (passiveSlotsAt(level, d.sync, p) > passiveSlotsAt(d.level, d.sync, p)) unlocked.push("패시브 1개 해금");
  }
  revalidatePath(`/characters/${characterId}`);
  if (row.campaign_id) revalidatePath(`/campaigns/${row.campaign_id}`);
  return { level, unlocked };
}

export async function deleteCharacter(characterId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("characters").delete().eq("id", characterId);
  if (error) throw new Error(error.message);
  redirect("/characters");
}
