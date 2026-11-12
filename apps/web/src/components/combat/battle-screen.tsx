"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type ReactNode, type PointerEvent as RPointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient, realtimeReady } from "@/lib/supabase/client";
import { STATUS_IDS, SIN_LABEL, SINS, slotKey, isCorroded, reachableCells, dist, skillRange, estimateClash, describeEffect, type CombatState, type Unit, type StatusId, type Skill, type Pos, type RuleConfig, type Pick, type Sin } from "@limbus/rules";
import { setPickAction, resolveRoundAction, endCombatAction, gmAdjustUnitAction, redrawHandAction, moveUnitAction } from "@/app/campaigns/[id]/sessions/[sid]/combat-actions";
import { revealToAll } from "@/app/campaigns/[id]/enemies/actions";
import { formatRound, unitNames } from "@/lib/combat-log";
import { SinIcon, DamageIcon, DefenseIcon, CoinIcon, StatusBadge, StatusIcon, BACKGROUNDS } from "@/components/icons";
import { Keyword, KeywordText } from "@/components/keyword/keyword";
import { buildPlaySteps, type PlayStep } from "./playback";

/*
 * 전투 화면 v4 — 림버스 컴퍼니 UI 조각(드라이브 UI/Battle 아틀라스) + 참고 영상(FVTT 림버스 모듈) 레이아웃
 *  - 좌상단 TURN/ENEMY 프레임, 왼쪽 행동 순서, 우상단 버튼, 오른쪽 유닛 카드(적은 공개된 기믹만), 우하단 로그, 붉은 원형 START.
 *  - 가운데 아래 림버스식 스킬 슬롯 띠: 자기 캐릭터의 다이스를 누르면 1·2·3번 손패/방어/E.G.O를 골라 올리고,
 *    다이스를 끌어(또는 적을 눌러) 대상을 정한다. 남의 캐릭터는 보기만.
 */

export interface EnemyInfo { threat: string; description: string; gimmicks: { id: string; name: string; text: string }[]; revealed: string[] }

interface Props {
  campaignId: string; combatId: string; initial: CombatState; meId: string; isGm: boolean; rules: RuleConfig;
  sessionTitle: string; sceneTitle: string; backHref: string;
  chat: ReactNode; sceneTools?: ReactNode; enemyInfo: Record<string, EnemyInfo>;
}

const UI = "/assets/limbus/ui";
const ui = (n: string) => `${UI}/${n}.png`;
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
const rangeLabel = (s: Skill) => { const r = skillRange(s); return r <= 1 ? "근접 1칸" : `원거리 ${r}칸`; };
const powerText = (s: Skill) => `${s.basePower}${s.coinPower >= 0 ? "+" : ""}${s.coinPower}×${s.coinCount}`;

export function BattleScreen({ campaignId, combatId, initial, meId, isGm, rules, sessionTitle, sceneTitle, backHref, chat, sceneTools, enemyInfo }: Props) {
  const router = useRouter();
  const [state, setState] = useState<CombatState>(initial);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // 판 위 합 연출 (영상처럼 한 단계씩). steps는 라운드 결과에서 만든다
  const [play, setPlay] = useState<{ steps: PlayStep[]; i: number; paused: boolean } | null>(null);
  const seenRound = useRef<number>(initial.lastRound?.length && initial.lastRound[0]!.type === "roundStart" ? (initial.lastRound[0] as { round: number }).round : 0);
  const [autoCine, setAutoCine] = useState<boolean>(() => { if (typeof window === "undefined") return true; try { return localStorage.getItem("limbus.cinematic") !== "off"; } catch { return true; } });
  const autoRef = useRef(autoCine);
  useEffect(() => { autoRef.current = autoCine; }, [autoCine]);
  const startPlay = useCallback((events: CombatState["lastRound"], units: Unit[]) => {
    if (!events?.length) return;
    const steps = buildPlaySteps(events, units);
    if (steps.length) setPlay({ steps, i: 0, paused: false });
  }, []);
  const applyState = useCallback((next: CombatState) => {
    setState(next);
    const lr = next.lastRound;
    if (lr && lr.length) {
      const rs = lr[0]!.type === "roundStart" ? (lr[0] as { round: number }).round : next.round;
      if (rs > seenRound.current) { seenRound.current = rs; if (autoRef.current) startPlay(lr, next.units); }
    }
  }, [startPlay]);
  const playStep = play ? play.steps[play.i] ?? null : null;
  const playNext = useCallback(() => setPlay((p) => (!p ? p : p.i >= p.steps.length - 1 ? null : { ...p, i: p.i + 1 })), []);
  useEffect(() => {
    if (!play || play.paused || !playStep) return;
    const t = setTimeout(playNext, playStep.hold);
    return () => clearTimeout(t);
  }, [play, playStep, playNext]);
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false; let ch: ReturnType<typeof supabase.channel> | null = null;
    void realtimeReady(supabase).then(() => {
      if (cancelled) return;
      ch = supabase.channel(`combat:${combatId}:${Math.random().toString(36).slice(2, 8)}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "combats", filter: `id=eq.${combatId}` },
          (p) => { const s = (p.new as { state?: CombatState }).state; if (s) applyState(s); })
        .subscribe();
    });
    return () => { cancelled = true; if (ch) void supabase.removeChannel(ch); };
  }, [combatId, applyState]);
  useEffect(() => { const prev = document.body.style.overflow; document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = prev; }; }, []);

  const names = useMemo(() => unitNames(state), [state]);
  const mine = useCallback((u: Unit) => isGm || (u.source.kind === "character" && u.source.ownerId === meId), [isGm, meId]);
  const myUnits = state.units.filter((u) => u.side === "ally" && mine(u) && !u.incapacitated);
  const [selId, setSelId] = useState<string | null>(() => initial.units.find((u) => u.side === "ally" && !u.incapacitated && (isGm || (u.source.kind === "character" && u.source.ownerId === meId)))?.id ?? null);
  const selected = state.units.find((u) => u.id === selId) ?? null;
  const allyUnpicked = state.slots.filter((s) => state.units.find((x) => x.id === s.combatantId)!.side === "ally" && !state.picks[slotKey(s.combatantId, s.slot)]);
  const alliesAlive = state.units.filter((u) => u.side === "ally" && !u.incapacitated).length;
  const enemiesAlive = state.units.filter((u) => u.side === "enemy" && !u.incapacitated).length;
  const [drawer, setDrawer] = useState<null | "chat" | "log" | "roster">(null);
  const [showGrid, setShowGrid] = useState(true);
  const [oddsMode, setOddsMode] = useState<"odds" | "power" | "off">("odds");
  const showOdds = oddsMode !== "off";
  const [logOpen, setLogOpen] = useState(true);
  const [menu, setMenu] = useState(false);
  // 로컬: 다이스에 "장전"된 스킬(아직 대상 없음), 활성 다이스, 스킬 선택 팝업, 보호 모드
  const [loaded, setLoaded] = useState<Record<string, string>>({});
  const [activeDie, setActiveDie] = useState<string | null>(null);
  const [picker, setPicker] = useState<string | null>(null);
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
  const confirmEgo = (skill: Skill | undefined, key: string) => !(skill?.ego && !state.picks[key]?.locked) || confirm(`E.G.O [${skill!.name}] 발현: 정신력 -${skill!.ego!.sanityCost}, 침식도 +${skill!.ego!.erosionGain}. 발현 후에는 바꿀 수 없습니다.`);
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
    if (!skillId) { setErr("먼저 다이스를 눌러 스킬을 고르세요"); setPicker(key); return; }
    const skill = unit.skills.find((s) => s.id === skillId);
    if (!confirmEgo(skill, key)) return;
    const p = buildPick(unit.id, skillId, target);
    if (typeof p === "string") { setErr(p); return; }
    pick(unit.id, slot, p);
    setPicker(null);
  };
  useEffect(() => { dropRef.current = handleDrop; });
  // 스킬 선택(팝업/단축키): 그 다이스에 장전. 이미 대상이 있으면 스킬만 교체
  const chooseSkill = (unit: Unit, slot: number, skill: Skill) => {
    if (draggedRef.current) return;
    const key = slotKey(unit.id, slot);
    const cur = state.picks[key];
    if (cur?.locked) { setErr("E.G.O 발현 후에는 바꿀 수 없습니다"); return; }
    if (cur) { if (!confirmEgo(skill, key)) return; pick(unit.id, slot, { ...cur, skillId: skill.id }); }
    else setLoaded((l) => ({ ...l, [key]: skill.id }));
    setActiveDie(key); setPicker(null);
  };
  // 적 토큰/다이스 클릭으로 대상 지정 (활성 다이스에 스킬이 올라와 있을 때)
  const targetByClick = (target: DropId): boolean => {
    if (!activeDie || state.phase !== "select") return false;
    const [uid, sl] = activeDie.split(":"); const unit = state.units.find((u) => u.id === uid); if (!unit || !mine(unit)) return false;
    const key = activeDie; const skillId = loaded[key] ?? (state.picks[key] && !state.picks[key]!.locked ? state.picks[key]!.skillId : undefined);
    if (!skillId) return false;
    handleDrop({ kind: "die", unitId: uid!, slot: Number(sl) }, target);
    return true;
  };
  // 단축키: 1~3 손패, Esc 팝업 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (e.key === "Escape") { if (play) { setPlay(null); return; } setPicker(null); setMenu(false); return; }
      if (play && (e.key === " " || e.key === "ArrowRight")) { e.preventDefault(); playNext(); return; }
      const n = Number(e.key); if (!(n >= 1 && n <= 3) || !activeDie) return;
      const unit = state.units.find((u) => activeDie.startsWith(u.id + ":")); if (!unit || !mine(unit)) return;
      const sk = unit.skills.find((s) => s.id === unit.hand[n - 1]); if (sk) chooseSkill(unit, Number(activeDie.split(":")[1]), sk);
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  });

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
  // 승률 표시: 내 선택 중 상대와 합이 되는 것
  const odds = useMemo(() => {
    if (!showOdds) return {} as Record<string, ReturnType<typeof estimateClash>>;
    const out: Record<string, ReturnType<typeof estimateClash>> = {};
    for (const [k, p] of Object.entries(state.picks)) {
      const [uid] = k.split(":"); const a = state.units.find((u) => u.id === uid); const t = state.units.find((u) => u.id === p.targetId);
      if (!a || !t || a.side !== "ally") continue;
      const opp = Object.entries(state.picks).find(([k2, p2]) => k2.startsWith(t.id + ":") && p2.targetId === a.id && (p.targetSlot === undefined || Number(k2.split(":")[1]) === p.targetSlot));
      const tp = opp?.[1] ?? (p.targetSlot !== undefined ? state.picks[slotKey(t.id, p.targetSlot)] : undefined);
      const as = a.skills.find((s) => s.id === p.skillId), ts = tp ? t.skills.find((s) => s.id === tp.skillId) : undefined;
      if (as && ts) out[k] = estimateClash(as, a.sanity, ts, t.sanity, rules, 150);
    }
    return out;
  }, [state, rules, showOdds]);

  const phaseText = state.phase === "select" ? "선택 단계" : state.phase === "ended" ? (state.winner === "ally" ? "승리" : "패배") : "처리 중";
  const pickerUnit = picker ? state.units.find((u) => picker.startsWith(u.id + ":")) : undefined;
  const pickerSlot = picker ? Number(picker.split(":")[1]) : undefined;
  // 스킬 선택 카드의 대상 드롭다운 (영상처럼): 적 토큰(일방) + 적 다이스(합/가로채기/보호, 승률 추정)
  const pickerTargets = useMemo(() => {
    if (!pickerUnit || pickerSlot === undefined) return null;
    const key = slotKey(pickerUnit.id, pickerSlot); const cur = state.picks[key];
    const sk = pickerUnit.skills.find((s) => s.id === (cur?.skillId ?? loaded[key])); if (!sk) return null;
    const opts: { value: string; label: string }[] = [];
    for (const t of state.units.filter((x) => x.side === "enemy" && !x.incapacitated)) {
      const d = state.grid ? dist(pickerUnit.pos, t.pos) : 0; const oor = !!state.grid && d > skillRange(sk);
      opts.push({ value: `unit|${t.id}`, label: `${names[t.id]} · 일방 공격 · 거리 ${d}${oor ? " · 사거리 밖" : ""}` });
      for (const s of state.slots.filter((x) => x.combatantId === t.id)) {
        const tp = state.picks[slotKey(t.id, s.slot)]; const ts = tp ? t.skills.find((x) => x.id === tp.skillId) : undefined;
        const mode = tp?.targetId === pickerUnit.id ? "합" : protectMode[pickerUnit.id] ? "보호" : "가로채기";
        const est = ts ? estimateClash(sk, pickerUnit.sanity, ts, t.sanity, rules, 120) : null;
        opts.push({ value: `slot|${t.id}|${s.slot}`, label: `${names[t.id]} 다이스 ${s.speed} · ${ts ? (isGm ? ts.name : "???") : "미선택"} · ${mode}${est ? ` · ${est.label} ${Math.round(est.winRate * 100)}%` : ""}${oor && mode !== "보호" ? " · 사거리 밖" : ""}` });
      }
    }
    const value = cur ? (cur.targetSlot !== undefined ? `slot|${cur.targetId}|${cur.targetSlot}` : `unit|${cur.targetId}`) : "";
    return { opts, value, locked: !!cur?.locked };
  }, [pickerUnit, pickerSlot, state, loaded, protectMode, rules, isGm, names]);
  const sinCounts = useMemo(() => { const c: Partial<Record<Sin, number>> = {}; for (const [k, p] of Object.entries(state.picks)) { const u = state.units.find((x) => k.startsWith(x.id + ":")); if (u?.side !== "ally") continue; const s = u.skills.find((x) => x.id === p.skillId); if (s) c[s.sin] = (c[s.sin] ?? 0) + 1; } return c; }, [state]);

  return (
    <div className="battle fixed inset-0 z-40 select-none overflow-hidden">
      <Arena state={state} names={names} isGm={isGm} selId={selId} onSelect={setSelId} mine={mine} showGrid={showGrid} drag={drag}
        startDrag={startDrag} draggedRef={draggedRef} disabled={pending || state.phase !== "select"}
        onMove={(unitId, to) => act(() => moveUnitAction(campaignId, combatId, unitId, to))} loaded={loaded} activeDie={activeDie} onEnemyTap={targetByClick} odds={odds} oddsMode={oddsMode} play={playStep} onPlayTap={play ? playNext : undefined} />

      {/* 좌상단 HUD */}
      <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-col gap-1">
        <div className="flex items-end gap-2">
          <HudFrame img="turn-frame" value={state.round} title="라운드" />
          <span className="mb-1 flex items-center gap-2 text-xs font-bold" style={{ textShadow: "0 1px 2px #000" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ui("ico-heart")} alt="아군" className="h-4" /> {alliesAlive}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ui("ico-sword")} alt="적" className="h-4" /> {enemiesAlive}
          </span>
        </div>
        <HudFrame img="enemy-frame" value={enemiesAlive} title="남은 적" />
        <span className="b-muted pl-1 text-[11px]">{phaseText}{state.phase === "select" && allyUnpicked.length ? ` · 미선택 ${allyUnpicked.length}` : state.phase === "select" ? " · 준비 완료" : ""}</span>
      </div>
      {/* 상단 가운데: 연출 띠 / 오류·공지 (영상의 "차례" 띠 자리) */}
      <div className="pointer-events-none absolute left-1/2 top-2 z-10 flex w-[min(80vw,40rem)] -translate-x-1/2 flex-col items-center gap-1 text-xs">
        {play && playStep ? (
          <div className="pointer-events-auto b-play-bar flex w-full items-center gap-2 px-3 py-1.5" data-role="play">
            <span className="min-w-0 flex-1 truncate text-center text-[12px] font-semibold text-[#f7e7c3]">{playStep.header}</span>
            <span className="b-muted shrink-0 tabular-nums">{play.i + 1}/{play.steps.length}</span>
            <button type="button" className="b-tabx shrink-0 px-2 py-0 text-[10px]" onClick={() => setPlay({ ...play, paused: !play.paused })}>{play.paused ? "재생" : "일시정지"}</button>
            <button type="button" className="b-tabx shrink-0 px-2 py-0 text-[10px]" onClick={() => setPlay(null)}>건너뛰기</button>
          </div>
        ) : (<>
          {err ? <div data-role="err" className="pointer-events-auto b-pane w-full border-l-2 px-3 py-1 text-center" style={{ borderLeftColor: "var(--b-red)", color: "#ffb3b3" }} onClick={() => setErr(null)}>{err}</div> : null}
          {state.notices?.slice(-2).map((n, i) => <div key={i} className="b-pane w-full border-l-2 px-3 py-1 text-center" style={{ borderLeftColor: "var(--b-gold)" }}><KeywordText text={n} /></div>)}
        </>)}
      </div>

      {/* 왼쪽: 행동 순서 */}
      <Tracker state={state} names={names} selId={selId} onSelect={setSelId} className="absolute bottom-[15.5rem] left-2 top-[8.5rem] z-10 hidden md:flex" />

      {/* 우상단 버튼 */}
      <div className="absolute right-2 top-2 z-20 flex items-start gap-1">
        {state.lastRound?.length ? <IconBtn img="btn-play" label="다시 보기" onClick={() => startPlay(state.lastRound, state.units)} /> : null}
        <IconBtn img="btn-brackets" label="격자" on={showGrid} onClick={() => setShowGrid(!showGrid)} />
        <IconBtn img="btn-pause" label="연출" on={autoCine} onClick={() => { const v = !autoCine; setAutoCine(v); autoRef.current = v; try { localStorage.setItem("limbus.cinematic", v ? "on" : "off"); } catch {} }} />
        <div className="relative">
          <IconBtn img="btn-gear" label="메뉴" on={menu} onClick={() => setMenu(!menu)} />
          {menu ? (
            <div className="b-pane absolute right-0 top-14 z-30 w-56 p-2 text-xs">
              <button type="button" className="b-row" onClick={() => { setDrawer("chat"); setMenu(false); }}>채팅</button>
              <button type="button" className="b-row" onClick={() => { setDrawer("log"); setMenu(false); }}>전체 로그</button>
              <button type="button" className="b-row" onClick={() => { setDrawer("roster"); setMenu(false); }}>명단 · 순서</button>
              <button type="button" className="b-row" onClick={() => setOddsMode(oddsMode === "off" ? "odds" : "off")}>승률 표시 {showOdds ? "끄기" : "켜기"}</button>
              {sceneTools ? <details className="mt-1 border-t pt-1" style={{ borderColor: "var(--b-line)" }}><summary className="b-row cursor-pointer list-none">장면 전환 ▾</summary><div className="mt-1">{sceneTools}</div></details> : null}
              {isGm && state.phase !== "ended" ? <button type="button" className="b-row text-red-300" onClick={() => { if (confirm("전투를 종료할까요? 체력과 정신력이 캐릭터에 반영됩니다.")) act(() => endCombatAction(campaignId, combatId)); setMenu(false); }}>전투 종료</button> : null}
              <Link href={backHref} className="b-row block">사무소로</Link>
              <div className="b-muted mt-1 truncate border-t pt-1 text-[10px]" style={{ borderColor: "var(--b-line)" }}>{sessionTitle} · {sceneTitle}</div>
            </div>
          ) : null}
        </div>
      </div>

      {/* 오른쪽: 죄악 자원(아군 선택 스킬 속성 수) */}
      <div className="absolute right-2 top-1/2 z-10 hidden -translate-y-1/2 flex-col gap-1 lg:flex" style={{ marginTop: "-2rem" }}>
        {SINS.map((s) => <span key={s} className="flex items-center gap-1 text-[11px] tabular-nums"><SinIcon sin={s} size={18} /><span className={sinCounts[s] ? "b-gold font-bold" : "b-muted"}>{sinCounts[s] ?? 0}</span></span>)}
      </div>

      {/* 오른쪽: 유닛 카드 */}
      {selected && !play ? (
        <div className="absolute right-2 top-16 z-10 w-[min(92vw,20rem)] max-h-[46vh] overflow-y-auto md:right-14 lg:right-16">
          <UnitCard u={selected} state={state} isGm={isGm} names={names} rules={rules} campaignId={campaignId} combatId={combatId} onApply={applyState} onClose={() => setSelId(null)} info={selected.source.kind === "enemy" ? enemyInfo[selected.source.id] : undefined} />
        </div>
      ) : null}

      {/* 우하단: 로그 카드 */}
      <div className="absolute bottom-[15.5rem] right-2 z-10 hidden w-[20rem] md:block">
        <div className="b-pane text-[11px]">
          <button type="button" className="b-head-plate flex w-full items-center justify-between px-2 py-1" onClick={() => setLogOpen(!logOpen)}>
            <span className="font-bold">로그{state.lastRound?.length ? ` · ${state.round}R` : ""}</span><span className="b-muted">{logOpen ? "▾" : "▸"}</span>
          </button>
          {logOpen ? <div className="max-h-40 overflow-y-auto whitespace-pre-wrap p-2 font-mono leading-relaxed">
            {state.lastRound?.length ? <KeywordText text={formatRound(state.lastRound, names).slice(-14).join("\n")} /> : <span className="b-muted">아직 결과가 없습니다. 선택을 마치고 라운드를 진행하세요.</span>}
            {state.lastRound?.length ? <button type="button" className="b-gold mt-1 block hover:underline" onClick={() => setDrawer("log")}>전체 보기</button> : null}
          </div> : null}
        </div>
      </div>

      {/* 가운데 아래: 상태 바 + 스킬 팝업 + 스킬 띠 */}
      {state.phase === "select" && myUnits.length > 0 ? (
        <>
          {selected && mine(selected) && selected.side === "ally" && !(pickerUnit && mine(pickerUnit)) ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-[13.4rem] z-10 flex justify-center px-2">
              <StatusBar u={selected} state={state} rules={rules} protect={!!protectMode[selected.id]} setProtect={(v) => setProtectMode((m) => ({ ...m, [selected.id]: v }))}
                onRedraw={() => { if (confirm(`빛 ${rules.lightRedrawCost}을 써서 손패를 교체할까요? (남은 빛 ${selected.light})`)) act(() => redrawHandAction(campaignId, combatId, selected.id)); }}
                hint={activeDie && (loaded[activeDie] || state.picks[activeDie]) ? (state.picks[activeDie] ? `→ ${names[state.picks[activeDie]!.targetId]} · 다른 적을 누르거나 끌어 바꿀 수 있어요` : "적을 누르거나 다이스를 끌어 대상을 정하세요") : "다이스를 눌러 스킬을 고르세요 (단축키 1·2·3)"} />
            </div>
          ) : null}
          {pickerUnit && pickerSlot !== undefined && mine(pickerUnit) ? (
            <div className="absolute inset-x-0 bottom-[13.4rem] z-20 flex justify-center px-2">
              <SkillPicker unit={pickerUnit} slot={pickerSlot} state={state} loaded={loaded} startDrag={startDrag} onPick={(s) => chooseSkill(pickerUnit, pickerSlot, s)} onClose={() => setPicker(null)}
                targets={pickerTargets} onTarget={(v) => { const t = parseDrop(v); if (t) handleDrop({ kind: "die", unitId: pickerUnit.id, slot: pickerSlot }, t); }}
                onClear={() => { const k = slotKey(pickerUnit.id, pickerSlot); if (state.picks[k]) pick(pickerUnit.id, pickerSlot, null); else setLoaded((l) => { const n = { ...l }; delete n[k]; return n; }); }} />
            </div>
          ) : null}
          <div className="absolute inset-x-0 bottom-8 z-10 flex justify-center">
            <SkillStrip units={myUnits} state={state} names={names} loaded={loaded} activeDie={activeDie} picker={picker} selId={selId} odds={odds}
              onDie={(u, slot) => { const k = slotKey(u.id, slot); setActiveDie(k); setSelId(u.id); setPicker(picker === k ? null : k); }}
              onPortrait={(u) => { setSelId(u.id); const d = firstFreeDie(u.id); if (d) setActiveDie(slotKey(u.id, d.slot)); }}
              onDefense={(u, s) => { const slot = dieFor(u.id); if (slot !== undefined) chooseSkill(u, slot, s); }}
              onCancel={(u, slot) => { const k = slotKey(u.id, slot); if (state.picks[k]) pick(u.id, slot, null); else setLoaded((l) => { const n = { ...l }; delete n[k]; return n; }); }}
              startDrag={startDrag} />
          </div>
        </>
      ) : null}

      {/* 우하단: 라운드 버튼 */}
      <div className="absolute bottom-10 right-3 z-20 flex flex-col items-center gap-1 md:bottom-12 md:right-5">
        <div className="flex items-end gap-1">
          <div className="mb-3 hidden flex-col items-end gap-1 md:flex">
            <button type="button" onClick={() => setOddsMode(oddsMode === "odds" ? "off" : "odds")} title="합 승률 표시" className={`h-7 w-16 ${oddsMode === "odds" ? "" : "opacity-50 grayscale"}`} style={{ backgroundImage: `url(${ui("plate-winrate")})`, backgroundSize: "100% 100%" }} />
            <button type="button" onClick={() => setOddsMode(oddsMode === "power" ? "off" : "power")} title="기대 위력 표시" className={`relative h-7 w-16 text-[11px] font-black text-[#ffd0d0] ${oddsMode === "power" ? "" : "opacity-50 grayscale"}`} style={{ backgroundImage: `url(${ui("plate-red")})`, backgroundSize: "100% 100%", textShadow: "0 1px 2px #000" }}>피해량</button>
            <span className="b-muted text-[10px] tabular-nums">선택 {state.slots.filter((s) => state.units.find((x) => x.id === s.combatantId)!.side === "ally").length - allyUnpicked.length}/{state.slots.filter((s) => state.units.find((x) => x.id === s.combatantId)!.side === "ally").length}</span>
          </div>
          <RoundButton isGm={isGm} phase={state.phase} winner={state.winner} pending={pending} unpicked={allyUnpicked.length} playing={!!play} onNext={playNext}
            onStart={() => act(() => resolveRoundAction(campaignId, combatId))} onClose={() => router.refresh()} />
        </div>
      </div>

      {/* 맨 아래 바 */}
      <div className="b-banner absolute inset-x-0 bottom-0 z-20 flex h-8 items-center gap-1 px-2 text-[11px]">
        <span className="b-logo mr-1 hidden px-2 py-0.5 text-[9px] font-black leading-none tracking-wider sm:block">LIMBUS<br />TRPG</span>
        <button type="button" className={`b-tabx ${drawer === null ? "b-tabx-on" : ""}`} onClick={() => setDrawer(null)}>전투</button>
        <button type="button" className={`b-tabx ${drawer === "chat" ? "b-tabx-on" : ""}`} onClick={() => setDrawer(drawer === "chat" ? null : "chat")}>채팅</button>
        <button type="button" className={`b-tabx ${drawer === "log" ? "b-tabx-on" : ""}`} onClick={() => setDrawer(drawer === "log" ? null : "log")}>로그</button>
        <button type="button" className={`b-tabx ${drawer === "roster" ? "b-tabx-on" : ""}`} onClick={() => setDrawer(drawer === "roster" ? null : "roster")}>명단</button>
        <span className="ml-auto truncate text-white/80">{sessionTitle} · {sceneTitle}</span>
      </div>

      {/* 드래그 미리보기 */}
      {drag && drag.payload.kind !== "token" ? (
        <div className="pointer-events-none fixed z-50" style={{ left: drag.x + 14, top: drag.y - 10 }}>
          {preview ? (
            <div className="b-pane w-60 p-2 text-[11px]">
              <div className="flex items-center justify-between"><b className={preview.outOfRange ? "text-red-400" : "b-gold"}>{preview.outOfRange ? `사거리 밖 (거리 ${preview.d}, 사거리 ${skillRange(preview.skill)})` : preview.mode}</b><span className="b-muted">→ {names[preview.t.id]}</span></div>
              <div className="mt-1 flex items-center gap-2">
                <SkillChip skill={preview.skill} size={36} />
                <span className="flex-1 truncate">{preview.skill.name} <span className="b-muted">{powerText(preview.skill)}</span></span>
                {preview.vs ? (<><span className="font-black text-white/70">VS</span><span className="flex-1 truncate text-right">{preview.hiddenName ? "???" : preview.vs.skill.name} <span className="b-muted">{powerText(preview.vs.skill)}</span></span><SkillChip skill={preview.vs.skill} size={36} /></>) : null}
              </div>
              {preview.vs ? <div className="mt-1 flex items-center justify-between"><span className={`font-black ${oddsColor(preview.vs.est.label)}`}>{preview.vs.est.label}</span><span className="b-muted">승률 {Math.round(preview.vs.est.winRate * 100)}% · 기대 위력 {preview.vs.est.aPower} : {preview.vs.est.bPower}</span></div> : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {drag && drag.payload.kind !== "token" ? <DragGhost drag={drag} state={state} loaded={loaded} dieFor={dieFor} /> : null}

      {/* 서랍 */}
      {/* 숨길 때 transform 대신 display:none — 변형된 요소는 overflow-hidden 부모를 가로로 스크롤시킬 수 있다 */}
      <div className={`absolute inset-y-0 right-0 z-30 w-full flex-col pb-8 sm:w-[22rem] ${drawer ? "flex" : "hidden"} b-drawer`}>
        <div className="b-bar flex h-9 items-center gap-1 px-2 text-[11px]">
          {(["chat", "log", "roster"] as const).map((k) => <button key={k} type="button" className={`b-tab ${drawer === k ? "b-tab-on" : ""}`} onClick={() => setDrawer(k)}>{k === "chat" ? "채팅" : k === "log" ? "로그" : "명단"}</button>)}
          <button type="button" className="b-tab ml-auto" onClick={() => setDrawer(null)}>닫기 ✕</button>
        </div>
        <div className={`min-h-0 flex-1 p-2 ${drawer === "chat" ? "" : "hidden"}`}>{chat}</div>
        {drawer === "log" ? <div className="min-h-0 flex-1 overflow-auto p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">{state.lastRound ? <KeywordText text={formatRound(state.lastRound, names).join("\n")} /> : <span className="b-muted">아직 결과가 없습니다.</span>}</div> : null}
        {drawer === "roster" ? <div className="min-h-0 flex-1 overflow-auto p-2"><Roster state={state} selId={selId} onSelect={(id) => { setSelId(id); }} isGm={isGm} names={names} /></div> : null}
      </div>

      {/* 연출 배너 (합 승리 · 전투불능 · 승패) */}
      {playStep?.banner ? <div className="pointer-events-none absolute inset-x-0 top-[34%] z-30 flex justify-center"><div className="b-play-banner px-8 py-2 text-3xl font-black tracking-widest md:text-5xl" style={{ color: playStep.banner.tone === "gold" ? "#ffd54a" : playStep.banner.tone === "red" ? "#ff4d55" : "#f1ebe0" }}>{playStep.banner.text}</div></div> : null}
    </div>
  );
}

const oddsColor = (l: string) => l === "압도" ? "text-amber-300" : l === "유리" ? "text-emerald-300" : l === "보통" ? "text-white" : l === "불리" ? "text-orange-300" : "text-red-400";

/* ---------- HUD 조각 ---------- */
function HudFrame({ img, value, title }: { img: string; value: number | string; title: string }) {
  return (
    <span className="relative block h-[44px] w-[120px]" title={title} style={{ backgroundImage: `url(${ui(img)})`, backgroundSize: "100% 100%" }}>
      <span className="absolute inset-y-0 right-[9%] flex w-[46%] items-center justify-center text-lg font-black tabular-nums text-white" style={{ textShadow: "0 1px 2px #000" }}>{value}</span>
    </span>
  );
}
function IconBtn({ img, label, on, onClick }: { img: string; label: string; on?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={label} className={`flex flex-col items-center gap-0 ${on === false ? "opacity-55" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ui(img)} alt="" className={`h-10 w-10 md:h-12 md:w-12 ${on ? "drop-shadow-[0_0_6px_rgba(217,179,91,.9)]" : ""}`} draggable={false} />
      <span className="text-[9px] leading-none" style={{ color: on === false ? "var(--b-muted)" : "var(--b-gold)", textShadow: "0 1px 2px #000" }}>{label}</span>
    </button>
  );
}

/* ---------- 행동 순서 ---------- */
function Tracker({ state, names, selId, onSelect, className }: { state: CombatState; names: Record<string, string>; selId: string | null; onSelect: (id: string) => void; className?: string }) {
  return (
    <div className={`b-pane w-[4.6rem] flex-col items-center gap-1 overflow-y-auto px-1 pb-1 ${className ?? "flex"}`}>
      <span className="b-head-plate mb-0.5 w-full py-0.5 text-center text-[11px] font-bold">순서</span>
      {state.slots.length === 0 ? <span className="b-muted py-2 text-center text-[10px]">속도 없음</span> : null}
      {state.slots.map((s) => {
        const u = state.units.find((x) => x.id === s.combatantId)!; const key = slotKey(u.id, s.slot); const p = state.picks[key];
        const enemy = u.side === "enemy";
        return (
          <button key={key} type="button" onClick={() => onSelect(u.id)} title={`${names[u.id]} · 속도 ${s.speed}${p ? ` → ${names[p.targetId]}` : ""}`}
            className={`relative h-12 w-12 shrink-0 ${u.id === selId ? "ring-2 ring-amber-300" : ""} ${u.incapacitated ? "opacity-40 grayscale" : ""}`}>
            <span className="block h-full w-full overflow-hidden" style={{ border: `2px solid ${enemy ? "#b3161c" : "#c9a24a"}`, background: "#140d0d" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {u.portraitUrl ? <img src={u.portraitUrl} alt="" className="h-full w-full object-cover" draggable={false} /> : <span className="flex h-full items-center justify-center text-sm font-bold">{u.name.slice(0, 1)}</span>}
            </span>
            <span className="absolute -bottom-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-0.5 text-[11px] font-black text-white" style={{ background: enemy ? "#b3161c" : "#2d6fb3", border: "1px solid #fff3" }}>{s.speed}</span>
            {p ? <span className="absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black text-[9px] text-amber-300 ring-1 ring-amber-300/60">✓</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- 무대 ---------- */
function Arena({ state, names, isGm, selId, onSelect, mine, showGrid, drag, startDrag, draggedRef, disabled, onMove, loaded, activeDie, onEnemyTap, odds, oddsMode, play, onPlayTap }: {
  state: CombatState; names: Record<string, string>; isGm: boolean; selId: string | null; onSelect: (id: string | null) => void; mine: (u: Unit) => boolean; showGrid: boolean;
  drag: { payload: DragPayload; over: DropId | null } | null; startDrag: (p: DragPayload) => (e: RPointerEvent) => void; draggedRef: React.MutableRefObject<boolean>;
  disabled: boolean; onMove: (unitId: string, to: Pos) => void; loaded: Record<string, string>; activeDie: string | null; onEnemyTap: (t: DropId) => boolean; odds: Record<string, ReturnType<typeof estimateClash>>;
  oddsMode: "odds" | "power" | "off"; play: PlayStep | null; onPlayTap?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 700 });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const { cols, rows } = state.grid ?? { cols: 10, rows: 6 };
  const wide = size.w >= 768;
  const padL = wide ? 100 : 8, padR = wide ? 340 : 8, padT = 70, padB = wide ? 270 : 250;
  const cell = Math.max(30, Math.min(104, Math.floor((size.w - padL - padR) / cols), Math.floor((size.h - padT - padB) / rows)));
  const W = cols * cell, H = rows * cell;
  const ox = Math.max(4, Math.floor(padL + (size.w - padL - padR - W) / 2)), oy = Math.max(padT, Math.floor(padT + (size.h - padT - padB - H) / 2));
  const gridOn = !!state.grid;
  const posOf = (u: Unit): Pos => gridOn ? u.pos : (() => { const side = state.units.filter((x) => x.side === u.side); const i = side.indexOf(u); return { x: u.side === "ally" ? 1 : cols - 2, y: Math.min(rows - 1, Math.floor((rows - side.length) / 2) + i) }; })();
  const center = (u: Unit) => { const p = posOf(u); return { x: ox + p.x * cell + cell / 2, y: oy + p.y * cell + cell / 2 }; };
  const dieSize = Math.max(24, Math.min(40, Math.round(cell * 0.42)));
  const diePos = (u: Unit, idx: number, n: number) => { const c = center(u); return { x: c.x + (idx - (n - 1) / 2) * (dieSize + 4), y: oy + posOf(u).y * cell - dieSize * 0.65 }; };
  const selected = selId ? state.units.find((u) => u.id === selId) : undefined;
  const canMove = !!selected && mine(selected) && !selected.incapacitated && !selected.staggered && !isCorroded(selected, state.round) && state.phase === "select" && gridOn;
  const reach = useMemo(() => (canMove && selected ? reachableCells(state, selected.id) : new Map<string, number>()), [state, selected, canMove]);
  const occupied = (x: number, y: number) => state.units.some((u) => !u.incapacitated && u.pos.x === x && u.pos.y === y);
  const maxRange = selected ? Math.max(1, ...selected.skills.filter((s) => s.kind === "attack").map(skillRange)) : 0;
  const draggingToken = drag?.payload.kind === "token" ? drag.payload.unitId : null;
  const tokenReach = useMemo(() => (draggingToken ? reachableCells(state, draggingToken) : null), [state, draggingToken]);
  const slotsOf = (u: Unit) => state.slots.filter((s) => s.combatantId === u.id);
  // 의도 선 (림버스: 적 빨강, 내 공격 하늘색 점선, 합 노랑)
  const lines = Object.entries(state.picks).map(([k, p]) => {
    const [uid, sl] = k.split(":"); const a = state.units.find((u) => u.id === uid); const t = state.units.find((u) => u.id === p.targetId);
    if (!a || !t || a.incapacitated) return null;
    const as = slotsOf(a); const ai = as.findIndex((s) => s.slot === Number(sl));
    const from = diePos(a, ai, as.length);
    let to = center(t);
    if (p.targetSlot !== undefined) { const ts = slotsOf(t); const ti = ts.findIndex((s) => s.slot === p.targetSlot); if (ti >= 0) to = diePos(t, ti, ts.length); }
    const mutual = Object.entries(state.picks).some(([k2, p2]) => k2.startsWith(t.id + ":") && p2.targetId === a.id);
    if (mutual && a.side === "enemy") return null; // 합은 아군 쪽 선 하나로
    return { from, to, enemy: a.side === "enemy", mutual, protect: !!p.protect, key: k };
  }).filter(Boolean) as { from: Pos; to: Pos; enemy: boolean; mutual: boolean; protect: boolean; key: string }[];
  const arc = (a: Pos, b: Pos) => { const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; const d = Math.hypot(b.x - a.x, b.y - a.y); const cy = my - Math.min(140, 30 + d * 0.25); return `M ${a.x} ${a.y} Q ${mx} ${cy} ${b.x} ${b.y}`; };
  const overId = drag?.over;
  // 연출 중: 두 유닛 사이 강조 선 + 유닛 옆 카드 위치
  const playArc = play?.arc ? (() => { const a = state.units.find((x) => x.id === play.arc!.from), b = state.units.find((x) => x.id === play.arc!.to); if (!a || !b) return null; return { d: arc(center(a), center(b)), color: play.arc!.kind === "clash" ? "#ffd54a" : play.arc!.kind === "ally" ? "#37d5ff" : "#ff3b3b" }; })() : null;
  // 카드는 쌍의 바깥쪽(아군은 왼쪽, 적은 오른쪽)에 두어 서로 겹치지 않게 한다. 화면 밖이면 안쪽으로
  const cardPos = (u: Unit, i: number) => { const c = center(u); const w = 176; const minL = wide ? padL : 8; let left = u.side === "ally" ? c.x - cell * 0.4 - w : c.x + cell * 0.4; if (left < minL) left = c.x + cell * 0.4; if (left + w > size.w - 8) left = Math.max(minL, c.x - cell * 0.4 - w); const top = Math.max(54, c.y - cell * 0.9 - 96 - i * 4); return { left, top, width: w }; };
  const powerRange = (s: Skill) => { const lo = s.basePower + Math.min(0, s.coinPower) * s.coinCount, hi = s.basePower + Math.max(0, s.coinPower) * s.coinCount; return lo === hi ? `${hi}` : `${Math.max(0, lo)}-${hi}`; };

  return (
    <div ref={ref} className="b-canvas absolute inset-0 overflow-hidden" onClick={(e) => { if (onPlayTap) { onPlayTap(); return; } if (e.target === e.currentTarget) onSelect(null); }}>
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${BACKGROUNDS.backstreet})`, filter: "brightness(.42) saturate(.75)" }} />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 30%, rgba(0,0,0,.55) 100%), linear-gradient(180deg, rgba(0,0,0,.6) 0%, rgba(0,0,0,.05) 25%, rgba(0,0,0,.1) 65%, rgba(0,0,0,.85) 100%)" }} />
      <svg className="absolute inset-0" width={size.w} height={size.h}>
        <defs>
          <pattern id="bgrid" x={ox} y={oy} width={cell} height={cell} patternUnits="userSpaceOnUse"><path d={`M ${cell} 0 L 0 0 0 ${cell}`} fill="none" stroke="rgba(217,179,91,.2)" strokeWidth="1" /></pattern>
          {[["red", "#ff3b3b"], ["cyan", "#37d5ff"], ["gold", "#ffd54a"], ["white", "#f5e6b5"]].map(([n, c]) => <marker key={n} id={`arr-${n}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill={c} /></marker>)}
        </defs>
        {showGrid && gridOn ? (<><rect x={ox} y={oy} width={W} height={H} fill="rgba(10,6,6,.3)" /><rect x={ox} y={oy} width={W} height={H} fill="url(#bgrid)" /><rect x={ox + 0.5} y={oy + 0.5} width={W - 1} height={H - 1} fill="none" stroke="rgba(217,179,91,.45)" /></>) : null}
        {canMove && selected ? Array.from({ length: rows }).map((_, y) => Array.from({ length: cols }).map((_, x) => {
          const inR = dist(selected.pos, { x, y }) <= maxRange; const cost = reach.get(`${x},${y}`);
          if (!inR && cost === undefined) return null;
          return <rect key={`${x},${y}`} x={ox + x * cell + 1} y={oy + y * cell + 1} width={cell - 2} height={cell - 2} fill={inR ? "rgba(210,36,43,.16)" : "rgba(79,179,116,.06)"} />;
        })) : null}
        {lines.map((l) => { const color = l.mutual ? "#ffd54a" : l.enemy ? "#ff3b3b" : l.protect ? "#f5e6b5" : "#37d5ff"; const mk = l.mutual ? "gold" : l.enemy ? "red" : l.protect ? "white" : "cyan";
          return (
            <g key={l.key} opacity={play ? 0.18 : 1}>
              <path d={arc(l.from, l.to)} fill="none" stroke="rgba(0,0,0,.6)" strokeWidth={l.mutual ? 5 : 4} />
              <path d={arc(l.from, l.to)} fill="none" stroke={color} strokeWidth={l.mutual ? 2.6 : 2} strokeDasharray={l.enemy || l.mutual ? undefined : "7 5"} markerEnd={`url(#arr-${mk})`} />
              {l.mutual ? <g transform={`translate(${(l.from.x + l.to.x) / 2},${(l.from.y + l.to.y) / 2 - Math.min(140, 30 + Math.hypot(l.to.x - l.from.x, l.to.y - l.from.y) * 0.25) / 2})`}><circle r={11} fill="#0b0707" stroke="#ffd54a" /><text textAnchor="middle" dy="4" fontSize="11" fontWeight="700" fill="#ffd54a">합</text></g> : null}
            </g>
          ); })}
        {playArc ? (<g><path d={playArc.d} fill="none" stroke={playArc.color} strokeWidth={9} opacity={0.25} /><path d={playArc.d} fill="none" stroke="#fff" strokeWidth={3.5} opacity={0.9} /><path d={playArc.d} fill="none" stroke={playArc.color} strokeWidth={2} className="b-arc-flow" /></g>) : null}
      </svg>
      {/* 연출 카드 (유닛 옆) */}
      {play ? play.cards.map((cd, i) => { const u = state.units.find((x) => x.id === cd.unitId); if (!u) return null; const p = cardPos(u, i); const ally = u.side === "ally";
        return (
          <div key={`${cd.unitId}-${i}`} className="b-play-card pointer-events-none absolute z-20" data-tone={cd.tone} style={{ left: p.left, top: p.top, width: p.width, borderColor: ally ? "#c9a24a" : "#b3161c" }}>
            <div className="truncate px-2 pt-1 text-[10px] text-[#d9c08a]">{cd.title}</div>
            {cd.coins ? <div className="flex items-center justify-center gap-1 px-2 pt-1">{cd.coins.map((h, k) => <span key={k} className="flex flex-col items-center"><CoinIcon heads={h} size={22} /><span className="text-[9px] leading-none" style={{ color: h ? "#ffd54a" : "#9a8f86" }}>{h ? "앞" : "뒤"}</span></span>)}</div> : null}
            {cd.big ? <div className="px-2 text-center text-xl font-black leading-tight" style={{ color: cd.tone === "gold" ? "#ffd54a" : cd.tone === "red" ? "#ff5a5a" : cd.tone === "dim" ? "#8a8078" : "#fff" }}>{cd.big}</div> : null}
            {cd.sub ? <div className="px-2 pb-1 text-center text-[10px]" style={{ color: cd.tone === "dim" ? "#8a8078" : "#e9dcc2" }}>{cd.sub}</div> : <div className="pb-1" />}
          </div>
        ); }) : null}
      {/* 이동 칸 */}
      {gridOn && ((canMove && selected) || tokenReach) ? Array.from((tokenReach ?? reach).entries()).map(([k, cost]) => { if (cost === 0) return null; const [x, y] = k.split(",").map(Number) as [number, number]; if (occupied(x, y)) return null;
        const over = overId?.kind === "cell" && overId.x === x && overId.y === y;
        return <button key={k} type="button" data-drop={`cell|${x}|${y}`} disabled={disabled} title={`이동 ${cost}칸`} onClick={() => { if (!draggedRef.current && selected) onMove(selected.id, { x, y }); }}
          className={`group absolute flex items-end justify-end p-0.5 text-[9px] text-emerald-200/80 hover:bg-emerald-400/25 ${over ? "bg-emerald-400/30" : ""}`} style={{ left: ox + x * cell, top: oy + y * cell, width: cell, height: cell }}><span className="opacity-0 group-hover:opacity-100">{cost}</span></button>; }) : null}
      {/* 토큰 */}
      {state.units.map((u) => { const p = posOf(u); const isSel = u.id === selId; const my = mine(u); const draggable = my && u.side === "ally" && !u.incapacitated && !u.staggered && state.phase === "select" && gridOn;
        const over = overId && overId.kind === "unit" && overId.unitId === u.id;
        const sprite = u.spriteUrl; const tokenH = sprite ? cell * 1.55 : cell - 8;
        return (
          <div key={u.id} className={`absolute ${u.incapacitated ? "opacity-40 grayscale" : ""}`} style={{ left: ox + p.x * cell, top: oy + p.y * cell, width: cell, height: cell }}>
            <button type="button" data-drop={u.side === "enemy" ? `unit|${u.id}` : undefined} onPointerDown={draggable ? startDrag({ kind: "token", unitId: u.id }) : undefined}
              onClick={() => { if (draggedRef.current) return; if (u.side === "enemy" && !u.incapacitated && onEnemyTap({ kind: "unit", unitId: u.id })) { onSelect(u.id); return; } onSelect(isSel ? null : u.id); }} title={names[u.id]}
              className={`absolute bottom-1 left-1/2 flex -translate-x-1/2 items-end justify-center ${draggable ? "touch-none cursor-grab" : ""}`} style={{ width: cell - 4, height: cell - 8 }}>
              {sprite ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={sprite} alt="" draggable={false} className={`pointer-events-none absolute bottom-0 left-1/2 w-auto max-w-none object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,.9)] ${over ? "brightness-125" : ""}`} style={{ height: tokenH, transform: `translateX(-50%)${u.side === "enemy" ? " scaleX(-1)" : ""}` }} />
              ) : (
                <span className={`relative block overflow-hidden rounded-full ${over ? "ring-2 ring-red-400" : ""}`} style={{ width: cell - 12, height: cell - 12, border: `2px solid ${u.side === "ally" ? "rgba(217,179,91,.95)" : "rgba(224,75,82,.95)"}`, background: "rgba(10,6,6,.85)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {u.portraitUrl ? <img src={u.portraitUrl} alt="" draggable={false} className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-base font-bold">{u.name.slice(0, 1)}</span>}
                </span>
              )}
              {isSel ? <span className="pointer-events-none absolute -inset-1 rounded-full" style={{ boxShadow: "0 0 0 2px #d9b35b, 0 0 18px rgba(217,179,91,.6)" }} /> : null}
              {over ? <span className="pointer-events-none absolute -inset-1 rounded-full" style={{ boxShadow: "0 0 0 2px #ff3b3b, 0 0 18px rgba(255,59,59,.8)" }} /> : null}
            </button>
            <div className="pointer-events-none absolute -bottom-4 left-0 right-0 text-center">
              <span className="mx-auto block h-1.5 w-[86%] overflow-hidden bg-black/70"><span className="block h-full" style={{ width: `${Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100))}%`, background: u.side === "ally" ? "linear-gradient(90deg,#2f7a4a,#4fb374)" : "linear-gradient(90deg,#7a0f13,#e04b52)" }} /></span>
              {cell >= 44 ? <span className="block truncate text-[9px] leading-tight" style={{ textShadow: "0 1px 2px #000" }}>{names[u.id]}{u.side === "ally" && !u.sanityLocked ? <span className="text-sky-300"> {u.sanity > 0 ? "+" : ""}{u.sanity}</span> : null}</span> : null}
            </div>
            {u.staggered ? <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-yellow-400 px-1 text-[9px] font-black text-black">흐트러짐</span> : null}
            {isCorroded(u, state.round) ? <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-red-700 px-1 text-[9px] font-black text-white">침식</span> : null}
          </div>
        ); })}
      {/* 속도 다이스 */}
      {state.units.filter((u) => !u.incapacitated).map((u) => { const ss = slotsOf(u); if (!ss.length) return null; const my = mine(u) && u.side === "ally";
        return ss.map((s, i) => { const key = slotKey(u.id, s.slot); const p = state.picks[key]; const sk = p ? u.skills.find((x) => x.id === p.skillId) : (my && loaded[key] ? u.skills.find((x) => x.id === loaded[key]) : undefined); const d = diePos(u, i, ss.length);
          const over = overId?.kind === "slot" && overId.unitId === u.id && overId.slot === s.slot;
          const hidden = u.side === "enemy" && !isGm; const o = odds[key];
          return (
            <button key={key} type="button" data-drop={u.side === "enemy" ? `slot|${u.id}|${s.slot}` : undefined} onPointerDown={my && sk && !p?.locked && state.phase === "select" ? startDrag({ kind: "die", unitId: u.id, slot: s.slot }) : undefined}
              onClick={() => { if (draggedRef.current) return; if (u.side === "enemy" && onEnemyTap({ kind: "slot", unitId: u.id, slot: s.slot })) { onSelect(u.id); return; } onSelect(u.id); }} title={`${names[u.id]} 속도 ${s.speed}${sk ? ` · ${hidden ? "???" : sk.name}${p ? ` → ${names[p.targetId]}` : " (대상 없음)"}` : ""}`}
              className={`absolute -translate-x-1/2 -translate-y-1/2 ${my && sk ? "touch-none cursor-grab" : ""}`} style={{ left: d.x, top: d.y, width: dieSize, height: dieSize }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ui(u.side === "enemy" ? "hept-rune" : sk ? "hex-frame" : "hex-frame")} alt="" draggable={false} className={`absolute inset-0 h-full w-full ${activeDie === key ? "drop-shadow-[0_0_6px_#fff]" : ""}`} style={u.side === "enemy" ? undefined : { filter: "sepia(1) saturate(2) hue-rotate(5deg) brightness(1.05)" }} />
              {!sk ? <span className="absolute inset-[22%] rounded-full" style={{ background: u.side === "enemy" ? "#2a0d0f" : "#1a1410" }} /> : null}
              {sk ? <span className="absolute inset-[16%]"><SkillChip skill={sk} size={Math.round(dieSize * 0.68)} bare /></span> : null}
              {over ? <span className="absolute -inset-1 rounded-full" style={{ boxShadow: "0 0 0 2px #fff, 0 0 16px #ff3b3b" }} /> : null}
              <span className="absolute -left-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-sm px-0.5 text-[10px] font-black leading-none text-white" style={{ background: u.side === "enemy" ? "#b3161c" : "#2d6fb3", border: "1px solid #0008" }}>{s.speed}</span>
              {p?.protect ? <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-amber-200 px-0.5 text-[7px] font-black text-black">보호</span> : null}
              {o ? <span className={`absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm bg-black/80 px-1 text-[9px] font-bold ${oddsColor(o.label)}`}>{oddsMode === "power" ? `${o.aPower} : ${o.bPower}` : `${o.label} ${Math.round(o.winRate * 100)}%`}</span> : null}
              {!o && sk ? <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] tabular-nums" style={{ color: u.side === "enemy" ? "#ffb3b3" : "#bfe9ff", textShadow: "0 1px 2px #000" }}>{powerRange(sk)}</span> : null}
            </button>
          ); }); })}
      <div className="pointer-events-none absolute bottom-9 left-2 hidden text-[10px] md:block" style={{ color: "var(--b-muted)" }}>
        {selected ? `${selected.name} · 이동력 ${selected.move ?? 0} · 최대 사거리 ${maxRange}칸${canMove ? " · 초록 칸을 누르거나 토큰을 끌어 이동" : ""}` : ""}
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
  return <div className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2" style={{ left: drag.x, top: drag.y }}>{skill ? <SkillChip skill={skill} size={52} glow /> : null}</div>;
}

/* ---------- 스킬 아이콘: 림버스 칠각 프레임 + 죄악 색 ---------- */
export function SkillChip({ skill, size, glow, selected, bare }: { skill: Skill; size: number; glow?: boolean; selected?: boolean; bare?: boolean }) {
  const color = SIN_COLOR[skill.sin] ?? "#555";
  const mask = `url(${ui("hex-mask")})`;
  return (
    <span className="relative inline-block shrink-0 align-middle" style={{ width: size, height: size, filter: glow ? `drop-shadow(0 0 10px ${color})` : undefined }}>
      <span className="absolute inset-[9%]" style={{ background: `radial-gradient(circle at 40% 30%, ${color} 0%, ${color}cc 55%, #0a0505 100%)`, WebkitMaskImage: mask, maskImage: mask, WebkitMaskSize: "100% 100%", maskSize: "100% 100%" }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {!bare || skill.ego ? <img src={ui(skill.ego ? "hex-ego" : "hex-frame")} alt="" draggable={false} className="absolute inset-0 h-full w-full" style={skill.ego ? { filter: "sepia(1) saturate(3) hue-rotate(10deg) brightness(1.1)" } : undefined} /> : null}
      <span className="absolute inset-0 flex items-center justify-center">{skill.kind === "defense" ? <DefenseIcon kind={skill.defenseKind ?? "guard"} size={Math.round(size * 0.5)} /> : <DamageIcon type={skill.damageType} size={Math.round(size * 0.5)} />}</span>
      {size >= 34 ? <span className="absolute -right-1 -top-1"><SinIcon sin={skill.sin} size={Math.round(size * 0.36)} /></span> : null}
      {selected ? <span className="absolute -inset-1 rounded-full" style={{ boxShadow: "0 0 0 2px #ffd54a, 0 0 12px #ffd54a" }} /> : null}
    </span>
  );
}

/* ---------- 상태 바 (선택한 내 유닛) ---------- */
function StatusBar({ u, state, rules, protect, setProtect, onRedraw, hint }: { u: Unit; state: CombatState; rules: RuleConfig; protect: boolean; setProtect: (v: boolean) => void; onRedraw: () => void; hint: string }) {
  const corroded = isCorroded(u, state.round);
  const protectable = Object.entries(state.picks).some(([k, p]) => { const a = state.units.find((x) => x.id === k.split(":")[0]); const v = state.units.find((x) => x.id === p.targetId); return !!a && a.side === "enemy" && !!v && v.side === "ally" && v.id !== u.id && !v.incapacitated && (!state.grid || dist(v.pos, u.pos) <= rules.protectRange); });
  return (
    <div className="pointer-events-auto flex max-w-[min(96vw,52rem)] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-xs" style={{ backgroundImage: `url(${ui("plate-wide")})`, backgroundSize: "100% 100%", minHeight: 36 }}>
      <b className="b-gold">{u.name}</b>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <span className="flex items-center gap-1 tabular-nums"><img src={ui("ico-heart")} alt="체력" className="h-3.5" />{u.hp}/{u.maxHp}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {!u.sanityLocked ? <span className="flex items-center gap-1 tabular-nums"><img src={ui("ico-brain-blue")} alt="정신력" className="h-3.5" />{u.sanity > 0 ? "+" : ""}{u.sanity}</span> : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {state.grid ? <span className="flex items-center gap-1 tabular-nums"><img src={ui("ico-boot")} alt="이동" className="h-3.5" />남은 이동 <b className="b-gold">{u.move ?? 0}</b></span> : null}
      <span className="b-muted">빛 {u.light}</span>
      {protectable && state.grid ? <label className={`flex cursor-pointer items-center gap-1 ${protect ? "text-amber-200" : "b-muted"}`} title="켜고 아군을 노리는 적 다이스에 스킬을 놓으면, 빛을 쓰고 자리를 바꿔 대신 받습니다"><input type="checkbox" checked={protect} onChange={(e) => setProtect(e.target.checked)} />보호</label> : null}
      {!corroded && u.light >= rules.lightRedrawCost ? <button type="button" onClick={onRedraw} className="b-gold hover:underline">빛 {rules.lightRedrawCost}: 손패 교체</button> : null}
      <span className="b-muted ml-auto hidden sm:inline">{corroded ? "침식 상태: 자동 조종" : u.staggered ? "흐트러짐: 이번 라운드 행동 불가" : hint}</span>
    </div>
  );
}

/* ---------- 스킬 선택 팝업 (영상처럼: 누르면 1·2·3 + 방어 + E.G.O) ---------- */
function SkillPicker({ unit, slot, state, loaded, startDrag, onPick, onClose, targets, onTarget, onClear }: { unit: Unit; slot: number; state: CombatState; loaded: Record<string, string>; startDrag: (p: DragPayload) => (e: RPointerEvent) => void; onPick: (s: Skill) => void; onClose: () => void; targets: { opts: { value: string; label: string }[]; value: string; locked: boolean } | null; onTarget: (v: string) => void; onClear: () => void }) {
  const key = slotKey(unit.id, slot); const cur = state.picks[key]?.skillId ?? loaded[key];
  const speed = state.slots.find((s) => s.combatantId === unit.id && s.slot === slot)?.speed;
  const corroded = isCorroded(unit, state.round);
  const hand: Skill[] = unit.hand.map((id) => unit.skills.find((s) => s.id === id)!).filter(Boolean);
  const defense = unit.skills.filter((s) => s.kind === "defense" && !s.ego);
  const egos = unit.skills.filter((s) => s.ego);
  const chip = (s: Skill, idx: number | null) => {
    const used = s.ego ? (unit.egoUsed?.[s.id] ?? 0) : 0; const blocked = corroded || (s.ego ? used >= s.ego.usesPerCombat : false); const on = cur === s.id;
    return (
      <button key={`${s.id}-${idx}`} type="button" disabled={blocked} onPointerDown={blocked ? undefined : startDrag({ kind: "skill", unitId: unit.id, skillId: s.id })} onClick={() => onPick(s)}
        title={`${s.name} · ${SIN_LABEL[s.sin]} · ${powerText(s)} · ${rangeLabel(s)}${s.effectText ? `\n${s.effectText}` : ""}`}
        className={`relative flex w-[4.6rem] shrink-0 touch-none cursor-grab flex-col items-center gap-0.5 px-1 py-1 text-[10px] disabled:cursor-not-allowed disabled:opacity-35 ${on ? "b-pick-on" : "hover:bg-white/5"}`}>
        {idx !== null ? <span className="absolute left-1 top-0.5 flex h-4 w-4 items-center justify-center rounded-sm bg-black/80 text-[10px] font-black text-amber-300 ring-1 ring-amber-300/60">{idx}</span> : null}
        <SkillChip skill={s} size={44} selected={on} />
        <span className="w-full truncate text-center leading-tight">{s.name}</span>
        <span className="b-muted flex items-center gap-0.5 tabular-nums">{s.basePower}{s.coinPower >= 0 ? "+" : ""}{s.coinPower}<span className="inline-flex">{Array.from({ length: Math.min(s.coinCount, 6) }).map((_, j) => <CoinIcon key={j} heads size={8} />)}</span></span>
        <span className="rounded-sm px-1 text-[9px]" style={{ background: "#2a1d12", color: "#e3c27a", border: "1px solid #7a5a2a" }}>{rangeLabel(s)}</span>
        {s.ego ? <span className="b-gold leading-none">E.G.O {used}/{s.ego.usesPerCombat}</span> : null}
      </button>
    );
  };
  return (
    <div className="b-pane max-w-[min(96vw,52rem)] p-2 text-xs">
      <div className="mb-1 flex items-center gap-2">
        <span className="b-head-plate px-2 py-0.5 font-bold">스킬 선택</span>
        <span>{unit.name} · 속도 <b className="text-sky-300">{speed}</b> 다이스</span>
        <span className="b-muted hidden sm:inline">누르면 올라가고, 다이스를 끌어 대상을 정합니다. 단축키 1·2·3</span>
        <button type="button" className="b-muted ml-auto hover:text-white" onClick={onClose}>✕</button>
      </div>
      <div className="flex items-start gap-1 overflow-x-auto">
        {hand.map((s, i) => chip(s, i + 1))}
        {hand.length === 0 ? <span className="b-muted self-center px-2">손패가 비었습니다</span> : null}
        <span className="mx-1 h-16 w-px shrink-0 self-center" style={{ background: "rgba(217,179,91,.3)" }} />
        {defense.map((s) => chip(s, null))}
        {egos.length ? <span className="mx-1 h-16 w-px shrink-0 self-center" style={{ background: "rgba(217,179,91,.3)" }} /> : null}
        {egos.map((s) => chip(s, null))}
      </div>
      {targets ? (
        <div className="mt-1 flex flex-wrap items-center gap-1 border-t pt-1" style={{ borderColor: "var(--b-line)" }}>
          <span className="b-gold font-semibold">대상</span>
          <select value={targets.value} disabled={targets.locked} onChange={(e) => { if (e.target.value) onTarget(e.target.value); }} className="b-input min-w-0 flex-1 px-1 py-0.5 text-[11px]">
            <option value="">대상을 고르세요 (또는 적을 누르거나 다이스를 끌어 놓기)</option>
            {targets.opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {!targets.locked ? <button type="button" className="b-btn text-[10px]" onClick={onClear}>선택 해제</button> : <span className="b-muted text-[10px]">E.G.O 확정</span>}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- 하단 스킬 띠 (림버스 슬롯) ---------- */
function SkillStrip({ units, state, names, loaded, activeDie, picker, selId, odds, onDie, onPortrait, onDefense, onCancel, startDrag }: {
  units: Unit[]; state: CombatState; names: Record<string, string>; loaded: Record<string, string>; activeDie: string | null; picker: string | null; selId: string | null; odds: Record<string, ReturnType<typeof estimateClash>>;
  onDie: (u: Unit, slot: number) => void; onPortrait: (u: Unit) => void; onDefense: (u: Unit, s: Skill) => void; onCancel: (u: Unit, slot: number) => void; startDrag: (p: DragPayload) => (e: RPointerEvent) => void;
}) {
  return (
    <div className="b-strip relative flex max-w-[100vw] items-end gap-1 overflow-x-auto px-3 py-1.5 md:px-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ui("stand")} alt="" className="pointer-events-none absolute -left-2 bottom-0 hidden h-28 opacity-80 md:block" draggable={false} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={ui("stand")} alt="" className="pointer-events-none absolute -right-2 bottom-0 hidden h-28 opacity-80 md:block" draggable={false} />
      {units.map((u, gi) => {
        const slots = state.slots.filter((s) => s.combatantId === u.id); const corroded = isCorroded(u, state.round);
        const defense = u.skills.filter((s) => s.kind === "defense" && !s.ego);
        return (
          <div key={u.id} className={`flex shrink-0 items-end gap-1.5 px-2 ${gi > 0 ? "border-l" : ""}`} style={{ borderColor: "rgba(217,179,91,.25)" }}>
            {/* 다이스 열 */}
            {slots.length === 0 ? <span className="b-muted mb-6 w-16 text-center text-[10px]">{u.staggered ? "흐트러짐" : "슬롯 없음"}</span> : null}
            {slots.map((s) => { const key = slotKey(u.id, s.slot); const p = state.picks[key]; const skId = p?.skillId ?? loaded[key]; const sk = skId ? u.skills.find((x) => x.id === skId) : undefined; const active = key === activeDie; const open = key === picker;
              return (
                <div key={key} className="flex w-16 flex-col items-center">
                  <span className="relative mb-0.5 flex h-[18px] w-12 items-center justify-center text-[11px] font-black text-white" style={{ backgroundImage: `url(${ui("num-plate")})`, backgroundSize: "100% 100%" }}>{s.speed}</span>
                  <div className="relative">
                    {active || open ? <span className="pointer-events-none absolute -inset-2" style={{ backgroundImage: `url(${ui("slot-glow")})`, backgroundSize: "100% 100%", filter: open ? "sepia(1) saturate(6) hue-rotate(170deg) brightness(1.3)" : "sepia(1) saturate(4) hue-rotate(5deg)", opacity: 0.75 }} /> : null}
                    <button type="button" onPointerDown={sk && !p?.locked && !corroded ? startDrag({ kind: "die", unitId: u.id, slot: s.slot }) : undefined} onClick={() => onDie(u, s.slot)}
                      title={sk ? `${sk.name}${p ? ` → ${names[p.targetId]}${p.targetSlot !== undefined ? (p.protect ? " (보호)" : " (가로채기/합)") : ""}` : " · 적에게 끌어 놓거나 적을 누르세요"}` : "누르면 스킬을 고릅니다"}
                      className={`relative flex h-14 w-14 touch-none items-center justify-center ${sk && !p?.locked ? "cursor-grab" : ""}`} style={{ backgroundImage: `url(${ui(p ? "slot-oct" : "slot-oct")})`, backgroundSize: "100% 100%" }}>
                      {sk ? <SkillChip skill={sk} size={44} /> : <span className="text-lg text-white/30">+</span>}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {p?.locked ? <img src={ui("ico-lock")} alt="확정" className="absolute -right-1 -top-1 h-4" /> : null}
                    </button>
                    {(p && !p.locked) || (!p && loaded[key]) ? <button type="button" onClick={() => onCancel(u, s.slot)} className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-black text-[9px] text-white/80 ring-1 ring-white/30 hover:bg-red-700" title="선택 취소">✕</button> : null}
                  </div>
                  <span className="mt-0.5 w-full truncate text-center text-[9px] leading-none"><b className="text-sky-300">{s.speed}</b> <span className={sk ? "" : "b-muted"}>{sk ? sk.name : "스킬 선택"}</span></span>
                  <span className="mt-0.5 h-3 w-full truncate text-center text-[9px] leading-none">{p ? (odds[key] ? <span className={oddsColor(odds[key]!.label)}>{odds[key]!.label} {Math.round(odds[key]!.winRate * 100)}%</span> : <span className="b-gold">→ {names[p.targetId]}</span>) : sk ? <span className="text-sky-300">대상?</span> : <span className="b-muted">—</span>}</span>
                </div>
              ); })}
            {/* 초상 + 방어 */}
            <div className="flex flex-col items-center">
              <button type="button" onClick={() => onPortrait(u)} className={`relative h-16 w-16 ${u.id === selId ? "drop-shadow-[0_0_8px_rgba(255,213,74,.9)]" : ""}`} title={u.name}>
                <span className="absolute inset-[10%] block overflow-hidden" style={{ WebkitMaskImage: `url(${ui("hex-mask")})`, maskImage: `url(${ui("hex-mask")})`, WebkitMaskSize: "100% 100%", maskSize: "100% 100%", background: "#120c0c" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {u.portraitUrl ? <img src={u.portraitUrl} alt="" className="h-full w-full object-cover" draggable={false} /> : <span className="flex h-full items-center justify-center text-base font-bold">{u.name.slice(0, 1)}</span>}
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ui("hex-frame")} alt="" className="absolute inset-0 h-full w-full" draggable={false} style={{ filter: "sepia(1) saturate(2) hue-rotate(5deg) brightness(1.05)" }} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {u.staggered ? <img src={ui("slot-broken")} alt="흐트러짐" className="absolute inset-0 h-full w-full opacity-70" draggable={false} /> : null}
                <span className="absolute -bottom-1 -left-1 rounded-sm bg-black/80 px-1 text-[10px] font-black tabular-nums text-red-400">{u.hp}</span>
                {!u.sanityLocked ? <span className="absolute -bottom-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-0.5 text-[10px] font-black tabular-nums text-white" style={{ background: "#2d6fb3", border: "1px solid #fff4" }}>{u.sanity}</span> : null}
              </button>
              <span className="mt-1 w-16 truncate text-center text-[10px] leading-none">{u.name}</span>
              <span className="mt-0.5 w-16 truncate text-center text-[9px] leading-none" style={{ color: slots.length === 0 ? "#9a8f86" : slots.every((s) => state.picks[slotKey(u.id, s.slot)]) ? "#7fd39a" : "#d9c08a" }}>{slots.length === 0 ? "행동 불가" : slots.every((s) => state.picks[slotKey(u.id, s.slot)]) ? "✓ 선택 완료" : "선택 중"}</span>
            </div>
            {defense.length ? (
              <div className="flex flex-col items-center gap-0.5 pb-3">
                {defense.slice(0, 2).map((s) => <button key={s.id} type="button" disabled={corroded} onPointerDown={corroded ? undefined : startDrag({ kind: "skill", unitId: u.id, skillId: s.id })} onClick={() => onDefense(u, s)} title={`${s.name} (방어) · ${powerText(s)}`} className="touch-none disabled:opacity-40"><SkillChip skill={s} size={30} /></button>)}
                <span className="b-muted text-[9px] leading-none">방어</span>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/* ---------- 라운드 버튼 (FVTT END 느낌 + 림버스 기어) ---------- */
function RoundButton({ isGm, phase, winner, pending, unpicked, playing, onNext, onStart, onClose }: { isGm: boolean; phase: CombatState["phase"]; winner: CombatState["winner"]; pending: boolean; unpicked: number; playing: boolean; onNext: () => void; onStart: () => void; onClose: () => void }) {
  // eslint-disable-next-line @next/next/no-img-element
  const gear = <img src={ui("gear-end")} alt="" className={`pointer-events-none absolute -inset-3 h-[calc(100%+1.5rem)] w-[calc(100%+1.5rem)] ${pending ? "b-spin-fast" : "b-spin"}`} style={{ mixBlendMode: "screen", opacity: 0.9 }} draggable={false} />;
  const inner = (txt: ReactNode, sub: ReactNode, dim?: boolean) => (
    <span className="relative flex h-full w-full flex-col items-center justify-center rounded-full text-white" style={{ backgroundImage: `url(${ui("btn-red-round")})`, backgroundSize: "100% 100%", filter: dim ? "grayscale(.8) brightness(.7)" : undefined }}>
      <span className="text-base font-black leading-none tracking-wider drop-shadow-[0_1px_2px_#000] md:text-lg">{txt}</span>
      <span className="mt-0.5 text-[9px] leading-none drop-shadow-[0_1px_2px_#000] md:text-[10px]">{sub}</span>
    </span>
  );
  const frame = (children: ReactNode) => <span className="absolute inset-0 rounded-full" style={{ backgroundImage: `url(${ui("btn-round-frame")})`, backgroundSize: "100% 100%" }}><span className="absolute inset-[11%]">{children}</span></span>;
  const size = "h-20 w-20 md:h-24 md:w-24";
  if (playing) return <button type="button" onClick={onNext} className={`relative ${size} transition-transform hover:scale-105`} title="다음 단계 (스페이스)">{gear}{frame(inner("NEXT", "다음 단계"))}</button>;
  if (isGm && phase === "select") return <button type="button" disabled={pending} onClick={onStart} className={`relative ${size} transition-transform hover:scale-105 disabled:scale-100`} title="라운드 진행">{gear}{frame(inner(pending ? "…" : "START", pending ? "처리 중" : unpicked ? `미선택 ${unpicked}` : "라운드 진행"))}</button>;
  if (phase === "ended") return <button type="button" onClick={onClose} className={`relative ${size}`} title="닫기">{frame(inner(winner === "ally" ? "승리" : "패배", "닫기", winner !== "ally"))}</button>;
  return <div className={`relative ${size}`} title="GM이 라운드를 진행합니다">{gear}{frame(inner("대기", unpicked ? `미선택 ${unpicked}` : "준비 완료", true))}</div>;
}

/* ---------- 유닛 카드 (영상의 우측 카드) ---------- */
function UnitCard({ u, state, isGm, names, rules, campaignId, combatId, onApply, onClose, info }: { u: Unit; state: CombatState; isGm: boolean; names: Record<string, string>; rules: RuleConfig; campaignId: string; combatId: string; onApply: (s: CombatState) => void; onClose: () => void; info?: EnemyInfo }) {
  const enemy = u.side === "enemy"; const hideNumbers = enemy && !isGm;
  const statuses = (Object.entries(u.statuses) as [StatusId, number][]).filter(([, v]) => v > 0);
  const [edit, setEdit] = useState(false);
  const [open, setOpen] = useState<null | "active" | "ego" | "passive">(null);
  const [revealing, startReveal] = useTransition();
  const router = useRouter();
  const hpPct = Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100));
  const active = u.skills.filter((s) => s.kind === "attack" && !s.ego), defense = u.skills.filter((s) => s.kind === "defense" && !s.ego), egos = u.skills.filter((s) => s.ego);
  const gimmicks = info ? (isGm ? info.gimmicks : info.gimmicks.filter((g) => info.revealed.includes(g.id))) : [];
  const hiddenGimmicks = info && !isGm ? info.gimmicks.length - gimmicks.length : 0;
  const enemyId = u.source.kind === "enemy" ? u.source.id : null;
  const sec = (k: "active" | "ego" | "passive", label: string, count: number, body: ReactNode) => (
    <div className="border-t" style={{ borderColor: "var(--b-line)" }}>
      <button type="button" className="flex w-full items-center justify-between px-1 py-1 text-left hover:bg-white/5" onClick={() => setOpen(open === k ? null : k)}><span className="font-semibold">▸ {label}</span><span className="b-muted">{count}개</span></button>
      {open === k ? <div className="space-y-1 px-1 pb-1.5">{body}</div> : null}
    </div>
  );
  const skillRow = (s: Skill) => (
    <div key={s.id} className="flex items-center gap-2 text-[11px]"><SkillChip skill={s} size={26} /><span className="min-w-0 flex-1"><span className="font-semibold">{s.name}</span> <span className="b-muted">{powerText(s)} · {rangeLabel(s)}</span>{s.effectText ? <span className="b-muted block truncate">{s.effectText}</span> : null}</span></div>
  );
  return (
    <div className="b-pane text-xs">
      <div className="b-head-plate flex items-center gap-2 px-2 py-1" data-tone={enemy ? "red" : "gold"}>
        <span className="rounded-sm px-1 text-[10px] font-black" style={{ background: enemy ? "#b3161c" : "#c9a24a", color: enemy ? "#fff" : "#1a1208" }}>{enemy ? "적" : "아군"}</span>
        <span className="truncate text-sm font-bold">{names[u.id]}</span>
        {info?.threat ? <span className="b-muted text-[10px]">{info.threat}</span> : null}
        <button type="button" onClick={onClose} className="b-muted ml-auto hover:text-white">✕</button>
      </div>
      <div className="p-2">
        <div className="relative h-2.5 w-full bg-black/70">
          <div className="h-full" style={{ width: `${hpPct}%`, background: enemy ? "linear-gradient(90deg,#7a0f13,#e04b52)" : "linear-gradient(90deg,#2f7a4a,#4fb374)" }} />
          {rules.staggerThresholds.map((t, i) => <span key={i} className="absolute top-0 h-full w-px bg-amber-200/80" style={{ left: `${t * 100}%` }} title={`흐트러짐 ${Math.round(t * 100)}%`} />)}
        </div>
        <div className="b-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] tabular-nums">
          <span className="text-white">{hideNumbers ? `체력 ${Math.round(hpPct)}%` : `체력 ${u.hp}/${u.maxHp}`}</span>
          <span>흐트러짐 {rules.staggerThresholds.map((t, i) => <span key={i} className={u.staggerTriggered?.includes(i) ? "text-amber-300" : ""}>◆{Math.round(t * 100)}% </span>)}</span>
          {!u.sanityLocked ? <span>정신력 <span className="text-sky-300">{u.sanity > 0 ? "+" : ""}{u.sanity}</span></span> : null}
          {u.source.kind === "character" ? <span><Keyword id="light">빛</Keyword> {u.light} · <Keyword id="erosion">침식도</Keyword> {u.erosion}</span> : null}
          {state.grid ? <span>이동 {u.move ?? 0}</span> : null}
          <span>{u.incapacitated ? <Keyword id="down">전투불능</Keyword> : isCorroded(u, state.round) ? <Keyword id="corrosion" className="text-red-400">침식</Keyword> : u.staggered ? <Keyword id="stagger">흐트러짐</Keyword> : null}</span>
        </div>
        {statuses.length ? <div className="mt-1 flex flex-wrap gap-1">{statuses.map(([k, v]) => <Keyword key={k} id={k} className="border-0"><StatusBadge status={k} value={v} /></Keyword>)}</div> : null}
        <div className="mt-1.5 flex flex-wrap gap-1">
          {u.source.kind === "character" ? <Link href={`/characters/${u.source.id}`} target="_blank" className="b-btn text-[10px]">시트</Link> : null}
          {enemyId && isGm ? <Link href={`/campaigns/${campaignId}/enemies/${enemyId}`} target="_blank" className="b-btn text-[10px]">도감</Link> : null}
          {isGm && state.phase !== "ended" ? <button type="button" onClick={() => setEdit(!edit)} className="b-btn text-[10px]">수치 조정</button> : null}
          {enemyId && isGm && info && info.gimmicks.some((g) => !info.revealed.includes(g.id)) ? <button type="button" disabled={revealing} className="b-btn-red text-[10px]" onClick={() => startReveal(async () => { await revealToAll(campaignId, enemyId, [], info.gimmicks.map((g) => g.id)); router.refresh(); })}>기믹 전부 공개</button> : null}
        </div>
        {edit ? <GmAdjust u={u} campaignId={campaignId} combatId={combatId} onDone={() => setEdit(false)} onApply={onApply} /> : null}
      </div>
      {info?.description && isGm ? <div className="b-muted border-t px-2 py-1 text-[10px]" style={{ borderColor: "var(--b-line)" }}>{info.description}</div> : null}
      {!hideNumbers ? sec("active", "액티브", active.length + defense.length, <>{active.map(skillRow)}{defense.map(skillRow)}</>) : null}
      {!enemy && egos.length ? sec("ego", "E.G.O", egos.length, egos.map(skillRow)) : null}
      {enemy
        ? sec("passive", "기믹", gimmicks.length, <>
            {gimmicks.map((g) => <div key={g.id} className="text-[11px]"><span className="flex items-center gap-1"><b className="b-gold">{g.name}</b>{isGm && info && !info.revealed.includes(g.id) ? <button type="button" disabled={revealing} className="b-muted text-[9px] underline" onClick={() => startReveal(async () => { await revealToAll(campaignId, enemyId!, [], [g.id]); router.refresh(); })}>미공개 · 공개하기</button> : <span className="text-[9px] text-emerald-300">공개</span>}</span><span className="b-muted block whitespace-pre-wrap">{g.text}</span></div>)}
            {hiddenGimmicks > 0 ? <div className="b-muted text-[10px]">미식별 기믹 {hiddenGimmicks}개</div> : null}
            {gimmicks.length === 0 && hiddenGimmicks === 0 ? <div className="b-muted text-[10px]">기믹 없음</div> : null}
          </>)
        : sec("passive", "패시브", u.passives.length, u.passives.length ? u.passives.map((e, i) => <div key={i} className="text-[11px]">{e.source ? <b className="b-gold">{e.source}</b> : null}<span className="b-muted block">{describeEffect(e)}</span></div>) : <div className="b-muted text-[10px]">없음</div>)}
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
  return (
    <div className="space-y-2">
      <div className="b-pane py-1"><div className="b-label px-1.5">아군</div>{state.units.filter((u) => u.side === "ally").map(row)}<div className="b-label mt-1 px-1.5">적</div>{state.units.filter((u) => u.side === "enemy").map(row)}</div>
      <div className="b-label px-1.5">행동 순서 (속도 내림차순)</div>
      <div className="flex flex-wrap gap-1 px-1">{state.slots.map((s) => { const u = state.units.find((x) => x.id === s.combatantId)!; return <button key={slotKey(u.id, s.slot)} type="button" onClick={() => onSelect(u.id)} className="flex items-center gap-1 border px-1.5 py-0.5 text-[10px]" style={{ borderColor: u.side === "enemy" ? "#b3161c" : "#c9a24a" }}><b className="text-sky-300">{s.speed}</b>{names[u.id]}</button>; })}</div>
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
