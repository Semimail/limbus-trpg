"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, getUser } from "@/lib/supabase/server";
import { newEnemyData, type EnemyData, type SpritePose, type SpritePoses, type SpriteAnimKey, type SpriteAnims } from "@limbus/rules";
import { buildSpritePrompt, buildPosePrompt, buildStripPrompt, buildSkillStripPrompt, POSES, STRIPS, type SkillForStrip } from "@/lib/sprite/prompt";
import { STRIP_SPECS, stripSize, skillStripSpec, fpsFor, isSkillKey, type StripSpec } from "@/lib/sprite/strip";
import { resolveSpriteProvider, type SpriteProvider } from "@/lib/sprite/provider";
import type { Database } from "@/lib/supabase/database.types";

export type SpriteJobRow = Database["public"]["Tables"]["sprite_jobs"]["Row"];
/** 결과를 붙일 대상: 적 도감 항목(GM) 또는 캐릭터(본인, GM은 전부) */
export type SpriteTarget = { kind: "enemy"; id: string } | { kind: "character"; id: string } | null;

const MAX_SOURCE_BYTES = 12 * 1024 * 1024;

/**
 * 캠페인 멤버 확인. 작업 로그는 RLS 로 본인 것만 보이고 GM 은 캠페인 전체를 본다.
 * GM 이 만든 것은 플레이어에게 보이지 않는다.
 */
async function requireMember(campaignId: string) {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/");
  const { data: me } = await supabase.from("campaign_members").select("role").eq("campaign_id", campaignId).eq("user_id", user.id).maybeSingle();
  if (!me) throw new Error("캠페인 멤버만 쓸 수 있습니다");
  const isGm = me.role === "gm" || me.role === "temp_gm";
  return { supabase, user, isGm };
}

type Supa = Awaited<ReturnType<typeof createClient>>;
const targetOf = (j: { enemy_id: string | null; character_id: string | null }): SpriteTarget => j.enemy_id ? { kind: "enemy", id: j.enemy_id } : j.character_id ? { kind: "character", id: j.character_id } : null;
const isAnimKey = (k: string): k is SpriteAnimKey => k === "idle" || POSES.some((p) => p.id === k) || isSkillKey(k);

async function fetchSource(url: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`원본 이미지를 받지 못했습니다 (${r.status})`);
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.byteLength > MAX_SOURCE_BYTES) throw new Error("원본 이미지가 12MB를 넘습니다");
  return { bytes: buf, mime: r.headers.get("content-type")?.split(";")[0] || "image/png" };
}

/** 작업 1건 실행: 생성 → Storage 저장 → 로그 갱신. 실패하면 로그에 적고 throw */
async function runJob(supabase: Supa, userId: string, jobId: string, provider: SpriteProvider, prompt: string, sourceUrl: string | null, campaignId: string, size?: string): Promise<string> {
  const started = Date.now();
  try {
    const source = sourceUrl ? await fetchSource(sourceUrl) : null;
    const out = await provider.generate({ prompt, source, size });
    const path = `${userId}/${jobId}.png`;
    const { error: upErr } = await supabase.storage.from("sprites").upload(path, out.png, { contentType: "image/png", upsert: true });
    if (upErr) throw new Error(`결과 저장 실패: ${upErr.message}`);
    const resultUrl = supabase.storage.from("sprites").getPublicUrl(path).data.publicUrl;
    await supabase.from("sprite_jobs").update({
      status: "done", result_url: resultUrl, usage: (out.usage ?? null) as never, cost_usd: out.costUsd, duration_ms: Date.now() - started, finished_at: new Date().toISOString(),
    }).eq("id", jobId);
    return resultUrl;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "생성 실패";
    await supabase.from("sprite_jobs").update({ status: "failed", error: msg.slice(0, 1000), duration_ms: Date.now() - started, finished_at: new Date().toISOString() }).eq("id", jobId);
    revalidatePath(`/campaigns/${campaignId}/sprites`);
    throw new Error(msg);
  }
}

/** 업로드 이미지(또는 글만)로 SD 대기 스프라이트 1장을 만들고 sprite_jobs 에 기록한다. */
export async function generateSprite(campaignId: string, input: { sourceUrl: string | null; label: string; notes: string; target: SpriteTarget }): Promise<{ error?: string; jobId?: string; resultUrl?: string }> {
  const { supabase, user, isGm } = await requireMember(campaignId);
  if (input.target?.kind === "enemy" && !isGm) return { error: "적 도감은 GM만 바꿀 수 있습니다" };
  const provider = resolveSpriteProvider();
  const prompt = buildSpritePrompt({ label: input.label, notes: input.notes, hasSource: !!input.sourceUrl });
  const { data: job, error: insErr } = await supabase.from("sprite_jobs").insert({
    campaign_id: campaignId, created_by: user.id, status: "running", pose: "idle", kind: "still",
    enemy_id: input.target?.kind === "enemy" ? input.target.id : null, character_id: input.target?.kind === "character" ? input.target.id : null,
    provider: provider.name, model: provider.model, label: input.label.trim(), prompt, source_url: input.sourceUrl,
  }).select("id").single();
  if (insErr || !job) return { error: insErr?.message ?? "작업을 기록하지 못했습니다" };
  let resultUrl: string;
  try { resultUrl = await runJob(supabase, user.id, job.id, provider, prompt, input.sourceUrl, campaignId); }
  catch (e) { return { error: e instanceof Error ? e.message : "생성 실패", jobId: job.id }; }
  let applyError: string | undefined;
  if (input.target) {
    try { await patchSprite(campaignId, input.target, { spriteUrl: resultUrl }); } catch (e) { applyError = e instanceof Error ? e.message : "적용 실패"; }
  }
  revalidatePath(`/campaigns/${campaignId}/sprites`);
  return applyError ? { jobId: job.id, resultUrl, error: `생성은 됐지만 적용 실패: ${applyError}` } : { jobId: job.id, resultUrl };
}

/** 완료된 대기 이미지(부모)를 확인하고 돌려준다 */
async function loadParent(supabase: Supa, campaignId: string, parentJobId: string, isGm: boolean): Promise<SpriteJobRow> {
  const { data: parent } = await supabase.from("sprite_jobs").select("*").eq("id", parentJobId).eq("campaign_id", campaignId).single();
  if (!parent || parent.status !== "done" || !parent.result_url) throw new Error("완료된 대기 이미지가 있어야 만들 수 있습니다");
  if (parent.pose !== "idle" || parent.kind !== "still") throw new Error("포즈·띠는 대기 이미지에서만 만듭니다");
  if (parent.enemy_id && !isGm) throw new Error("적 도감은 GM만 바꿀 수 있습니다");
  return parent;
}

/** 대기 결과(부모 작업)를 참고로 같은 인물의 포즈 1장을 만든다. 부모가 적/캐릭터에 연결돼 있으면 바로 적용 */
export async function generatePose(campaignId: string, parentJobId: string, pose: SpritePose): Promise<{ error?: string; jobId?: string; resultUrl?: string }> {
  const { supabase, user, isGm } = await requireMember(campaignId);
  if (!POSES.some((p) => p.id === pose)) return { error: "알 수 없는 포즈입니다" };
  let parent: SpriteJobRow;
  try { parent = await loadParent(supabase, campaignId, parentJobId, isGm); } catch (e) { return { error: e instanceof Error ? e.message : "오류" }; }
  const provider = resolveSpriteProvider();
  const prompt = buildPosePrompt(pose, parent.label);
  const { data: job, error: insErr } = await supabase.from("sprite_jobs").insert({
    campaign_id: campaignId, created_by: user.id, status: "running", pose, kind: "still", parent_job_id: parent.id,
    enemy_id: parent.enemy_id, character_id: parent.character_id,
    provider: provider.name, model: provider.model, label: `${parent.label} · ${POSES.find((p) => p.id === pose)!.label}`, prompt, source_url: parent.result_url,
  }).select("id").single();
  if (insErr || !job) return { error: insErr?.message ?? "작업을 기록하지 못했습니다" };
  let resultUrl: string;
  try { resultUrl = await runJob(supabase, user.id, job.id, provider, prompt, parent.result_url, campaignId); }
  catch (e) { return { error: e instanceof Error ? e.message : "생성 실패", jobId: job.id }; }
  const target = targetOf(parent);
  let applyError: string | undefined;
  if (target) {
    try { await patchSprite(campaignId, target, { spritePoses: { [pose]: resultUrl } }); } catch (e) { applyError = e instanceof Error ? e.message : "적용 실패"; }
  }
  revalidatePath(`/campaigns/${campaignId}/sprites`);
  return applyError ? { jobId: job.id, resultUrl, error: `생성은 됐지만 적용 실패: ${applyError}` } : { jobId: job.id, resultUrl };
}

/**
 * 대기 결과를 참고로 모션 하나의 프레임 띠(N칸 한 줄)를 한 번의 호출로 만든다.
 * 자르기는 브라우저가 하고(slice.ts), 프레임을 올린 뒤 saveStripFrames 로 기록·적용한다.
 */
export async function generateStrip(campaignId: string, parentJobId: string, key: SpriteAnimKey): Promise<{ error?: string; jobId?: string; resultUrl?: string; frames?: number }> {
  const { supabase, user, isGm } = await requireMember(campaignId);
  if (!isAnimKey(key)) return { error: "알 수 없는 모션입니다" };
  let parent: SpriteJobRow;
  try { parent = await loadParent(supabase, campaignId, parentJobId, isGm); } catch (e) { return { error: e instanceof Error ? e.message : "오류" }; }
  let spec: StripSpec; let prompt: string; let stripLabel: string;
  if (isSkillKey(key)) {
    // 스킬 띠: 부모가 연결된 적/캐릭터의 스킬에서 이름·피해 유형·방어 종류를 가져온다
    const target = targetOf(parent);
    if (!target) return { error: "스킬 띠는 먼저 적이나 캐릭터에 적용한 뒤 만들 수 있습니다" };
    const table = target.kind === "enemy" ? "enemies" : "characters";
    const { data: row } = await supabase.from(table).select("data").eq("id", target.id).single();
    const d = row?.data as { skills?: SkillForStrip[] & { id: string }[]; ego?: (SkillForStrip & { id: string })[] } | undefined;
    const sid = key.slice("skill:".length);
    const skill = [...(d?.skills ?? []), ...(d?.ego ?? [])].find((s) => (s as { id: string }).id === sid);
    if (!skill) return { error: "대상에 그 스킬이 없습니다" };
    spec = skillStripSpec(skill); prompt = buildSkillStripPrompt(skill, spec.frames, parent.label); stripLabel = skill.name || "스킬";
  } else {
    if (!STRIPS.some((s) => s.id === key)) return { error: "알 수 없는 모션입니다" };
    spec = STRIP_SPECS[key as keyof typeof STRIP_SPECS]; prompt = buildStripPrompt(key, spec.frames, parent.label); stripLabel = STRIPS.find((s) => s.id === key)!.label;
  }
  const { w, h } = stripSize(spec.frames);
  const provider = resolveSpriteProvider();
  const { data: job, error: insErr } = await supabase.from("sprite_jobs").insert({
    campaign_id: campaignId, created_by: user.id, status: "running", pose: key, kind: "strip", frames: spec.frames, parent_job_id: parent.id,
    enemy_id: parent.enemy_id, character_id: parent.character_id,
    provider: provider.name, model: provider.model, label: `${parent.label} · ${stripLabel} 띠`, prompt, source_url: parent.result_url,
  }).select("id").single();
  if (insErr || !job) return { error: insErr?.message ?? "작업을 기록하지 못했습니다" };
  let resultUrl: string;
  try { resultUrl = await runJob(supabase, user.id, job.id, provider, prompt, parent.result_url, campaignId, `${w}x${h}`); }
  catch (e) { return { error: e instanceof Error ? e.message : "생성 실패", jobId: job.id }; }
  revalidatePath(`/campaigns/${campaignId}/sprites`);
  return { jobId: job.id, resultUrl, frames: spec.frames };
}

/** 브라우저가 잘라 올린 프레임 URL 목록을 띠 작업에 기록하고, 연결된 적/캐릭터에 적용한다 */
export async function saveStripFrames(campaignId: string, jobId: string, frameUrls: string[]): Promise<{ error?: string }> {
  const { supabase } = await requireMember(campaignId);
  const { data: job } = await supabase.from("sprite_jobs").select("*").eq("id", jobId).eq("campaign_id", campaignId).single();
  if (!job || job.kind !== "strip" || job.status !== "done") return { error: "완료된 띠 작업이 아닙니다" };
  if (!frameUrls.length || frameUrls.length > 16 || frameUrls.some((u) => !u.includes("/storage/v1/object/public/sprites/"))) return { error: "프레임 URL 이 올바르지 않습니다" };
  const { error } = await supabase.from("sprite_jobs").update({ frame_urls: frameUrls }).eq("id", jobId);
  if (error) return { error: error.message };
  const target = targetOf(job);
  if (target && isAnimKey(job.pose)) {
    try { await patchSprite(campaignId, target, { spriteAnims: { [job.pose]: { frames: frameUrls, fps: fpsFor(job.pose, frameUrls.length) } } }); }
    catch (e) { return { error: `프레임은 저장됐지만 적용 실패: ${e instanceof Error ? e.message : "오류"}` }; }
  }
  revalidatePath(`/campaigns/${campaignId}/sprites`);
  return {};
}

/** 적 또는 캐릭터의 data.spriteUrl / spritePoses / spriteAnims 를 바꾼다 (RLS: 적은 GM, 캐릭터는 본인(잠금 전) 또는 GM). 포즈·애니는 병합 */
async function patchSprite(campaignId: string, target: NonNullable<SpriteTarget>, patch: { spriteUrl?: string; spritePoses?: SpritePoses; spriteAnims?: SpriteAnims }) {
  const supabase = await createClient();
  const table = target.kind === "enemy" ? "enemies" : "characters";
  const { data: row } = await supabase.from(table).select("data").eq("id", target.id).eq("campaign_id", campaignId).single();
  if (!row) throw new Error(target.kind === "enemy" ? "적을 찾을 수 없습니다" : "캐릭터를 찾을 수 없습니다");
  const cur = row.data as { spriteUrl?: string | null; spritePoses?: SpritePoses | null; spriteAnims?: SpriteAnims | null };
  const data = {
    ...cur,
    ...(patch.spriteUrl ? { spriteUrl: patch.spriteUrl } : {}),
    ...(patch.spritePoses ? { spritePoses: { ...(cur.spritePoses ?? {}), ...patch.spritePoses } } : {}),
    ...(patch.spriteAnims ? { spriteAnims: { ...(cur.spriteAnims ?? {}), ...patch.spriteAnims } } : {}),
  };
  const { data: updated, error } = await supabase.from(table).update({ data: JSON.parse(JSON.stringify(data)) }).eq("id", target.id).select("id");
  if (error) throw new Error(error.message);
  if (!updated?.length) throw new Error(target.kind === "enemy" ? "적 도감은 GM만 바꿀 수 있습니다" : "잠긴(전투 중) 캐릭터는 GM만 바꿀 수 있습니다");
  revalidatePath(target.kind === "enemy" ? `/campaigns/${campaignId}/enemies/${target.id}` : `/characters/${target.id}`);
}

/** 완료된 자식 포즈 이미지와 프레임 띠를 모은다 */
async function doneChildren(supabase: Supa, parentJobId: string): Promise<{ poses: SpritePoses; anims: SpriteAnims }> {
  const { data: kids } = await supabase.from("sprite_jobs").select("pose, kind, result_url, frame_urls, status").eq("parent_job_id", parentJobId).eq("status", "done");
  const poses: SpritePoses = {}; const anims: SpriteAnims = {};
  for (const k of kids ?? []) {
    if (k.kind === "strip") { if (k.frame_urls?.length && isAnimKey(k.pose)) anims[k.pose] = { frames: k.frame_urls, fps: fpsFor(k.pose, k.frame_urls.length) }; }
    else if (k.result_url && POSES.some((p) => p.id === k.pose)) poses[k.pose as SpritePose] = k.result_url;
  }
  return { poses, anims };
}

/** 이미 만든 결과를 적/캐릭터의 스탠딩으로 적용. 대기 이미지면 완료된 포즈·띠도 함께, 자식이면 그것만 */
export async function applySprite(campaignId: string, jobId: string, target: NonNullable<SpriteTarget>): Promise<{ error?: string }> {
  const { supabase, isGm } = await requireMember(campaignId);
  if (target.kind === "enemy" && !isGm) return { error: "적 도감은 GM만 바꿀 수 있습니다" };
  const { data: job } = await supabase.from("sprite_jobs").select("result_url, pose, kind, frame_urls, parent_job_id").eq("id", jobId).eq("campaign_id", campaignId).single();
  if (!job?.result_url) return { error: "결과가 없는 작업입니다" };
  const link = target.kind === "enemy" ? { enemy_id: target.id, character_id: null } : { character_id: target.id, enemy_id: null };
  try {
    if (job.kind === "still" && job.pose === "idle" && !job.parent_job_id) {
      const { poses, anims } = await doneChildren(supabase, jobId);
      await patchSprite(campaignId, target, { spriteUrl: job.result_url, spritePoses: poses, spriteAnims: anims });
      await supabase.from("sprite_jobs").update(link).eq("parent_job_id", jobId);
    } else if (job.kind === "strip") {
      if (!job.frame_urls?.length || !isAnimKey(job.pose)) return { error: "아직 잘라 올린 프레임이 없습니다" };
      await patchSprite(campaignId, target, { spriteAnims: { [job.pose]: { frames: job.frame_urls, fps: fpsFor(job.pose, job.frame_urls.length) } } });
    } else {
      await patchSprite(campaignId, target, { spritePoses: { [job.pose as SpritePose]: job.result_url } });
    }
  } catch (e) { return { error: e instanceof Error ? e.message : "적용 실패" }; }
  await supabase.from("sprite_jobs").update(link).eq("id", jobId);
  revalidatePath(`/campaigns/${campaignId}/sprites`);
  return {};
}

/** (GM) 대기 결과로 새 적 도감 항목을 만든다 (기본 스킬, 스탠딩 = 결과 + 완료된 포즈·띠, 초상 = 결과) */
export async function createEnemyFromSprite(campaignId: string, jobId: string, name: string): Promise<{ error?: string; enemyId?: string }> {
  const { supabase, user, isGm } = await requireMember(campaignId);
  if (!isGm) return { error: "GM만 적을 등록할 수 있습니다" };
  if (!name.trim()) return { error: "이름을 입력하세요" };
  const { data: job } = await supabase.from("sprite_jobs").select("result_url, pose, kind").eq("id", jobId).eq("campaign_id", campaignId).single();
  if (!job?.result_url) return { error: "결과가 없는 작업입니다" };
  const isParent = job.pose === "idle" && job.kind === "still";
  const { poses, anims } = isParent ? await doneChildren(supabase, jobId) : { poses: {}, anims: {} };
  const data: EnemyData = { ...newEnemyData(), spriteUrl: job.result_url, spritePoses: poses, spriteAnims: anims };
  const { data: row, error } = await supabase.from("enemies").insert({ campaign_id: campaignId, name: name.trim(), portrait_url: job.result_url, data: JSON.parse(JSON.stringify(data)), created_by: user.id }).select("id").single();
  if (error || !row) return { error: error?.message ?? "등록 실패" };
  await supabase.from("sprite_jobs").update({ enemy_id: row.id }).eq("id", jobId);
  if (isParent) await supabase.from("sprite_jobs").update({ enemy_id: row.id }).eq("parent_job_id", jobId);
  revalidatePath(`/campaigns/${campaignId}/sprites`);
  revalidatePath(`/campaigns/${campaignId}/enemies`);
  return { enemyId: row.id };
}

/** 작업 로그와 결과 파일 삭제 (본인 또는 GM. 대기 이미지를 지우면 그 포즈·띠도 함께. 이미 적용된 URL 은 그대로 둔다) */
export async function deleteSpriteJob(campaignId: string, jobId: string): Promise<{ error?: string }> {
  const { supabase, user, isGm } = await requireMember(campaignId);
  const { data: job } = await supabase.from("sprite_jobs").select("id, result_url, enemy_id, character_id, created_by, pose, kind, frames, frame_urls").eq("id", jobId).eq("campaign_id", campaignId).single();
  if (!job) return { error: "작업이 없습니다" };
  if (job.created_by !== user.id && !isGm) return { error: "본인 작업만 지울 수 있습니다" };
  const isParent = job.pose === "idle" && job.kind === "still";
  const { data: kids } = isParent ? await supabase.from("sprite_jobs").select("id, result_url, enemy_id, character_id, created_by, pose, kind, frames, frame_urls").eq("parent_job_id", jobId) : { data: [] };
  // 파일은 올린 사람 폴더에 있어 본인만 지울 수 있다 (GM 이 남의 것을 지우면 로그만 지워진다)
  const files: string[] = [];
  for (const j of [job, ...(kids ?? [])]) {
    if (!j.result_url || j.enemy_id || j.character_id || j.created_by !== user.id) continue;
    files.push(`${user.id}/${j.id}.png`);
    if (j.kind === "strip") for (let i = 0; i < (j.frame_urls?.length ?? 0); i++) files.push(`${user.id}/${j.id}-f${i}.png`);
  }
  if (files.length) await supabase.storage.from("sprites").remove(files);
  if (kids?.length) await supabase.from("sprite_jobs").delete().eq("parent_job_id", jobId);
  const { error } = await supabase.from("sprite_jobs").delete().eq("id", jobId);
  if (error) return { error: error.message };
  revalidatePath(`/campaigns/${campaignId}/sprites`);
  return {};
}
