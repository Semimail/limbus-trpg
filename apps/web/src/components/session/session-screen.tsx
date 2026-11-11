"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient, realtimeReady } from "@/lib/supabase/client";
import { Chat, useSessionMessages, type ChatMessage, type Member, type MyChar } from "./chat";
import { Stage, type StageActor, type TypingLine } from "./stage";
import { GmConsole, type ConsoleTab } from "./gm-console";
import { SceneBoard, type TokenSource } from "@/components/board/scene-board";
import { sendMessage, updateBoard, type BoardData, type MessageKind } from "@/app/campaigns/[id]/sessions/[sid]/actions";
import type { SceneRow } from "./scene-bar";
import type { AllyOption, EnemyOption } from "@/components/combat/setup";

/*
 * 세션 화면 (비전투): 참고 영상의 LIMBUS PLAY 모듈 레이아웃
 *  - 무대(스탠딩 + 대사 상자)가 화면을 채우고, 좌상단에 파티 초상(등장 상태), 아래 바에서 대사를 입력한다.
 *  - 입력 중이면 모두의 대사 상자에 "○○이(가) 잠시 말을 고른다…" 같은 지문이 뜬다(실시간 브로드캐스트).
 *  - 대사를 보내면 그 캐릭터가 무대에 없을 때 자동으로 등장한다(서버 액션이 출연진에 추가).
 *  - 오른쪽 서랍: 채팅 기록 / 시트 / GM 콘솔(진행·무대·전투·시트).
 */

interface Props {
  campaignId: string; sessionId: string; sessionTitle: string; sessionOpen: boolean; meId: string; isGm: boolean;
  members: Member[]; myChars: MyChar[]; charNames: Record<string, string>; initialMessages: ChatMessage[];
  scenes: SceneRow[]; current: SceneRow | null; board: BoardData; actors: StageActor[]; tokenSources: TokenSource[];
  chars: { id: string; name: string; owner: string; approved: boolean; hp: number; maxHp: number; sanity: number; ownerId: string }[];
  setup: { allies: AllyOption[]; enemies: EnemyOption[] } | null; backHref: string;
}

const TYPING_LINES = ["{n}{이가} 잠시 말을 고른다…", "{n}{이가} 입을 열려 한다…", "{n}{이가} 숨을 고른다…", "{n}{이가} 무언가 말하려 한다…", "{n}의 시선이 잠시 흔들린다…", "{n}{이가} 생각에 잠긴다…", "{n}{이가} 천천히 고개를 든다…"];
const iga = (n: string) => { const c = n.charCodeAt(n.length - 1); if (c < 0xac00 || c > 0xd7a3) return "이(가)"; return (c - 0xac00) % 28 ? "이" : "가"; };
const typingLine = (name: string | null) => name ? TYPING_LINES[Math.floor(Math.random() * TYPING_LINES.length)]!.replace("{n}", name).replace("{이가}", iga(name)) : "GM이 상황을 서술하는 중…";

export function SessionScreen(p: Props) {
  const router = useRouter();
  const store = useSessionMessages(p.sessionId, p.initialMessages);
  const [board, setBoard] = useState<BoardData>(p.board);
  const [mode, setMode] = useState<"stage" | "map">("stage");
  const [drawer, setDrawer] = useState<null | "chat" | "sheets" | "gm">(null);
  const [tab, setTab] = useState<ConsoleTab>(p.current ? (p.current.kind === "combat" ? "combat" : "stage") : "flow");
  const sceneId = p.current?.id ?? null;
  const gmNames = useMemo(() => Object.fromEntries(p.members.map((m) => [m.user_id, m.username])), [p.members]);
  // 서버가 새 보드를 내려주면(장면 전환·새로고침) 로컬 상태를 맞춘다
  const [prevBoard, setPrevBoard] = useState(p.board);
  if (p.board !== prevBoard) { setPrevBoard(p.board); setBoard(p.board); }
  useEffect(() => { const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = prev; }; }, []);

  // 실시간: 장면 보드(출연진·배경) / 세션의 현재 장면 바뀌면 새로고침
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false; let ch: ReturnType<typeof supabase.channel> | null = null;
    void realtimeReady(supabase).then(() => {
      if (cancelled) return;
      ch = supabase.channel(`session-screen:${p.sessionId}:${Math.random().toString(36).slice(2, 8)}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${p.sessionId}` },
          (ev) => { const n = ev.new as { current_scene_id?: string | null; status?: string }; if (n.current_scene_id !== sceneId || (n.status === "closed") !== !p.sessionOpen) router.refresh(); })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "combats" }, () => router.refresh());
      if (sceneId) ch.on("postgres_changes", { event: "UPDATE", schema: "public", table: "scenes", filter: `id=eq.${sceneId}` },
        (ev) => { const b = (ev.new as { board?: Partial<BoardData> }).board; if (b) setBoard({ background: b.background ?? null, tokens: b.tokens ?? [], stage: b.stage }); });
      ch.subscribe();
    });
    return () => { cancelled = true; if (ch) void supabase.removeChannel(ch); };
  }, [p.sessionId, sceneId, p.sessionOpen, router]);

  /* ---- 입력 중 지문 (브로드캐스트) ---- */
  const [typing, setTyping] = useState<Record<string, TypingLine & { ts: number }>>({});
  const typingCh = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  useEffect(() => {
    if (!sceneId) return;
    const supabase = createClient();
    let cancelled = false;
    void realtimeReady(supabase).then(() => {
      if (cancelled) return;
      const ch = supabase.channel(`typing:${sceneId}`, { config: { broadcast: { self: true } } })
        .on("broadcast", { event: "typing" }, ({ payload }) => { const t = payload as { key: string; name: string; line: string; stop?: boolean }; setTyping((m) => { const n = { ...m }; if (t.stop) delete n[t.key]; else n[t.key] = { key: t.key, name: t.name, line: t.line, ts: Date.now() }; return n; }); })
        .subscribe();
      typingCh.current = ch;
    });
    const iv = setInterval(() => setTyping((m) => { const now = Date.now(); const n = Object.fromEntries(Object.entries(m).filter(([, v]) => now - v.ts < 4000)); return Object.keys(n).length === Object.keys(m).length ? m : n; }), 1000);
    return () => { cancelled = true; clearInterval(iv); const ch = typingCh.current; typingCh.current = null; if (ch) void supabase.removeChannel(ch); };
  }, [sceneId]);
  const myLine = useRef<{ line: string; at: number } | null>(null);
  const sendTyping = useCallback((name: string | null, stop = false) => {
    const ch = typingCh.current; if (!ch) return;
    const key = p.meId;
    if (stop) { myLine.current = null; void ch.send({ type: "broadcast", event: "typing", payload: { key, name: name ?? "GM", line: "", stop: true } }); return; }
    const now = Date.now();
    if (!myLine.current || now - myLine.current.at > 6000) myLine.current = { line: typingLine(name), at: now };
    else if (now - myLine.current.at < 1500) return; // 과도한 전송 방지
    myLine.current.at = now;
    void ch.send({ type: "broadcast", event: "typing", payload: { key, name: name ?? "GM", line: myLine.current.line } });
  }, [p.meId]);

  /* ---- 입력 바 ---- */
  const [kind, setKind] = useState<MessageKind>(p.myChars.length ? "ic" : p.isGm ? "gm" : "ooc");
  const [speaker, setSpeaker] = useState<string>(p.myChars[0]?.id ?? "gm");   // 캐릭터 id | "gm" | "npc:<id>"
  const [toUser, setToUser] = useState<string | null>(p.members.find((m) => m.user_id !== p.meId)?.user_id ?? null);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const npcs = p.actors.filter((a) => a.kind === "npc");
  const speakerName = kind === "ic" ? (p.charNames[speaker] ?? null) : kind === "gm" && speaker.startsWith("npc:") ? (npcs.find((a) => a.id === `e:${speaker.slice(4)}`)?.name ?? null) : null;
  const castId = kind === "ic" ? `c:${speaker}` : kind === "gm" && speaker.startsWith("npc:") ? `e:${speaker.slice(4)}` : null;
  const cast = board.stage?.cast ?? [];
  const onStage = castId ? cast.includes(castId) : false;
  const buildInput = (imageUrl?: string) => ({ sessionId: p.sessionId, sceneId, kind, content: text, characterId: kind === "ic" ? speaker : null, toUserId: toUser, imageUrl: imageUrl ?? null, npc: kind === "gm" && speaker.startsWith("npc:") ? { id: speaker.slice(4), name: speakerName ?? "NPC" } : null });
  const send = () => {
    if (!text.trim()) return;
    setErr(null); const body = text; setText(""); sendTyping(speakerName, true);
    start(async () => {
      const r = await sendMessage(buildInput());
      if (r.error) { setErr(r.error); setText(body); return; }
      if (r.message) store.append(r.message as unknown as ChatMessage);
    });
  };
  const uploadImage = async (file: File) => {
    setUploading(true); setErr(null);
    try {
      const supabase = createClient();
      const path = `${p.meId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error } = await supabase.storage.from("uploads").upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("uploads").getPublicUrl(path);
      const r = await sendMessage({ ...buildInput(data.publicUrl), kind: kind === "system" ? "ooc" : kind });
      if (r.error) throw new Error(r.error);
      if (r.message) store.append(r.message as unknown as ChatMessage);
      setText("");
    } catch (e) { setErr(e instanceof Error ? e.message : "업로드 실패"); } finally { setUploading(false); }
  };
  const toggleCast = (id: string) => start(async () => {
    if (!sceneId) return; setErr(null);
    const next = cast.includes(id) ? cast.filter((x) => x !== id) : [...cast, id];
    const r = await updateBoard(p.campaignId, sceneId, { stage: { cast: next, split: board.stage?.split } });
    if (r.error) setErr(r.error); else if (r.board) setBoard(r.board);
  });
  const canToggle = (a: StageActor) => p.isGm || (a.kind === "pc" && p.chars.some((c) => `c:${c.id}` === a.id && c.ownerId === p.meId));
  const pcs = p.actors.filter((a) => a.kind === "pc");
  const typingList = Object.values(typing);
  const sceneLabel = p.current ? ({ drama: "드라마", explore: "탐색", combat: "전투" } as const)[p.current.kind] : null;

  return (
    <div className="battle fixed inset-0 z-40 overflow-hidden">
      {/* 무대 / 지도 */}
      <div className="absolute inset-x-0 top-0 bottom-[5.5rem] sm:bottom-[5.25rem]">
        {!p.current ? (
          <div className="flex h-full items-center justify-center bg-[#0a0707] text-center text-sm text-[#9a8f86]"><div>장면이 없습니다.{p.isGm ? " 오른쪽 GM 콘솔의 진행 탭에서 장면을 추가하세요." : " GM이 장면을 준비하고 있습니다."}</div></div>
        ) : mode === "map" ? (
          <div className="h-full overflow-auto p-2 pt-14"><SceneBoard key={p.current.id} campaignId={p.campaignId} sceneId={p.current.id} initial={board} isGm={p.isGm} meId={p.meId} sources={p.tokenSources} readOnly={!p.sessionOpen} /></div>
        ) : (
          <Stage fill background={board.background} actors={p.actors} messages={store.msgs} gmNames={gmNames} cast={board.stage?.cast ?? null} split={board.stage?.split} typing={typingList}
            overlay={p.current.kind === "combat" ? <div className="pointer-events-none absolute inset-x-0 top-[30%] flex justify-center"><div className="pointer-events-auto b-pane px-6 py-3 text-center text-sm"><div className="text-base font-bold text-[#f1d9a0]">전투 준비 중</div><div className="b-muted mt-1">{p.isGm ? "GM 콘솔 › 전투 탭에서 아군과 적을 고르고 전투를 시작하세요." : "GM이 전투를 준비하고 있습니다."}</div>{p.isGm ? <button type="button" className="b-btn-red mt-2" onClick={() => { setDrawer("gm"); setTab("combat"); }}>전투 준비 열기</button> : null}</div></div> : undefined} />
        )}
      </div>

      {/* 좌상단: 파티 초상 (등장 상태) */}
      <div className="absolute left-2 top-2 z-10 flex max-w-[70vw] items-start gap-1 overflow-x-auto [scrollbar-width:none]">
        <div className="b-pane flex items-center gap-1 px-1.5 py-1">
          {pcs.length === 0 ? <span className="b-muted px-1 text-[10px]">캐릭터 없음</span> : null}
          {pcs.map((a) => { const on = cast.includes(a.id); const ok = canToggle(a) && !!sceneId && p.sessionOpen;
            return (
              <button key={a.id} type="button" disabled={!ok || pending} onClick={() => toggleCast(a.id)} title={`${a.name}${on ? " · 등장 중" : " · 대기"}${ok ? " (누르면 등장/퇴장)" : ""}`} className={`flex w-12 flex-col items-center ${on ? "" : "opacity-45 grayscale"} ${ok ? "" : "cursor-default"}`}>
                <span className="block h-11 w-11 overflow-hidden" style={{ border: `2px solid ${on ? "#c9a24a" : "#5a4a3a"}`, background: "#140d0d" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {a.portraitUrl ? <img src={a.portraitUrl} alt="" className="h-full w-full object-cover" draggable={false} /> : <span className="flex h-full items-center justify-center text-sm font-bold">{a.name.slice(0, 1)}</span>}
                </span>
                <span className="w-full truncate text-center text-[9px] leading-tight" style={{ textShadow: "0 1px 2px #000" }}>{a.name}</span>
              </button>
            ); })}
          {npcs.filter((a) => cast.includes(a.id)).map((a) => (
            <button key={a.id} type="button" disabled={!p.isGm || pending} onClick={() => toggleCast(a.id)} title={`${a.name} (NPC)`} className="flex w-12 flex-col items-center">
              <span className="block h-11 w-11 overflow-hidden" style={{ border: "2px solid #b3161c", background: "#140d0d" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {a.portraitUrl ? <img src={a.portraitUrl} alt="" className="h-full w-full object-cover" draggable={false} /> : <span className="flex h-full items-center justify-center text-sm font-bold">{a.name.slice(0, 1)}</span>}
              </span>
              <span className="w-full truncate text-center text-[9px] leading-tight text-red-200">{a.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 우상단: 장면 정보 + 버튼 */}
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1 text-[11px]">
        {p.current ? <span className="b-pane px-2 py-1"><span className="b-gold">{sceneLabel}</span> · {p.current.title}</span> : null}
        <Link href={p.backHref} className="b-tabx">사무소</Link>
      </div>

      {/* 아래: 입력 바 */}
      <div className="absolute inset-x-0 bottom-8 z-10 flex h-[3.5rem] items-center gap-1 border-t px-2 sm:h-[3.25rem]" style={{ background: "linear-gradient(180deg, #1a1210, #0e0908)", borderColor: "#6a4e2a" }}>
        {p.sessionOpen ? (
          <>
            <select value={kind === "ic" ? `ic:${speaker}` : kind === "gm" ? `gm:${speaker.startsWith("npc:") ? speaker : "gm"}` : kind} onChange={(e) => { const v = e.target.value; if (v.startsWith("ic:")) { setKind("ic"); setSpeaker(v.slice(3)); } else if (v.startsWith("gm:")) { setKind("gm"); setSpeaker(v.slice(3)); } else setKind(v as MessageKind); }} className="b-input h-8 max-w-[9rem] px-1 text-xs" title="화자">
              {p.myChars.map((c) => <option key={c.id} value={`ic:${c.id}`}>{c.name}</option>)}
              {p.isGm ? <option value="gm:gm">GM 서술</option> : null}
              {p.isGm ? npcs.map((a) => <option key={a.id} value={`gm:npc:${a.id.slice(2)}`}>NPC · {a.name}</option>) : null}
              <option value="ooc">플레이어</option>
              <option value="whisper">귓속말</option>
            </select>
            {kind === "whisper" ? <select value={toUser ?? ""} onChange={(e) => setToUser(e.target.value || null)} className="b-input h-8 px-1 text-xs">{p.members.filter((m) => m.user_id !== p.meId).map((m) => <option key={m.user_id} value={m.user_id}>→ {m.username}</option>)}</select> : null}
            <input value={text} onChange={(e) => { setText(e.target.value); if (e.target.value && (kind === "ic" || kind === "gm")) sendTyping(speakerName); else if (!e.target.value) sendTyping(speakerName, true); }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
              placeholder={kind === "ic" ? "대사를 입력하고 Enter로 보내요. (/coin 분노 2, /vs 오만 이름 색욕)" : kind === "gm" ? (speaker.startsWith("npc:") ? "NPC의 대사" : "상황 서술 (지문)") : "메시지. /r 2d6+3"}
              className="b-input h-8 min-w-0 flex-1 px-3 text-sm" />
            <label className="b-btn hidden h-8 cursor-pointer items-center text-xs sm:flex">{uploading ? "…" : "이미지"}<input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadImage(f); e.target.value = ""; }} /></label>
            <button type="button" onClick={send} disabled={pending || !text.trim()} className="b-btn-red h-8 text-xs">전송</button>
            {castId && sceneId ? <button type="button" disabled={pending || !canToggleId(castId)} onClick={() => toggleCast(castId)} className={`b-tabx h-8 text-xs ${onStage ? "b-tabx-on" : ""}`} title={onStage ? "무대에서 내린다" : "말 없이 무대에 세운다"}>{onStage ? "퇴장" : "등장"}</button> : null}
          </>
        ) : <span className="b-muted px-2 text-xs">종료된 세션입니다. 기록만 볼 수 있습니다.</span>}
      </div>
      {err ? <div className="absolute bottom-[6rem] left-1/2 z-20 -translate-x-1/2 b-pane border-l-2 px-3 py-1 text-xs" style={{ borderLeftColor: "var(--b-red)", color: "#ffb3b3" }} onClick={() => setErr(null)}>{err}</div> : null}

      {/* 맨 아래 붉은 바 */}
      <div className="b-banner absolute inset-x-0 bottom-0 z-20 flex h-8 items-center gap-1 px-2 text-[11px]">
        <span className="b-logo mr-1 hidden px-2 py-0.5 text-[9px] font-black leading-none tracking-wider sm:block">LIMBUS<br />TRPG</span>
        <button type="button" className={`b-tabx ${mode === "stage" ? "b-tabx-on" : ""}`} onClick={() => setMode("stage")}>스탠딩</button>
        <button type="button" className={`b-tabx ${mode === "map" ? "b-tabx-on" : ""}`} onClick={() => setMode("map")}>지도</button>
        {p.current?.kind === "combat" && p.isGm ? <button type="button" className="b-tabx" onClick={() => { setDrawer("gm"); setTab("combat"); }}>전투</button> : null}
        <span className="ml-auto hidden truncate text-white/80 sm:inline">{p.sessionTitle}</span>
        <button type="button" className={`b-tabx ${drawer === "chat" ? "b-tabx-on" : ""}`} onClick={() => setDrawer(drawer === "chat" ? null : "chat")}>채팅</button>
        <button type="button" className={`b-tabx ${drawer === "sheets" ? "b-tabx-on" : ""}`} onClick={() => setDrawer(drawer === "sheets" ? null : "sheets")}>시트</button>
        <span className="b-muted hidden px-1 sm:inline">● {p.members.length}명</span>
        {p.isGm ? <button type="button" className={`b-tabx ${drawer === "gm" ? "b-tabx-on" : ""}`} style={{ background: drawer === "gm" ? undefined : "#7a1013", color: "#fff" }} onClick={() => setDrawer(drawer === "gm" ? null : "gm")}>GM 콘솔</button> : null}
      </div>

      {/* 오른쪽 서랍 */}
      <div className={`absolute inset-y-0 right-0 z-30 w-full flex-col pb-8 sm:w-[24rem] ${drawer ? "flex" : "hidden"} b-drawer`}>
        {drawer === "gm" ? (
          <GmConsole campaignId={p.campaignId} sessionId={p.sessionId} sessionOpen={p.sessionOpen} scenes={p.scenes} currentId={sceneId} current={p.current} board={board} actors={p.actors} meId={p.meId}
            chars={p.chars} setup={p.setup} combatActive={false} tab={tab} setTab={setTab} onClose={() => setDrawer(null)} onBoard={setBoard} />
        ) : (
          <>
            <div className="b-bar flex h-9 items-center gap-1 px-2 text-[11px]">
              <button type="button" className={`b-tab ${drawer === "chat" ? "b-tab-on" : ""}`} onClick={() => setDrawer("chat")}>채팅</button>
              <button type="button" className={`b-tab ${drawer === "sheets" ? "b-tab-on" : ""}`} onClick={() => setDrawer("sheets")}>시트</button>
              <button type="button" className="b-tab ml-auto" onClick={() => setDrawer(null)}>닫기 ✕</button>
            </div>
            <div className={`min-h-0 flex-1 p-2 ${drawer === "chat" ? "" : "hidden"}`}>
              <Chat sessionId={p.sessionId} sceneId={sceneId} meId={p.meId} isGm={p.isGm} members={p.members} myChars={p.myChars} charNames={p.charNames} initial={p.initialMessages} sessionOpen={p.sessionOpen} fill hideInput store={store} />
            </div>
            {drawer === "sheets" ? (
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2 text-xs">
                {p.chars.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 border border-[#3a2626] px-2 py-1">
                    <span className="min-w-0 flex-1 truncate">{c.name} <span className="b-muted">({c.owner})</span></span>
                    {p.isGm || c.ownerId === p.meId ? <span className="b-muted tabular-nums">체력 {c.hp}/{c.maxHp} · 정신 {c.sanity > 0 ? "+" : ""}{c.sanity}</span> : null}
                    <Link href={`/characters/${c.id}`} target="_blank" className="b-btn text-[10px]">시트</Link>
                  </div>
                ))}
                {p.chars.length === 0 ? <div className="b-muted">캐릭터가 없습니다.</div> : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );

  function canToggleId(id: string) { const a = p.actors.find((x) => x.id === id); return !!a && canToggle(a); }
}
