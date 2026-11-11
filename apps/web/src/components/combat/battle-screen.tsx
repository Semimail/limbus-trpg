"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type ReactNode, type PointerEvent as RPointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { STATUS_IDS, SIN_LABEL, slotKey, isCorroded, reachableCells, dist, skillRange, estimateClash, type CombatState, type Unit, type StatusId, type Skill, type Pos, type RuleConfig, type Pick } from "@limbus/rules";
import { setPickAction, resolveRoundAction, endCombatAction, gmAdjustUnitAction, redrawHandAction, moveUnitAction } from "@/app/campaigns/[id]/sessions/[sid]/combat-actions";
import { formatRound, unitNames } from "@/lib/combat-log";
import { SinIcon, DamageIcon, DefenseIcon, CoinIcon, StatusBadge, StatusIcon, BACKGROUNDS } from "@/components/icons";
import { Keyword, KeywordText } from "@/components/keyword/keyword";
import { Cinematic } from "./cinematic";

/*
 * 전투 화면 (림버스 컴퍼니 집중 전투 느낌)
 *  - 무대 전체가 전장. 토큰 위에 속도 다이스가 떠 있고, 아래 스킬 바에서 스킬을 끌어 적(또는 적의 다이스)에 놓아 공격·합·가로채기를 건다.
 *  - 오른쪽 가운데 큰 버튼으로 라운드 진행(GM). 합 연출은 무대 안에서만 재생된다.
 *  - 채팅·로그·명단은 오른쪽 서랍.
 */

interface Props {
  campaignId: string; combatId: string; initial: CombatState; meId: string; isGm: boolean; rules: RuleConfig;
  sessionTitle: string; sceneTitle: string; backHref: string;
  chat: ReactNode; sceneTools?: ReactNode;
}

const SIN_COLOR: Record<string, string> = { wrath: "#b3161c", lust: "#d4621c", sloth: "#c9a227", gluttony: "#4f8a3a", gloom: "#2e6f9e", pride: "#2b3f8c", envy: "#6a3d9a" };

type DragPayload = { kind: "skill"; unitId: string; skillId: string } | { kind: "die"; unitId: string; slot: number } | { kind: "token"; unitId: string };
type DropId = { kind: "unit"; unitId: string } | { kind: "slot"; unitId: string; slot: number } | { kind: "cell"; x: number; y: number };
function parseDrop(s: string | null | undefined): DropId | null {
  if (!s) return null;
  const [k, a, b] = s.split("|");
  if (k === "unit" && a) return { kind: "unit", unitId: a };
  if (k === "slot" && a && b !== undefined) return { kind: "slot", unitId: a, slot: Number(b) };
  if (k === "cell" && a !== undefined && b !== undefined) return { kind: "cell", x: Number(a), y: Number(b) };
  return null;
}

export function BattleScreen({ campaignId, combatId, initial, meId, isGm, rules, sessionTitle, sceneTitle, backHref, chat, sceneTools }: Props) {
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
  useEffect(() => { const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = prev; }; }, []);

  const names = useMemo(() => unitNames(state), [state]);
  const mine = useCallback((u: Unit) => isGm || (u.source.kind === "character" && u.source.ownerId === meId), [isGm, meId]);
  const myUnits = state.units.filter((u) => u.side === "ally" && mine(u) && !u.incapacitated);
  const [selId, setSelId] = useState<string | null>(null);
  const selected = state.units.find((u) => u.id === selId) ?? null;
  const allyUnpicked = state.slots.filter((s) => state.units.find((x) => x.id === s.combatantId)!.side === "ally" && !state.picks[slotKey(s.combatantId, s.slot)]);
  const [drawer, setDrawer] = useState<null | "chat" | "log" | "roster">(null);
  const [showGrid, setShowGrid] = useState(true);
  // 로컬: 다이스에 "장전"된 스킬 (아직 대상 없음), 활성 다이스, 보호 모드
  const [loaded, setLoaded] = useState<Record<string, string>>({});
  const [activeDie, setActiveDie] = useState<string | null>(null);
  const [protectMode, setProtectMode] = useState<Record<string, boolean>>({});
  const firstFreeDie = (unitId: string) => state.slots.find((s) => s.combatantId === unitId && !state.picks[slotKey(unitId, s.slot)]) ?? state.slots.find((s) => s.combatantId === unitId);
  const dieFor = (unitId: string) => { if (activeDie && activeDie.startsWith(unitId + ":")) return Number(activeDie.split(":")[1]); return firstFreeDie(unitId)?.slot; };

  const act = (fn: () => Promise<{ error?: string; state?: CombatState }>) => start(async () => { setErr(null); const r = await fn(); if (r.error) setErr(r.error); if (r.state) applyState(r.state); });
  const pick = (unitId: string, slot: number, p: Pick | null) => act(() => setPickAction(campaignId, combatId, unitId, slot, p));

  /* ---- 드래그 ---- */
  const [drag, setDrag] = useState<{ payload: DragPayload; x: number; y: number; over: DropId | null } | null>(null);
  const pendingDrag = useRef<{ payload: DragPayload; x: number; y: number } | null>(null);
  const draggedRef = useRef(false);
  const dropRef = useRef<((p: DragPayload, t: DropId) => void) | null>(null);
  const startDrag = (payload: DragPayload) => (e: RPointerEvent) => {
    if (state.phase !== "select") return;
    if (e.button !== 0 && e.pointerType === "mouse") return;
    pendingDrag.current = { payload, x: e.clientX, y: e.clientY }; draggedRef.current = false;
  };
  useEffect(() => {
    const dropAt = (x: number, y: number): DropId | null => { const el = document.elementFromPoint(x, y) as HTMLElement | null; return parseDrop(el?.closest<HTMLElement>("[data-drop]")?.dataset.drop); };
    const move = (e: PointerEvent) => {
      const pd = pendingDrag.current;
      if (pd && !draggedRef.current) { if (Math.hypot(e.clientX - pd.x, e.clientY - pd.y) > 6) { draggedRef.current = true; setDrag({ payload: pd.payload, x: e.clientX, y: e.clientY, over: null }); } return; }
      if (draggedRef.current) setDrag((d) => d ? { ...d, x: e.clientX, y: e.clientY, over: dropAt(e.clientX, e.clientY) } : d);
    };
    const up = (e: PointerEvent) => {
      const pd = pendingDrag.current; pendingDrag.current = null;
      if (!pd || !draggedRef.current) return;
      const target = dropAt(e.clientX, e.clientY);
      setDrag(null);
      if (target) dropRef.current?.(pd.payload, target);
      setTimeout(() => { draggedRef.current = false; }, 0);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
  }, []);

  const buildPick = (unitId: string, skillId: string, target: DropId): Pick | string => {
    if (target.kind === "cell") return "스킬은 적에게 놓아야 합니다";
    const t = state.units.find((u) => u.id === target.unitId);
    if (!t || t.side === "ally") return "적에게 놓아야 합니다";
    if (target.kind === "unit") return { skillId, targetId: t.id };
    const tp = state.picks[slotKey(t.id, target.slot)];
    if (tp && tp.targetId === unitId) return { skillId, targetId: t.id };                       // 서로 노림 → 합
    if (protectMode[unitId] && tp) return { skillId, targetId: t.id, targetSlot: target.slot, protect: true }; // 보호
    return { skillId, targetId: t.id, targetSlot: target.slot };                                 // 가로채기(엔진이 속도 검사)
  };
  const handleDrop = (payload: DragPayload, target: DropId) => {
    if (payload.kind === "token") {
      if (target.kind !== "cell") return;
      act(() => moveUnitAction(campaignId, combatId, payload.unitId, { x: target.x, y: target.y }));
      return;
    }
    const unit = state.units.find((u) => u.id === payload.unitId); if (!unit) return;
    const slot = payload.kind === "die" ? payload.slot : dieFor(unit.id);
    if (slot === undefined) { setErr("행동 슬롯이 없습니다"); return; }
    const key = slotKey(unit.id, slot);
    const skillId = payload.kind === "skill" ? payload.skillId : (loaded[key] ?? state.picks[key]?.skillId);
    if (!skillId) { setErr("먼저 스킬을 골라 다이스에 올리세요"); return; }
    const skill = unit.skills.find((s) => s.id === skillId);
    if (skill?.ego && !state.picks[key]?.locked && !confirm(`E.G.O [${skill.name}] 발현: 정신력 -${skill.ego.sanityCost}, 침식도 +${skill.ego.erosionGain}. 발현 후에는 바꿀 수 없습니다.`)) return;
    const p = buildPick(unit.id, skillId, target);
    if (typeof p === "string") { setErr(p); return; }
    pick(unit.id, slot, p);
  };
  useEffect(() => { dropRef.current = handleDrop; });
  // 칩 클릭: 활성 다이스에 장전 (이미 대상이 있으면 그대로 스킬만 교체)
  const loadSkill = (unit: Unit, skill: Skill) => {
    if (draggedRef.current) return;
    const slot = dieFor(unit.id); if (slot === undefined) return;
    const key = slotKey(unit.id, slot);
    const cur = state.picks[key];
    if (cur && !cur.locked) {
      if (skill.ego && !confirm(`E.G.O [${skill.name}] 발현: 정신력 -${skill.ego.sanityCost}, 침식도 +${skill.ego.erosionGain}. 발현 후에는 바꿀 수 없습니다.`)) return;
      pick(unit.id, slot, { ...cur, skillId: skill.id });
    } else if (!cur) { setLoaded((l) => ({ ...l, [key]: skill.id })); setActiveDie(key); }
  };

  /* ---- 합 예측 (드래그 중) ---- */
  const preview = useMemo(() => {
    if (!drag || !drag.over || drag.payload.kind === "token" || drag.over.kind === "cell") return null;
    const unit = state.units.find((u) => u.id === drag.payload.unitId); if (!unit) return null;
    const slot = drag.payload.kind === "die" ? drag.payload.slot : dieFor(unit.id);
    const skillId = drag.payload.kind === "skill" ? drag.payload.skillId : slot !== undefined ? (loaded[slotKey(unit.id, slot)] ?? state.picks[slotKey(unit.id, slot)]?.skillId) : undefined;
    const skill = unit.skills.find((s) => s.id === skillId); if (!skill) return null;
    const t = state.units.find((u) => u.id === (drag.over as { unitId: string }).unitId); if (!t || t.side === "ally") return null;
    const d = state.grid ? dist(unit.pos, t.pos) : 0;
    const outOfRange = !!state.grid && d > skillRange(skill) && !(drag.over.kind === "slot" && protectMode[unit.id]);
    let vs: { skill: Skill; est: ReturnType<typeof estimateClash> } | null = null;
    let mode = "일방 공격";
    if (drag.over.kind === "slot") {
      const tp = state.picks[slotKey(t.id, drag.over.slot)];
      const ts = tp ? t.skills.find((s) => s.id === tp.skillId) : undefined;
      if (ts) { vs = { skill: ts, est: estimateClash(skill, unit.sanity, ts, t.sanity, rules, 200) }; mode = tp!.targetId === unit.id ? "합" : protectMode[unit.id] ? "보호" : "가로채기"; }
      else mode = "아직 선택 없음 · 일방 공격";
    }
    return { skill, t, d, outOfRange, vs, mode, hiddenName: t.side === "enemy" && !isGm };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, state, loaded, protectMode, rules, isGm]);

  const phaseText = state.phase === "select" ? "선택 단계" : state.phase === "ended" ? (state.winner === "ally" ? "승리" : "패배") : "처리 중";

  return (
    <div className="battle fixed inset-0 z-40 flex select-none flex-col overflow-hidden">
      {/* 무대 */}
      <div className="relative min-h-0 flex-1">
        <Arena state={state} names={names} isGm={isGm} selId={selId} onSelect={setSelId} mine={mine} showGrid={showGrid} drag={drag}
          startDrag={startDrag} draggedRef={draggedRef} disabled={pending || state.phase !== "select"}
          onMove={(unitId, to) => act(() => moveUnitAction(campaignId, combatId, unitId, to))} loaded={loaded} />

        {/* 상단 스트립: 라운드 + 메뉴 */}
        <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 overflow-x-auto px-3 py-1.5 text-xs [scrollbar-width:none]">
          <span className="b-round shrink-0">{state.round}</span>
          <span className="flex shrink-0 flex-col leading-tight"><span className="b-gold text-[10px] tracking-widest">ROUND</span><span className="font-semibold">{phaseText}{state.phase === "select" && allyUnpicked.length ? ` · 미선택 ${allyUnpicked.length}` : ""}</span></span>
          <span className="b-muted hidden truncate md:inline">{sessionTitle} · {sceneTitle}</span>
          <span className="ml-auto flex shrink-0 items-center gap-1 text-[11px]">
            <button type="button" className={`b-tab ${drawer === "chat" ? "b-tab-on" : ""}`} onClick={() => setDrawer(drawer === "chat" ? null : "chat")}>채팅</button>
            <button type="button" className={`b-tab ${drawer === "log" ? "b-tab-on" : ""}`} onClick={() => setDrawer(drawer === "log" ? null : "log")}>로그</button>
            <button type="button" className={`b-tab ${drawer === "roster" ? "b-tab-on" : ""}`} onClick={() => setDrawer(drawer === "roster" ? null : "roster")}>명단</button>
            <button type="button" className={`b-tab ${showGrid ? "b-tab-on" : ""}`} onClick={() => setShowGrid(!showGrid)} title="격자 표시">격자</button>
            <button type="button" className={`b-tab ${autoCine ? "b-tab-on" : ""}`} onClick={() => { const v = !autoCine; setAutoCine(v); autoRef.current = v; try { localStorage.setItem("limbus.cinematic", v ? "on" : "off"); } catch {} }} title="라운드 결과 연출 자동 재생">연출</button>
            {state.lastRound?.length ? <button type="button" className="b-tab" onClick={() => setCine({ round: state.round, events: state.lastRound })}>다시 보기</button> : null}
            {sceneTools ? <details className="relative"><summary className="b-tab cursor-pointer list-none">장면</summary><div className="b-panel absolute right-0 top-7 z-20 w-[min(90vw,34rem)] p-2">{sceneTools}</div></details> : null}
            {isGm && state.phase !== "ended" ? <button type="button" className="b-tab" onClick={() => { if (confirm("전투를 종료할까요? 체력과 정신력이 캐릭터에 반영됩니다.")) act(() => endCombatAction(campaignId, combatId)); }}>전투 종료</button> : null}
            <Link href={backHref} className="b-tab">사무소</Link>
          </span>
        </div>
        {/* 좌상단: 오류·공지·선택 유닛 */}
        <div className="pointer-events-none absolute left-3 top-12 z-10 flex max-w-[min(80vw,24rem)] flex-col gap-1.5 text-xs">
          {err ? <div data-role="err" className="pointer-events-auto b-panel border-l-2 px-2 py-1" style={{ borderLeftColor: "var(--b-red)", color: "#ffb3b3" }} onClick={() => setErr(null)}>{err}</div> : null}
          {state.notices?.slice(-3).map((n, i) => <div key={i} className="b-panel border-l-2 px-2 py-1" style={{ borderLeftColor: "var(--b-gold)" }}><KeywordText text={n} /></div>)}
          {selected ? <div className="pointer-events-auto"><UnitCard u={selected} state={state} isGm={isGm} names={names} campaignId={campaignId} combatId={combatId} onApply={applyState} onClose={() => setSelId(null)} /></div> : null}
        </div>

        {/* 오른쪽 가운데: 라운드 진행 버튼 */}
        <div className="absolute bottom-6 right-3 z-10 flex flex-col items-center gap-2 md:bottom-auto md:right-4 md:top-1/2 md:-translate-y-1/2">
          {isGm && state.phase === "select" ? (
            <button type="button" disabled={pending} onClick={() => act(() => resolveRoundAction(campaignId, combatId))} className="b-start" title="라운드 진행">
              <span className="b-start-inner">{pending ? <span className="text-[11px]">처리 중</span> : <><span className="text-2xl leading-none">▶</span><span className="text-[10px] tracking-widest">START</span></>}</span>
            </button>
          ) : state.phase === "ended" ? (
            <button type="button" onClick={() => router.refresh()} className="b-start" title="닫기"><span className="b-start-inner"><span className="text-sm font-bold">{state.winner === "ally" ? "승리" : "패배"}</span><span className="text-[10px]">닫기</span></span></button>
          ) : (
            <div className="b-start b-start-wait" title="GM이 라운드를 진행합니다"><span className="b-start-inner"><span className="text-[11px]">대기</span><span className="text-[10px]">{allyUnpicked.length ? `미선택 ${allyUnpicked.length}` : "준비 완료"}</span></span></div>
          )}
        </div>

        {/* 드래그 미리보기 */}
        {drag && drag.payload.kind !== "token" ? (
          <div className="pointer-events-none fixed z-50" style={{ left: drag.x + 14, top: drag.y - 10 }}>
            {preview ? (
              <div className="b-panel w-60 p-2 text-[11px]">
                <div className="flex items-center justify-between"><b className={preview.outOfRange ? "text-red-400" : "b-gold"}>{preview.outOfRange ? `사거리 밖 (거리 ${preview.d}, 사거리 ${skillRange(preview.skill)})` : preview.mode}</b><span className="b-muted">→ {names[preview.t.id]}</span></div>
                <div className="mt-1 flex items-center gap-2">
                  <SkillChip skill={preview.skill} size={34} />
                  <span className="flex-1 truncate">{preview.skill.name} <span className="b-muted">{preview.skill.basePower}{preview.skill.coinPower >= 0 ? "+" : ""}{preview.skill.coinPower}×{preview.skill.coinCount}</span></span>
                  {preview.vs ? (<><span className="font-black text-white/70">VS</span><span className="flex-1 truncate text-right">{preview.hiddenName ? "???" : preview.vs.skill.name} <span className="b-muted">{preview.vs.skill.basePower}{preview.vs.skill.coinPower >= 0 ? "+" : ""}{preview.vs.skill.coinPower}×{preview.vs.skill.coinCount}</span></span><SkillChip skill={preview.vs.skill} size={34} /></>) : null}
                </div>
                {preview.vs ? <div className="mt-1 flex items-center justify-between"><span className={`font-black ${oddsColor(preview.vs.est.label)}`}>{preview.vs.est.label}</span><span className="b-muted">승률 {Math.round(preview.vs.est.winRate * 100)}% · 기대 위력 {preview.vs.est.aPower} : {preview.vs.est.bPower}</span></div> : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {drag && drag.payload.kind !== "token" ? <DragGhost drag={drag} state={state} loaded={loaded} dieFor={dieFor} /> : null}

        {/* 서랍 */}
        <div className={`absolute inset-y-0 right-0 z-20 flex w-full flex-col sm:w-[22rem] ${drawer ? "" : "pointer-events-none translate-x-full"} b-drawer transition-transform duration-200`}>
          <div className="b-bar flex h-9 items-center gap-1 px-2 text-[11px]">
            {(["chat", "log", "roster"] as const).map((k) => <button key={k} type="button" className={`b-tab ${drawer === k ? "b-tab-on" : ""}`} onClick={() => setDrawer(k)}>{k === "chat" ? "채팅" : k === "log" ? "로그" : "명단"}</button>)}
            <button type="button" className="b-tab ml-auto" onClick={() => setDrawer(null)}>닫기 ✕</button>
          </div>
          <div className={`min-h-0 flex-1 p-2 ${drawer === "chat" ? "" : "hidden"}`}>{chat}</div>
          {drawer === "log" ? <div className="min-h-0 flex-1 overflow-auto p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">{state.lastRound ? <KeywordText text={formatRound(state.lastRound, names).join("\n")} /> : <span className="b-muted">아직 결과가 없습니다.</span>}</div> : null}
          {drawer === "roster" ? <div className="min-h-0 flex-1 overflow-auto p-2"><Roster state={state} selId={selId} onSelect={(id) => { setSelId(id); }} isGm={isGm} names={names} /></div> : null}
        </div>

        {cine?.events ? <Cinematic inline events={cine.events} units={state.units} onClose={() => setCine(null)} /> : null}
      </div>

      {/* 하단: 스킬 바 */}
      {state.phase === "select" && myUnits.length > 0 ? (
        <div className="b-skillbar shrink-0 overflow-y-auto" style={{ maxHeight: "38vh" }}>
          {myUnits.map((u) => (
            <SkillRow key={u.id} unit={u} state={state} names={names} rules={rules} loaded={loaded} activeDie={activeDie} setActiveDie={setActiveDie}
              protectMode={!!protectMode[u.id]} setProtectMode={(v) => setProtectMode((m) => ({ ...m, [u.id]: v }))}
              startDrag={startDrag} onChip={(s) => loadSkill(u, s)} onSelect={() => setSelId(u.id)}
              onCancel={(slot) => { const k = slotKey(u.id, slot); if (state.picks[k]) pick(u.id, slot, null); else setLoaded((l) => { const n = { ...l }; delete n[k]; return n; }); }}
              onRedraw={() => { if (confirm(`빛 1을 써서 손패를 교체할까요? (남은 빛 ${u.light})`)) act(() => redrawHandAction(campaignId, combatId, u.id)); }} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

const oddsColor = (l: string) => l === "압도" ? "text-amber-300" : l === "유리" ? "text-emerald-300" : l === "보통" ? "text-white" : l === "불리" ? "text-orange-300" : "text-red-400";

/* ---------- 무대 ---------- */
function Arena({ state, names, isGm, selId, onSelect, mine, showGrid, drag, startDrag, draggedRef, disabled, onMove, loaded }: {
  state: CombatState; names: Record<string, string>; isGm: boolean; selId: string | null; onSelect: (id: string | null) => void; mine: (u: Unit) => boolean; showGrid: boolean;
  drag: { payload: DragPayload; over: DropId | null } | null; startDrag: (p: DragPayload) => (e: RPointerEvent) => void; draggedRef: React.MutableRefObject<boolean>;
  disabled: boolean; onMove: (unitId: string, to: Pos) => void; loaded: Record<string, string>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 600 });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const { cols, rows } = state.grid ?? { cols: 10, rows: 6 };
  const cell = Math.max(34, Math.min(110, Math.floor((size.w - 140) / cols), Math.floor((size.h - 110) / rows)));
  const W = cols * cell, H = rows * cell;
  const ox = Math.max(8, Math.floor((size.w - W) / 2)), oy = Math.max(60, Math.floor((size.h - H) / 2 + 20));
  const gridOn = !!state.grid;
  const posOf = (u: Unit): Pos => gridOn ? u.pos : (() => { const side = state.units.filter((x) => x.side === u.side); const i = side.indexOf(u); return { x: u.side === "ally" ? 1 : cols - 2, y: Math.min(rows - 1, Math.floor((rows - side.length) / 2) + i) }; })();
  const center = (u: Unit) => { const p = posOf(u); return { x: ox + p.x * cell + cell / 2, y: oy + p.y * cell + cell / 2 }; };
  const dieSize = Math.max(22, Math.min(34, Math.round(cell * 0.38)));
  const diePos = (u: Unit, idx: number, n: number) => { const c = center(u); return { x: c.x + (idx - (n - 1) / 2) * (dieSize + 4), y: oy + posOf(u).y * cell - dieSize * 0.7 }; };
  const selected = selId ? state.units.find((u) => u.id === selId) : undefined;
  const canMove = !!selected && mine(selected) && !selected.incapacitated && !selected.staggered && !isCorroded(selected, state.round) && state.phase === "select" && gridOn;
  const reach = useMemo(() => (canMove && selected ? reachableCells(state, selected.id) : new Map<string, number>()), [state, selected, canMove]);
  const occupied = (x: number, y: number) => state.units.some((u) => !u.incapacitated && u.pos.x === x && u.pos.y === y);
  const maxRange = selected ? Math.max(1, ...selected.skills.filter((s) => s.kind === "attack").map(skillRange)) : 0;
  const draggingToken = drag?.payload.kind === "token" ? drag.payload.unitId : null;
  const tokenReach = useMemo(() => (draggingToken ? reachableCells(state, draggingToken) : null), [state, draggingToken]);
  const slotsOf = (u: Unit) => state.slots.filter((s) => s.combatantId === u.id);
  // 선 (의도)
  const lines = Object.entries(state.picks).map(([k, p]) => {
    const [uid, sl] = k.split(":"); const a = state.units.find((u) => u.id === uid); const t = state.units.find((u) => u.id === p.targetId);
    if (!a || !t || a.incapacitated) return null;
    const as = slotsOf(a); const ai = as.findIndex((s) => s.slot === Number(sl));
    const from = diePos(a, ai, as.length);
    let to = center(t);
    if (p.targetSlot !== undefined) { const ts = slotsOf(t); const ti = ts.findIndex((s) => s.slot === p.targetSlot); if (ti >= 0) to = diePos(t, ti, ts.length); }
    const mutual = Object.entries(state.picks).some(([k2, p2]) => k2.startsWith(t.id + ":") && p2.targetId === a.id);
    return { from, to, enemy: a.side === "enemy", mutual, protect: !!p.protect, key: k };
  }).filter(Boolean) as { from: Pos; to: Pos; enemy: boolean; mutual: boolean; protect: boolean; key: string }[];
  const overId = drag?.over;

  return (
    <div ref={ref} className="b-canvas absolute inset-0 overflow-hidden" onClick={(e) => { if (e.target === e.currentTarget) onSelect(null); }}>
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${BACKGROUNDS.backstreet})`, filter: "brightness(.45) saturate(.8)" }} />
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,.1) 30%, rgba(0,0,0,.15) 70%, rgba(0,0,0,.7) 100%)" }} />
      {/* 격자 + 선 */}
      <svg className="absolute inset-0" width={size.w} height={size.h}>
        <defs>
          <pattern id="bgrid" x={ox} y={oy} width={cell} height={cell} patternUnits="userSpaceOnUse"><path d={`M ${cell} 0 L 0 0 0 ${cell}`} fill="none" stroke="rgba(217,179,91,.18)" strokeWidth="1" /></pattern>
          <marker id="arr-red" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#e04b52" /></marker>
          <marker id="arr-gold" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#d9b35b" /></marker>
        </defs>
        {showGrid && gridOn ? (<><rect x={ox} y={oy} width={W} height={H} fill="rgba(10,6,6,.35)" /><rect x={ox} y={oy} width={W} height={H} fill="url(#bgrid)" /><rect x={ox + 0.5} y={oy + 0.5} width={W - 1} height={H - 1} fill="none" stroke="rgba(217,179,91,.45)" /></>) : null}
        {canMove && selected ? Array.from({ length: rows }).map((_, y) => Array.from({ length: cols }).map((_, x) => {
          const inR = dist(selected.pos, { x, y }) <= maxRange; const cost = reach.get(`${x},${y}`);
          if (!inR && cost === undefined) return null;
          return <rect key={`${x},${y}`} x={ox + x * cell + 1} y={oy + y * cell + 1} width={cell - 2} height={cell - 2} fill={inR ? "rgba(210,36,43,.16)" : "rgba(79,179,116,.06)"} />;
        })) : null}
        {lines.map((l) => (
          <g key={l.key}>
            <line x1={l.from.x} y1={l.from.y} x2={l.to.x} y2={l.to.y} stroke={l.enemy ? "#e04b52" : l.protect ? "#f5e6b5" : "#d9b35b"} strokeWidth={l.mutual ? 2.5 : 1.8} strokeDasharray={l.mutual ? undefined : "5 4"} opacity={0.9} markerEnd={`url(#${l.enemy ? "arr-red" : "arr-gold"})`} />
            {l.mutual && !l.enemy ? <g transform={`translate(${(l.from.x + l.to.x) / 2},${(l.from.y + l.to.y) / 2})`}><circle r={11} fill="#0b0707" stroke="#d9b35b" /><text textAnchor="middle" dy="4" fontSize="11" fontWeight="700" fill="#d9b35b">합</text></g> : null}
          </g>
        ))}
      </svg>
      {/* 이동 칸 (클릭 또는 토큰 드롭) */}
      {gridOn && ((canMove && selected) || tokenReach) ? Array.from((tokenReach ?? reach).entries()).map(([k, cost]) => { if (cost === 0) return null; const [x, y] = k.split(",").map(Number) as [number, number]; if (occupied(x, y)) return null;
        const over = overId?.kind === "cell" && overId.x === x && overId.y === y;
        return <button key={k} type="button" data-drop={`cell|${x}|${y}`} disabled={disabled} title={`이동 ${cost}칸`} onClick={() => { if (!draggedRef.current && selected) onMove(selected.id, { x, y }); }}
          className={`absolute flex items-end justify-end p-0.5 text-[9px] text-emerald-200/60 hover:bg-emerald-400/25 ${over ? "bg-emerald-400/30" : ""}`} style={{ left: ox + x * cell, top: oy + y * cell, width: cell, height: cell }}>{cost}</button>; }) : null}
      {/* 토큰 */}
      {state.units.map((u) => { const p = posOf(u); const isSel = u.id === selId; const my = mine(u); const draggable = my && u.side === "ally" && !u.incapacitated && !u.staggered && state.phase === "select" && gridOn;
        const over = overId && overId.kind === "unit" && overId.unitId === u.id;
        const sprite = u.spriteUrl; const tokenH = sprite ? cell * 1.55 : cell - 8;
        return (
          <div key={u.id} className={`absolute ${u.incapacitated ? "opacity-40 grayscale" : ""}`} style={{ left: ox + p.x * cell, top: oy + p.y * cell, width: cell, height: cell }}>
            <button type="button" data-drop={u.side === "enemy" ? `unit|${u.id}` : undefined} onPointerDown={draggable ? startDrag({ kind: "token", unitId: u.id }) : undefined}
              onClick={() => { if (draggedRef.current) return; onSelect(isSel ? null : u.id); }} title={names[u.id]}
              className={`absolute bottom-1 left-1/2 flex -translate-x-1/2 items-end justify-center ${draggable ? "touch-none cursor-grab" : ""}`} style={{ width: cell - 4, height: cell - 8 }}>
              {sprite ? (
                // 스탠딩은 칸 위로 삐져나오지만 클릭·드롭 판정은 칸 크기만 쓴다
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sprite} alt="" draggable={false} className={`pointer-events-none absolute bottom-0 left-1/2 w-auto max-w-none -translate-x-1/2 object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,.9)] ${over ? "brightness-125" : ""}`} style={{ height: tokenH, transform: `translateX(-50%)${u.side === "enemy" ? " scaleX(-1)" : ""}` }} />
              ) : (
                <span className={`relative block overflow-hidden ${over ? "ring-2 ring-red-400" : ""}`} style={{ width: cell - 10, height: cell - 10, border: `2px solid ${u.side === "ally" ? "rgba(217,179,91,.9)" : "rgba(224,75,82,.9)"}`, background: "rgba(10,6,6,.8)", clipPath: "polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {u.portraitUrl ? <img src={u.portraitUrl} alt="" draggable={false} className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-base font-bold">{u.name.slice(0, 1)}</span>}
                </span>
              )}
              {isSel ? <span className="pointer-events-none absolute -inset-1 rounded-sm" style={{ boxShadow: "0 0 0 2px #d9b35b, 0 0 18px rgba(217,179,91,.6)" }} /> : null}
              {over ? <span className="pointer-events-none absolute -inset-1 rounded-sm" style={{ boxShadow: "0 0 0 2px #e04b52, 0 0 18px rgba(224,75,82,.8)" }} /> : null}
            </button>
            {/* 체력·이름 */}
            <div className="pointer-events-none absolute -bottom-4 left-0 right-0 text-center">
              <span className="mx-auto block h-1.5 w-[86%] overflow-hidden bg-black/70"><span className="block h-full" style={{ width: `${Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100))}%`, background: u.side === "ally" ? "linear-gradient(90deg,#2f7a4a,#4fb374)" : "linear-gradient(90deg,#7a0f13,#e04b52)" }} /></span>
              {cell >= 44 ? <span className="block truncate text-[9px] leading-tight" style={{ textShadow: "0 1px 2px #000" }}>{names[u.id]}{u.side === "ally" && !u.sanityLocked ? <span className="b-muted"> {u.sanity > 0 ? "+" : ""}{u.sanity}</span> : null}</span> : null}
            </div>
            {u.staggered ? <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-yellow-400 px-1 text-[9px] font-black text-black">흐트러짐</span> : null}
            {isCorroded(u, state.round) ? <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-red-700 px-1 text-[9px] font-black text-white">침식</span> : null}
          </div>
        ); })}
      {/* 속도 다이스 */}
      {state.units.filter((u) => !u.incapacitated).map((u) => { const ss = slotsOf(u); if (!ss.length) return null; const my = mine(u) && u.side === "ally";
        return ss.map((s, i) => { const key = slotKey(u.id, s.slot); const p = state.picks[key]; const sk = p ? u.skills.find((x) => x.id === p.skillId) : (my && loaded[key] ? u.skills.find((x) => x.id === loaded[key]) : undefined); const d = diePos(u, i, ss.length);
          const over = overId?.kind === "slot" && overId.unitId === u.id && overId.slot === s.slot;
          const hidden = u.side === "enemy" && !isGm;
          return (
            <button key={key} type="button" data-drop={u.side === "enemy" ? `slot|${u.id}|${s.slot}` : undefined} onPointerDown={my && sk && !p?.locked && state.phase === "select" ? startDrag({ kind: "die", unitId: u.id, slot: s.slot }) : undefined}
              onClick={() => { if (!draggedRef.current) onSelect(u.id); }} title={`${names[u.id]} 속도 ${s.speed}${sk ? ` · ${hidden ? "???" : sk.name}${p ? ` → ${names[p.targetId]}` : " (대상 없음)"}` : ""}`}
              className={`b-die absolute -translate-x-1/2 -translate-y-1/2 ${u.side === "enemy" ? "b-die-enemy" : ""} ${over ? "b-die-over" : ""} ${my && sk ? "touch-none cursor-grab" : ""} ${p?.locked ? "b-die-locked" : ""}`} style={{ left: d.x, top: d.y, width: dieSize, height: dieSize }}>
              {sk ? <SkillChip skill={sk} size={dieSize - 4} /> : null}
              <span className={`b-die-num ${sk ? "b-die-num-sm" : ""}`}>{s.speed}</span>
              {p?.protect ? <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-amber-200 px-0.5 text-[7px] font-black text-black">보호</span> : null}
            </button>
          ); }); })}
      <div className="pointer-events-none absolute bottom-1 left-3 text-[10px]" style={{ color: "var(--b-muted)" }}>
        {selected ? `${selected.name} · 이동력 ${selected.move ?? 0} · 최대 사거리 ${maxRange}칸${canMove ? " · 초록 칸을 누르거나 토큰을 끌어 이동" : ""}` : "토큰을 눌러 정보 보기 · 스킬을 적에게 끌어 놓기"}
      </div>
    </div>
  );
}

function DragGhost({ drag, state, loaded, dieFor }: { drag: { payload: DragPayload; x: number; y: number }; state: CombatState; loaded: Record<string, string>; dieFor: (unitId: string) => number | undefined }) {
  if (drag.payload.kind === "token") return null;
  const unit = state.units.find((u) => u.id === drag.payload.unitId); if (!unit) return null;
  const slot = drag.payload.kind === "die" ? drag.payload.slot : dieFor(unit.id);
  const skillId = drag.payload.kind === "skill" ? drag.payload.skillId : slot !== undefined ? (loaded[slotKey(unit.id, slot)] ?? state.picks[slotKey(unit.id, slot)]?.skillId) : undefined;
  const skill = unit.skills.find((s) => s.id === skillId);
  return <div className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2" style={{ left: drag.x, top: drag.y }}>{skill ? <SkillChip skill={skill} size={48} glow /> : <span className="b-die flex items-center justify-center" style={{ width: 40, height: 40 }}>?</span>}</div>;
}

/* ---------- 스킬 아이콘 (죄악 색 원 + 공격 타입) ---------- */
function SkillChip({ skill, size, glow, selected }: { skill: Skill; size: number; glow?: boolean; selected?: boolean }) {
  const color = SIN_COLOR[skill.sin] ?? "#555";
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center rounded-full ${selected ? "ring-2 ring-amber-300" : ""}`}
      style={{ width: size, height: size, background: `radial-gradient(circle at 35% 30%, ${color}f0, ${color}80 65%, #050303 100%)`, border: `${skill.ego ? 2 : 1.5}px solid ${skill.ego ? "#f1d27a" : "rgba(0,0,0,.7)"}`, boxShadow: glow ? `0 0 18px ${color}` : "inset 0 0 6px rgba(0,0,0,.6)" }}>
      {skill.kind === "defense" ? <DefenseIcon kind={skill.defenseKind ?? "guard"} size={Math.round(size * 0.55)} /> : <DamageIcon type={skill.damageType} size={Math.round(size * 0.55)} />}
      {size >= 30 ? <span className="absolute -right-1 -top-1"><SinIcon sin={skill.sin} size={Math.round(size * 0.38)} /></span> : null}
    </span>
  );
}

/* ---------- 하단 스킬 바 한 줄 ---------- */
function SkillRow({ unit, state, names, loaded, activeDie, setActiveDie, protectMode, setProtectMode, startDrag, onChip, onSelect, onCancel, onRedraw }: {
  unit: Unit; state: CombatState; names: Record<string, string>; rules: RuleConfig; loaded: Record<string, string>; activeDie: string | null; setActiveDie: (k: string) => void;
  protectMode: boolean; setProtectMode: (v: boolean) => void; startDrag: (p: DragPayload) => (e: RPointerEvent) => void; onChip: (s: Skill) => void; onSelect: () => void; onCancel: (slot: number) => void; onRedraw: () => void;
}) {
  const slots = state.slots.filter((s) => s.combatantId === unit.id);
  const corroded = isCorroded(unit, state.round);
  const hand: Skill[] = unit.hand.map((id) => unit.skills.find((s) => s.id === id)!).filter(Boolean);
  const defense = unit.skills.filter((s) => s.kind === "defense" && !s.ego);
  const egos = unit.skills.filter((s) => s.ego);
  const firstFree = slots.find((s) => !state.picks[slotKey(unit.id, s.slot)]);
  const activeKey = activeDie && activeDie.startsWith(unit.id + ":") ? activeDie : firstFree ? slotKey(unit.id, firstFree.slot) : null;
  const activeSkillId = activeKey ? (state.picks[activeKey]?.skillId ?? loaded[activeKey]) : undefined;
  // 보호 가능: 적 다이스가 주변 아군을 노리는 경우
  const protectable = Object.entries(state.picks).some(([k, p]) => { const a = state.units.find((u) => u.id === k.split(":")[0]); const v = state.units.find((u) => u.id === p.targetId); return !!a && a.side === "enemy" && !!v && v.side === "ally" && v.id !== unit.id && !v.incapacitated && (!state.grid || dist(v.pos, unit.pos) <= 2); });
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 md:flex-nowrap" style={{ borderTop: "1px solid rgba(217,179,91,.15)" }}>
      <button type="button" onClick={onSelect} className="flex shrink-0 items-center gap-2 text-left">
        <span className="relative block h-11 w-11 overflow-hidden" style={{ border: "2px solid rgba(217,179,91,.8)", clipPath: "polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)", background: "#120c0c" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {unit.portraitUrl ? <img src={unit.portraitUrl} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-sm font-bold">{unit.name.slice(0, 1)}</span>}
        </span>
        <span className="hidden w-20 flex-col leading-tight sm:flex">
          <span className="truncate text-xs font-semibold">{unit.name}</span>
          <span className="b-muted text-[10px] tabular-nums">체력 {unit.hp}/{unit.maxHp}</span>
          <span className="b-muted text-[10px] tabular-nums">정신 {unit.sanity > 0 ? "+" : ""}{unit.sanity} · <span className="b-gold">빛 {unit.light}</span></span>
        </span>
      </button>
      {/* 다이스 */}
      <div className="flex shrink-0 items-center gap-1.5">
        {slots.length === 0 ? <span className="b-muted text-[11px]">{unit.staggered ? "흐트러짐 · 행동 불가" : "슬롯 없음"}</span> : null}
        {slots.map((s) => { const key = slotKey(unit.id, s.slot); const p = state.picks[key]; const skId = p?.skillId ?? loaded[key]; const sk = skId ? unit.skills.find((x) => x.id === skId) : undefined; const active = key === activeKey;
          return (
            <div key={key} className="relative flex flex-col items-center">
              <button type="button" onPointerDown={sk && !p?.locked && !corroded ? startDrag({ kind: "die", unitId: unit.id, slot: s.slot }) : undefined} onClick={() => setActiveDie(key)}
                title={sk ? `${sk.name}${p ? ` → ${names[p.targetId]}${p.targetSlot !== undefined ? (p.protect ? " (보호)" : " (가로채기/합)") : ""}` : " · 적에게 끌어 놓으세요"}` : "스킬을 골라 올리세요"}
                className={`b-die b-die-lg relative touch-none ${active ? "b-die-active" : ""} ${p ? "b-die-set" : ""} ${p?.locked ? "b-die-locked" : ""} ${sk && !p?.locked ? "cursor-grab" : ""}`} style={{ width: 46, height: 46 }}>
                {sk ? <SkillChip skill={sk} size={40} /> : null}
                <span className={`b-die-num ${sk ? "b-die-num-sm" : ""}`}>{s.speed}</span>
              </button>
              <span className="mt-0.5 h-3 text-[9px] leading-none">{p ? <span className="b-gold">→ {names[p.targetId]}</span> : sk ? <span className="text-emerald-300">대상?</span> : <span className="b-muted">속도 {s.speed}</span>}</span>
              {(p && !p.locked) || (!p && loaded[key]) ? <button type="button" onClick={() => onCancel(s.slot)} className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black text-[9px] text-white/80 ring-1 ring-white/30 hover:bg-red-700" title="선택 취소">✕</button> : null}
            </div>
          ); })}
      </div>
      <span className="mx-1 hidden h-10 w-px shrink-0 md:block" style={{ background: "rgba(217,179,91,.25)" }} />
      {/* 손패 · 방어 · E.G.O */}
      <div className="order-last flex min-w-0 basis-full items-center gap-1.5 overflow-x-auto py-1 md:order-none md:basis-auto md:flex-1">
        {corroded ? <span className="text-[11px] text-red-400">침식 상태: 자동 조종</span> : null}
        {[...hand.map((s, i) => ({ s, i })), ...defense.map((s, i) => ({ s, i: 100 + i })), ...egos.map((s, i) => ({ s, i: 200 + i }))].map(({ s, i }, idx) => {
          const used = s.ego ? (unit.egoUsed?.[s.id] ?? 0) : 0; const blocked = corroded || (s.ego ? used >= s.ego.usesPerCombat : false);
          const sepBefore = idx === hand.length || idx === hand.length + defense.length;
          return (
            <span key={`${s.id}-${i}`} className="flex items-center">
              {sepBefore && idx > 0 ? <span className="mx-1 h-8 w-px" style={{ background: "rgba(255,255,255,.12)" }} /> : null}
              <button type="button" disabled={blocked} onPointerDown={blocked ? undefined : startDrag({ kind: "skill", unitId: unit.id, skillId: s.id })} onClick={() => onChip(s)}
                title={`${s.name} · ${SIN_LABEL[s.sin]} · ${s.basePower}${s.coinPower >= 0 ? "+" : ""}${s.coinPower} × ${s.coinCount}코인 · 사거리 ${skillRange(s)}칸${s.effectText ? `\n${s.effectText}` : ""}`}
                className={`flex w-[3.6rem] shrink-0 touch-none cursor-grab flex-col items-center gap-0.5 text-[9px] disabled:cursor-not-allowed disabled:opacity-35 ${activeSkillId === s.id ? "b-chip-on" : ""}`}>
                <SkillChip skill={s} size={40} selected={activeSkillId === s.id} />
                <span className="w-full truncate text-center leading-tight">{s.name}</span>
                <span className="b-muted flex items-center gap-0.5 tabular-nums">{s.basePower}{s.coinPower >= 0 ? "+" : ""}{s.coinPower}<span className="inline-flex">{Array.from({ length: Math.min(s.coinCount, 6) }).map((_, j) => <CoinIcon key={j} heads size={8} />)}</span></span>
                {s.ego ? <span className="b-gold leading-none">E.G.O {used}/{s.ego.usesPerCombat}</span> : null}
              </button>
            </span>
          ); })}
      </div>
      {/* 오른쪽 제어 */}
      <div className="ml-auto flex shrink-0 flex-col items-end gap-1 text-[10px]">
        {protectable && state.grid ? <label className={`flex items-center gap-1 ${protectMode ? "text-amber-200" : "b-muted"}`} title="켜고 아군을 노리는 적 다이스에 스킬을 놓으면, 빛을 쓰고 자리를 바꿔 대신 받습니다"><input type="checkbox" checked={protectMode} onChange={(e) => setProtectMode(e.target.checked)} />보호</label> : null}
        {!corroded && unit.light > 0 ? <button type="button" onClick={onRedraw} className="b-gold hover:underline">빛 1: 손패 교체</button> : null}
      </div>
    </div>
  );
}

/* ---------- 유닛 카드 ---------- */
function UnitCard({ u, state, isGm, names, campaignId, combatId, onApply, onClose }: { u: Unit; state: CombatState; isGm: boolean; names: Record<string, string>; campaignId: string; combatId: string; onApply: (s: CombatState) => void; onClose: () => void }) {
  const hideNumbers = u.side === "enemy" && !isGm;
  const statuses = (Object.entries(u.statuses) as [StatusId, number][]).filter(([, v]) => v > 0);
  const [edit, setEdit] = useState(false);
  const hpPct = Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100));
  return (
    <div className="b-panel w-72 p-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{names[u.id]}</span>
        <span className="flex items-center gap-2">
          <span className="b-muted text-[10px]">{u.incapacitated ? <Keyword id="down">전투불능</Keyword> : isCorroded(u, state.round) ? <Keyword id="corrosion" className="text-red-400">침식</Keyword> : u.staggered ? <Keyword id="stagger">흐트러짐</Keyword> : u.side === "ally" ? "아군" : "적"}</span>
          <button type="button" onClick={onClose} className="b-muted hover:text-white">✕</button>
        </span>
      </div>
      <div className="mt-1 h-2 w-full bg-black/60"><div className="h-full" style={{ width: `${hpPct}%`, background: u.side === "ally" ? "linear-gradient(90deg,#2f7a4a,#4fb374)" : "linear-gradient(90deg,#7a0f13,#e04b52)" }} /></div>
      <div className="b-muted mt-0.5 flex flex-wrap justify-between gap-x-2 text-[10px] tabular-nums">
        <span>{hideNumbers ? "체력 ?" : `체력 ${u.hp}/${u.maxHp}`}</span>
        {!u.sanityLocked ? <span>정신력 {u.sanity > 0 ? "+" : ""}{u.sanity}</span> : null}
        {u.source.kind === "character" ? <span><Keyword id="light">빛</Keyword> {u.light} · <Keyword id="erosion">침식도</Keyword> {u.erosion}</span> : null}
        {state.grid ? <span>이동 {u.move ?? 0}</span> : null}
      </div>
      {statuses.length ? <div className="mt-1 flex flex-wrap gap-1">{statuses.map(([k, v]) => <Keyword key={k} id={k} className="border-0"><StatusBadge status={k} value={v} /></Keyword>)}</div> : null}
      {isGm && state.phase !== "ended" ? <button type="button" onClick={() => setEdit(!edit)} className="b-muted mt-1 text-[10px] hover:text-white">수치 조정</button> : null}
      {edit ? <GmAdjust u={u} campaignId={campaignId} combatId={combatId} onDone={() => setEdit(false)} onApply={onApply} /> : null}
    </div>
  );
}

function Roster({ state, selId, onSelect, isGm, names }: { state: CombatState; selId: string | null; onSelect: (id: string) => void; isGm: boolean; names: Record<string, string> }) {
  const row = (u: Unit) => (
    <button key={u.id} type="button" onClick={() => onSelect(u.id)} className={`flex w-full items-center gap-2 px-1.5 py-1 text-left text-[11px] hover:bg-white/5 ${u.id === selId ? "b-active" : ""} ${u.incapacitated ? "opacity-50" : ""}`}>
      <span className="min-w-0 flex-1 truncate">{names[u.id]}</span>
      <span className="h-1.5 w-20 overflow-hidden bg-black/60"><span className="block h-full" style={{ width: `${Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100))}%`, background: u.side === "ally" ? "#4fb374" : "#e04b52" }} /></span>
      {u.side === "ally" || isGm ? <span className="b-muted w-16 text-right tabular-nums">{u.hp}/{u.maxHp}</span> : null}
    </button>
  );
  return (<div className="b-panel py-1"><div className="b-label px-1.5">아군</div>{state.units.filter((u) => u.side === "ally").map(row)}<div className="b-label mt-1 px-1.5">적</div>{state.units.filter((u) => u.side === "enemy").map(row)}</div>);
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
