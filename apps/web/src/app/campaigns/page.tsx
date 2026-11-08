import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button, Card, Input, PageTitle } from "@/components/ui";
import { createCampaign } from "./actions";

export default async function CampaignsPage() {
  const supabase = await createClient();
  const { data: campaigns } = await supabase
    .from("campaigns").select("id, name, created_at, campaign_members(role)").order("created_at", { ascending: false });

  return (
    <div>
      <PageTitle>캠페인</PageTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        {(campaigns ?? []).map((c) => (
          <Link key={c.id} href={`/campaigns/${c.id}`}>
            <Card className="h-full hover:border-accent">
              <div className="font-medium">{c.name}</div>
              <div className="mt-1 text-xs text-muted">
                {c.campaign_members?.[0]?.role === "gm" ? "GM" : c.campaign_members?.[0]?.role === "temp_gm" ? "임시 GM" : "플레이어"}
              </div>
            </Card>
          </Link>
        ))}
        {(campaigns ?? []).length === 0 ? <p className="text-sm text-muted">참가 중인 캠페인이 없습니다. 새로 만들거나 초대 링크로 참가하세요.</p> : null}
      </div>
      <Card className="mt-8 max-w-md">
        <h2 className="mb-3 font-medium">새 캠페인</h2>
        <form action={createCampaign} className="flex gap-2">
          <Input name="name" placeholder="캠페인 이름" required />
          <Button type="submit">만들기</Button>
        </form>
      </Card>
    </div>
  );
}
