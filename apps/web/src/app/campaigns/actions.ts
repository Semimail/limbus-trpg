"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createCampaign(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { data, error } = await supabase.from("campaigns").insert({ name, owner_id: user.id }).select("id").single();
  if (error) throw new Error(error.message);
  redirect(`/campaigns/${data.id}`);
}

export async function createInvite(campaignId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
