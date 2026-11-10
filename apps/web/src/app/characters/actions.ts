"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, getUser } from "@/lib/supabase/server";
import { validateCharacter, type CharacterData } from "@limbus/rules";

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

  // JSON 컬럼 타입 호환을 위해 직렬화
  const data = JSON.parse(JSON.stringify(input.data));
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

/** GM 전용: 레벨/체력/정신력/빛/침식도/동기화/승인 조정 */
export async function gmAdjust(characterId: string, patch: Partial<Pick<CharacterData, "level" | "hp" | "maxHp" | "sanity" | "light" | "erosion" | "sync">>, approved?: boolean) {
  const supabase = await createClient();
  const { data: row, error: e1 } = await supabase.from("characters").select("data").eq("id", characterId).single();
  if (e1 || !row) return { error: e1?.message ?? "not found" };
  const data = { ...(row.data as unknown as CharacterData), ...patch };
  const update: { data: unknown; approved?: boolean } = { data: JSON.parse(JSON.stringify(data)) };
  if (approved !== undefined) update.approved = approved;
  const { error } = await supabase.from("characters").update(update as never).eq("id", characterId);
  if (error) return { error: error.message };
  revalidatePath(`/characters/${characterId}`);
  return {};
}

export async function deleteCharacter(characterId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("characters").delete().eq("id", characterId);
  if (error) throw new Error(error.message);
  redirect("/characters");
}
