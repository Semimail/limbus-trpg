"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, getUser } from "@/lib/supabase/server";
import { newEnemyData, type EnemyData } from "@limbus/rules";
import { buildSpritePrompt } from "@/lib/sprite/prompt";
import { resolveSpriteProvider } from "@/lib/sprite/provider";
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

/** 업로드 이미지(또는 글만)로 SD 정지 스프라이트 1장을 만들고 sprite_jobs 에 기록한다. */
export async function generateSprite(campaignId: string, input: { sourceUrl: string | null; label: string; notes: string; target: SpriteTarget }): Promise<{ error?: string; jobId?: string; resultUrl?: string }> {
  const { supabase, user, isGm } = await requireMember(campaignId);
  if (input.target?.kind === "enemy" && !isGm) return { error: "적 도감은 GM만 바꿀 수 있습니다" };
  const provider = resolveSpriteProvider();
  const prompt = buildSpritePrompt({ label: input.label, notes: input.notes, hasSource: !!input.sourceUrl });
  const { data: job, error: insErr } = await supabase.from("sprite_jobs").insert({
    campaign_id: campaignId, created_by: user.id, status: "running",
    enemy_id: input.target?.kind === "enemy" ? input.target.id : null, character_id: input.target?.kind === "character" ? input.target.id : null,
    provider: provider.name, model: provider.model, label: input.label.trim(), prompt, source_url: input.sourceUrl,
  }).select("id").single();
  if (insErr || !job) return { error: insErr?.message ?? "작업을 기록하지 못했습니다" };
  const started = Date.now();
  const fail = async (msg: string) => {
    await supabase.from("sprite_jobs").update({ status: "failed", error: msg.slice(0, 1000), duration_ms: Date.now() - started, finished_at: new Date().toISOString() }).eq("id", job.id);
    revalidatePath(`/campaigns/${campaignId}/sprites`);
    return { error: msg, jobId: job.id };
  };
  try {
    let source: { bytes: Uint8Array; mime: string } | null = null;
    if (input.sourceUrl) {
      const r = await fetch(input.sourceUrl, { cache: "no-store" });
      if (!r.ok) return await fail(`원본 이미지를 받지 못했습니다 (${r.status})`);
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.byteLength > MAX_SOURCE_BYTES) return await fail("원본 이미지가 12MB를 넘습니다");
      source = { bytes: buf, mime: r.headers.get("content-type")?.split(";")[0] || "image/png" };
    }
    const out = await provider.generate({ prompt, source });
    const path = `${user.id}/${job.id}.png`;
    const { error: upErr } = await supabase.storage.from("sprites").upload(path, out.png, { contentType: "image/png", upsert: true });
    if (upErr) return await fail(`결과 저장 실패: ${upErr.message}`);
    const { data: pub } = supabase.storage.from("sprites").getPublicUrl(path);
    const resultUrl = pub.publicUrl;
    await supabase.from("sprite_jobs").update({
      status: "done", result_url: resultUrl, usage: (out.usage ?? null) as never, cost_usd: out.costUsd, duration_ms: Date.now() - started, finished_at: new Date().toISOString(),
    }).eq("id", job.id);
    let applyError: string | undefined;
    if (input.target) {
      try { await applyUrl(campaignId, input.target, resultUrl); } catch (e) { applyError = e instanceof Error ? e.message : "적용 실패"; }
    }
    revalidatePath(`/campaigns/${campaignId}/sprites`);
    return applyError ? { jobId: job.id, resultUrl, error: `생성은 됐지만 적용 실패: ${applyError}` } : { jobId: job.id, resultUrl };
  } catch (e) {
    return await fail(e instanceof Error ? e.message : "생성 실패");
  }
}

/** 적 또는 캐릭터의 data.spriteUrl 을 바꾼다 (RLS: 적은 GM, 캐릭터는 본인(잠금 전) 또는 GM) */
async function applyUrl(campaignId: string, target: NonNullable<SpriteTarget>, url: string) {
  const supabase = await createClient();
  const table = target.kind === "enemy" ? "enemies" : "characters";
  const { data: row } = await supabase.from(table).select("data").eq("id", target.id).eq("campaign_id", campaignId).single();
  if (!row) throw new Error(target.kind === "enemy" ? "적을 찾을 수 없습니다" : "캐릭터를 찾을 수 없습니다");
  const data = { ...(row.data as object), spriteUrl: url };
  const { data: updated, error } = await supabase.from(table).update({ data }).eq("id", target.id).select("id");
  if (error) throw new Error(error.message);
  if (!updated?.length) throw new Error(target.kind === "enemy" ? "적 도감은 GM만 바꿀 수 있습니다" : "잠긴(전투 중) 캐릭터는 GM만 바꿀 수 있습니다");
  revalidatePath(target.kind === "enemy" ? `/campaigns/${campaignId}/enemies/${target.id}` : `/characters/${target.id}`);
}

/** 이미 만든 결과를 적/캐릭터의 스탠딩으로 적용 */
export async function applySprite(campaignId: string, jobId: string, target: NonNullable<SpriteTarget>): Promise<{ error?: string }> {
  const { supabase, isGm } = await requireMember(campaignId);
  if (target.kind === "enemy" && !isGm) return { error: "적 도감은 GM만 바꿀 수 있습니다" };
  const { data: job } = await supabase.from("sprite_jobs").select("result_url").eq("id", jobId).eq("campaign_id", campaignId).single();
  if (!job?.result_url) return { error: "결과가 없는 작업입니다" };
  try { await applyUrl(campaignId, target, job.result_url); } catch (e) { return { error: e instanceof Error ? e.message : "적용 실패" }; }
  await supabase.from("sprite_jobs").update(target.kind === "enemy" ? { enemy_id: target.id } : { character_id: target.id }).eq("id", jobId);
  revalidatePath(`/campaigns/${campaignId}/sprites`);
  return {};
}

/** (GM) 결과로 새 적 도감 항목을 만든다 (기본 스킬, 스탠딩 = 결과, 초상 = 결과) */
export async function createEnemyFromSprite(campaignId: string, jobId: string, name: string): Promise<{ error?: string; enemyId?: string }> {
  const { supabase, user, isGm } = await requireMember(campaignId);
  if (!isGm) return { error: "GM만 적을 등록할 수 있습니다" };
  if (!name.trim()) return { error: "이름을 입력하세요" };
  const { data: job } = await supabase.from("sprite_jobs").select("result_url").eq("id", jobId).eq("campaign_id", campaignId).single();
  if (!job?.result_url) return { error: "결과가 없는 작업입니다" };
  const data: EnemyData = { ...newEnemyData(), spriteUrl: job.result_url };
  const { data: row, error } = await supabase.from("enemies").insert({ campaign_id: campaignId, name: name.trim(), portrait_url: job.result_url, data: JSON.parse(JSON.stringify(data)), created_by: user.id }).select("id").single();
  if (error || !row) return { error: error?.message ?? "등록 실패" };
  await supabase.from("sprite_jobs").update({ enemy_id: row.id }).eq("id", jobId);
  revalidatePath(`/campaigns/${campaignId}/sprites`);
  revalidatePath(`/campaigns/${campaignId}/enemies`);
  return { enemyId: row.id };
}

/** 작업 로그와 결과 파일 삭제 (본인 또는 GM. 이미 적용된 URL 은 그대로 둔다) */
export async function deleteSpriteJob(campaignId: string, jobId: string): Promise<{ error?: string }> {
  const { supabase, user, isGm } = await requireMember(campaignId);
  const { data: job } = await supabase.from("sprite_jobs").select("result_url, enemy_id, character_id, created_by").eq("id", jobId).eq("campaign_id", campaignId).single();
  if (!job) return { error: "작업이 없습니다" };
  if (job.created_by !== user.id && !isGm) return { error: "본인 작업만 지울 수 있습니다" };
  // 파일은 올린 사람 폴더에 있어 본인만 지울 수 있다 (GM 이 남의 것을 지우면 로그만 지워진다)
  if (job.result_url && !job.enemy_id && !job.character_id && job.created_by === user.id) await supabase.storage.from("sprites").remove([`${user.id}/${jobId}.png`]);
  const { error } = await supabase.from("sprite_jobs").delete().eq("id", jobId);
  if (error) return { error: error.message };
  revalidatePath(`/campaigns/${campaignId}/sprites`);
  return {};
}
