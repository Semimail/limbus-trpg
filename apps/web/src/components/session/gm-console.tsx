"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createScene, setCurrentScene, updateBoard, type BoardData, type BgmData } from "@/app/campaigns/[id]/sessions/[sid]/actions";
import { closeSession } from "@/app/campaigns/actions";
import { createClient } from "@/lib/supabase/client";
import { CombatSetup, type AllyOption, type EnemyOption } from "@/components/combat/setup";
import { BACKGROUNDS, BACKGROUND_LIST } from "@/components/icons";
import type { SceneRow } from "./scene-bar";
import type { StageActor } from "./stage";
import { STAGE_MOTIONS, TRANSITIONS, SFX, playSfx, type StageFx, type TransitionMode } from "./stage-fx";

export type ConsoleTab = "flow" | "stage" | "combat" | "sheets";
const KIND_LABEL = { drama: "드라마", explore: "탐색", combat: "전투" } as const;

interface Props {
  campaignId: string; sessionId: string; sessionOpen: boolean; scenes: SceneRow[]; currentId: string | null; current: SceneRow | null;
  board: BoardData; actors: StageActor[]; meId: string;
  chars: { id: string; name: string; owner: string; approved: boolean; hp: number; maxHp: number; sanity: number }[];
  setup: { allies: AllyOption[]; enemies: EnemyOption[] } | null; combatActive: boolean;
  tab: ConsoleTab; setTab: (t: ConsoleTab) => void; onClose: () => void; onBoard: (b: BoardData) => void;
  /** 무대 연출 브로드캐스트 (세션 화면이 fx 채널로 보낸다) */
  onFx?: (fx: StageFx) => void;
}

/** 배경 이미지 업로드 (uploads 버킷) → 공개 주소 */
async function uploadBgFile(meId: string, file: File): Promise<string> {
  const supabase = createClient();
  const path = `${meId}/bg-${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
  const { error } = await supabase.storage.from("uploads").upload(path, file, { contentType: file.type });
  if (error) throw error;
  return supabase.storage.from("uploads").getPublicUrl(path).data.publicUrl;
}
const readBgmList = (key: string): BgmData[] => { if (typeof window === "undefined") return []; try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as BgmData[]) : []; } catch { return []; } };
/** 전환 뒤 배경 교체 타이머 (언마운트 뒤에 와도 보드만 갱신되므로 모듈 변수로 둔다) */
const swapTimers: number[] = [];

/** 연출 큐의 한 단계: 연출 또는 대기 */
type QueueStep = StageFx | { type: "wait"; ms: number };
const stepLabel = (s: QueueStep, actors: StageActor[]) =>
  s.type === "wait" ? `대기 ${s.ms / 1000}초`
  : s.type === "transition" ? `전환 · ${TRANSITIONS.find((t) => t.id === s.mode)?.label}`
  : s.type === "title" ? `제목 · ${s.title}`
  : s.type === "motion" ? `${actors.find((a) => a.id === s.actorId)?.name ?? "?"} · ${STAGE_MOTIONS.find((m) => m.id === s.motion)?.label}`
  : s.type === "sfx" ? `효과음 · ${SFX.find((x) => x.id === s.id)?.label}`
  : `BGM · ${s.title ?? (s.url ? "재생" : "끄기")}`;

/** GM 콘솔 (영상의 오른쪽 패널): 진행 / 무대 / 전투 / 시트 */
export function GmConsole(p: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const cast = p.board.stage?.cast ?? [];
  const run = (fn: () => Promise<unknown>) => start(async () => { setErr(null); try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "실패"); } });
  const patchBoard = (patch: Partial<BoardData>) => run(async () => { if (!p.currentId) throw new Error("장면이 없습니다"); const r = await updateBoard(p.campaignId, p.currentId, patch); if (r.error) throw new Error(r.error); if (r.board) p.onBoard(r.board); });
  const toggleCast = (id: string) => patchBoard({ stage: { cast: cast.includes(id) ? cast.filter((x) => x !== id) : [...cast, id], split: p.board.stage?.split } });
  const uploadBg = async (file: File) => {
    setUploading(true); setErr(null);
    try { const url = await uploadBgFile(p.meId, file); setBgPick(url); patchBoard({ background: url }); }
    catch (e) { setErr(e instanceof Error ? e.message : "업로드 실패"); } finally { setUploading(false); }
  };

  /* ---- 무대 연출 ---- */
  const [bgPick, setBgPick] = useState<string | null>(p.board.background);
  const [transMode, setTransMode] = useState<TransitionMode>("fade");
  const [titleText, setTitleText] = useState("");
  const [subText, setSubText] = useState("");
  const [motionActor, setMotionActor] = useState<string>(cast[0] ?? p.actors[0]?.id ?? "");
  const bgmKey = `limbus.bgm.${p.campaignId}`;
  const [bgmList, setBgmList] = useState<BgmData[]>(() => readBgmList(bgmKey));
  const [bgmTitle, setBgmTitle] = useState(""); const [bgmUrl, setBgmUrl] = useState("");
  const [collect, setCollect] = useState(false);
  const [queue, setQueue] = useState<QueueStep[]>([]);
  const [playing, setPlaying] = useState(false);
  const saveBgmList = (l: BgmData[]) => { setBgmList(l); try { localStorage.setItem(bgmKey, JSON.stringify(l)); } catch {} };
  // 연출 하나를 실제로 쏜다: 브로드캐스트 + 부수 효과(전환은 어두워진 순간 배경 교체, BGM 은 보드에 저장)
  const fire = (fx: StageFx) => {
    p.onFx?.(fx);
    if (fx.type === "transition") {
      const def = TRANSITIONS.find((t) => t.id === fx.mode)!;
      if (fx.background !== p.board.background) swapTimers.push(window.setTimeout(() => patchBoard({ background: fx.background }), def.swapAt));
    } else if (fx.type === "bgm") patchBoard({ bgm: fx.url ? { url: fx.url, title: fx.title } : null });
  };
  const act = (fx: StageFx) => { if (collect) setQueue((q) => [...q, fx]); else fire(fx); };
  const playQueue = async () => {
    if (playing || !queue.length) return; setPlaying(true);
    for (const s of queue) {
      if (s.type === "wait") await new Promise((r) => setTimeout(r, s.ms));
      else { fire(s); const hold = s.type === "transition" ? TRANSITIONS.find((t) => t.id === s.mode)!.total : s.type === "title" ? 3200 : s.type === "motion" ? 700 : 300; await new Promise((r) => setTimeout(r, hold)); }
    }
    setPlaying(false);
  };
  const bgChoices: { url: string | null; label: string }[] = [{ url: null, label: "기본" }, ...BACKGROUND_LIST.map((b) => ({ url: BACKGROUNDS[b.key], label: b.label })), ...(p.board.background && !Object.values(BACKGROUNDS).includes(p.board.background as never) ? [{ url: p.board.background, label: "현재(업로드)" }] : [])];

  const tabs: [ConsoleTab, string][] = [["flow", "진행"], ["stage", "무대"], ["combat", "전투"], ["sheets", "시트"]];
  const sec = (title: string) => <div className="gm-sec">{title}</div>;
  const btn = (label: string, onClick: () => void, cls = "b-btn") => <button type="button" className={`${cls} text-[11px]`} disabled={pending || !p.currentId} onClick={onClick}>{label}</button>;
  return (
    <div className="flex h-full flex-col text-xs">
      <div className="b-bar flex h-10 items-center gap-2 px-3">
        <span className="text-sm font-bold text-[#f1d9a0]">GM 콘솔</span>
        <button type="button" className="b-muted ml-auto hover:text-white" onClick={p.onClose}>✕</button>
      </div>
      <div className="flex border-b" style={{ borderColor: "var(--b-line)" }}>
        {tabs.map(([k, l]) => <button key={k} type="button" onClick={() => p.setTab(k)} className={`flex-1 py-1.5 ${p.tab === k ? "bg-[#c9a24a] font-bold text-[#1a1208]" : "text-[#d9c08a] hover:bg-white/5"}`}>{l}</button>)}
      </div>
      {err ? <div className="px-3 py-1 text-red-300">{err}</div> : null}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {p.tab === "flow" ? (
          <>
            {sec("장면")}
            <div className="space-y-1">
              {p.scenes.map((s, i) => {
                const active = s.id === p.currentId;
                return (
                  <div key={s.id} className={`flex items-center gap-2 border px-2 py-1 ${active ? "border-[#c9a24a] bg-[#c9a24a1a]" : "border-[#3a2626]"}`}>
                    <span className="b-muted tabular-nums">{i + 1}.</span><span className="flex-1 truncate">{s.title}</span><span className="b-muted">{KIND_LABEL[s.kind]}</span>
                    {!active && p.sessionOpen ? <button type="button" disabled={pending} className="b-btn text-[10px]" onClick={() => run(async () => { await setCurrentScene(p.campaignId, p.sessionId, s.id); router.refresh(); })}>전환</button> : active ? <span className="text-[10px] text-[#c9a24a]">현재</span> : null}
                  </div>
                );
              })}
              {p.scenes.length === 0 ? <div className="b-muted">장면이 없습니다.</div> : null}
            </div>
            {p.sessionOpen ? (
              <form action={async (fd) => { await createScene(p.campaignId, p.sessionId, fd); router.refresh(); }} className="flex flex-wrap gap-1">
                <input name="title" placeholder="새 장면 제목" className="b-input min-w-0 flex-1 px-2 py-1" />
                <select name="kind" className="b-input px-1 py-1"><option value="drama">드라마</option><option value="explore">탐색</option><option value="combat">전투</option></select>
                <button type="submit" className="b-btn-red">장면 추가 · 전환</button>
              </form>
            ) : null}
            {sec("세션")}
            <div className="flex flex-wrap gap-1">
              <a href={`/api/sessions/${p.sessionId}/export`} className="b-btn">내보내기 (JSON)</a>
              {p.sessionOpen ? <form action={async () => { if (!confirm("세션을 종료할까요? 기록은 남고, 더는 입력할 수 없습니다.")) return; await closeSession(p.campaignId, p.sessionId); router.refresh(); }}><button type="submit" className="b-btn text-red-300">세션 종료</button></form> : <span className="b-muted self-center">종료된 세션</span>}
            </div>
          </>
        ) : null}

        {p.tab === "stage" ? (
          <>
            {sec("출연진 (스탠딩)")}
            <div className="b-muted">누르면 등장/퇴장. 캐릭터가 대사를 보내면 자동으로 등장합니다.</div>
            <div className="flex flex-wrap gap-1">
              {p.actors.filter((a) => a.kind === "pc").map((a) => <button key={a.id} type="button" disabled={pending || !p.currentId} onClick={() => toggleCast(a.id)} className={`border px-2 py-0.5 ${cast.includes(a.id) ? "border-[#c9a24a] text-[#f1d9a0]" : "border-[#3a2626] text-[#9a8f86]"}`}>{a.name}</button>)}
            </div>
            <div className="b-label">NPC (적 도감)</div>
            <div className="flex flex-wrap gap-1">
              {p.actors.filter((a) => a.kind === "npc").map((a) => <button key={a.id} type="button" disabled={pending || !p.currentId} onClick={() => toggleCast(a.id)} className={`border px-2 py-0.5 ${cast.includes(a.id) ? "border-[#b3161c] text-[#ffd7d7]" : "border-[#3a2626] text-[#9a8f86]"}`}>{a.name}</button>)}
              {p.actors.filter((a) => a.kind === "npc").length === 0 ? <span className="b-muted">적 도감에 항목이 없습니다.</span> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="flex items-center gap-1"><input type="checkbox" checked={!!p.board.stage?.split} onChange={(e) => patchBoard({ stage: { cast, split: e.target.checked } })} />진영 배치 (왼쪽 PC · 오른쪽 NPC)</label>
              <button type="button" className="b-btn" disabled={pending} onClick={() => patchBoard({ stage: { cast: [], split: p.board.stage?.split } })}>전부 퇴장</button>
            </div>

            {sec("장면 전환 · 배경")}
            <div className="b-muted">① 배경 고르기 → ② 방식 → ③ 전환. 어두워지는 순간 배경이 바뀝니다.</div>
            <div className="flex flex-wrap gap-1">
              {bgChoices.map((b) => (
                <button key={b.label} type="button" onClick={() => setBgPick(b.url)} className={`relative h-10 w-[4.5rem] overflow-hidden border ${bgPick === b.url ? "border-[#ffd54a]" : "border-[#3a2626]"}`} title={b.label}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={b.url ?? BACKGROUNDS.backstreet} alt="" className="h-full w-full object-cover opacity-80" draggable={false} />
                  <span className="absolute inset-x-0 bottom-0 bg-black/70 text-center text-[9px] leading-tight">{b.label}</span>
                  {p.board.background === b.url ? <span className="absolute left-0 top-0 bg-[#b3161c] px-0.5 text-[8px] font-black">현재</span> : null}
                </button>
              ))}
              <label className="b-btn flex h-10 cursor-pointer items-center text-[10px]">{uploading ? "…" : "업로드"}<input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadBg(f); e.target.value = ""; }} /></label>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {TRANSITIONS.map((t) => <button key={t.id} type="button" onClick={() => setTransMode(t.id)} className={`b-tabx px-2 py-0 ${transMode === t.id ? "b-tabx-on" : ""}`}>{t.label}</button>)}
              {btn("전환", () => act({ type: "transition", mode: transMode, background: bgPick }), "b-btn-red")}
            </div>
            <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get("url") ?? "").trim(); if (v) { setBgPick(v); patchBoard({ background: v }); } }}>
              <input name="url" placeholder="배경 이미지 URL" className="b-input min-w-0 flex-1 px-2 py-1" /><button type="submit" className="b-btn">바로 적용</button>
            </form>

            {sec("제목 카드")}
            <div className="flex gap-1">
              <input value={titleText} onChange={(e) => setTitleText(e.target.value)} placeholder="제1장 · 녹슨 사슬" className="b-input min-w-0 flex-1 px-2 py-1" />
              <input value={subText} onChange={(e) => setSubText(e.target.value)} placeholder="부제 (선택)" className="b-input w-28 px-2 py-1" />
              {btn("표시", () => { if (titleText.trim()) act({ type: "title", title: titleText.trim(), subtitle: subText.trim() || undefined }); })}
            </div>

            {sec("캐릭터 동작")}
            <div className="flex flex-wrap items-center gap-1">
              <select value={motionActor} onChange={(e) => setMotionActor(e.target.value)} className="b-input px-1 py-0.5">
                {p.actors.filter((a) => cast.includes(a.id)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                {p.actors.filter((a) => !cast.includes(a.id)).map((a) => <option key={a.id} value={a.id}>{a.name} (무대 밖)</option>)}
              </select>
              {STAGE_MOTIONS.map((m) => <button key={m.id} type="button" className={`b-btn text-[11px] ${m.stance === "reset" ? "text-[#ffd54a]" : ""}`} disabled={pending || !motionActor} onClick={() => act({ type: "motion", actorId: motionActor, motion: m.id })}>{m.label}</button>)}
            </div>
            <div className="b-muted">다가서기·물러서기·쓰러짐·돌아서기는 자세로 남고, 제자리로 되돌립니다. 짧은 동작은 한 번 재생됩니다.</div>

            {sec("BGM")}
            <div className="flex flex-wrap items-center gap-1">
              <span className="b-muted">재생 중: {p.board.bgm?.title ?? (p.board.bgm?.url ? "제목 없음" : "없음")}</span>
              {p.board.bgm ? btn("끄기", () => act({ type: "bgm", url: null })) : null}
            </div>
            <div className="flex flex-wrap gap-1">
              {bgmList.map((b) => <span key={b.url} className="flex items-center"><button type="button" className={`b-tabx px-2 py-0 ${p.board.bgm?.url === b.url ? "b-tabx-on" : ""}`} disabled={pending} onClick={() => act({ type: "bgm", url: b.url, title: b.title })}>{b.title || b.url.slice(-16)}</button><button type="button" className="b-muted px-1 hover:text-red-300" title="목록에서 지우기" onClick={() => saveBgmList(bgmList.filter((x) => x.url !== b.url))}>✕</button></span>)}
              {bgmList.length === 0 ? <span className="b-muted">아래에 mp3·ogg 주소를 넣어 목록을 만드세요 (이 브라우저에 저장).</span> : null}
            </div>
            <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); const u = bgmUrl.trim(); if (!u) return; saveBgmList([...bgmList.filter((x) => x.url !== u), { url: u, title: bgmTitle.trim() || u.split("/").pop() }]); setBgmTitle(""); setBgmUrl(""); }}>
              <input value={bgmTitle} onChange={(e) => setBgmTitle(e.target.value)} placeholder="곡 이름" className="b-input w-24 px-2 py-1" />
              <input value={bgmUrl} onChange={(e) => setBgmUrl(e.target.value)} placeholder="음원 주소 (mp3·ogg 직접 주소)" className="b-input min-w-0 flex-1 px-2 py-1" />
              <button type="submit" className="b-btn">추가</button>
            </form>

            {sec("효과음")}
            <div className="flex flex-wrap gap-1">
              {SFX.map((s) => <button key={s.id} type="button" className="b-btn text-[11px]" disabled={pending || !p.currentId} onClick={() => act({ type: "sfx", id: s.id })} onContextMenu={(e) => { e.preventDefault(); playSfx(s.id); }} title="누르면 모두에게, 오른쪽 클릭은 나만 미리 듣기">{s.label}</button>)}
            </div>
            <div className="b-muted">소리는 각자 하단 바의 「소리」를 켜야 들립니다. 음원 파일 없이 합성한 소리입니다.</div>

            {sec("연출 큐")}
            <div className="flex flex-wrap items-center gap-1">
              <label className={`flex cursor-pointer items-center gap-1 ${collect ? "text-[#ffd54a]" : ""}`}><input type="checkbox" checked={collect} onChange={(e) => setCollect(e.target.checked)} />큐에 담기 (바로 쏘지 않음)</label>
              {[1000, 2000, 3000].map((ms) => <button key={ms} type="button" className="b-btn text-[11px]" onClick={() => setQueue((q) => [...q, { type: "wait", ms }])}>대기 {ms / 1000}초</button>)}
              <button type="button" className="b-btn-red text-[11px]" disabled={playing || !queue.length} onClick={() => void playQueue()}>{playing ? "재생 중…" : `재생 (${queue.length})`}</button>
              <button type="button" className="b-btn text-[11px]" disabled={playing || !queue.length} onClick={() => setQueue([])}>비우기</button>
            </div>
            {queue.length ? <ol className="space-y-0.5">{queue.map((s, i) => <li key={i} className="flex items-center gap-1 border border-[#3a2626] px-2 py-0.5"><span className="b-muted tabular-nums">{i + 1}.</span><span className="flex-1 truncate">{stepLabel(s, p.actors)}</span><button type="button" className="b-muted hover:text-red-300" onClick={() => setQueue((q) => q.filter((_, k) => k !== i))}>✕</button></li>)}</ol> : null}
          </>
        ) : null}

        {p.tab === "combat" ? (
          <>
            {sec("전투")}
            {p.combatActive ? <div>전투가 진행 중입니다. <button type="button" className="b-gold underline" onClick={() => router.refresh()}>전투 화면 열기</button></div>
              : p.current?.kind === "combat" && p.setup ? <div className="gm-setup"><CombatSetup campaignId={p.campaignId} sessionId={p.sessionId} sceneId={p.current.id} allies={p.setup.allies} enemies={p.setup.enemies} /></div>
              : (
                <div className="space-y-2">
                  <div className="b-muted">현재 장면은 {p.current ? KIND_LABEL[p.current.kind] : "없음"}입니다. 전투 장면을 추가하면 여기서 아군·적을 골라 전투를 시작합니다.</div>
                  {p.sessionOpen ? <form action={async (fd) => { await createScene(p.campaignId, p.sessionId, fd); router.refresh(); p.setTab("combat"); }} className="flex gap-1"><input type="hidden" name="kind" value="combat" /><input name="title" placeholder="전투 장면 제목" className="b-input min-w-0 flex-1 px-2 py-1" /><button type="submit" className="b-btn-red">전투 장면 추가</button></form> : null}
                </div>
              )}
          </>
        ) : null}

        {p.tab === "sheets" ? (
          <>
            {sec("캐릭터")}
            <div className="space-y-1">
              {p.chars.map((c) => (
                <div key={c.id} className="flex items-center gap-2 border border-[#3a2626] px-2 py-1">
                  <span className="min-w-0 flex-1 truncate">{c.name} <span className="b-muted">({c.owner}{c.approved ? "" : " · 미승인"})</span></span>
                  <span className="b-muted tabular-nums">체력 {c.hp}/{c.maxHp} · 정신 {c.sanity > 0 ? "+" : ""}{c.sanity}</span>
                  <Link href={`/characters/${c.id}`} target="_blank" className="b-btn text-[10px]">시트</Link>
                </div>
              ))}
              {p.chars.length === 0 ? <div className="b-muted">캐릭터가 없습니다.</div> : null}
            </div>
            <div className="flex flex-wrap gap-1 pt-1">
              <Link href={`/campaigns/${p.campaignId}`} className="b-btn">사무소 (GM 패널)</Link>
              <Link href={`/campaigns/${p.campaignId}/enemies`} className="b-btn">적 도감</Link>
              <Link href={`/campaigns/${p.campaignId}/settings`} className="b-btn">룰 설정</Link>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
