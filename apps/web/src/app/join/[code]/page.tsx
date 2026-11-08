import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { DiscordLogin } from "@/components/discord-login";
import { Button, Card } from "@/components/ui";
import { joinCampaign } from "@/app/campaigns/actions";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await getUser();
  if (!user) {
    return (
      <Card className="mx-auto mt-12 max-w-md text-center">
        <p className="mb-4">캠페인에 참가하려면 먼저 로그인하세요.</p>
        <DiscordLogin next={`/join/${code}`} />
      </Card>
    );
  }
  async function join() {
    "use server";
    const r = await joinCampaign(code.toUpperCase());
    if (r?.error) redirect(`/join/${code}?error=${encodeURIComponent(r.error)}`);
  }
  return (
    <Card className="mx-auto mt-12 max-w-md text-center">
      <p className="mb-1 text-sm text-muted">초대 코드</p>
      <p className="mb-4 text-2xl font-semibold tracking-widest">{code.toUpperCase()}</p>
      <form action={join}><Button type="submit">참가하기</Button></form>
    </Card>
  );
}
