"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { STATUS_IDS, SIN_LABEL, slotKey, isCorroded, reachableCells, dist, skillRange, type CombatState, type Unit, type StatusId, type Skill, type Pos } from "@limbus/rules";
import { setPickAction, resolveRoundAction, endCombatAction, gmAdjustUnitAction, redrawHandAction, moveUnitAction } from "@/app/campaigns/[id]/sessions/[sid]/combat-actions";
import { formatRound, unitNames } from "@/lib/combat-log";
import { SinIcon, DamageIcon, DefenseIcon, CoinIcon, StatusBadge, StatusIcon, BACKGROUNDS } from "@/components/icons";
import { Keyword, KeywordText } from "@/components/keyword/keyword";
import { Cinematic } from "./cinematic";

/*
 * 전투 화면: 참고 영상(FVTT + 림버스 모듈) 레이아웃을 따른다.
 *  - 전체 화면 어두운 캔버스 가운데 격자 지도, 토큰은 초상화
 *  - 상단 바: 장면·라운드·GM 버튼 / 우측 상단: 선택 유닛 패널 + 명단
 *  - 하단 중앙: 스킬 독(내 슬롯의 손패) / 맨 아래: 붉은 속도 트래커
 *  - 오른쪽 열: 채팅
 */

interface Props {
  campaignId: string; combatId: string; initial: CombatState; meId: string; isGm: boolean; protectRange: number;
  sessionTitle: string; sceneTitle: string; backHref: string;
  chat: ReactNode; sceneTools?: ReactNode;
}

const SIN_COLOR: Record<string, string> = { wrath: "#b3161c", lust: "#d4621c", sloth: "#c9a227", gluttony: "#4f8a3a", gloom: "#2e6f9e", pride: "#2b3f8c", envy: "#6a3d9a" };

export function BattleScreen({ campaignId, combatId, initial, meId, isGm, protectRange, sessionTitle, sceneTitle, backHref, chat, sceneTools }: Props) {
  const router = useRouter();
  const [state, setState] = useState<CombatState>(initial);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [cine, setCine] = useState<{ round: number; events: CombatState["lastRound"] } | null>(null);
  const seenRound = useRef<number>(initial.lastRound?.length && initial.lastRound[0]!.type === "roundStart" ? (initial.lastRound[0] as { round: number }).round : 0);
  const [autoCine, setAutoCine] = useState<boolean>(() => { if (typeof window === "undefined") return true; try { return localStorage.getItem("limbus.cinematic") !== "off"; } catch { return true; } });
  const autoRef = useRef(autoCine);
  useEffect(() => { autoRef.current = autoCine; }, [autoCine]);
  const applyState = useCallback((next: CombatState) => {
    setState(next);
    const lr = next.lastRound;
    if (lr && lr.length) {
      const rs = lr[0]!.type === "roundStart" ? (lr[0] as { round: number }).round : next.round;
      if (rs > seenRound.current) { seenRound.current = rs; if (autoRef.current) setCine({ round: rs, events: lr }); }
    }
  }, []);
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase.channel(`combat:${combatId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "combats", filter: `id=eq.${combatId}` },
        (p) => { const s = (p.new as { state?: CombatState }).state; if (s) applyState(s); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [combatId, applyState]);
  // 전체 화면 동안 바깥 스크롤 잠금
  useEffect(() => { const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = prev; }; }, []);

  const names = useMemo(() => unitNames(state), [state]);
  const mine = useCallback((u: Unit) => isGm || (u.source.kind === "character" && u.source.ownerId === meId), [isGm, meId]);
  const myUnits = state.units.filter((u) => u.side === "ally" && mine(u));
  const [selId, setSelId] = useState<string | null>(myUnits[0]?.id ?? null);
  const selected = state.units.find((u) => u.id === selId) ?? null;
  const mySlots = state.slots.filter((s) => { const u = state.units.find((x) => x.id === s.combatantId)!; return u.side === "ally" && mine(u); });
  const unpicked = mySlots.filter((s) => !state.picks[slotKey(s.combatantId, s.slot)]);
  const allyUnpicked = state.slots.filter((s) => state.units.find((x) => x.id === s.combatantId)!.side === "ally" && !state.picks[slotKey(s.combatantId, s.slot)]);
  const [tab, setTab] = useState<"info" | "log">("info");
  const [dockSlot, setDockSlot] = useState<string | null>(null);
  const activeSlot = mySlots.find((s) => slotKey(s.combatantId, s.slot) === dockSlot) ?? mySlots[0];

  const act = (fn: () => Promise<{ error?: string; state?: CombatState }>) => start(async () => { setErr(null); const r = await fn(); if (r.error) setErr(r.error); if (r.state) applyState(r.state); });
  const phaseText = state.phase === "select" ? "스킬 선택" : state.phase === "ended" ? (state.winner === "ally" ? "종료 · 아군 승리" : "종료 · 아군 패배") : "처리 중";

  return (
    <div className="battle fixed inset-0 z-40 flex flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      {/* 왼쪽: 전투 영역 */}
      <div className="relative flex flex-col lg:min-h-0 lg:flex-1">
        {/* 상단 바 */}
        <div className="b-bar flex min-h-11 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1 text-xs [&>*]:whitespace-nowrap">
          <Link href={backHref} className="b-muted hover:text-white">← 사무소</Link>
          <span className="truncate font-semibold">{sessionTitle}</span>
          <span className="b-gold truncate">{sceneTitle}</span>
          <span className="mx-auto flex items-center gap-2">
            <span className="stamp" style={{ borderColor: "var(--b-gold)", color: "var(--b-gold)" }}>라운드 {state.round}</span>
            <span className="b-muted">{phaseText}</span>
            {state.phase === "select" && allyUnpicked.length ? <span className="b-muted">· 미선택 {allyUnpicked.length}</span> : null}
            {selected ? <span className="b-muted hidden md:inline">· {selected.name} 이동력 {selected.move ?? 0}</span> : null}
          </span>
          <label className="b-muted hidden items-center gap-1 sm:flex"><input type="checkbox" suppressHydrationWarning checked={autoCine} onChange={(e) => { setAutoCine(e.target.checked); autoRef.current = e.target.checked; try { localStorage.setItem("limbus.cinematic", e.target.checked ? "on" : "off"); } catch {} }} />합 연출</label>
          {state.lastRound?.length ? <button type="button" className="b-muted underline hover:text-white" onClick={() => setCine({ round: state.round, events: state.lastRound })}>지난 연출</button> : null}
          {sceneTools ? <details className="relative"><summary className="b-muted cursor-pointer list-none hover:text-white">장면 ▾</summary><div className="b-panel absolute right-0 top-6 z-10 w-[min(90vw,34rem)] p-2">{sceneTools}</div></details> : null}
          {isGm && state.phase === "select" ? (<>
            <button type="button" onClick={() => act(() => resolveRoundAction(campaignId, combatId))} disabled={pending} className="b-btn-red">{pending ? "처리 중..." : "라운드 진행"}</button>
            <button type="button" onClick={() => { if (confirm("전투를 종료할까요? 체력과 정신력이 캐릭터에 반영됩니다.")) act(() => endCombatAction(campaignId, combatId)); }} disabled={pending} className="b-btn">전투 종료</button>
          </>) : null}
          {isGm && state.phase === "ended" ? <button type="button" className="b-btn" onClick={() => router.refresh()}>닫기</button> : null}
        </div>

        {/* 캔버스 + 오버레이 */}
        <div className="relative h-[55vh] shrink-0 overflow-hidden lg:h-auto lg:min-h-0 lg:flex-1">
          <Canvas state={state} selId={selId} onSelect={setSelId} mine={mine} names={names} isGm={isGm}
            disabled={pending || state.phase !== "select"} onMove={(unitId, to) => act(() => moveUnitAction(campaignId, combatId, unitId, to))} />

          {/* 공지 / 오류 */}
          <div className="pointer-events-none absolute left-3 top-6 max-w-[min(60vw,28rem)] space-y-1 text-xs">
            {err ? <div className="b-panel border-l-2 px-2 py-1" style={{ borderLeftColor: "var(--b-red)", color: "#ffb3b3" }}>{err}</div> : null}
            {state.notices?.slice(-4).map((n, i) => <div key={i} className="b-panel border-l-2 px-2 py-1" style={{ borderLeftColor: "var(--b-gold)" }}><KeywordText text={n} /></div>)}
          </div>

          {/* 우측 상단: 선택 유닛 패널 + 명단 */}
          <div className="absolute right-3 top-3 hidden w-72 flex-col gap-2 md:flex" style={{ maxHeight: "calc(100% - 1.5rem)" }}>
            <div className="b-panel flex text-[11px]">
              <button type="button" onClick={() => setTab("info")} className={`flex-1 py-1 ${tab === "info" ? "b-head" : "b-muted"}`}>유닛</button>
              <button type="button" onClick={() => setTab("log")} className={`flex-1 py-1 ${tab === "log" ? "b-head" : "b-muted"}`}>로그</button>
            </div>
            {tab === "info" ? (<>
              {selected ? <UnitPanel u={selected} state={state} isGm={isGm} names={names} campaignId={campaignId} combatId={combatId} onApply={applyState} /> : null}
              <Roster state={state} selId={selId} onSelect={setSelId} isGm={isGm} />
            </>) : (
              <div className="b-panel min-h-0 flex-1 overflow-auto p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                {state.lastRound ? <KeywordText text={formatRound(state.lastRound, names).join("\n")} /> : <span className="b-muted">아직 결과가 없습니다.</span>}
              </div>
            )}
          </div>

        </div>

        {/* 하단 중앙: 스킬 독 (모바일은 흐름 배치) */}
        {state.phase === "select" && mySlots.length > 0 && activeSlot ? (
            <div className="p-2 md:absolute md:bottom-[3.75rem] md:left-2 md:right-[19.5rem] md:p-0 lg:left-1/2 lg:right-auto lg:w-[min(48rem,calc(100%-20rem))] lg:-translate-x-1/2">
              <div className="mb-1 flex items-end gap-1 overflow-x-auto px-1">
                {mySlots.map((s) => { const u = state.units.find((x) => x.id === s.combatantId)!; const k = slotKey(s.combatantId, s.slot); const picked = !!state.picks[k]; const active = k === slotKey(activeSlot.combatantId, activeSlot.slot);
                  return (
                    <button key={k} type="button" onClick={() => setDockSlot(k)} className={`b-panel flex shrink-0 items-center gap-1.5 px-2 py-1 text-[11px] ${active ? "b-active" : ""}`}>
                      <Portrait u={u} size={22} />
                      <span className="max-w-20 truncate">{u.name}</span>
                      <span className="b-gold font-bold tabular-nums">{s.speed}</span>
                      <span className={picked ? "text-emerald-400" : "b-muted"}>{picked ? "✓" : "·"}</span>
                    </button>
                  ); })}
                {unpicked.length === 0 ? <span className="ml-auto self-center text-[11px] text-emerald-400">모두 선택됨</span> : null}
              </div>
              <Dock key={slotKey(activeSlot.combatantId, activeSlot.slot)} state={state} unit={state.units.find((u) => u.id === activeSlot.combatantId)!} slot={activeSlot.slot} speed={activeSlot.speed} names={names} isGm={isGm} protectRange={protectRange}
                onPick={(pick) => act(() => setPickAction(campaignId, combatId, activeSlot.combatantId, activeSlot.slot, pick))}
                onRedraw={() => act(() => redrawHandAction(campaignId, combatId, activeSlot.combatantId))} />
            </div>
          ) : null}

        {/* 모바일: 유닛 패널 */}
        <div className="shrink-0 space-y-2 overflow-auto p-2 md:hidden" style={{ maxHeight: "30vh" }}>
          {selected ? <UnitPanel u={selected} state={state} isGm={isGm} names={names} campaignId={campaignId} combatId={combatId} onApply={applyState} /> : null}
          <Roster state={state} selId={selId} onSelect={setSelId} isGm={isGm} />
        </div>

        {/* 속도 트래커 */}
        <Tracker state={state} names={names} isGm={isGm} selId={selId} onSelect={setSelId} />
      </div>

      {/* 오른쪽: 채팅 */}
      <aside className="b-chat flex h-[70vh] shrink-0 flex-col lg:h-auto lg:w-[340px]">
        <div className="b-bar flex h-9 items-center px-3 text-xs font-semibold">채팅</div>
        <div className="min-h-0 flex-1 p-2">{chat}</div>
      </aside>

      {cine?.events ? <Cinematic events={cine.events} units={state.units} onClose={() => setCine(null)} /> : null}
    </div>
  );
}

/* ---------- 캔버스 ---------- */
function Canvas({ state, selId, onSelect, mine, names, isGm, disabled, onMove }: { state: CombatState; selId: string | null; onSelect: (id: string | null) => void; mine: (u: Unit) => boolean; names: Record<string, string>; isGm: boolean; disabled: boolean; onMove: (unitId: string, to: Pos) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const grid = state.grid ?? { cols: 10, rows: 6 };
  const { cols, rows } = grid;
  // 셀 크기: 화면에 맞추되 36~84px
  const cell = Math.max(36, Math.min(84, Math.floor((size.w - 32) / cols), Math.floor((size.h - 120) / rows)));
  const W = cols * cell, H = rows * cell;
  const selected = selId ? state.units.find((u) => u.id === selId) : undefined;
  const canMove = !!selected && mine(selected) && !selected.incapacitated && !selected.staggered && !isCorroded(selected, state.round) && state.phase === "select" && !!state.grid;
  const reach = useMemo(() => (canMove && selected ? reachableCells(state, selected.id) : new Map<string, number>()), [state, selected, canMove]);
  const alive = state.units.filter((u) => !u.incapacitated);
  const maxRange = selected ? Math.max(1, ...selected.skills.filter((s) => s.kind === "attack").map(skillRange)) : 0;
  const intents = Object.entries(state.picks).map(([k, p]) => { const [uid] = k.split(":"); const a = state.units.find((u) => u.id === uid); const t = state.units.find((u) => u.id === p.targetId); return a && t && !a.incapacitated ? { a, t, enemy: a.side === "enemy" } : null; }).filter(Boolean) as { a: Unit; t: Unit; enemy: boolean }[];
  const c = (p: Pos) => ({ x: p.x * cell + cell / 2, y: p.y * cell + cell / 2 });
  const gridOn = !!state.grid;
  // 격자 없는 전투: 진영별로 가상 배치
  const posOf = (u: Unit): Pos => gridOn ? u.pos : (() => { const side = state.units.filter((x) => x.side === u.side); const i = side.indexOf(u); return { x: u.side === "ally" ? 1 : cols - 2, y: Math.min(rows - 1, Math.floor((rows - side.length) / 2) + i) }; })();

  return (
    <div ref={ref} className="b-canvas absolute inset-0 overflow-auto" onClick={(e) => { if (e.target === e.currentTarget) onSelect(null); }}>
      <div className="absolute inset-0 bg-cover bg-center opacity-30" style={{ backgroundImage: `url(${BACKGROUNDS.backstreet})` }} />
      <div className="absolute inset-0" style={{ background: "radial-gradient(80% 70% at 50% 45%, rgba(40,14,12,.35), rgba(8,5,5,.9))" }} />
      <div className="relative mx-auto my-4 flex min-h-full w-max items-center" style={{ minHeight: "calc(100% - 2rem)" }}>
        <div className="relative" style={{ width: W, height: H }}>
          {/* 격자 선 */}
          <svg className="absolute inset-0" width={W} height={H}>
            <defs>
              <pattern id="bgrid" width={cell} height={cell} patternUnits="userSpaceOnUse">
                <path d={`M ${cell} 0 L 0 0 0 ${cell}`} fill="none" stroke="rgba(217,179,91,.22)" strokeWidth="1" />
              </pattern>
              <marker id="arr-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#e04b52" /></marker>
              <marker id="arr-gold" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#d9b35b" /></marker>
            </defs>
            <rect width={W} height={H} fill="rgba(20,10,8,.55)" />
            <rect width={W} height={H} fill="url(#bgrid)" />
            <rect x={0.5} y={0.5} width={W - 1} height={H - 1} fill="none" stroke="rgba(217,179,91,.5)" />
            {/* 사거리·이동 범위 */}
            {canMove && selected ? Array.from({ length: rows }).map((_, y) => Array.from({ length: cols }).map((_, x) => {
              const inR = dist(selected.pos, { x, y }) <= maxRange; const cost = reach.get(`${x},${y}`);
              if (!inR && cost === undefined) return null;
              return <rect key={`${x},${y}`} x={x * cell + 1} y={y * cell + 1} width={cell - 2} height={cell - 2} fill={inR ? "rgba(210,36,43,.14)" : cost !== undefined && cost > 0 ? "rgba(79,179,116,.08)" : "none"} />;
            })) : null}
            {/* 의도 화살표 */}
            {intents.map(({ a, t, enemy }, i) => { const A = c(posOf(a)), T = c(posOf(t)); const dx = T.x - A.x, dy = T.y - A.y, L = Math.hypot(dx, dy) || 1; const sh = cell * 0.42;
              return <line key={i} x1={A.x + dx / L * sh} y1={A.y + dy / L * sh} x2={T.x - dx / L * sh} y2={T.y - dy / L * sh} stroke={enemy ? "#e04b52" : "#d9b35b"} strokeWidth={2} strokeDasharray="5 4" opacity={0.85} markerEnd={`url(#${enemy ? "arr-red" : "arr-gold"})`} />; })}
          </svg>
          {/* 이동 칸 클릭 */}
          {canMove && selected ? Array.from(reach.entries()).map(([k, cost]) => { if (cost === 0) return null; const [x, y] = k.split(",").map(Number) as [number, number]; if (alive.some((u) => u.pos.x === x && u.pos.y === y)) return null;
            return <button key={k} type="button" disabled={disabled} title={`이동 ${cost}칸`} onClick={() => onMove(selected.id, { x, y })}
              className="absolute flex items-end justify-end p-0.5 text-[9px] text-emerald-300/50 hover:bg-emerald-400/25 hover:text-emerald-200 disabled:cursor-wait" style={{ left: x * cell, top: y * cell, width: cell, height: cell }}>{cost}</button>; }) : null}
          {/* 토큰 */}
          {state.units.map((u) => { const p = posOf(u); const s = cell - 8; const isSel = u.id === selId;
            return (
              <button key={u.id} type="button" onClick={() => onSelect(isSel ? null : u.id)} title={names[u.id]}
                className={`absolute transition-all duration-300 ${u.incapacitated ? "opacity-40 grayscale" : ""}`} style={{ left: p.x * cell + 4, top: p.y * cell + 4, width: s, height: s }}>
                <span className={`absolute inset-0 rounded-full border-2 ${u.side === "ally" ? "border-amber-200/80" : "border-red-500/80"} ${isSel ? "b-pulse" : ""} ${u.staggered ? "border-dashed !border-yellow-300" : ""}`} style={{ background: u.side === "ally" ? "rgba(217,179,91,.18)" : "rgba(179,22,28,.25)" }} />
                <span className="absolute inset-1 overflow-hidden rounded-full bg-black/60">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {u.portraitUrl ? <img src={u.portraitUrl} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-sm" style={{ color: "var(--b-fg)" }}>{u.name.slice(0, 1)}</span>}
                </span>
                {/* 체력 */}
                <span className="absolute -bottom-1 left-1 right-1 h-1 overflow-hidden rounded bg-black/70"><span className="block h-full" style={{ width: `${Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100))}%`, background: u.side === "ally" ? "#4fb374" : "#e04b52" }} /></span>
                {u.staggered ? <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-yellow-400 px-1 text-[8px] font-bold text-black">흐트러짐</span> : null}
                {isCorroded(u, state.round) ? <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-red-600 px-1 text-[8px] font-bold text-white">침식</span> : null}
                {cell >= 48 ? <span className="absolute -bottom-4 left-1/2 w-max max-w-[5.5rem] -translate-x-1/2 truncate text-[9px]" style={{ color: "var(--b-fg)", textShadow: "0 1px 2px #000" }}>{isGm || u.side === "ally" ? u.name : names[u.id]}</span> : null}
              </button>
            ); })}
        </div>
      </div>
      <div className="pointer-events-none absolute left-3 top-1 text-[10px]" style={{ color: "var(--b-muted)" }}>
        {gridOn ? `격자 ${cols}×${rows}` : "격자 없음"}{selected ? ` · ${selected.name} 이동력 ${selected.move ?? 0} · 최대 사거리 ${maxRange}칸` : " · 토큰을 눌러 선택"}{canMove ? " · 초록 숫자 칸을 눌러 이동" : ""}
      </div>
    </div>
  );
}

/* ---------- 초상화 ---------- */
function Portrait({ u, size }: { u: Unit; size: number }) {
  return (
    <span className="inline-block shrink-0 overflow-hidden rounded-full bg-black/50 align-middle" style={{ width: size, height: size, border: `1px solid ${u.side === "ally" ? "rgba(217,179,91,.6)" : "rgba(224,75,82,.6)"}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {u.portraitUrl ? <img src={u.portraitUrl} alt="" className="h-full w-full object-cover" /> : null}
    </span>
  );
}

/* ---------- 유닛 패널 ---------- */
function UnitPanel({ u, state, isGm, names, campaignId, combatId, onApply }: { u: Unit; state: CombatState; isGm: boolean; names: Record<string, string>; campaignId: string; combatId: string; onApply: (s: CombatState) => void }) {
  const slots = state.slots.filter((s) => s.combatantId === u.id);
  const hideNumbers = u.side === "enemy" && !isGm;
  const hpPct = Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100));
  const statuses = (Object.entries(u.statuses) as [StatusId, number][]).filter(([, v]) => v > 0);
  const [edit, setEdit] = useState(false);
  return (
    <div className="b-panel p-2 text-xs">
      <div className="flex gap-2">
        <Portrait u={u} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <span className="truncate text-sm font-semibold">{isGm || u.side === "ally" ? u.name : names[u.id]}</span>
            <span className="b-muted text-[10px]">{u.incapacitated ? <Keyword id="down">전투불능</Keyword> : isCorroded(u, state.round) ? <Keyword id="corrosion" className="text-red-400">침식</Keyword> : u.staggered ? <Keyword id="stagger">흐트러짐</Keyword> : u.side === "ally" ? "아군" : "적"}</span>
          </div>
          <div className="mt-1 h-2 w-full bg-black/60"><div className="h-full" style={{ width: `${hpPct}%`, background: "linear-gradient(90deg,#2f7a4a,#4fb374)" }} /></div>
          <div className="b-muted mt-0.5 flex justify-between text-[10px] tabular-nums">
            <span>{hideNumbers ? "체력" : `체력 ${u.hp}/${u.maxHp}`}</span>
            {!u.sanityLocked ? <span>정신력 {u.sanity > 0 ? "+" : ""}{u.sanity}</span> : null}
            {state.grid ? <span>이동 {u.move ?? 0}</span> : null}
          </div>
        </div>
      </div>
      {u.source.kind === "character" ? <div className="b-muted mt-1 text-[10px] tabular-nums"><Keyword id="light">빛</Keyword> {u.light} · <Keyword id="erosion">침식도</Keyword> {u.erosion}</div> : null}
      {statuses.length ? <div className="mt-1 flex flex-wrap gap-1">{statuses.map(([k, v]) => <Keyword key={k} id={k} className="border-0"><StatusBadge status={k} value={v} /></Keyword>)}</div> : null}
      <div className="mt-2 flex flex-wrap gap-1">
        {slots.map((s) => { const p = state.picks[slotKey(u.id, s.slot)]; const sk = p ? u.skills.find((x) => x.id === p.skillId) : undefined; const hidden = u.side === "enemy" && !isGm;
          return (
            <span key={s.slot} className="b-cell inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px]">
              <span className="b-gold font-bold tabular-nums">{s.speed}</span>
              {sk ? (<>{sk.kind === "defense" ? <DefenseIcon kind={sk.defenseKind ?? "guard"} size={13} /> : <DamageIcon type={sk.damageType} size={13} />}<SinIcon sin={sk.sin} size={13} /><span className="max-w-20 truncate">{hidden ? "???" : sk.name}</span><span className="b-muted">→ {names[p!.targetId]}</span>{p!.protect ? <span className="b-gold">보호</span> : null}</>)
                : <span className="b-muted">{state.phase === "select" ? "미선택" : "-"}</span>}
            </span>
          ); })}
        {isGm && state.phase !== "ended" ? <button type="button" onClick={() => setEdit(!edit)} className="b-muted ml-auto text-[10px] hover:text-white">조정</button> : null}
      </div>
      {edit ? <GmAdjust u={u} campaignId={campaignId} combatId={combatId} onDone={() => setEdit(false)} onApply={onApply} /> : null}
    </div>
  );
}

function Roster({ state, selId, onSelect, isGm }: { state: CombatState; selId: string | null; onSelect: (id: string) => void; isGm: boolean }) {
  const names = unitNames(state);
  const row = (u: Unit) => (
    <button key={u.id} type="button" onClick={() => onSelect(u.id)} className={`flex w-full items-center gap-2 px-1.5 py-1 text-left text-[11px] hover:bg-white/5 ${u.id === selId ? "b-active" : ""} ${u.incapacitated ? "opacity-50" : ""}`}>
      <Portrait u={u} size={20} />
      <span className="min-w-0 flex-1 truncate">{isGm || u.side === "ally" ? u.name : names[u.id]}</span>
      <span className="h-1.5 w-16 overflow-hidden bg-black/60"><span className="block h-full" style={{ width: `${Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100))}%`, background: u.side === "ally" ? "#4fb374" : "#e04b52" }} /></span>
      {u.side === "ally" || isGm ? <span className="b-muted w-14 text-right tabular-nums">{u.hp}/{u.maxHp}</span> : null}
    </button>
  );
  return (
    <div className="b-panel py-1">
      <div className="b-label px-1.5">아군</div>
      {state.units.filter((u) => u.side === "ally").map(row)}
      <div className="b-label mt-1 px-1.5">적</div>
      {state.units.filter((u) => u.side === "enemy").map(row)}
    </div>
  );
}

function GmAdjust({ u, campaignId, combatId, onDone, onApply }: { u: Unit; campaignId: string; combatId: string; onDone: () => void; onApply: (s: CombatState) => void }) {
  const [hp, setHp] = useState(u.hp);
  const [sanity, setSanity] = useState(u.sanity);
  const [st, setSt] = useState<Record<string, number>>(Object.fromEntries(STATUS_IDS.map((k) => [k, u.statuses[k] ?? 0])));
  const [pending, start] = useTransition();
  const cls = "b-input w-full px-1 py-0.5 text-xs tabular-nums";
  return (
    <div className="mt-2 space-y-1 border-t pt-2 text-xs" style={{ borderColor: "var(--b-line)" }}>
      <div className="grid grid-cols-2 gap-1">
        <label>체력<input type="number" value={hp} onChange={(e) => setHp(Number(e.target.value))} className={cls} /></label>
        <label>정신력<input type="number" value={sanity} onChange={(e) => setSanity(Number(e.target.value))} className={cls} /></label>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {STATUS_IDS.map((k) => <label key={k} className="flex items-center gap-1"><StatusIcon status={k} size={14} /><input type="number" min={0} value={st[k]} onChange={(e) => setSt({ ...st, [k]: Number(e.target.value) })} className={cls} /></label>)}
      </div>
      <div className="flex gap-1">
        <button type="button" className="b-btn-red" disabled={pending} onClick={() => start(async () => { const r = await gmAdjustUnitAction(campaignId, combatId, u.id, { hp, sanity, statuses: st as Unit["statuses"] }); if (r.state) onApply(r.state); onDone(); })}>적용</button>
        <button type="button" className="b-btn" onClick={onDone}>취소</button>
      </div>
    </div>
  );
}

/* ---------- 스킬 독 ---------- */
function Dock({ state, unit, slot, speed, onPick, names, onRedraw, protectRange }: { state: CombatState; unit: Unit; slot: number; speed: number; onPick: (p: { skillId: string; targetId: string; targetSlot?: number; protect?: boolean } | null) => void; names: Record<string, string>; onRedraw: () => void; isGm: boolean; protectRange: number }) {
  const current = state.picks[slotKey(unit.id, slot)];
  const egos = unit.skills.filter((s) => s.ego);
  const corroded = isCorroded(unit, state.round);
  const enemies = state.units.filter((u) => u.side === "enemy" && !u.incapacitated)
    .map((e) => ({ e, d: state.grid ? dist(unit.pos, e.pos) : 0 })).sort((a, b) => a.d - b.d);
  const [targetId, setTargetId] = useState(current?.targetId ?? enemies[0]?.e.id ?? "");
  const [targetSlot, setTargetSlot] = useState<number | "">(current?.targetSlot ?? "");
  const [protect, setProtect] = useState<boolean>(current?.protect ?? false);
  const handSkills: Skill[] = unit.hand.map((id) => unit.skills.find((s) => s.id === id)!).filter(Boolean);
  const defense = unit.skills.filter((s) => s.kind === "defense" && !s.ego);
  const interceptable = state.slots.filter((s) => s.combatantId === targetId && s.speed <= speed && state.picks[slotKey(s.combatantId, s.slot)] && state.picks[slotKey(s.combatantId, s.slot)]!.targetId !== unit.id);
  const protectable = state.slots.filter((s) => { if (s.combatantId !== targetId) return false; const p = state.picks[slotKey(s.combatantId, s.slot)]; if (!p || p.targetId === unit.id) return false; const v = state.units.find((u) => u.id === p.targetId); return !!v && v.side === unit.side && !v.incapacitated && (!state.grid || dist(v.pos, unit.pos) <= protectRange); });
  const choose = (skillId: string) => onPick({ skillId, targetId, ...(targetSlot !== "" ? { targetSlot: Number(targetSlot), ...(protect ? { protect: true } : {}) } : {}) });
  const target = enemies.find((x) => x.e.id === targetId);
  const chip = (s: Skill, i: number) => {
    const sel = current?.skillId === s.id;
    const used = s.ego ? (unit.egoUsed?.[s.id] ?? 0) : 0;
    const egoBlocked = s.ego ? used >= s.ego.usesPerCombat : false;
    const outOfRange = !!state.grid && !!target && s.kind === "attack" && !protect && target.d > skillRange(s);
    const disabled = corroded || current?.locked || egoBlocked;
    const color = SIN_COLOR[s.sin] ?? "#555";
    return (
      <button key={`${s.id}-${i}`} type="button" disabled={disabled} title={`${s.name} · ${SIN_LABEL[s.sin]} · 사거리 ${skillRange(s)}칸${outOfRange ? " (사거리 밖)" : ""}`}
        onClick={() => { if (s.ego && !confirm(`E.G.O [${s.name}] 발현: 정신력 -${s.ego.sanityCost}, 침식도 +${s.ego.erosionGain}. 발현 후에는 바꿀 수 없습니다.`)) return; choose(s.id); }}
        className={`group relative flex w-[4.6rem] shrink-0 flex-col items-center gap-0.5 pb-1 pt-1.5 text-[10px] disabled:opacity-40 ${sel ? "b-active" : ""} ${outOfRange ? "opacity-60" : ""}`}>
        <span className={`relative flex h-11 w-11 items-center justify-center rounded-full border-2 ${s.ego ? "border-amber-300" : "border-black/60"} ${sel ? "ring-2 ring-amber-300" : ""}`} style={{ background: `radial-gradient(circle at 35% 30%, ${color}ee, ${color}66 70%, #000 100%)` }}>
          {s.kind === "defense" ? <DefenseIcon kind={s.defenseKind ?? "guard"} size={24} /> : <DamageIcon type={s.damageType} size={24} />}
          <span className="absolute -right-1 -top-1"><SinIcon sin={s.sin} size={16} /></span>
          <span className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 gap-px">{Array.from({ length: s.coinCount }).map((_, j) => <CoinIcon key={j} heads size={9} />)}</span>
        </span>
        <span className="w-full truncate px-0.5 text-center font-medium">{s.name}</span>
        <span className="b-muted tabular-nums">{s.basePower}{s.coinPower >= 0 ? "+" : ""}{s.coinPower}{s.kind === "attack" ? ` · ${skillRange(s)}칸` : ""}</span>
        {s.ego ? <span className="absolute left-0.5 top-0 bg-amber-300 px-0.5 text-[8px] font-bold text-black">E.G.O {used}/{s.ego.usesPerCombat}</span> : null}
        {s.effects?.length ? <span className="absolute right-0.5 top-0 text-[8px] text-emerald-300">fx</span> : null}
      </button>
    );
  };
  return (
    <div className="b-panel p-2">
      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <b>{unit.name}</b> <span className="b-gold">속도 {speed}</span>
        <label className="flex items-center gap-1">대상
          <select value={targetId} onChange={(e) => { setTargetId(e.target.value); setTargetSlot(""); setProtect(false); if (current) onPick({ ...current, targetId: e.target.value, targetSlot: undefined }); }} className="b-input px-1 py-0.5">
            {enemies.map(({ e, d }) => <option key={e.id} value={e.id}>{names[e.id]}{state.grid ? ` (거리 ${d})` : ""}</option>)}
          </select>
        </label>
        {protectable.length && state.grid ? (
          <label className="b-gold flex items-center gap-1" title="빛을 쓰고 노려지는 아군과 자리를 바꿔 공격을 대신 받습니다">
            <input type="checkbox" checked={protect} disabled={!!current?.locked} onChange={(e) => { setProtect(e.target.checked); if (e.target.checked && targetSlot === "") setTargetSlot(protectable[0]!.slot); }} />보호
          </label>
        ) : null}
        {protect && protectable.length ? (
          <label className="flex items-center gap-1">보호 대상
            <select value={targetSlot} onChange={(e) => setTargetSlot(e.target.value === "" ? "" : Number(e.target.value))} className="b-input px-1 py-0.5">
              {protectable.map((s) => <option key={s.slot} value={s.slot}>속도 {s.speed} → {names[state.picks[slotKey(s.combatantId, s.slot)]!.targetId]}</option>)}
            </select>
          </label>
        ) : interceptable.length ? (
          <label className="flex items-center gap-1">가로채기
            <select value={targetSlot} onChange={(e) => { const v = e.target.value === "" ? "" : Number(e.target.value); setTargetSlot(v); if (current) onPick({ ...current, targetSlot: v === "" ? undefined : v }); }} className="b-input px-1 py-0.5">
              <option value="">안 함</option>
              {interceptable.map((s) => <option key={s.slot} value={s.slot}>속도 {s.speed} → {names[state.picks[slotKey(s.combatantId, s.slot)]!.targetId]} 노리는 공격</option>)}
            </select>
          </label>
        ) : null}
        {corroded ? <span style={{ color: "#e04b52" }}>침식 상태: 자동 조종</span> : null}
        {current?.locked ? <span className="b-gold">확정됨</span> : null}
        <span className="ml-auto flex gap-3">
          {current && !current.locked ? <button type="button" onClick={() => onPick(null)} className="b-muted hover:text-white">선택 취소</button> : null}
          {!corroded && !current?.locked && unit.light > 0 ? <button type="button" onClick={() => { if (confirm(`빛 1을 써서 손패를 교체할까요? (남은 빛 ${unit.light})`)) onRedraw(); }} className="b-gold hover:underline">빛 1: 손패 교체</button> : null}
        </span>
      </div>
      <div className="flex gap-1 overflow-x-auto">
        {handSkills.map(chip)}
        <span className="mx-1 w-px shrink-0 self-stretch" style={{ background: "var(--b-line)" }} />
        {defense.map((s) => chip(s, 99))}
        {egos.length ? <span className="mx-1 w-px shrink-0 self-stretch" style={{ background: "var(--b-line)" }} /> : null}
        {egos.map((s, i) => chip(s, 200 + i))}
      </div>
    </div>
  );
}

/* ---------- 속도 트래커 ---------- */
function Tracker({ state, names, isGm, selId, onSelect }: { state: CombatState; names: Record<string, string>; isGm: boolean; selId: string | null; onSelect: (id: string) => void }) {
  const order = [...state.slots].map((s) => ({ s, u: state.units.find((u) => u.id === s.combatantId)! })).filter((x) => x.u && !x.u.incapacitated)
    .sort((a, b) => b.s.speed - a.s.speed || (a.u.side === "ally" ? -1 : 1));
  return (
    <div className="b-tracker flex h-14 shrink-0 items-center gap-1 overflow-x-auto px-3">
      <span className="b-gold mr-2 shrink-0 text-[10px] tracking-widest">속도</span>
      {order.length === 0 ? <span className="text-[11px] text-white/60">{state.phase === "ended" ? "전투 종료" : "속도 슬롯 없음"}</span> : null}
      {order.map(({ s, u }) => { const p = state.picks[slotKey(u.id, s.slot)]; const sk = p ? u.skills.find((x) => x.id === p.skillId) : undefined; const hidden = u.side === "enemy" && !isGm;
        return (
          <button key={slotKey(u.id, s.slot)} type="button" onClick={() => onSelect(u.id)} title={`${names[u.id]} 속도 ${s.speed}${sk ? ` · ${hidden ? "???" : sk.name} → ${names[p!.targetId]}` : ""}`}
            className={`flex h-11 shrink-0 items-center gap-1.5 border px-1.5 ${u.id === selId ? "border-amber-300 bg-black/50" : "border-black/40 bg-black/30"} `}>
            <Portrait u={u} size={30} />
            <span className="flex flex-col items-center leading-none">
              <span className="text-sm font-bold tabular-nums text-white">{s.speed}</span>
              <span className="mt-0.5 flex items-center gap-0.5">
                {sk ? (<>{sk.kind === "defense" ? <DefenseIcon kind={sk.defenseKind ?? "guard"} size={12} /> : <DamageIcon type={sk.damageType} size={12} />}<SinIcon sin={sk.sin} size={12} /></>) : <span className="text-[9px] text-white/50">{state.phase === "select" ? "…" : "-"}</span>}
              </span>
            </span>
            {sk ? <span className="max-w-16 truncate text-[9px] text-white/80">→ {names[p!.targetId]}</span> : null}
          </button>
        ); })}
    </div>
  );
}
