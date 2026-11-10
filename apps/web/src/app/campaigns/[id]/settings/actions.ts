"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { RuleConfig, ProgressionConfig } from "@limbus/rules";

export async function saveRules(campaignId: string, rules: Partial<RuleConfig>, progression: Partial<ProgressionConfig>): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("campaigns").update({ rules: JSON.parse(JSON.stringify({ rules, progression })) }).eq("id", campaignId);
  if (error) return { error: error.message };
  revalidatePath(`/campaigns/${campaignId}`);
  return {};
}
