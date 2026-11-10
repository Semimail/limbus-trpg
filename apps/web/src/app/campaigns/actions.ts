"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient, getUser } from "@/lib/supabase/server";

export async function createCampaign(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/");
  const { data, error } = await supabase.from("campaigns").insert({ name, owner_id: user.id }).select("id").single();
  if (error) throw new Error(error.message);
  redirect(`/campaigns/${data.id}`);
}

export async function createInvite(campaignId: string) {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/");
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const { error } = await supabase.from("campaign_invites").insert({ campaign_id: campaignId, code, created_by: user.id });
  if (error) throw new Error(error.message);
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function joinCampaign(code: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_campaign", { invite_code: code });
  if (error) return { error: error.message };
  redirect(`/campaigns/${data}`);
}

export async function setMemberRole(campaignId: string, userId: string, role: "temp_gm" | "player") {
  const supabase = await createClient();
  const { error } = await supabase.from("campaign_members").update({ role }).eq("campaign_id", campaignId).eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function updateNotice(campaignId: string, formData: FormData) {
  const supabase = await createClient();
  const notice = String(formData.get("notice") ?? "");
  const next_session_note = String(formData.get("next_session_note") ?? "");
  const { error } = await supabase.from("campaigns").update({ notice, next_session_note }).eq("id", campaignId);
  if (error) throw new Error(error.message);
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function openSession(campaignId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim() || `세션 ${new Date().toLocaleDateString("ko-KR")}`;
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/");
  const { data, error } = await supabase.from("sessions").insert({ campaign_id: campaignId, title, created_by: user.id }).select("id").single();
  if (error) throw new Error(error.message);
  redirect(`/campaigns/${campaignId}/sessions/${data.id}`);
}

export async function closeSession(campaignId: string, sessionId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("sessions").update({ status: "closed", ended_at: new Date().toISOString() }).eq("id", sessionId);
  if (error) throw new Error(error.message);
  revalidatePath(`/campaigns/${campaignId}`);
}

export async function approveCharacter(campaignId: string, characterId: string, approved: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("characters").update({ approved }).eq("id", characterId);
  if (error) throw new Error(error.message);
  revalidatePath(`/campaigns/${campaignId}`);
}

/** 캠페인 삭제. 소유자(본 GM)만 가능 (RLS로도 막힘). 세션·장면·채팅·전투·적 도감·초대가 함께 지워지고, 캐릭터는 캠페인 미참가 상태로 남는다. */
export async function deleteCampaign(campaignId: string): Promise<void> {
  const supabase = await createClient();
  const user = await getUser();
  if (!user) redirect("/");
  const { data: c } = await supabase.from("campaigns").select("owner_id").eq("id", campaignId).single();
  if (!c || c.owner_id !== user.id) throw new Error("캠페인 소유자만 삭제할 수 있습니다");
  const { error } = await supabase.from("campaigns").delete().eq("id", campaignId);
  if (error) throw new Error(error.message);
  redirect("/campaigns?all=1");
}
