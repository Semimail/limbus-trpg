import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button, Input } from "@/components/ui";
import { Panel } from "@/components/office/panel";
import { CharacterCard, type CharacterSummary } from "@/components/office/character-card";
import { DeleteCampaign } from "@/components/office/delete-campaign";
import { approveCharacter, closeSession, createInvite, openSession, setMemberRole, updateNotice } from "../actions";

const ROLE_LABEL = { gm: "GM", temp_gm: "임시 GM", player: "플레이어" } as const;

export default async function OfficePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: campaign } = await supabase.from("campaigns").select("id, name, owner_id, notice, next_session_note").eq("id", id).single();
  if (!campaign || !user) notFound();

  const [{ data: members }, { data: invites }, { data: characters }, { data: sessions }, { count: enemyCount }] = await Promise.all([
    supabase.from("campaign_members").select("user_id, role, profiles(username, avatar_url)").eq("campaign_id", id),
    supabase.from("campaign_invites").select("code, uses").eq("campaign_id", id).order("created_at", { ascending: false }).limit(3),
    supabase.from("characters").select("id, name, owner_id, approved, portrait_url, data").eq("campaign_id", id).order("created_at"),
    supabase.from("sessions").select("id, title, status, started_at, ended_at").eq("campaign_id", id).order("started_at", { ascending: false }),
    supabase.from("enemies").select("id", { count: "exact", head: true }).eq("campaign_id", id),
  ]);

  const me = members?.find((m) => m.user_id === user.id);
  const isGm = me?.role === "gm" || me?.role === "temp_gm";
  const isOwnerGm = me?.role === "gm";
  const isOwner = campaign.owner_id === user.id;
  const openSessions = (sessions ?? []).filter((s) => s.status === "open");
  const closedSessions = (sessions ?? []).filter((s) => s.status === "closed");
  const mine = (characters ?? []).filter((c) => c.owner_id === user.id) as CharacterSummary[];
  const others = (characters ?? []).filter((c) => c.owner_id !== user.id);
  const pending = (characters ?? []).filter((c) => !c.approved);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="stamp">해결사 사무소</div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{campaign.name}</h1>
        </div>
        <span className="text-sm text-muted">{me ? ROLE_LABEL[me.role] : ""}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* 왼쪽 2/3 */}
        <div className="space-y-4 lg:col-span-2">
          <Panel title="세션" stamp="LIVE">
            {openSessions.length > 0 ? (
              <ul className="space-y-2">
                {openSessions.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 border border-accent/40 bg-accent/5 p-3">
                    <div>
                      <div className="font-medium">{s.title}</div>
                      <div className="text-xs text-muted">진행 중 · {new Date(s.started_at).toLocaleString("ko-KR")}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/campaigns/${id}/sessions/${s.id}`}><Button>입장</Button></Link>
                      {isGm ? <form action={closeSession.bind(null, id, s.id)}><Button variant="ghost">종료</Button></form> : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-muted">
                진행 중인 세션이 없습니다.
                {campaign.next_session_note ? <p className="mt-1 text-fg">다음 세션: {campaign.next_session_note}</p> : null}
              </div>
            )}
            {isGm ? (
              <form action={openSession.bind(null, id)} className="mt-3 flex gap-2">
                <Input name="title" placeholder="세션 제목 (비우면 날짜)" />
                <Button type="submit" variant="ghost">세션 열기</Button>
              </form>
            ) : null}
          </Panel>

          <Panel title="의뢰 게시판" stamp="NOTICE">
            {campaign.notice ? <p className="whitespace-pre-wrap text-sm">{campaign.notice}</p> : <p className="text-sm text-muted">게시된 의뢰가 없습니다.</p>}
            {isGm ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-muted">편집</summary>
                <form action={updateNotice.bind(null, id)} className="mt-2 space-y-2">
                  <textarea name="notice" defaultValue={campaign.notice} rows={4} placeholder="공지 / 의뢰 내용"
                    className="w-full rounded-md border border-border bg-elev px-3 py-2 text-sm outline-none focus:border-accent" />
                  <Input name="next_session_note" defaultValue={campaign.next_session_note} placeholder="다음 세션 예정 (예: 11/15 토 20:00)" />
                  <Button type="submit" variant="ghost">저장</Button>
                </form>
              </details>
            ) : null}
          </Panel>

          <div className="grid gap-4 sm:grid-cols-3">
            <Panel title="파티원">
              <ul className="space-y-1 text-sm">
                {others.map((c) => <li key={c.id} className="truncate">{c.name}</li>)}
                {others.length === 0 ? <li className="text-muted">아직 없음</li> : null}
              </ul>
            </Panel>
            <Panel title="기록 보관소">
              <ul className="space-y-1 text-sm">
                {closedSessions.slice(0, 5).map((s) => (
                  <li key={s.id}><Link href={`/campaigns/${id}/sessions/${s.id}`} className="hover:text-accent">{s.title}</Link></li>
                ))}
                {closedSessions.length === 0 ? <li className="text-muted">종료된 세션 없음</li> : null}
              </ul>
            </Panel>
            <Panel title="적 도감">
              <p className="text-sm text-muted">{isGm ? `등록 ${enemyCount ?? 0}` : "마주친 적 0"}</p>
              <p className="mt-1 text-xs text-muted">다음 단계에서 구현</p>
            </Panel>
          </div>
        </div>

        {/* 오른쪽 1/3 (모바일에서는 맨 위) */}
        <div className="order-first space-y-4 lg:order-none">
          <Panel title="내 캐릭터" right={<Link href={`/characters/new?campaign=${id}`} className="text-xs text-accent">+ 만들기</Link>}>
            <div className="space-y-2">
              {mine.map((c) => <CharacterCard key={c.id} c={c} />)}
              {mine.length === 0 ? <p className="text-sm text-muted">아직 캐릭터가 없습니다.</p> : null}
            </div>
          </Panel>

          {isGm ? (
            <Panel title="GM" stamp="GM ONLY">
              <div className="space-y-4 text-sm">
                <div>
                  <div className="mb-1 text-xs text-muted">승인 대기 캐릭터</div>
                  {pending.length === 0 ? <p className="text-muted">없음</p> : null}
                  <ul className="space-y-1">
                    {pending.map((c) => (
                      <li key={c.id} className="flex items-center justify-between">
                        <Link href={`/characters/${c.id}`} className="hover:text-accent">{c.name}</Link>
                        <form action={approveCharacter.bind(null, id, c.id, true)}><Button variant="ghost" className="px-2 py-0.5 text-xs">승인</Button></form>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="mb-1 text-xs text-muted">참가자</div>
                  <ul className="space-y-1">
                    {(members ?? []).map((m) => {
                      const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
                      return (
                        <li key={m.user_id} className="flex items-center justify-between gap-2">
                          <span className="truncate">{p?.username || "이름 없음"}</span>
                          <span className="flex items-center gap-2 text-muted">
                            {ROLE_LABEL[m.role]}
                            {isOwnerGm && m.role !== "gm" ? (
                              <form action={setMemberRole.bind(null, id, m.user_id, m.role === "player" ? "temp_gm" : "player")}>
                                <Button variant="ghost" className="px-2 py-0.5 text-xs">{m.role === "player" ? "임시 GM" : "해제"}</Button>
                              </form>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div>
                  <div className="mb-1 text-xs text-muted">초대</div>
                  <ul className="space-y-1">
                    {(invites ?? []).map((i) => (
                      <li key={i.code} className="flex items-center justify-between">
                        <code className="rounded bg-fg/5 px-1">{i.code}</code>
                        <span className="text-xs text-muted">/join/{i.code} · {i.uses}회</span>
                      </li>
                    ))}
                  </ul>
                  <form action={createInvite.bind(null, id)} className="mt-2">
                    <Button variant="ghost" className="px-2 py-1 text-xs">초대 코드 만들기</Button>
                  </form>
                </div>
                {isOwner ? (
                  <div className="border-t border-border pt-3">
                    <div className="mb-1 text-xs text-muted">위험 구역 (소유자 전용)</div>
                    <DeleteCampaign campaignId={id} name={campaign.name} />
                  </div>
                ) : null}
              </div>
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
