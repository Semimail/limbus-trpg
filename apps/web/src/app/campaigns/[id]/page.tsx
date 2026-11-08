import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button, Card, PageTitle } from "@/components/ui";
import { createInvite, setMemberRole } from "../actions";

const ROLE_LABEL = { gm: "GM", temp_gm: "임시 GM", player: "플레이어" } as const;

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: campaign } = await supabase.from("campaigns").select("id, name, owner_id").eq("id", id).single();
  if (!campaign || !user) notFound();

  const [{ data: members }, { data: invites }, { data: characters }, { data: sessions }] = await Promise.all([
    supabase.from("campaign_members").select("user_id, role, profiles(username, avatar_url)").eq("campaign_id", id),
    supabase.from("campaign_invites").select("code, uses, created_at").eq("campaign_id", id).order("created_at", { ascending: false }),
    supabase.from("characters").select("id, name, owner_id, approved, portrait_url").eq("campaign_id", id),
    supabase.from("sessions").select("id, title, status, started_at").eq("campaign_id", id).order("started_at", { ascending: false }),
  ]);

  const me = members?.find((m) => m.user_id === user.id);
  const isGm = me?.role === "gm" || me?.role === "temp_gm";
  const isOwnerGm = me?.role === "gm";

  return (
    <div>
      <PageTitle right={<span className="text-sm text-muted">{me ? ROLE_LABEL[me.role] : ""}</span>}>{campaign.name}</PageTitle>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-medium">세션</h2>
          {(sessions ?? []).length === 0 ? <p className="text-sm text-muted">아직 세션이 없습니다.</p> : null}
          <ul className="space-y-1 text-sm">
            {(sessions ?? []).map((s) => (
              <li key={s.id} className="flex justify-between">
                <Link href={`/campaigns/${id}/sessions/${s.id}`} className="hover:text-accent">{s.title}</Link>
                <span className="text-muted">{s.status === "open" ? "진행 중" : "종료"}</span>
              </li>
            ))}
          </ul>
          {isGm ? <p className="mt-3 text-xs text-muted">세션 시작 기능은 다음 단계에서 추가됩니다.</p> : null}
        </Card>

        <Card>
          <h2 className="mb-3 font-medium">캐릭터</h2>
          {(characters ?? []).length === 0 ? <p className="text-sm text-muted">참가한 캐릭터가 없습니다.</p> : null}
          <ul className="space-y-1 text-sm">
            {(characters ?? []).map((c) => (
              <li key={c.id} className="flex justify-between">
                <Link href={`/characters/${c.id}`} className="hover:text-accent">{c.name}</Link>
                <span className="text-muted">{c.approved ? "승인됨" : "승인 대기"}</span>
              </li>
            ))}
          </ul>
          <Link href={`/characters/new?campaign=${id}`} className="mt-3 inline-block text-sm text-accent">+ 캐릭터 만들기</Link>
        </Card>

        <Card>
          <h2 className="mb-3 font-medium">참가자</h2>
          <ul className="space-y-2 text-sm">
            {(members ?? []).map((m) => {
              const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
              return (
                <li key={m.user_id} className="flex items-center justify-between gap-2">
                  <span>{p?.username || "이름 없음"}</span>
                  <span className="flex items-center gap-2 text-muted">
                    {ROLE_LABEL[m.role]}
                    {isOwnerGm && m.role !== "gm" ? (
                      <form action={setMemberRole.bind(null, id, m.user_id, m.role === "player" ? "temp_gm" : "player")}>
                        <Button variant="ghost" className="px-2 py-0.5 text-xs">{m.role === "player" ? "임시 GM 지정" : "해제"}</Button>
                      </form>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>

        {isGm ? (
          <Card>
            <h2 className="mb-3 font-medium">초대</h2>
            <ul className="space-y-1 text-sm">
              {(invites ?? []).map((i) => (
                <li key={i.code} className="flex justify-between">
                  <code className="rounded bg-fg/5 px-1">{i.code}</code>
                  <span className="text-muted">사용 {i.uses}회</span>
                </li>
              ))}
            </ul>
            <form action={createInvite.bind(null, id)} className="mt-3">
              <Button variant="ghost" type="submit">초대 코드 만들기</Button>
            </form>
            <p className="mt-2 text-xs text-muted">참가자는 초대 링크 /join/코드 로 들어옵니다.</p>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
