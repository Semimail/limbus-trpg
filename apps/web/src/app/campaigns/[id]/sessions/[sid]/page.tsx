import { notFound } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { Chat, type ChatMessage } from "@/components/session/chat";
import { SceneBar, type SceneRow } from "@/components/session/scene-bar";
import { deleteSession } from "@/app/campaigns/actions";
import { DeleteSession } from "@/components/session/delete-session";
import { BattleScreen, type EnemyInfo } from "@/components/combat/battle-screen";
import type { TokenSource } from "@/components/board/scene-board";
import { SessionScreen } from "@/components/session/session-screen";
import type { StageActor } from "@/components/session/stage";
import type { CharacterData } from "@limbus/rules";
import type { BoardData } from "./actions";
import { getCampaignRules } from "@/lib/rules";
import type { CombatState, EnemyData } from "@limbus/rules";

export default async function SessionPage({ params }: { params: Promise<{ id: string; sid: string }> }) {
  const { id, sid } = await params;
  const supabase = await createClient();
  const user = await getUser();
  const { data: s } = await supabase.from("sessions").select("id, title, status, started_at, current_scene_id").eq("id", sid).single();
  if (!s || !user) notFound();

  // 세션에 필요한 조회를 한 번에 (왕복 최소화)
  const [{ data: members }, { data: scenes }, { data: chars }, { data: msgs }, { data: activeCombat }, { data: foes }, { rules }] = await Promise.all([
    supabase.from("campaign_members").select("user_id, role, profiles(username)").eq("campaign_id", id),
    supabase.from("scenes").select("id, title, kind, order_index, board").eq("session_id", sid).order("order_index"),
    supabase.from("characters").select("id, name, owner_id, portrait_url, approved, data").eq("campaign_id", id).order("created_at"),
    supabase.from("messages").select("id, kind, content, created_at, author_id, character_id, to_user_id, payload").eq("session_id", sid).order("id", { ascending: false }).limit(150),
    s.current_scene_id
      ? supabase.from("combats").select("id, state, phase, scene_id").eq("scene_id", s.current_scene_id).neq("phase", "ended").order("created_at", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("enemies").select("id, name, portrait_url, data").eq("campaign_id", id).order("name"),
    getCampaignRules(id),
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
  // 전투 장면이면 활성 전투 또는 준비 화면
  let combat: { id: string; state: CombatState } | null = null;
  let setup: { allies: { id: string; name: string; owner: string; approved: boolean }[]; enemies: { id: string; name: string; threat: string; maxHp: number }[] } | null = null;
  if (current?.kind === "combat") {
    if (activeCombat) combat = { id: activeCombat.id, state: activeCombat.state as unknown as CombatState };
    else if (isGm && open) {
      const ownerName = (uid: string) => memberList.find((m) => m.user_id === uid)?.username ?? "";
      setup = {
        allies: (chars ?? []).map((c) => ({ id: c.id, name: c.name, owner: ownerName(c.owner_id), approved: c.approved })),
        enemies: (foes ?? []).map((f) => { const d = f.data as unknown as EnemyData; return { id: f.id, name: f.name, threat: d.threat, maxHp: d.maxHp }; }),
      };
    }
  }
  // 이름표 꼬리표: PC 는 "출신 · 소속", NPC 는 위험 등급
  const actors: StageActor[] = [
    ...(chars ?? []).map((c) => { const d = c.data as unknown as Partial<CharacterData>; return { id: `c:${c.id}`, name: c.name, portraitUrl: c.portrait_url, cardUrl: d?.cardUrl ?? null, tag: [d?.origin, d?.affiliation].filter(Boolean).join(" · ") || null, spriteUrl: d?.spriteUrl ?? null, spritePoses: d?.spritePoses ?? null, spriteAnims: d?.spriteAnims ?? null, kind: "pc" as const }; }),
    ...(foes ?? []).map((f) => { const d = f.data as unknown as Partial<EnemyData>; return { id: `e:${f.id}`, name: f.name, portraitUrl: f.portrait_url, cardUrl: null, tag: d?.threat ? `위험 등급 ${d.threat}` : null, spriteUrl: d?.spriteUrl ?? null, spritePoses: d?.spritePoses ?? null, spriteAnims: d?.spriteAnims ?? null, kind: "npc" as const }; }),
  ];
  const boardData: BoardData = (() => { const b = (current?.board ?? {}) as Partial<BoardData>; return { background: b.background ?? null, tokens: b.tokens ?? [], stage: b.stage, bgm: b.bgm ?? null }; })();
  const ownerName = (uid: string) => memberList.find((m) => m.user_id === uid)?.username ?? "";
  const charRows = (chars ?? []).map((c) => { const d = c.data as unknown as Partial<CharacterData>; return { id: c.id, name: c.name, owner: ownerName(c.owner_id), ownerId: c.owner_id, approved: c.approved, hp: d.hp ?? 0, maxHp: d.maxHp ?? 0, sanity: d.sanity ?? 0,
    // 판정 팝업용: 능력치·출신·특기 이름·빛·초상
    stats: d.stats ?? ({} as CharacterData["stats"]), origin: d.origin ?? null, traits: (d.traits ?? []).map((t) => t.name).filter(Boolean), light: d.light ?? 0, portraitUrl: c.portrait_url, cardUrl: d.cardUrl ?? null }; });
  let tokenSources: TokenSource[] = (chars ?? []).map((c) => ({ id: c.id, name: c.name, img: c.portrait_url, ownerId: c.owner_id, kind: "character" as const }));
  if (isGm && current && current.kind !== "combat") {
    tokenSources = [...tokenSources, ...(foes ?? []).map((f) => ({ id: f.id, name: f.name, img: f.portrait_url, ownerId: null, kind: "enemy" as const }))];
  }

  if (combat) {
    // 적 카드용: 기믹 목록 + (플레이어는) 내 캐릭터에게 공개된 기믹만
    const enemyIds = Array.from(new Set(combat.state.units.filter((u) => u.source.kind === "enemy").map((u) => u.source.id)));
    const myCharIds = myChars.map((c) => c.id);
    const { data: reveals } = !isGm && enemyIds.length && myCharIds.length
      ? await supabase.from("enemy_reveals").select("enemy_id, revealed_gimmicks").in("enemy_id", enemyIds).in("character_id", myCharIds)
      : { data: [] as { enemy_id: string; revealed_gimmicks: string[] }[] };
    const enemyInfo: Record<string, EnemyInfo> = {};
    for (const f of foes ?? []) {
      if (!enemyIds.includes(f.id)) continue;
      const d = f.data as unknown as EnemyData;
      enemyInfo[f.id] = { threat: d.threat, description: d.description ?? "", gimmicks: (d.gimmicks ?? []).map((g) => ({ id: g.id, name: g.name, text: g.text })), revealed: Array.from(new Set((reveals ?? []).filter((r) => r.enemy_id === f.id).flatMap((r) => r.revealed_gimmicks ?? []))) };
    }
    return (
      <BattleScreen campaignId={id} combatId={combat.id} initial={combat.state} meId={user.id} isGm={isGm} rules={rules} enemyInfo={enemyInfo} background={boardData.background}
        sessionTitle={s.title} sceneTitle={current?.title ?? ""} backHref={`/campaigns/${id}`}
        sceneTools={isGm ? <SceneBar campaignId={id} sessionId={sid} scenes={(scenes ?? []) as SceneRow[]} currentId={s.current_scene_id} isGm={isGm} sessionOpen={open} /> : undefined}
        chat={<Chat sessionId={sid} sceneId={s.current_scene_id} meId={user.id} isGm={isGm} members={memberList} myChars={myChars} charNames={charNames}
          initial={((msgs ?? []) as unknown as ChatMessage[]).reverse()} sessionOpen={open} fill />} />
    );
  }

  // 종료된 세션은 GM이 삭제할 수 있게 작은 머리말만 두고, 나머지는 전체 화면 세션 화면
  return (
    <>
      {!open && isGm ? <div className="fixed left-1/2 top-2 z-50 -translate-x-1/2"><DeleteSession title={s.title} action={deleteSession.bind(null, id, sid)} /></div> : null}
      <SessionScreen campaignId={id} sessionId={sid} sessionTitle={s.title} sessionOpen={open} meId={user.id} isGm={isGm}
        members={memberList} myChars={myChars} charNames={charNames} initialMessages={((msgs ?? []) as unknown as ChatMessage[]).reverse()}
        scenes={(scenes ?? []) as SceneRow[]} current={(current as SceneRow | null)} board={boardData} actors={actors} tokenSources={tokenSources}
        chars={charRows} setup={setup} backHref={`/campaigns/${id}`} />
    </>
  );
}
