import { DEFAULT_RULES, DEFAULT_PROGRESSION, type RuleConfig, type ProgressionConfig } from "@limbus/rules";
import { createClient } from "@/lib/supabase/server";

export interface CampaignRules { rules: RuleConfig; progression: ProgressionConfig }

/** 캠페인에 저장된 오버라이드를 기본값과 합친다 */
export function mergeRules(raw: unknown): CampaignRules {
  const o = (raw && typeof raw === "object" ? raw : {}) as { rules?: Partial<RuleConfig>; progression?: Partial<ProgressionConfig> };
  // 격자 전술 레이어는 보류(사용자 결정: "격자 없애고 림버스처럼"). 저장된 오버라이드가 있어도 끈다.
  return { rules: { ...DEFAULT_RULES, ...(o.rules ?? {}), gridEnabled: false }, progression: { ...DEFAULT_PROGRESSION, ...(o.progression ?? {}) } };
}

export async function getCampaignRules(campaignId: string): Promise<CampaignRules> {
  const supabase = await createClient();
  const { data } = await supabase.from("campaigns").select("rules").eq("id", campaignId).single();
  return mergeRules(data?.rules);
}
