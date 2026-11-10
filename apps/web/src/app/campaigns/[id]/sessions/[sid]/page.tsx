import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { Panel } from "@/components/office/panel";
import { Chat, type ChatMessage } from "@/components/session/chat";
import { SceneBar, type SceneRow } from "@/components/session/scene-bar";
import { closeSession } from "@/app/campaigns/actions";
import { Button } from "@/components/ui";

export default async function SessionPage({ params }: { params: Promise<{ id: string; sid: string }> }) {
  const { id, sid } = await params;
  const supabase = await createClient();
  const user = await getUser();
  const { data: s } = await supabase.from("sessions").select("id, title, status, started_at, current_scene_id").eq("id", sid).single();
  if (!s || !user) notFound();

  const [{ data: members }, { data: scenes }, { data: chars }, { data: msgs }] = await Promise.all([
    supabase.from("campaign_members").select("user_id, role, profiles(username)").eq("campaign_id", id),
    supabase.from("scenes").select("id, title, kind, order_index").eq("session_id", sid).order("order_index"),
    supabase.from("characters").select("id, name, owner_id").eq("campaign_id", id),
    supabase.from("messages").select("id, kind, content, created_at, author_id, character_id, to_user_id, payload").eq("session_id", sid).order("id", { ascending: false }).limit(150),
  ]);
  const me = members?.find((m) => m.user_id === user.id);
  const isGm = me?.role === "gm" || me?.role === "temp_gm";
  const memberList = (members ?? []).map((m) => {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return { user_id: m.user_id, username: p?.username || "이름 없음", role: m.role };
  });
  const charNames = Object.fromEntries((chars ?? []).map((c) => [c.id, c.name]));
  const myChars = (chars ?? []).filter((c) => c.owner_id === user.id).map((c) => ({ id: c.id, name: c.name }));
  const current = (scenes ?? []).find((x) => x.id === s.current_scene_id) ?? null;
  const open = s.status === "open";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Link href={`/campaigns/${id}`} className="text-sm text-muted hover:text-fg">← 사무소</Link>
          <h1 className="text-xl font-bold">{s.title}</h1>
          <span className="text-xs text-muted">{open ? "진행 중" : "종료"}</span>
        </div>
        {isGm && open ? <form action={closeSession.bind(null, id, sid)}><Button variant="ghost" className="text-xs">세션 종료</Button></form> : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="order-last space-y-3 lg:order-none lg:col-span-2">
          <Panel title="장면" stamp={current ? ({ drama: "드라마", explore: "탐색", combat: "전투" } as const)[current.kind] : undefined}>
            <SceneBar campaignId={id} sessionId={sid} scenes={(scenes ?? []) as SceneRow[]} currentId={s.current_scene_id} isGm={isGm} sessionOpen={open} />
          </Panel>
          <Panel title={current ? current.title : "보드"} className="min-h-64">
            {current?.kind === "combat"
              ? <p className="text-sm text-muted">전투 보드는 다음 단계에서 구현됩니다. 지금은 채팅의 /coin 과 /r 명령으로 진행하세요.</p>
              : <p className="text-sm text-muted">장면 보드(배경 이미지, 토큰)는 이후에 추가됩니다.</p>}
          </Panel>
        </div>
        <Panel title="채팅" className="order-first lg:order-none lg:sticky lg:top-4">
          <Chat sessionId={sid} sceneId={s.current_scene_id} meId={user.id} isGm={isGm} members={memberList}
            myChars={myChars} charNames={charNames} initial={((msgs ?? []) as unknown as ChatMessage[]).reverse()} sessionOpen={open} />
        </Panel>
      </div>
    </div>
  );
}
