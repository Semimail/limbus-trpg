"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, getUser } from "@/lib/supabase/server";
import { newEnemyData, type EnemyData } from "@limbus/rules";
import { buildSpritePrompt } from "@/lib/sprite/prompt";
import { resolveSpriteProvider } from "@/lib/sprite/provider";
import type { Database } from "@/lib/supabase/database.types";

export type SpriteJobRow = Database["public"]["Tables"]["sprite_jobs"]["Row"];

const MAX_SOURCE_BYTES = 12 * 1024 * 1024;

async function requireGm(campaignId: string) {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/");
  const { data: me } = await supabase.from("campaign_members").select("role").eq("campaign_id", campaignId).eq("user_id", user.id).maybeSingle();
  if (!me || (me.role !== "gm" && me.role !== "temp_gm")) throw new Error("GM만 쓸 수 있습니다");
  return { supabase, user };
}

/** 업로드 이미지(또는 글만)로 SD 정지 스프라이트 1장을 만들고 sprite_jobs 에 기록한다. */
export async function generateSprite(campaignId: string, input: { sourceUrl: string | null; label: string; notes: string; enemyId: string | null }): Promise<{ error?: string; jobId?: string; resultUrl?: string }> {
  const { supabase, user } = await requireGm(campaignId);
  const provider = resolveSpriteProvider();
  const prompt = buildSpritePrompt({ label: input.label, notes: input.notes, hasSource: !!input.sourceUrl });
  const { data: job, error: insErr } = await supabase.from("sprite_jobs").insert({
    campaign_id: campaignId, enemy_id: input.enemyId, created_by: user.id, status: "running",
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
    if (input.enemyId) await setEnemySprite(campaignId, input.enemyId, resultUrl);
    revalidatePath(`/campaigns/${campaignId}/sprites`);
    return { jobId: job.id, resultUrl };
  } catch (e) {
    return await fail(e instanceof Error ? e.message : "생성 실패");
  }
}

async function setEnemySprite(campaignId: string, enemyId: string, url: string) {
  const supabase = await createClient();
  const { data: e } = await supabase.from("enemies").select("data").eq("id", enemyId).eq("campaign_id", campaignId).single();
  if (!e) throw new Error("적을 찾을 수 없습니다");
  const data = { ...(e.data as object), spriteUrl: url };
  const { error } = await supabase.from("enemies").update({ data }).eq("id", enemyId);
  if (error) throw new Error(error.message);
  revalidatePath(`/campaigns/${campaignId}/enemies/${enemyId}`);
}

/** 이미 만든 결과를 적 도감 항목의 스탠딩으로 적용 */
export async function applySpriteToEnemy(campaignId: string, jobId: string, enemyId: string): Promise<{ error?: string }> {
  const { supabase } = await requireGm(campaignId);
  const { data: job } = await supabase.from("sprite_jobs").select("result_url").eq("id", jobId).eq("campaign_id", campaignId).single();
  if (!job?.result_url) return { error: "결과가 없는 작업입니다" };
  try { await setEnemySprite(campaignId, enemyId, job.result_url); } catch (e) { return { error: e instanceof Error ? e.message : "적용 실패" }; }
  await supabase.from("sprite_jobs").update({ enemy_id: enemyId }).eq("id", jobId);
  revalidatePath(`/campaigns/${campaignId}/sprites`);
  return {};
}

/** 결과로 새 적 도감 항목을 만든다 (기본 스킬, 스탠딩 = 결과, 초상 = 결과) */
export async function createEnemyFromSprite(campaignId: string, jobId: string, name: string): Promise<{ error?: string; enemyId?: string }> {
  const { supabase, user } = await requireGm(campaignId);
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

/** 작업 로그와 결과 파일 삭제 (적에 이미 적용된 URL은 그대로 둔다) */
export async function deleteSpriteJob(campaignId: string, jobId: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireGm(campaignId);
  const { data: job } = await supabase.from("sprite_jobs").select("result_url, enemy_id").eq("id", jobId).eq("campaign_id", campaignId).single();
  if (!job) return { error: "작업이 없습니다" };
  if (job.result_url && !job.enemy_id) await supabase.storage.from("sprites").remove([`${user.id}/${jobId}.png`]);
  const { error } = await supabase.from("sprite_jobs").delete().eq("id", jobId);
  if (error) return { error: error.message };
  revalidatePath(`/campaigns/${campaignId}/sprites`);
  return {};
}
