"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, getUser } from "@/lib/supabase/server";
import { parseEffectText, type EnemyData } from "@limbus/rules";

export async function saveEnemy(campaignId: string, id: string | null, name: string, portraitUrl: string | null, data: EnemyData): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/");
  if (!name.trim()) return { error: "이름을 입력하세요" };
  if (data.skills.length === 0) return { error: "스킬이 하나 이상 필요합니다" };
  if (data.skills.some((s) => !s.name.trim())) return { error: "이름 없는 스킬이 있습니다" };
  const parsed: EnemyData = {
    ...data,
    skills: data.skills.map((s) => ({ ...s, effects: parseEffectText(s.effectText ?? "", "skill").effects })),
    gimmicks: data.gimmicks.map((g) => ({ ...g, effects: parseEffectText(g.text ?? "", "passive").effects })),
  };
  const payload = JSON.parse(JSON.stringify(parsed));
  if (id) {
    const { error } = await supabase.from("enemies").update({ name: name.trim(), portrait_url: portraitUrl, data: payload }).eq("id", id);
    if (error) return { error: error.message };
    revalidatePath(`/campaigns/${campaignId}/enemies/${id}`);
    return { id };
  }
  const { data: row, error } = await supabase.from("enemies").insert({ campaign_id: campaignId, name: name.trim(), portrait_url: portraitUrl, data: payload, created_by: user.id }).select("id").single();
  if (error) return { error: error.message };
  return { id: row.id };
}

export async function deleteEnemy(campaignId: string, id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("enemies").delete().eq("id", id);
  if (error) throw new Error(error.message);
  redirect(`/campaigns/${campaignId}/enemies`);
}

/** GM 수동 공개: 특정 캐릭터(또는 캠페인 전체 캐릭터)에게 스킬/기믹 공개 */
export async function revealToAll(campaignId: string, enemyId: string, skillIds: string[], gimmickIds: string[]): Promise<void> {
  const supabase = await createClient();
  const { data: chars } = await supabase.from("characters").select("id").eq("campaign_id", campaignId);
  for (const c of chars ?? []) {
    const { data: ex } = await supabase.from("enemy_reveals").select("revealed_skills, revealed_gimmicks").eq("enemy_id", enemyId).eq("character_id", c.id).maybeSingle();
    const rs = Array.from(new Set([...(ex?.revealed_skills ?? []), ...skillIds]));
    const rg = Array.from(new Set([...(ex?.revealed_gimmicks ?? []), ...gimmickIds]));
    await supabase.from("enemy_reveals").upsert({ enemy_id: enemyId, character_id: c.id, revealed_skills: rs, revealed_gimmicks: rg }, { onConflict: "enemy_id,character_id" });
  }
  revalidatePath(`/campaigns/${campaignId}/enemies/${enemyId}`);
}
