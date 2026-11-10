import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { mergeRules } from "@/lib/rules";
import { RulesForm } from "./rules-form";

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getUser();
  const { data: c } = await supabase.from("campaigns").select("id, name, rules, owner_id").eq("id", id).single();
  if (!c || !user) notFound();
  const { data: me } = await supabase.from("campaign_members").select("role").eq("campaign_id", id).eq("user_id", user.id).maybeSingle();
  if (me?.role !== "gm") notFound();
  const { rules, progression } = mergeRules(c.rules);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3"><Link href={`/campaigns/${id}`} className="text-sm text-muted hover:text-fg">← 사무소</Link><h1 className="text-2xl font-bold">룰 설정</h1></div>
      <p className="text-sm text-muted">여기 값은 이 캠페인의 새 전투와 판정에 바로 적용됩니다. 진행 중인 전투에는 영향을 주지 않습니다.</p>
      <RulesForm campaignId={id} rules={rules} progression={progression} />
    </div>
  );
}
