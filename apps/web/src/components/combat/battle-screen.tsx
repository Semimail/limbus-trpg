"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type ReactNode, type PointerEvent as RPointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient, realtimeReady } from "@/lib/supabase/client";
import { STATUS_IDS, SIN_LABEL, SINS, GLOSSARY_TERMS, slotKey, isCorroded, dist, skillRange, estimateClash, describeEffect, erosionStageChanged, erosionStage, EROSION_STAGE_LABEL, type CombatState, type Unit, type StatusId, type Skill, type Pos, type RuleConfig, type Pick, type Sin, type DamageType, type Resistance } from "@limbus/rules";
import { setPickAction, resolveRoundAction, endCombatAction, gmAdjustUnitAction, redrawHandAction, rerollEnemyPicksAction } from "@/app/campaigns/[id]/sessions/[sid]/combat-actions";
import { revealToAll } from "@/app/campaigns/[id]/enemies/actions";
import { formatRound, unitNames } from "@/lib/combat-log";
import { SinIcon, DamageIcon, DefenseIcon, CoinIcon, StatusBadge, StatusIcon, BACKGROUNDS } from "@/components/icons";
import { Keyword, KeywordText } from "@/components/keyword/keyword";
import { buildPlaySteps, type PlayStep } from "./playback";
import { SdSprite } from "@/components/sprite/sd-sprite";
import { ErosionReveal, type ErosionCard } from "./erosion-reveal";

/*
 * 전투 화면 v5 — 원작 BattleUI 조각(설치 폴더 추출, public/assets/limbus/ui/b/, 비공개 전제)을 그대로 쓴다 + 참고 영상(FVTT 림버스 모듈) 레이아웃
 *  - 조각 이름 ↔ 원작 스프라이트 대응은 scripts/limbus-extract/README.md "전투 UI 조각" 절. 폰트: Excelsior(제목)·BebasKai(숫자)·SCDream(본문).
 *  - 좌상단 TURN/ENEMY 프레임, 왼쪽 행동 순서, 우상단 버튼, 오른쪽 유닛 카드(적은 공개된 기믹만), 우하단 로그, 붉은 원형 START.
 *  - 가운데 아래 림버스식 스킬 슬롯 띠: 자기 캐릭터의 다이스를 누르면 1·2·3번 손패/방어/E.G.O를 골라 올리고,
 *    다이스를 끌어(또는 상대를 눌러) 대상을 정한다. 남의 캐릭터는 GM 이라도 보기만. "선택 완료" 단계는 없다 — 고른 스킬이 곧 선택.
 *  - 적의 스킬은 GM 이 같은 띠에서 지정한다(라운드 시작 때는 무작위로 깔리고, "무작위" 버튼으로 다시 굴릴 수 있다).
 *  - 아래 줄은 스킬 띠 + 승률/피해량 + START 를 한 덩어리로 가운데 모은다(넓은 화면에서 멀리 떨어지지 않게).
 *  - v5.2: 띠는 원작처럼 유닛마다 세로 한 열(다이스 → 속도 → 초상, 이름 글자 없음), 적에 마우스를 올리면 호버 카드(고른 스킬·효과·키워드),
 *    적을 누르면 왼쪽 큰 정보 패널(요약/스킬/기믹/상태·내성) — 둘 다 그 사람 화면에만. HUD 는 TURN 만(아군·적 수는 세지 않음).
 */

export interface EnemyInfo { threat: string; description: string; gimmicks: { id: string; name: string; text: string }[]; revealed: string[] }

interface Props {
  campaignId: string; combatId: string; initial: CombatState; meId: string; isGm: boolean; rules: RuleConfig;
  sessionTitle: string; sceneTitle: string; backHref: string;
  chat: ReactNode; sceneTools?: ReactNode; enemyInfo: Record<string, EnemyInfo>;
  /** 장면 배경(GM 콘솔 무대 탭). 없으면 기본 전투 배경 */
  background: string | null;
}

const UI = "/assets/limbus/ui/b";
const ui = (n: string) => `${UI}/${n}.png`;
/** 적 등급 → 원작 위협 등급 꼬리표 (ZAYIN~ALEPH, 불순물은 ???) */
const THREAT_TAG: Record<string, string> = { "뜬소문": "threat-zayin", "도시괴담": "threat-teth", "도시전설": "threat-he", "도시의 악몽": "threat-waw", "도시의 재앙": "threat-aleph", "별": "threat-aleph2", "불순물": "threat-unknown" };
const RESIST_LABEL: Record<Resistance, string> = { fatal: "치명", weak: "취약", normal: "보통", endure: "견딤", resist: "내성", immune: "면역" };
const RESIST_MULT: Record<Resistance, string> = { fatal: "x2", weak: "x1.5", normal: "x1", endure: "x0.75", resist: "x0.5", immune: "x0" };
const SIN_COLOR: Record<string, string> = { wrath: "#b3161c", lust: "#d4621c", sloth: "#c9a227", gluttony: "#4f8a3a", gloom: "#2e6f9e", pride: "#2b3f8c", envy: "#6a3d9a" };

type DragPayload = { kind: "skill"; unitId: string; skillId: string } | { kind: "die"; unitId: string; slot: number };
type DropId = { kind: "unit"; unitId: string } | { kind: "slot"; unitId: string; slot: number } | { kind: "cell"; x: number; y: number };
function parseDrop(s: string | null | undefined): DropId | null {
  if (!s) return null;
  const [k, a, b] = s.split("|");
  if (k === "unit" && a) return { kind: "unit", unitId: a };
  if (k === "slot" && a && b !== undefined) return { kind: "slot", unitId: a, slot: Number(b) };
  if (k === "cell" && a !== undefined && b !== undefined) return { kind: "cell", x: Number(a), y: Number(b) };
  return null;
}
const powerText = (s: Skill) => `${s.basePower}${s.coinPower >= 0 ? "+" : ""}${s.coinPower}×${s.coinCount}`;

export function BattleScreen({ campaignId, combatId, initial, meId, isGm, rules, sessionTitle, sceneTitle, backHref, chat, sceneTools, enemyInfo, background }: Props) {
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
  // 합 컷인(림버스식) on/off. 끄면 유닛 옆 카드 방식
  const [cutin, setCutin] = useState<boolean>(() => { if (typeof window === "undefined") return true; try { return localStorage.getItem("limbus.cutin") !== "off"; } catch { return true; } });
  // 라운드 시작 플래시 ("TURN n"): 연출이 끝난 뒤 한 번
  const [flash, setFlash] = useState<number | null>(null);
  const flashedRef = useRef<number>(initial.round);
  useEffect(() => {
    if (play || state.round === flashedRef.current) return;
    flashedRef.current = state.round; setFlash(state.round);
    const t = setTimeout(() => setFlash(null), 1700);
    return () => clearTimeout(t);
  }, [state.round, play]);
  const playNext = useCallback(() => setPlay((p) => (!p ? p : p.i >= p.steps.length - 1 ? null : { ...p, i: p.i + 1 })), []);
  // 전투 종료 뒤 침식도 단계 연출 (한 번만). 전투 시작 침식도(erosionStart)와 비교해 단계가 바뀐 아군 캐릭터
  // 처음부터 끝난 전투(새로고침)에서는 보여주지 않고, 닫으면 다시 뜨지 않는다
  const [erosionDone, setErosionDone] = useState(initial.phase === "ended");
  const erosionCards = useMemo<ErosionCard[] | null>(() => {
    if (state.phase !== "ended" || play || erosionDone) return null;
    const cards: ErosionCard[] = [];
    for (const u of state.units) {
      if (u.source.kind !== "character" || u.erosionStart === undefined) continue;
      const ch = erosionStageChanged(u.erosionStart, u.erosion, rules);
      if (ch) cards.push({ unitId: u.id, name: u.name, portrait: u.portraitUrl, before: u.erosionStart, after: u.erosion, from: ch.from, to: ch.to, max: rules.erosionMax });
    }
    return cards.length ? cards : null;
  }, [state, play, rules, erosionDone]);
  const clearErosion = useCallback(() => setErosionDone(true), []);
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
  // 조종 권한: 캐릭터는 주인만(GM 이라도 남의 캐릭터는 못 건드린다), 적은 GM 만
  const mine = useCallback((u: Unit) => (u.source.kind === "character" ? u.source.ownerId === meId : isGm), [isGm, meId]);
  const myUnits = state.units.filter((u) => mine(u) && !u.incapacitated);
  const [selId, setSelId] = useState<string | null>(() => { const ctrl = (u: Unit) => !u.incapacitated && (u.source.kind === "character" ? u.source.ownerId === meId : isGm); return (initial.units.find((u) => u.side === "ally" && ctrl(u)) ?? initial.units.find(ctrl))?.id ?? null; });
  const selected = state.units.find((u) => u.id === selId) ?? null;
  // 정보 패널(아군 카드·적 패널)은 무대·순서표에서 유닛을 눌렀을 때만 연다. 띠의 다이스·초상은 선택만 바꾼다(패널이 무대를 가려 대상 지정을 막지 않게)
  const [infoId, setInfoId] = useState<string | null>(null);
  const infoUnit = state.units.find((u) => u.id === infoId) ?? null;
  const selectUnit = useCallback((id: string | null) => { setSelId(id); setInfoId(id); }, []);
  const allyUnpicked = state.slots.filter((s) => state.units.find((x) => x.id === s.combatantId)!.side === "ally" && !state.picks[slotKey(s.combatantId, s.slot)]);
  const enemiesAlive = state.units.filter((u) => u.side === "enemy" && !u.incapacitated).length;
  const [drawer, setDrawer] = useState<null | "chat" | "log" | "roster">(null);
  // 적에 마우스를 올린 상태 (이 사람 화면에만 뜨는 호버 카드)
  const [hoverId, setHoverId] = useState<string | null>(null);
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
  const reroll = (unitId?: string) => act(() => rerollEnemyPicksAction(campaignId, combatId, unitId));

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
    if (target.kind === "cell") return "스킬은 상대에게 놓아야 합니다";
    const me = state.units.find((u) => u.id === unitId); const t = state.units.find((u) => u.id === target.unitId);
    if (!me || !t || t.side === me.side) return "상대편에게 놓아야 합니다";
    if (target.kind === "unit") return { skillId, targetId: t.id };
    const tp = state.picks[slotKey(t.id, target.slot)];
    if (tp && tp.targetId === unitId) return { skillId, targetId: t.id };                       // 서로 노림 → 합
    if (protectMode[unitId] && tp) return { skillId, targetId: t.id, targetSlot: target.slot, protect: true }; // 보호
    return { skillId, targetId: t.id, targetSlot: target.slot };                                 // 가로채기(엔진이 속도 검사)
  };
  const confirmEgo = (skill: Skill | undefined, key: string) => !(skill?.ego && !state.picks[key]?.locked) || confirm(`E.G.O [${skill!.name}] 발현: 정신력 -${skill!.ego!.sanityCost}, 침식도 +${skill!.ego!.erosionGain}. 발현 후에는 바꿀 수 없습니다.`);
  const handleDrop = (payload: DragPayload, target: DropId) => {
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
    if (!drag || !drag.over || drag.over.kind === "cell") return null;
    const unit = state.units.find((u) => u.id === drag.payload.unitId); if (!unit) return null;
    const slot = drag.payload.kind === "die" ? drag.payload.slot : dieFor(unit.id);
    const skillId = drag.payload.kind === "skill" ? drag.payload.skillId : slot !== undefined ? (loaded[slotKey(unit.id, slot)] ?? state.picks[slotKey(unit.id, slot)]?.skillId) : undefined;
    const skill = unit.skills.find((s) => s.id === skillId); if (!skill) return null;
    const t = state.units.find((u) => u.id === (drag.over as { unitId: string }).unitId); if (!t || t.side === unit.side) return null;
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
      if (!a || !t || (a.side !== "ally" && !isGm)) continue; // 적 쪽 승률은 GM 에게만
      const opp = Object.entries(state.picks).find(([k2, p2]) => k2.startsWith(t.id + ":") && p2.targetId === a.id && (p.targetSlot === undefined || Number(k2.split(":")[1]) === p.targetSlot));
      const tp = opp?.[1] ?? (p.targetSlot !== undefined ? state.picks[slotKey(t.id, p.targetSlot)] : undefined);
      const as = a.skills.find((s) => s.id === p.skillId), ts = tp ? t.skills.find((s) => s.id === tp.skillId) : undefined;
      if (as && ts) out[k] = estimateClash(as, a.sanity, ts, t.sanity, rules, 150);
    }
    return out;
  }, [state, rules, showOdds, isGm]);

  const phaseText = state.phase === "select" ? "선택 단계" : state.phase === "ended" ? (state.winner === "ally" ? "승리" : "패배") : "처리 중";
  const pickerUnit = picker ? state.units.find((u) => picker.startsWith(u.id + ":")) : undefined;
  const pickerSlot = picker ? Number(picker.split(":")[1]) : undefined;
  // 스킬 선택 카드의 대상 드롭다운 (영상처럼): 적 토큰(일방) + 적 다이스(합/가로채기/보호, 승률 추정)
  const pickerTargets = useMemo(() => {
    if (!pickerUnit || pickerSlot === undefined) return null;
    const key = slotKey(pickerUnit.id, pickerSlot); const cur = state.picks[key];
    const sk = pickerUnit.skills.find((s) => s.id === (cur?.skillId ?? loaded[key])); if (!sk) return null;
    const opts: { value: string; label: string }[] = [];
    for (const t of state.units.filter((x) => x.side !== pickerUnit.side && !x.incapacitated)) {
      const d = state.grid ? dist(pickerUnit.pos, t.pos) : 0; const oor = !!state.grid && d > skillRange(sk);
      opts.push({ value: `unit|${t.id}`, label: `${names[t.id]} · 일방 공격${t.staggered ? " · 흐트러짐" : ""}${state.grid ? ` · 거리 ${d}` : ""}${oor ? " · 사거리 밖" : ""}` });
      for (const s of state.slots.filter((x) => x.combatantId === t.id)) {
        const tp = state.picks[slotKey(t.id, s.slot)]; const ts = tp ? t.skills.find((x) => x.id === tp.skillId) : undefined;
        const mode = tp?.targetId === pickerUnit.id ? "합" : protectMode[pickerUnit.id] ? "보호" : "가로채기";
        const est = ts ? estimateClash(sk, pickerUnit.sanity, ts, t.sanity, rules, 120) : null;
        opts.push({ value: `slot|${t.id}|${s.slot}`, label: `${names[t.id]} 다이스 ${s.speed} · ${ts ? (t.side === "enemy" && !isGm ? "???" : ts.name) : "미선택"} · ${mode}${est ? ` · ${est.label} ${Math.round(est.winRate * 100)}%` : ""}${oor && mode !== "보호" ? " · 사거리 밖" : ""}` });
      }
    }
    const value = cur ? (cur.targetSlot !== undefined ? `slot|${cur.targetId}|${cur.targetSlot}` : `unit|${cur.targetId}`) : "";
    return { opts, value, locked: !!cur?.locked };
  }, [pickerUnit, pickerSlot, state, loaded, protectMode, rules, isGm, names]);
  // 지금 대상이 되는 편: 끌고 있는(없으면 활성) 다이스 주인의 반대편. 적 다이스를 다루는 GM 은 아군이 대상
  const ctrlId = drag?.payload.unitId ?? activeDie?.split(":")[0];
  const targetSide: "ally" | "enemy" = state.units.find((u) => u.id === ctrlId)?.side === "enemy" ? "ally" : "enemy";
  const sinCounts = useMemo(() => { const c: Partial<Record<Sin, number>> = {}; for (const [k, p] of Object.entries(state.picks)) { const u = state.units.find((x) => k.startsWith(x.id + ":")); if (u?.side !== "ally") continue; const s = u.skills.find((x) => x.id === p.skillId); if (s) c[s.sin] = (c[s.sin] ?? 0) + 1; } return c; }, [state]);

  return (
    <div className="battle fixed inset-0 z-40 select-none overflow-hidden">
      <Arena state={state} names={names} isGm={isGm} selId={selId} onSelect={selectUnit} mine={mine} drag={drag} background={background} targetSide={targetSide} hoverId={hoverId} onHover={setHoverId} enemyInfo={enemyInfo}
        startDrag={startDrag} draggedRef={draggedRef} loaded={loaded} activeDie={activeDie} onEnemyTap={targetByClick} odds={odds} oddsMode={oddsMode} play={playStep} playKey={play?.i ?? -1} cutin={cutin} thresholds={rules.staggerThresholds} />

      {/* 좌상단 HUD */}
      {/* 좌상단 HUD: 원작처럼 TURN 플레이트. 아군·적 수는 세지 않는다. 아래 빈 자리는 혈찬·작열지대 같은 전투 특수 규칙이 생기면 그 아이콘·수치가 들어갈 곳 */}
      <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-col gap-1">
        <HudFrame img="hud-turn" value={state.round} title="라운드" />
        <span className="b-plate-d ml-1 w-fit px-4 py-0.5 text-[11px]">{phaseText}</span>
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
      <Tracker state={state} names={names} selId={selId} onSelect={selectUnit} className="absolute bottom-[16.5rem] left-2 top-[6.2rem] z-10 hidden md:flex" />

      {/* 우상단 버튼 */}
      <div className="absolute right-2 top-2 z-20 flex items-start gap-1">
        {state.lastRound?.length ? <IconBtn img="btn-play" label="다시 보기" onClick={() => startPlay(state.lastRound, state.units)} /> : null}
        <IconBtn img={autoCine ? "btn-arrows-on" : "btn-arrows-off"} label="연출" on={autoCine} onClick={() => { const v = !autoCine; setAutoCine(v); autoRef.current = v; try { localStorage.setItem("limbus.cinematic", v ? "on" : "off"); } catch {} }} />
        <div className="relative">
          <IconBtn img="btn-gear" label="메뉴" on={menu} onClick={() => setMenu(!menu)} />
          {menu ? (
            <div className="b-pane absolute right-0 top-14 z-30 w-56 p-2 text-xs">
              <button type="button" className="b-row" onClick={() => { setDrawer("chat"); setMenu(false); }}>채팅</button>
              <button type="button" className="b-row" onClick={() => { setDrawer("log"); setMenu(false); }}>전체 로그</button>
              <button type="button" className="b-row" onClick={() => { setDrawer("roster"); setMenu(false); }}>명단 · 순서</button>
              <button type="button" className="b-row" onClick={() => setOddsMode(oddsMode === "off" ? "odds" : "off")}>승률 표시 {showOdds ? "끄기" : "켜기"}</button>
              <button type="button" className="b-row" onClick={() => { const v = !cutin; setCutin(v); try { localStorage.setItem("limbus.cutin", v ? "on" : "off"); } catch {} }}>합 컷인 연출 {cutin ? "끄기 (카드 방식)" : "켜기"}</button>
              {sceneTools ? <details className="mt-1 border-t pt-1" style={{ borderColor: "var(--b-line)" }}><summary className="b-row cursor-pointer list-none">장면 전환 ▾</summary><div className="mt-1">{sceneTools}</div></details> : null}
              {isGm && state.phase !== "ended" ? <button type="button" className="b-row text-red-300" onClick={() => { if (confirm("전투를 종료할까요? 체력과 정신력이 캐릭터에 반영됩니다.")) act(() => endCombatAction(campaignId, combatId)); setMenu(false); }}>전투 종료</button> : null}
              <Link href={backHref} className="b-row block">사무소로</Link>
              <div className="b-muted mt-1 truncate border-t pt-1 text-[10px]" style={{ borderColor: "var(--b-line)" }}>{sessionTitle} · {sceneTitle}</div>
            </div>
          ) : null}
        </div>
      </div>

      {/* 오른쪽: 죄악 자원(아군 선택 스킬 속성 수) */}
      <div className="b-rescol absolute -right-1 top-1/2 z-10 hidden w-[7.6rem] -translate-y-1/2 flex-col lg:flex" style={{ marginTop: "-1rem" }}>
        {SINS.map((s) => <span key={s} className="b-res" title={`${SIN_LABEL[s]} 자원 (아군이 고른 ${SIN_LABEL[s]} 스킬 수)`}><SinIcon sin={s} size={34} /><span className={`b-num text-[26px] leading-none ${sinCounts[s] ? "text-white" : "b-muted"}`} style={{ textShadow: "0 1px 2px #000" }}>{sinCounts[s] ?? 0}</span></span>)}
      </div>

      {/* 오른쪽: 유닛 카드 */}
      {infoUnit && !play && infoUnit.side === "enemy" ? (
        <div className="absolute left-2 top-16 z-10 max-h-[calc(100vh-19rem)] w-[min(94vw,30rem)] overflow-y-auto md:left-[5.8rem]">
          <EnemyPanel u={infoUnit} state={state} isGm={isGm} names={names} rules={rules} campaignId={campaignId} combatId={combatId} onApply={applyState} onClose={() => setInfoId(null)} info={infoUnit.source.kind === "enemy" ? enemyInfo[infoUnit.source.id] : undefined} />
        </div>
      ) : infoUnit && !play ? (
        <div className="absolute right-2 top-16 z-10 w-[min(92vw,21rem)] max-h-[46vh] overflow-y-auto md:right-16 lg:right-32">
          <UnitCard u={infoUnit} state={state} isGm={isGm} names={names} rules={rules} campaignId={campaignId} combatId={combatId} onApply={applyState} onClose={() => setInfoId(null)} info={undefined} />
        </div>
      ) : null}

      {/* 우하단: 로그 카드 */}
      <div className="absolute bottom-[16.5rem] right-2 z-10 hidden w-[20rem] md:block">
        <div className="b-log text-[11px]">
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
          {selected && mine(selected) && !(pickerUnit && mine(pickerUnit)) ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-[14.6rem] z-10 flex justify-center px-2">
              <StatusBar u={selected} state={state} rules={rules} protect={!!protectMode[selected.id]} setProtect={(v) => setProtectMode((m) => ({ ...m, [selected.id]: v }))}
                onRedraw={() => { if (confirm(`빛 ${rules.lightRedrawCost}을 써서 손패를 교체할까요? (남은 빛 ${selected.light})`)) act(() => redrawHandAction(campaignId, combatId, selected.id)); }}
                hint={activeDie && (loaded[activeDie] || state.picks[activeDie]) ? (state.picks[activeDie] ? `→ ${names[state.picks[activeDie]!.targetId]} · 다른 적을 누르거나 끌어 바꿀 수 있어요` : "적을 누르거나 다이스를 끌어 대상을 정하세요") : "다이스를 눌러 스킬을 고르세요 (단축키 1·2·3)"} />
            </div>
          ) : null}
          {pickerUnit && pickerSlot !== undefined && mine(pickerUnit) ? (
            <div className="absolute inset-x-0 bottom-[14.6rem] z-20 flex justify-center px-2">
              <SkillPicker unit={pickerUnit} slot={pickerSlot} state={state} loaded={loaded} startDrag={startDrag} onPick={(s) => chooseSkill(pickerUnit, pickerSlot, s)} onClose={() => setPicker(null)}
                targets={pickerTargets} onTarget={(v) => { const t = parseDrop(v); if (t) handleDrop({ kind: "die", unitId: pickerUnit.id, slot: pickerSlot }, t); }}
                onClear={() => { const k = slotKey(pickerUnit.id, pickerSlot); if (state.picks[k]) pick(pickerUnit.id, pickerSlot, null); else setLoaded((l) => { const n = { ...l }; delete n[k]; return n; }); }} />
            </div>
          ) : null}
        </>
      ) : null}

      {/* 아래 줄: 스킬 띠 + 승률/피해량 + 라운드 버튼을 한 덩어리로 가운데에 (넓은 화면에서 멀리 떨어지지 않게) */}
      <div className="absolute inset-x-0 bottom-12 z-10 flex items-end justify-center gap-2 px-2 md:gap-4">
        {state.phase === "select" && myUnits.length > 0 ? (
          <SkillStrip units={myUnits} state={state} names={names} loaded={loaded} activeDie={activeDie} picker={picker} selId={selId} odds={odds}
            onDie={(u, slot) => { const k = slotKey(u.id, slot); setActiveDie(k); setSelId(u.id); setPicker(picker === k ? null : k); }}
            onPortrait={(u) => { setSelId(u.id); const d = firstFreeDie(u.id); if (d) setActiveDie(slotKey(u.id, d.slot)); }}
            onCancel={(u, slot) => { const k = slotKey(u.id, slot); if (state.picks[k]) pick(u.id, slot, null); else setLoaded((l) => { const n = { ...l }; delete n[k]; return n; }); }}
            onReroll={isGm ? (u) => reroll(u.id) : undefined}
            startDrag={startDrag} />
        ) : null}
        <div className="z-20 flex shrink-0 items-end gap-2 pb-1 md:pb-2">
          <div className="mb-2 hidden flex-col items-end gap-1 md:flex">
            <button type="button" onClick={() => setOddsMode(oddsMode === "odds" ? "off" : "odds")} title="합 승률 표시" className="relative h-9 w-[4.8rem] pr-5 text-[12px] font-black text-[#ffd0d0]" style={{ backgroundImage: `url(${ui(oddsMode === "odds" ? "plate-red-on" : "plate-red-off")})`, backgroundSize: "100% 100%", textShadow: "0 1px 2px #000" }}>승률</button>
            <button type="button" onClick={() => setOddsMode(oddsMode === "power" ? "off" : "power")} title="기대 위력 표시" className="relative h-9 w-[4.8rem] pr-5 text-[12px] font-black text-[#ffd0d0]" style={{ backgroundImage: `url(${ui(oddsMode === "power" ? "plate-red-on" : "plate-red-off")})`, backgroundSize: "100% 100%", textShadow: "0 1px 2px #000" }}>피해량</button>
            {isGm && state.phase === "select" && enemiesAlive > 0 ? <button type="button" disabled={pending} onClick={() => reroll()} title="모든 적의 선택을 무작위로 다시 고릅니다 (확정된 것은 유지)" className="b-tabx px-3 py-0.5 text-[10px]">적 무작위</button> : null}
          </div>
          <RoundButton isGm={isGm} phase={state.phase} winner={state.winner} pending={pending} unpicked={allyUnpicked.length} playing={!!play}
            onStart={() => act(() => resolveRoundAction(campaignId, combatId))} onClose={() => router.refresh()} />
        </div>
      </div>

      {/* 맨 아래 바 */}
      <div className="b-banner absolute inset-x-0 bottom-0 z-20 flex h-12 items-center gap-2 px-2 text-[11px]">
        <span className="b-logo b-num mr-1 hidden px-2 py-1 text-[12px] leading-none tracking-wider sm:block">LIMBUS<br />TRPG</span>
        <button type="button" className={`b-tabx b-tabx-lg ${drawer === null ? "b-tabx-on" : ""}`} onClick={() => setDrawer(null)}>전투</button>
        <button type="button" className={`b-tabx b-tabx-lg ${drawer === "chat" ? "b-tabx-on" : ""}`} onClick={() => setDrawer(drawer === "chat" ? null : "chat")}>채팅</button>
        <button type="button" className={`b-tabx b-tabx-lg ${drawer === "log" ? "b-tabx-on" : ""}`} onClick={() => setDrawer(drawer === "log" ? null : "log")}>로그</button>
        <button type="button" className={`b-tabx b-tabx-lg ${drawer === "roster" ? "b-tabx-on" : ""}`} onClick={() => setDrawer(drawer === "roster" ? null : "roster")}>명단</button>
        <span className="ml-auto truncate text-white/80">{sessionTitle} · {sceneTitle}</span>
      </div>

      {/* 드래그 미리보기 */}
      {drag ? (
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
      {drag ? <DragGhost drag={drag} state={state} loaded={loaded} dieFor={dieFor} /> : null}

      {/* 서랍 */}
      {/* 숨길 때 transform 대신 display:none — 변형된 요소는 overflow-hidden 부모를 가로로 스크롤시킬 수 있다 */}
      <div className={`absolute inset-y-0 right-0 z-30 w-full flex-col pb-12 sm:w-[22rem] ${drawer ? "flex" : "hidden"} b-drawer`}>
        <div className="b-bar flex h-9 items-center gap-1 px-2 text-[11px]">
          {(["chat", "log", "roster"] as const).map((k) => <button key={k} type="button" className={`b-tab ${drawer === k ? "b-tab-on" : ""}`} onClick={() => setDrawer(k)}>{k === "chat" ? "채팅" : k === "log" ? "로그" : "명단"}</button>)}
          <button type="button" className="b-tab ml-auto" onClick={() => setDrawer(null)}>닫기 ✕</button>
        </div>
        <div className={`min-h-0 flex-1 p-2 ${drawer === "chat" ? "" : "hidden"}`}>{chat}</div>
        {drawer === "log" ? <div className="min-h-0 flex-1 overflow-auto p-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">{state.lastRound ? <KeywordText text={formatRound(state.lastRound, names).join("\n")} /> : <span className="b-muted">아직 결과가 없습니다.</span>}</div> : null}
        {drawer === "roster" ? <div className="min-h-0 flex-1 overflow-auto p-2"><Roster state={state} selId={selId} onSelect={(id) => { selectUnit(id); setDrawer(null); }} isGm={isGm} names={names} /></div> : null}
      </div>

      {/* 라운드 시작 플래시 */}
      {flash !== null && !play ? <div className="pointer-events-none absolute inset-x-0 top-[26%] z-30 flex justify-center"><div className="b-turn-flash relative flex items-center gap-3 px-10 py-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ui("turn-lines")} alt="" className="pointer-events-none absolute inset-0 h-full w-full" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ui("txt-turn")} alt="TURN" className="relative h-14 md:h-20" draggable={false} /><span className="b-num relative text-6xl text-[#ff9a2e] md:text-8xl" style={{ textShadow: "0 0 24px rgba(255,120,40,.8), 0 2px 0 #000" }}>{flash}</span></div></div> : null}
      {/* 전투 종료: 침식도 단계 연출 */}
      {erosionCards ? <ErosionReveal cards={erosionCards} onDone={clearErosion} /> : null}
      {/* 연출 배너 (합 승리 · 전투불능 · 승패) */}
      {playStep?.banner ? (playStep.banner.text === "승리" || playStep.banner.text === "패배"
        ? <ResultBanner win={playStep.banner.text === "승리"} />
        : <div className="pointer-events-none absolute inset-x-0 top-[34%] z-30 flex justify-center"><div className="b-play-banner px-8 py-2 text-3xl font-black tracking-widest md:text-5xl" style={{ color: playStep.banner.tone === "gold" ? "#ffd54a" : playStep.banner.tone === "red" ? "#ff4d55" : "#f1ebe0" }}>{playStep.banner.text}</div></div>) : null}
    </div>
  );
}

const oddsColor = (l: string) => l === "압도" ? "text-amber-300" : l === "유리" ? "text-emerald-300" : l === "보통" ? "text-white" : l === "불리" ? "text-orange-300" : "text-red-400";

/* ---------- HUD 조각 ---------- */
/** 원작 TURN/ENEMY 플레이트(305x128): 오른쪽 어두운 칸에 숫자 */
function HudFrame({ img, value, title }: { img: string; value: number | string; title: string }) {
  return (
    <span className="relative block h-[50px] w-[120px]" title={title} style={{ backgroundImage: `url(${ui(img)})`, backgroundSize: "100% 100%" }}>
      <span className="b-num absolute inset-y-0 right-[8%] flex w-[40%] items-center justify-center text-2xl text-white" style={{ textShadow: "0 1px 2px #000" }}>{value}</span>
    </span>
  );
}
/** 원작 사각 버튼(250x245). 켜져 있으면 주황 테두리 글로우 조각을 겹친다 */
function IconBtn({ img, label, on, onClick }: { img: string; label: string; on?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title={label} className={`flex flex-col items-center gap-0 ${on === false ? "opacity-60" : ""}`}>
      <span className="relative block h-10 w-10 md:h-12 md:w-12">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ui(img)} alt="" className="h-full w-full" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {on ? <img src={ui("btn-glow")} alt="" className="pointer-events-none absolute -inset-[6%] h-[112%] w-[112%]" draggable={false} /> : null}
      </span>
      <span className="text-[9px] leading-none" style={{ color: on === false ? "var(--b-muted)" : "var(--b-gold)", textShadow: "0 1px 2px #000" }}>{label}</span>
    </button>
  );
}
/** 승리·패배: 원작 VICTORY/DEFEAT 글자 + 장식 선 */
function ResultBanner({ win }: { win: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[30%] z-30 flex flex-col items-center">
      <div className="relative flex w-[min(92vw,44rem)] items-center justify-center py-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ui(win ? "result-lines-gold" : "result-line-red")} alt="" className="b-result-lines absolute inset-x-0 top-1/2 h-28 w-full -translate-y-1/2 object-fill opacity-90 md:h-40" draggable={false} />
        {win ? (<>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ui("result-branch-l")} alt="" className="b-result absolute left-0 top-1/2 h-16 -translate-y-1/2 md:h-24" draggable={false} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ui("result-branch-r")} alt="" className="b-result absolute right-0 top-1/2 h-16 -translate-y-1/2 md:h-24" draggable={false} />
        </>) : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ui(win ? "txt-victory" : "txt-defeat")} alt={win ? "VICTORY" : "DEFEAT"} className="b-result relative h-16 md:h-24" draggable={false} />
      </div>
    </div>
  );
}
/** 초상 게이지(원작 칠각 링): 왼쪽 빨강 체력, 오른쪽 파랑 정신력. 안쪽에 초상 */

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

/* ---------- 무대: 림버스식 진형 (격자 없음, 비스듬한 바닥) ---------- */
// 바닥 좌표 (u: 가로 0~1, v: 깊이 0=뒤 1=앞). 아군은 왼쪽 앞에서 뒤로 지그재그, 적은 좌우 반전
const FORMATION: [number, number][] = [[0.17, 0.92], [0.31, 0.68], [0.43, 0.96], [0.10, 0.60], [0.47, 0.72], [0.25, 0.46], [0.37, 0.42], [0.06, 0.80], [0.20, 0.30], [0.44, 0.52]];

function Arena({ state, names, isGm, selId, onSelect, mine, drag, startDrag, draggedRef, loaded, activeDie, onEnemyTap, odds, oddsMode, play, playKey, background, cutin, thresholds, targetSide, hoverId, onHover, enemyInfo }: {
  state: CombatState; names: Record<string, string>; isGm: boolean; selId: string | null; onSelect: (id: string | null) => void; mine: (u: Unit) => boolean; /** 흐트러짐 구간 (체력 바 눈금) */ thresholds: number[];
  /** 지금 대상이 되는 편 (내 다이스의 반대편). 그 편의 유닛·다이스만 놓기/누르기 대상이 된다 */ targetSide: "ally" | "enemy";
  /** 적 호버 카드 (마우스를 올린 사람 화면에만) */ hoverId: string | null; onHover: (id: string | null) => void; enemyInfo: Record<string, EnemyInfo>;
  drag: { payload: DragPayload; over: DropId | null } | null; startDrag: (p: DragPayload) => (e: RPointerEvent) => void; draggedRef: React.MutableRefObject<boolean>;
  loaded: Record<string, string>; activeDie: string | null; onEnemyTap: (t: DropId) => boolean; odds: Record<string, ReturnType<typeof estimateClash>>;
  oddsMode: "odds" | "power" | "off"; play: PlayStep | null; /** 연출 단계 번호 (바뀔 때마다 모션 재생) */ playKey: number; background: string | null; cutin: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 700 });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const wide = size.w >= 768;
  const padT = 60, padB = wide ? 236 : 220, padL = wide ? 90 : 4, padR = wide ? 300 : 4;
  // 지평선(뒤)에서 앞까지의 바닥. 뒤로 갈수록 좁아지고 작아진다 (카메라를 살짝 위에서 내려다보는 림버스 앵글)
  const floorTop = padT + (size.h - padT - padB) * 0.22, floorBot = size.h - padB;
  const fh = Math.max(140, floorBot - floorTop), fw = Math.max(240, size.w - padL - padR), cx = padL + fw / 2;
  const project = (u: number, v: number) => ({ x: cx + (u - 0.5) * fw * (0.6 + 0.4 * v), y: floorTop + v * fh, s: 0.72 + 0.4 * v });
  const slotOf = (u: Unit): [number, number] => { const side = state.units.filter((x) => x.side === u.side); const i = side.indexOf(u); const [su, sv] = FORMATION[i % FORMATION.length]!; return u.side === "ally" ? [su, sv] : [1 - su, sv]; };
  const foot = (u: Unit) => { const [su, sv] = slotOf(u); return project(su, sv); };
  const spriteH = (u: Unit) => Math.max(80, Math.min(fh * 0.62, 260)) * foot(u).s;
  const tokenD = (u: Unit) => Math.max(52, Math.min(fh * 0.24, 100)) * foot(u).s;
  const bodyH = (u: Unit) => (u.spriteUrl ? spriteH(u) : tokenD(u) + 6);
  const center = (u: Unit) => { const f = foot(u); return { x: f.x, y: f.y - bodyH(u) * 0.5 }; };
  const headY = (u: Unit) => foot(u).y - bodyH(u);
  const dieSize = (u: Unit) => Math.round(Math.max(26, Math.min(40, 34 * foot(u).s)));
  const diePos = (u: Unit, idx: number, n: number) => { const f = foot(u); const ds = dieSize(u); return { x: f.x + (idx - (n - 1) / 2) * (ds + 4), y: headY(u) - ds * 0.75 }; };
  const selected = selId ? state.units.find((u) => u.id === selId) : undefined;
  const slotsOf = (u: Unit) => state.slots.filter((s) => s.combatantId === u.id);
  // 의도 선 (림버스: 적 빨강, 내 공격 하늘 점선, 합 노랑)
  const lines = Object.entries(state.picks).map(([k, p]) => {
    const [uid, sl] = k.split(":"); const a = state.units.find((u) => u.id === uid); const t = state.units.find((u) => u.id === p.targetId);
    if (!a || !t || a.incapacitated) return null;
    const as = slotsOf(a); const ai = as.findIndex((s) => s.slot === Number(sl));
    const from = diePos(a, ai, as.length);
    let to = center(t);
    if (p.targetSlot !== undefined) { const ts = slotsOf(t); const ti = ts.findIndex((s) => s.slot === p.targetSlot); if (ti >= 0) to = diePos(t, ti, ts.length); }
    const mutual = Object.entries(state.picks).some(([k2, p2]) => k2.startsWith(t.id + ":") && p2.targetId === a.id);
    if (mutual && a.side === "enemy") return null;
    return { from, to, enemy: a.side === "enemy", mutual, protect: !!p.protect, key: k };
  }).filter(Boolean) as { from: Pos; to: Pos; enemy: boolean; mutual: boolean; protect: boolean; key: string }[];
  const arc = (a: Pos, b: Pos) => { const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; const d = Math.hypot(b.x - a.x, b.y - a.y); const cy = my - Math.min(160, 30 + d * 0.28); return `M ${a.x} ${a.y} Q ${mx} ${cy} ${b.x} ${b.y}`; };
  const overId = drag?.over;
  const playArc = play?.arc ? (() => { const a = state.units.find((x) => x.id === play.arc!.from), b = state.units.find((x) => x.id === play.arc!.to); if (!a || !b) return null; return { d: arc(center(a), center(b)), color: play.arc!.kind === "clash" ? "#ffd54a" : play.arc!.kind === "ally" ? "#37d5ff" : "#ff3b3b" }; })() : null;
  // 연출 카드: 쌍의 바깥쪽(아군 왼쪽, 적 오른쪽). 화면·순서 트래커 밖이면 안쪽으로
  const cardPos = (u: Unit, i: number) => { const c = center(u); const w = 176; const half = bodyH(u) * 0.45; const minL = wide ? padL : 8; let left = u.side === "ally" ? c.x - half - w : c.x + half; if (left < minL) left = c.x + half; if (left + w > size.w - 8) left = Math.max(minL, c.x - half - w); const top = Math.max(54, headY(u) - 100 - i * 4); return { left, top, width: w }; };
  const powerRange = (s: Skill) => { const lo = s.basePower + Math.min(0, s.coinPower) * s.coinCount, hi = s.basePower + Math.max(0, s.coinPower) * s.coinCount; return lo === hi ? `${hi}` : `${Math.max(0, lo)}-${hi}`; };
  const ordered = [...state.units].sort((a, b) => foot(a).y - foot(b).y); // 뒤 → 앞
  // 현재 연출 단계에서 이 유닛의 코드 모션 (공격·피격·회피·전투불능…)
  const cardOf = (u: Unit) => play?.cards.find((c) => c.unitId === u.id);
  const motionOf = (u: Unit) => cardOf(u)?.motion ?? "idle";
  // 쓴 스킬의 띠가 있으면 준비·공격·승리 단계에서 그 띠를 재생
  const animKeyOf = (c: { motion?: string; skillId?: string } | undefined) => c?.skillId && (c.motion === "attack" || c.motion === "ready" || c.motion === "win") ? `skill:${c.skillId}` : null;
  // 피격·전투불능 단계에서 화면 흔들림
  const shake = !!play?.cards.some((c) => c.motion === "hit" || c.motion === "down");

  return (
    <div ref={ref} className="b-canvas absolute inset-0 overflow-hidden" onClick={(e) => { if (play) return; if (e.target === e.currentTarget) onSelect(null); }}>
     <div key={shake ? `shake-${playKey}` : "still"} className={`absolute inset-0 ${shake ? "b-shake" : ""}`}>
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${background ?? BACKGROUNDS.underground})`, filter: "brightness(.78) saturate(.9)" }} />
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,.05) 28%, rgba(0,0,0,0) 55%, rgba(0,0,0,.75) 100%)" }} />
      {/* 바닥 조명: 진형 아래 타원 빛 */}
      <div className="pointer-events-none absolute" style={{ left: padL, width: fw, top: floorTop, height: fh, background: "radial-gradient(ellipse at 50% 60%, rgba(255,235,200,.10) 0%, rgba(255,235,200,.03) 45%, rgba(0,0,0,0) 70%)" }} />
      <svg className="absolute inset-0" width={size.w} height={size.h}>
        <defs>
          {[["red", "#ff3b3b"], ["cyan", "#37d5ff"], ["gold", "#ffd54a"], ["white", "#f5e6b5"]].map(([n, c]) => <marker key={n} id={`arr-${n}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill={c} /></marker>)}
        </defs>
        {/* 발밑 그림자 */}
        {ordered.map((u) => { const f = foot(u); const d = tokenD(u); return <ellipse key={`sh-${u.id}`} cx={f.x} cy={f.y} rx={d * 0.62} ry={d * 0.17} fill="rgba(0,0,0,.55)" />; })}
        {selected ? (() => { const f = foot(selected); const d = tokenD(selected); return <ellipse cx={f.x} cy={f.y} rx={d * 0.7} ry={d * 0.2} fill="none" stroke="#ffd54a" strokeWidth={2} className="b-pulse" />; })() : null}
        {lines.map((l) => { const color = l.mutual ? "#ffd54a" : l.enemy ? "#ff3b3b" : l.protect ? "#f5e6b5" : "#37d5ff"; const mk = l.mutual ? "gold" : l.enemy ? "red" : l.protect ? "white" : "cyan";
          return (
            <g key={l.key} opacity={play ? 0.18 : 1}>
              <path d={arc(l.from, l.to)} fill="none" stroke="rgba(0,0,0,.6)" strokeWidth={l.mutual ? 5 : 4} />
              <path d={arc(l.from, l.to)} fill="none" stroke={color} strokeWidth={l.mutual ? 2.6 : 2} strokeDasharray={l.enemy || l.mutual ? undefined : "7 5"} markerEnd={`url(#arr-${mk})`} />
              {l.mutual ? <g transform={`translate(${(l.from.x + l.to.x) / 2},${(l.from.y + l.to.y) / 2 - Math.min(160, 30 + Math.hypot(l.to.x - l.from.x, l.to.y - l.from.y) * 0.28) / 2})`}><circle r={11} fill="#0b0707" stroke="#ffd54a" /><text textAnchor="middle" dy="4" fontSize="11" fontWeight="700" fill="#ffd54a">합</text></g> : null}
            </g>
          ); })}
        {playArc ? (<g><path d={playArc.d} fill="none" stroke={playArc.color} strokeWidth={9} opacity={0.25} /><path d={playArc.d} fill="none" stroke="#fff" strokeWidth={3.5} opacity={0.9} /><path d={playArc.d} fill="none" stroke={playArc.color} strokeWidth={2} className="b-arc-flow" /></g>) : null}
      </svg>
      {/* 유닛 (뒤 → 앞 순서로 겹침) */}
      {ordered.map((u) => { const f = foot(u); const isSel = u.id === selId; const over = overId && overId.kind === "unit" && overId.unitId === u.id; const d = tokenD(u); const sh = spriteH(u);
        return (
          <div key={u.id} className={`absolute ${u.incapacitated ? "opacity-40 grayscale" : ""}`} style={{ left: f.x, top: f.y, width: 0, height: 0 }}>
            <button type="button" data-drop={u.side === targetSide ? `unit|${u.id}` : undefined}
              onPointerEnter={u.side === "enemy" ? () => onHover(u.id) : undefined} onPointerLeave={u.side === "enemy" ? () => onHover(null) : undefined}
              onClick={() => { if (draggedRef.current) return; if (u.side === targetSide && !u.incapacitated && onEnemyTap({ kind: "unit", unitId: u.id })) return; onSelect(isSel ? null : u.id); }} title={`${names[u.id]}${u.staggered ? " · 흐트러짐" : ""}`}
              className="absolute bottom-0 left-0 flex -translate-x-1/2 items-end justify-center" style={{ width: u.spriteUrl ? sh * 0.6 : d, height: u.spriteUrl ? sh : d }}>
              {u.spriteUrl ? (
                <span className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2">
                  <SdSprite src={u.spriteUrl} poses={u.spritePoses} anims={u.spriteAnims} animKey={animKeyOf(cardOf(u))} height={sh} flip={u.side === "enemy"} motion={motionOf(u)} motionKey={playKey} phase={(state.units.indexOf(u) % 5) * 0.4} className={over ? "brightness-125" : ""} />
                </span>
              ) : (
                <span className={`relative block overflow-hidden rounded-full ${over ? "ring-2 ring-red-400" : ""}`} style={{ width: d, height: d, border: `3px solid ${u.side === "ally" ? "rgba(217,179,91,.95)" : "rgba(224,75,82,.95)"}`, background: "rgba(10,6,6,.9)", boxShadow: "0 6px 14px rgba(0,0,0,.8)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {u.portraitUrl ? <img src={u.portraitUrl} alt="" draggable={false} className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-lg font-bold">{u.name.slice(0, 1)}</span>}
                </span>
              )}
              {over ? <span className="pointer-events-none absolute -inset-1 rounded-full" style={{ boxShadow: "0 0 0 2px #ff3b3b, 0 0 18px rgba(255,59,59,.8)" }} /> : null}
            </button>
            {/* 체력·이름 */}
            <div className="pointer-events-none absolute left-0 top-1 w-28 -translate-x-1/2 text-center">
              <span className="relative mx-auto block h-1.5 w-[70%] overflow-hidden bg-black/70"><span className="block h-full" style={{ width: `${Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100))}%`, background: u.side === "ally" ? "linear-gradient(90deg,#2f7a4a,#4fb374)" : "linear-gradient(90deg,#7a0f13,#e04b52)" }} />{thresholds.map((t) => <span key={t} className="absolute top-0 h-full w-px" style={{ left: `${t * 100}%`, background: u.staggerTriggered.includes(t) ? "#ffb347" : "rgba(255,255,255,.55)" }} />)}</span>
              <span className="block truncate text-[10px] leading-tight" style={{ textShadow: "0 1px 2px #000, 0 0 4px #000" }}>{names[u.id]}{u.side === "ally" && !u.sanityLocked ? <span className="text-sky-300"> {u.sanity > 0 ? "+" : ""}{u.sanity}</span> : null}</span>
            </div>
            {u.staggered ? <span className="pointer-events-none absolute left-0 -translate-x-1/2 bg-yellow-400 px-1 text-[9px] font-black text-black" style={{ top: -bodyH(u) * 0.5 }}>흐트러짐</span> : null}
            {isCorroded(u, state.round) ? <span className="pointer-events-none absolute left-0 -translate-x-1/2 bg-red-700 px-1 text-[9px] font-black text-white" style={{ top: -bodyH(u) * 0.5 }}>침식</span> : null}
          </div>
        ); })}
      {/* 속도 다이스 (머리 위) */}
      {ordered.filter((u) => !u.incapacitated).map((u) => { const ss = slotsOf(u); if (!ss.length) return null; const my = mine(u); const ds = dieSize(u);
        return ss.map((s, i) => { const key = slotKey(u.id, s.slot); const p = state.picks[key]; const sk = p ? u.skills.find((x) => x.id === p.skillId) : (my && loaded[key] ? u.skills.find((x) => x.id === loaded[key]) : undefined); const dp = diePos(u, i, ss.length);
          const over = overId?.kind === "slot" && overId.unitId === u.id && overId.slot === s.slot;
          const hidden = u.side === "enemy" && !isGm; const o = odds[key];
          return (
            <button key={key} type="button" data-drop={u.side === targetSide ? `slot|${u.id}|${s.slot}` : undefined} onPointerDown={my && sk && !p?.locked && state.phase === "select" ? startDrag({ kind: "die", unitId: u.id, slot: s.slot }) : undefined}
              onClick={() => { if (draggedRef.current) return; if (u.side === targetSide && onEnemyTap({ kind: "slot", unitId: u.id, slot: s.slot })) return; onSelect(u.id); }} title={`${names[u.id]} 속도 ${s.speed}${sk ? ` · ${hidden ? "???" : sk.name}${p ? ` → ${names[p.targetId]}` : " (대상 없음)"}` : ""}`}
              className={`absolute -translate-x-1/2 -translate-y-1/2 ${my && sk ? "touch-none cursor-grab" : ""}`} style={{ left: dp.x, top: dp.y, width: ds, height: ds }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ui(u.side === "enemy" ? "die-enemy-fill" : "slot-base")} alt="" draggable={false} className="absolute inset-0 h-full w-full" style={u.side === "enemy" ? { filter: "brightness(.55)" } : undefined} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ui(u.side === "enemy" ? "die-enemy" : "slot-empty")} alt="" draggable={false} className={`absolute inset-0 h-full w-full ${activeDie === key ? "drop-shadow-[0_0_6px_#fff]" : ""}`} />
              {sk ? <span className="absolute inset-[16%]"><SkillChip skill={sk} size={Math.round(ds * 0.68)} bare /></span> : null}
              {over ? <span className="absolute -inset-1 rounded-full" style={{ boxShadow: "0 0 0 2px #fff, 0 0 16px #ff3b3b" }} /> : null}
              <span className="absolute -left-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-sm px-0.5 text-[10px] font-black leading-none text-white" style={{ background: u.side === "enemy" ? "#b3161c" : "#2d6fb3", border: "1px solid #0008" }}>{s.speed}</span>
              {p?.protect ? <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-amber-200 px-0.5 text-[7px] font-black text-black">보호</span> : null}
              {o ? <span className={`absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm bg-black/80 px-1 text-[9px] font-bold ${oddsColor(o.label)}`}>{oddsMode === "power" ? `${o.aPower} : ${o.bPower}` : `${o.label} ${Math.round(o.winRate * 100)}%`}</span> : null}
              {!o && sk ? <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] tabular-nums" style={{ color: u.side === "enemy" ? "#ffb3b3" : "#bfe9ff", textShadow: "0 1px 2px #000" }}>{powerRange(sk)}</span> : null}
            </button>
          ); }); })}
      {/* 적 호버 카드: 마우스를 올린 사람 화면에만. 끌기·연출 중에는 숨김 */}
      {hoverId && !drag && !play ? (() => { const u = state.units.find((x) => x.id === hoverId); if (!u || u.side !== "enemy") return null; const c = center(u); const cw = 280; const half = bodyH(u) * 0.35; let left = c.x + half + 12; if (left + cw > size.w - 8) left = c.x - half - 12 - cw; const top = Math.max(56, Math.min(size.h - padB - 40, headY(u) - 24));
        return <div className="pointer-events-none absolute z-30" style={{ left, top, width: cw }}><EnemyHoverCard u={u} state={state} isGm={isGm} names={names} info={u.source.kind === "enemy" ? enemyInfo[u.source.id] : undefined} /></div>; })() : null}
      {/* 연출: 컷인(두 유닛) 또는 유닛 옆 카드 */}
      {play && cutin && play.cards.length === 2 ? <CutIn step={play} playKey={playKey} state={state} names={names} w={size.w} bottom={floorBot + 8} /> : null}
      {play && !(cutin && play.cards.length === 2) ? play.cards.map((cd, i) => { const u = state.units.find((x) => x.id === cd.unitId); if (!u) return null; const p = cardPos(u, i); const ally = u.side === "ally";
        return (
          <div key={`${cd.unitId}-${i}`} className="b-play-card pointer-events-none absolute z-20" data-tone={cd.tone} style={{ left: p.left, top: p.top, width: p.width, borderColor: ally ? "#c9a24a" : "#b3161c" }}>
            <div className="truncate px-2 pt-1 text-[10px] text-[#d9c08a]">{cd.title}</div>
            {cd.coins ? <div className="flex items-center justify-center gap-1 px-2 pt-1">{cd.coins.map((h, k) => <span key={k} className="flex flex-col items-center"><CoinIcon heads={h} size={22} /><span className="text-[9px] leading-none" style={{ color: h ? "#ffd54a" : "#9a8f86" }}>{h ? "앞" : "뒤"}</span></span>)}</div> : null}
            {cd.big ? <div className="px-2 text-center text-xl font-black leading-tight" style={{ color: cd.tone === "gold" ? "#ffd54a" : cd.tone === "red" ? "#ff5a5a" : cd.tone === "dim" ? "#8a8078" : "#fff" }}>{cd.big}</div> : null}
            {cd.sub ? <div className="px-2 pb-1 text-center text-[10px]" style={{ color: cd.tone === "dim" ? "#8a8078" : "#e9dcc2" }}>{cd.sub}</div> : <div className="pb-1" />}
          </div>
        ); }) : null}
     </div>
    </div>
  );
}

/* ---------- 합 컷인: 두 유닛이 가운데로 격돌하고, 합마다 코인을 던져 총 위력을 비교, 진 쪽 코인이 하나씩 깨진다 ---------- */
function CutIn({ step, playKey, state, names, w, bottom }: { step: PlayStep; playKey: number; state: CombatState; names: Record<string, string>; w: number; bottom: number }) {
  const [c0, c1] = step.cards as [PlayStep["cards"][number], PlayStep["cards"][number]];
  const u0 = state.units.find((u) => u.id === c0.unitId), u1 = state.units.find((u) => u.id === c1.unitId);
  if (!u0 || !u1) return null;
  // 왼쪽 = 아군 쪽
  const [L, R] = u0.side === "ally" || u1.side !== "ally" ? [{ u: u0, c: c0 }, { u: u1, c: c1 }] : [{ u: u1, c: c1 }, { u: u0, c: c0 }];
  const wide = w >= 768;
  const figH = Math.min(bottom * 0.62, wide ? 380 : 260);
  const clash = !!(L.c.clash && R.c.clash);
  const round = clash && L.c.power !== undefined && R.c.power !== undefined; // 격돌 단계 (코인 토스 → 위력 비교)
  const lWin = round && L.c.power! > R.c.power!, rWin = round && R.c.power! > L.c.power!;
  const skillOf = (u: Unit, name?: string) => (name ? u.skills.find((s) => s.name === name) : undefined);
  const side = (p: { u: Unit; c: PlayStep["cards"][number] }, pos: "l" | "r") => {
    const sk = skillOf(p.u, p.c.skill); const tone = p.c.tone;
    const color = tone === "gold" ? "#ffd54a" : tone === "red" ? "#ff5a5a" : tone === "dim" ? "#8a8078" : "#fff";
    const glow = tone === "gold" ? "drop-shadow(0 0 26px rgba(255,213,74,.75))" : tone === "red" ? "drop-shadow(0 0 20px rgba(255,59,59,.6))" : tone === "dim" ? "grayscale(.6) brightness(.7)" : "drop-shadow(0 10px 20px rgba(0,0,0,.8))";
    const lost = round && tone === "dim"; // 이번 합에서 코인을 잃은 쪽
    const x = pos === "l" ? (round ? (wide ? "35%" : "28%") : (wide ? "27%" : "22%")) : (round ? (wide ? "65%" : "72%") : (wide ? "73%" : "78%"));
    const anim = round ? (pos === "l" ? "b-cut-clash-l" : "b-cut-clash-r") : (pos === "l" ? "b-cut-fig-l" : "b-cut-fig-r");
    return (
      <div key={`${p.u.id}-${round ? playKey : "s"}`} className={`absolute bottom-0 flex flex-col items-center ${anim}`} style={{ left: x, transform: "translateX(-50%)", width: 0, transition: "left .3s" }}>
        <div className="flex flex-col items-center" style={{ filter: glow, transition: "filter .25s" }}>
          {p.u.spriteUrl ? (
            <SdSprite src={p.u.spriteUrl} poses={p.u.spritePoses} anims={p.u.spriteAnims} animKey={p.c.skillId && (p.c.motion === "attack" || p.c.motion === "ready" || p.c.motion === "win") ? `skill:${p.c.skillId}` : null} height={figH} flip={p.u.side === "enemy"} motion={p.c.motion ?? "idle"} motionKey={playKey} phase={pos === "l" ? 0 : 1} shadow={false} />
          ) : (
            <span className="block overflow-hidden rounded-full" style={{ width: figH * 0.42, height: figH * 0.42, border: `4px solid ${p.u.side === "ally" ? "#d9b35b" : "#e04b52"}`, background: "rgba(10,6,6,.92)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.u.portraitUrl ? <img src={p.u.portraitUrl} alt="" draggable={false} className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-4xl font-bold">{p.u.name.slice(0, 1)}</span>}
            </span>
          )}
        </div>
        {/* 이름 플레이트 */}
        <div className="b-plate-w mt-1 flex h-8 min-w-[7rem] items-center justify-center whitespace-nowrap px-5 text-sm">{names[p.u.id]}</div>
        {/* 스킬 · 남은 코인 · 이번 토스 */}
        <div className="b-cut-skill mt-2 flex w-[11rem] flex-col items-center gap-1 px-1 py-1 md:w-[13rem]" data-tone={tone}>
          <div className="flex items-center gap-2">
            {sk ? <SkillChip skill={sk} size={40} /> : null}
            <div className="min-w-0"><div className="truncate text-[11px] text-[#d9c08a]">{p.c.title}</div>{p.c.skill ? <div className="truncate text-xs font-semibold">{p.c.skill}</div> : null}</div>
          </div>
          {clash && p.c.coinsTotal ? (
            <div className="flex items-center justify-center gap-1" title="남은 코인">
              {Array.from({ length: p.c.coinsTotal }).map((_, k) => { const left = p.c.coinsLeft ?? p.c.coinsTotal!; const gone = k >= left; const justLost = lost && k === left;
                return <span key={`${k}-${gone}`} className={`relative inline-block ${justLost ? "b-coin-lose" : gone ? "b-coin-gone" : ""}`} style={{ width: 20, height: 20 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {gone ? <img src={ui("coin-break")} alt="깨진 코인" className="h-full w-full" draggable={false} /> : <CoinIcon heads size={20} />}
                </span>; })}
            </div>
          ) : null}
          {p.c.coins ? <div className="flex items-center justify-center gap-1.5" style={{ perspective: 300 }}>{p.c.coins.map((h, k) => <span key={`${step.header}-${k}`} className="b-coin-flip flex flex-col items-center" style={{ animationDelay: `${k * 140}ms` }}><CoinIcon heads={h} size={24} /><span className="text-[9px] leading-none" style={{ color: h ? "#ffd54a" : "#9a8f86" }}>{h ? "앞" : "뒤"}</span></span>)}</div> : null}
          {!round && p.c.big ? <div key={`${step.header}-big`} className="b-num-pop text-3xl font-black leading-none tracking-wide md:text-4xl" style={{ color, textShadow: "0 2px 0 #000, 0 0 18px rgba(0,0,0,.8)" }}>{p.c.big}</div> : null}
          {!round && p.c.sub ? <div className="text-center text-[11px]" style={{ color: tone === "dim" ? "#8a8078" : "#e9dcc2" }}>{p.c.sub}</div> : null}
        </div>
      </div>
    );
  };
  const powerTop = Math.max(40, bottom * 0.26);
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 60%, rgba(0,0,0,.35) 0%, rgba(0,0,0,.8) 70%)" }} />
      <div className="absolute inset-x-0 top-0" style={{ height: bottom }}>
        {side(L, "l")}
        {side(R, "r")}
        {round ? (<>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={`imp-${playKey}`} src={ui("battle-star")} alt="" className="b-cut-impact h-40 w-40 md:h-60 md:w-60" style={{ top: bottom * 0.58 }} draggable={false} />
          <div key={`pow-${playKey}`} className="b-num-pop absolute left-1/2 flex -translate-x-1/2 items-center gap-5 md:gap-8" style={{ top: powerTop }}>
            <span className="b-num text-6xl leading-none md:text-8xl" style={{ color: lWin ? "#ffd54a" : rWin ? "#8a8078" : "#fff", textShadow: "0 3px 0 #000, 0 0 24px rgba(0,0,0,.9)" }}>{L.c.power}</span>
            <span className="b-title text-3xl text-white/70 md:text-5xl">{lWin ? "▶" : rWin ? "◀" : "="}</span>
            <span className="b-num text-6xl leading-none md:text-8xl" style={{ color: rWin ? "#ffd54a" : lWin ? "#8a8078" : "#fff", textShadow: "0 3px 0 #000, 0 0 24px rgba(0,0,0,.9)" }}>{R.c.power}</span>
          </div>
        </>) : (
          <div className="b-title absolute left-1/2 -translate-x-1/2 text-5xl italic text-white/85 md:text-7xl" style={{ top: Math.max(60, bottom * 0.35), textShadow: "0 0 20px rgba(0,0,0,.9)" }}>VS</div>
        )}
      </div>
    </div>
  );
}

function DragGhost({ drag, state, loaded, dieFor }: { drag: { payload: DragPayload; x: number; y: number }; state: CombatState; loaded: Record<string, string>; dieFor: (unitId: string) => number | undefined }) {
  const unit = state.units.find((u) => u.id === drag.payload.unitId); if (!unit) return null;
  const slot = drag.payload.kind === "die" ? drag.payload.slot : dieFor(unit.id);
  const skillId = drag.payload.kind === "skill" ? drag.payload.skillId : slot !== undefined ? (loaded[slotKey(unit.id, slot)] ?? state.picks[slotKey(unit.id, slot)]?.skillId) : undefined;
  const skill = unit.skills.find((s) => s.id === skillId);
  return <div className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2" style={{ left: drag.x, top: drag.y }}>{skill ? <SkillChip skill={skill} size={52} glow /> : null}</div>;
}

/* ---------- 스킬 아이콘: 림버스 칠각 프레임 + 죄악 색 ---------- */
export function SkillChip({ skill, size, glow, selected, bare }: { skill: Skill; size: number; glow?: boolean; selected?: boolean; bare?: boolean }) {
  const color = SIN_COLOR[skill.sin] ?? "#555";
  const mask = `url(${ui("chip-mask")})`;
  return (
    <span className="relative inline-block shrink-0 align-middle" style={{ width: size, height: size, filter: glow ? `drop-shadow(0 0 10px ${color})` : undefined }}>
      <span className="absolute inset-[8%]" style={{ background: `radial-gradient(circle at 40% 30%, ${color} 0%, ${color}cc 55%, #0a0505 100%)`, WebkitMaskImage: mask, maskImage: mask, WebkitMaskSize: "100% 100%", maskSize: "100% 100%" }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {!bare || skill.ego ? <img src={ui(skill.ego ? "chip-ego" : "chip-frame")} alt="" draggable={false} className={skill.ego ? "absolute -inset-[4%] h-[108%] w-[108%]" : "absolute inset-0 h-full w-full"} /> : null}
      <span className="absolute inset-0 flex items-center justify-center">{skill.kind === "defense" ? <DefenseIcon kind={skill.defenseKind ?? "guard"} size={Math.round(size * 0.5)} /> : <DamageIcon type={skill.damageType} size={Math.round(size * 0.5)} />}</span>
      {size >= 34 ? <span className="absolute -right-1 -top-1"><SinIcon sin={skill.sin} size={Math.round(size * 0.36)} /></span> : null}
      {selected ? <span className="absolute -inset-1 rounded-full" style={{ boxShadow: "0 0 0 2px #ffd54a, 0 0 12px #ffd54a" }} /> : null}
    </span>
  );
}

/* ---------- 상태 바 (선택한 내 유닛) ---------- */
function StatusBar({ u, state, rules, protect, setProtect, onRedraw, hint }: { u: Unit; state: CombatState; rules: RuleConfig; protect: boolean; setProtect: (v: boolean) => void; onRedraw: () => void; hint: string }) {
  const corroded = isCorroded(u, state.round);
  const protectable = u.side === "ally" && Object.entries(state.picks).some(([k, p]) => { const a = state.units.find((x) => x.id === k.split(":")[0]); const v = state.units.find((x) => x.id === p.targetId); return !!a && a.side === "enemy" && !!v && v.side === "ally" && v.id !== u.id && !v.incapacitated && (!state.grid || dist(v.pos, u.pos) <= rules.protectRange); });
  return (
    <div className="b-plate-d pointer-events-auto flex max-w-[min(96vw,52rem)] flex-wrap items-center gap-x-3 gap-y-1 px-5 py-1.5 text-xs" style={{ minHeight: 36 }}>
      <b className="b-gold">{u.name}</b>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <span className="flex items-center gap-1 tabular-nums"><img src={ui("ico-heart")} alt="체력" className="h-3.5" />{u.hp}/{u.maxHp}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {!u.sanityLocked ? <span className="flex items-center gap-1 tabular-nums"><img src={ui("ico-mind")} alt="정신력" className="h-3.5" />{u.sanity > 0 ? "+" : ""}{u.sanity}</span> : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {state.grid ? <span className="flex items-center gap-1 tabular-nums"><img src={ui("ico-boot")} alt="이동" className="h-3.5" />남은 이동 <b className="b-gold">{u.move ?? 0}</b></span> : null}
      <span className="b-muted">빛 {u.light}</span>
      <StaggerPips u={u} rules={rules} compact />
      {protectable && state.grid ? <label className={`flex cursor-pointer items-center gap-1 ${protect ? "text-amber-200" : "b-muted"}`} title="켜고 아군을 노리는 적 다이스에 스킬을 놓으면, 빛을 쓰고 자리를 바꿔 대신 받습니다"><input type="checkbox" checked={protect} onChange={(e) => setProtect(e.target.checked)} />보호</label> : null}
      {!corroded && u.light >= rules.lightRedrawCost ? <button type="button" onClick={onRedraw} className="b-gold hover:underline">빛 {rules.lightRedrawCost}: 손패 교체</button> : null}
      <span className="b-muted ml-auto hidden sm:inline">{corroded ? "침식 상태: 자동 조종" : u.staggered ? "흐트러짐" : hint}</span>
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
    const used = s.ego ? (unit.egoUsed?.[s.id] ?? 0) : 0;
    // 같은 E.G.O는 한 라운드에 한 번 (다른 슬롯에서 이미 골랐으면 막음)
    const egoElsewhere = s.ego ? Object.entries(state.picks).some(([k, p]) => k.startsWith(unit.id + ":") && k !== key && p.skillId === s.id) : false;
    const blocked = corroded || (s.ego ? used >= s.ego.usesPerCombat || egoElsewhere : false); const on = cur === s.id;
    return (
      <button key={`${s.id}-${idx}`} type="button" disabled={blocked} onPointerDown={blocked ? undefined : startDrag({ kind: "skill", unitId: unit.id, skillId: s.id })} onClick={() => onPick(s)}
        title={`${s.name} · ${SIN_LABEL[s.sin]} · ${powerText(s)}${s.effectText ? `\n${s.effectText}` : ""}`}
        className={`relative flex w-[4.6rem] shrink-0 touch-none cursor-grab flex-col items-center gap-0.5 px-1 py-1 text-[10px] disabled:cursor-not-allowed disabled:opacity-35 ${on ? "b-pick-on" : "hover:bg-white/5"}`}>
        {idx !== null ? <span className="absolute left-1 top-0.5 flex h-4 w-4 items-center justify-center rounded-sm bg-black/80 text-[10px] font-black text-amber-300 ring-1 ring-amber-300/60">{idx}</span> : null}
        <SkillChip skill={s} size={44} selected={on} />
        <span className="w-full truncate text-center leading-tight">{s.name}</span>
        <span className="b-muted flex items-center gap-0.5 tabular-nums">{s.basePower}{s.coinPower >= 0 ? "+" : ""}{s.coinPower}<span className="inline-flex">{Array.from({ length: Math.min(s.coinCount, 6) }).map((_, j) => <CoinIcon key={j} heads size={8} />)}</span></span>
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

/* ---------- 하단 스킬 띠 (원작 배치): 유닛마다 세로 한 열 — 위 다이스(고른 스킬) → 속도 숫자 → 아래 초상(칠각 게이지)+체력·정신력. 이름·대상 글자는 두지 않는다 ---------- */
function SkillStrip({ units, state, names, loaded, activeDie, picker, selId, odds, onDie, onPortrait, onCancel, onReroll, startDrag }: {
  units: Unit[]; state: CombatState; names: Record<string, string>; loaded: Record<string, string>; activeDie: string | null; picker: string | null; selId: string | null; odds: Record<string, ReturnType<typeof estimateClash>>;
  onDie: (u: Unit, slot: number) => void; onPortrait: (u: Unit) => void; onCancel: (u: Unit, slot: number) => void; /** GM: 이 적의 선택을 무작위로 다시 */ onReroll?: (u: Unit) => void; startDrag: (p: DragPayload) => (e: RPointerEvent) => void;
}) {
  // 원작 하단 띠(사용자가 보낸 실제 게임 화면): 양끝에 기어 고리와 기계 팔, 가운데 금 레일 위에 속도 숫자, 그 아래 주황 칠각 초상(체력 주황 숫자·정신력 파란 원).
  // 원작의 위쪽 스킬 더미는 두지 않고(사용자 요청) 다이스(고른 스킬)만 둔다.
  return (
    <div className="b-strip2 relative flex min-w-0 max-w-[calc(100vw-7rem)] items-end md:max-w-[calc(100vw-15rem)]">
      {/* 왼쪽 끝: 기어 고리 + 기둥 */}
      <div className="pointer-events-none relative hidden w-20 shrink-0 self-stretch md:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ui("arm-l")} alt="" className="absolute bottom-0 left-5 h-[7.5rem] opacity-95" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ui("ring-dark")} alt="" className="b-ring absolute left-1 top-1 h-[4.4rem] w-[4.4rem]" draggable={false} />
      </div>
      <div className="b-strip-rail relative flex items-end gap-0.5 overflow-x-auto px-3 pb-2 pt-2 md:px-4">
        {units.map((u) => {
          const slots = state.slots.filter((s) => s.combatantId === u.id); const corroded = isCorroded(u, state.round); const enemy = u.side === "enemy";
          const firstPick = slots.map((s) => state.picks[slotKey(u.id, s.slot)]?.skillId ?? loaded[slotKey(u.id, s.slot)]).find(Boolean);
          const barColor = firstPick ? SIN_COLOR[u.skills.find((x) => x.id === firstPick)?.sin ?? ""] : undefined;
          return (
            <div key={u.id} className="relative flex w-[6.2rem] shrink-0 flex-col items-center" data-side={u.side}
              title={`${names[u.id]} · 체력 ${u.hp}/${u.maxHp}${u.sanityLocked ? "" : ` · 정신력 ${u.sanity}`}`}>
              {/* 위: 다이스(고른 스킬), 그 밑 금 레일 위의 속도 숫자 */}
              <div className="flex items-end gap-1">
                {slots.length === 0 ? <div className="flex flex-col items-center"><span className="b-muted flex h-14 w-14 items-center justify-center text-center text-[10px] leading-tight" title={u.staggered ? "흐트러짐" : "행동 슬롯 없음"}>{u.staggered ? "흐트러짐" : "행동 불가"}</span><span className="b-speed2 b-num mt-1 text-[19px] leading-none">–</span></div> : null}
                {slots.map((s) => { const key = slotKey(u.id, s.slot); const p = state.picks[key]; const skId = p?.skillId ?? loaded[key]; const sk = skId ? u.skills.find((x) => x.id === skId) : undefined; const active = key === activeDie; const open = key === picker; const o = odds[key];
                  return (
                    <div key={key} className="flex flex-col items-center">
                      <div className="relative">
                        {active || open ? <span className="b-slot-glow" data-tone={open ? "cyan" : "gold"} /> : null}
                        <button type="button" onPointerDown={sk && !p?.locked && !corroded ? startDrag({ kind: "die", unitId: u.id, slot: s.slot }) : undefined} onClick={() => onDie(u, s.slot)}
                          title={sk ? `${sk.name}${p ? ` → ${names[p.targetId]}${p.targetSlot !== undefined ? (p.protect ? " (보호)" : " (가로채기/합)") : ""}` : " · 상대에게 끌어 놓거나 상대를 누르세요"}` : "누르면 스킬을 고릅니다"}
                          data-side={u.side} className={`b-slot h-14 w-14 touch-none ${sk ? "" : "b-slot-empty"} ${sk && !p?.locked ? "cursor-grab" : ""}`}>
                          {sk ? <SkillChip skill={sk} size={46} bare /> : null}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {p?.locked ? <img src={ui("ico-lock")} alt="확정" className="absolute -right-1 -top-1 h-4" /> : null}
                        </button>
                        {(p && !p.locked) || (!p && loaded[key]) ? <button type="button" onClick={() => onCancel(u, s.slot)} className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-black text-[9px] text-white/80 ring-1 ring-white/30 hover:bg-red-700" title="선택 취소">✕</button> : null}
                        {p && !o ? <span className="pointer-events-none absolute -bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-sky-300 shadow-[0_0_6px_#7dd3fc]" title="대상 지정됨" /> : null}
                        {o ? <span className={`pointer-events-none absolute -bottom-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm bg-black/85 px-1 text-[9px] font-bold ${oddsColor(o.label)}`}>{Math.round(o.winRate * 100)}%</span> : null}
                      </div>
                      <span className="b-speed2 b-num mt-1 text-[19px] leading-none">{s.speed}</span>
                    </div>
                  ); })}
              </div>
              {/* 아래: 주황 칠각 초상 (적은 붉게) + 체력(주황)·정신력(파란 원), 왼쪽 가는 띠는 고른 스킬의 죄악색 */}
              <button type="button" onClick={() => onPortrait(u)} className={`b-hept relative mt-1 h-[5.4rem] w-[5.4rem] ${u.id === selId ? "b-hept-sel" : ""}`} data-side={u.side}>
                <span className="b-hept-face">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {u.portraitUrl ? <img src={u.portraitUrl} alt="" className="h-full w-full object-cover" draggable={false} /> : <span className="flex h-full items-center justify-center text-lg font-bold">{u.name.slice(0, 1)}</span>}
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ui("hept-orange")} alt="" className="b-hept-frame" draggable={false} />
                {barColor ? <span className="absolute bottom-[22%] left-0 top-[22%] w-[3px] rounded-full" style={{ background: barColor, boxShadow: `0 0 6px ${barColor}` }} /> : null}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {u.staggered ? <img src={ui("slot-break")} alt="흐트러짐" className="absolute inset-0 h-full w-full opacity-75" draggable={false} /> : null}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {enemy ? <img src={ui("tag-enemy")} alt="적" className="absolute -top-1 left-1/2 h-3.5 -translate-x-1/2" draggable={false} /> : null}
                <span className="b-num absolute -bottom-1 left-0.5 text-[19px] leading-none text-[#ff8a3c]" style={{ textShadow: "0 1px 0 #000, 0 0 6px #000" }}>{u.hp}</span>
                {!u.sanityLocked ? <span className="b-num absolute -bottom-1.5 -right-1 flex h-7 w-7 items-center justify-center rounded-full text-[14px] leading-none text-white" style={{ background: "#1f5fb8", border: "2px solid #9fd0ff", textShadow: "0 1px 1px #000" }}>{u.sanity}</span> : null}
              </button>
              {enemy && onReroll && !corroded ? <button type="button" onClick={() => onReroll(u)} className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-full bg-black/80 text-[12px] leading-none text-[#ffd54a] ring-1 ring-[#ffd54a]/60 hover:bg-red-800" title="이 적의 선택을 무작위로 다시 (확정된 것은 유지)">⟳</button> : null}
            </div>
          );
        })}
      </div>
      {/* 오른쪽 끝: 기어 고리 + 집게 팔 */}
      <div className="pointer-events-none relative hidden w-20 shrink-0 self-stretch md:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ui("arm-r")} alt="" className="absolute bottom-1 right-2 h-[6.5rem] opacity-95" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ui("ring-dark")} alt="" className="b-ring absolute right-1 top-1 h-[4.4rem] w-[4.4rem]" draggable={false} />
      </div>
    </div>
  );
}

/* ---------- 라운드 버튼 (FVTT END 느낌 + 림버스 기어) ---------- */
/* ---------- 라운드 버튼: 원작 붉은 팔각 + 청동 테 + 뒤에 도는 주황 기어 ---------- */
function RoundButton({ isGm, phase, winner, pending, unpicked, playing, onStart, onClose }: { isGm: boolean; phase: CombatState["phase"]; winner: CombatState["winner"]; pending: boolean; unpicked: number; playing: boolean; onStart: () => void; onClose: () => void }) {
  const body = (txt: ReactNode, sub: ReactNode, dim?: boolean, spin = true) => (<>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {spin ? <img src={ui("start-gear")} alt="" className={`b-start-gear ${pending ? "b-spin-fast" : "b-spin"}`} draggable={false} /> : null}
    <span className="b-start-oct" />
    <span className="b-start-ring" />
    <span className="relative flex h-full w-full flex-col items-center justify-center text-white">
      <span className="b-title text-lg leading-none drop-shadow-[0_1px_2px_#000] md:text-xl">{txt}</span>
      <span className="mt-1 text-[9px] leading-none drop-shadow-[0_1px_2px_#000] md:text-[10px]">{sub}</span>
    </span>
    {dim ? null : null}
  </>);
  const size = "h-20 w-20 md:h-24 md:w-24";
  // 연출(합 등)은 저절로 진행된다. 버튼은 돌아가는 기어로 "진행 중"만 보여준다 (스페이스로 빨리 넘길 수는 있음)
  if (playing) return <div className={`b-start5 ${size}`} data-dim="1" title="연출 진행 중 (스페이스: 빨리 넘기기)">{body("PLAY", "연출 중", true)}</div>;
  // 아군 슬롯이 하나라도 비어 있으면 START 는 꺼진다 (사용자: "미선택" 글 대신 선택이 안 되면 활성화 안 되게)
  if (isGm && phase === "select") { const wait = unpicked > 0; return <button type="button" disabled={pending || wait} onClick={onStart} data-dim={wait ? "1" : undefined} className={`b-start5 ${size} transition-transform hover:scale-105 disabled:scale-100`} title={wait ? "아군이 모두 스킬을 고르면 진행할 수 있습니다" : "라운드 진행"}>{body(pending ? "…" : "START", pending ? "처리 중" : wait ? "선택 대기" : "라운드 진행", wait)}</button>; }
  if (phase === "ended") return <button type="button" onClick={onClose} className={`b-start5 ${size}`} data-dim={winner === "ally" ? undefined : "1"} title="닫기">{body(winner === "ally" ? "WIN" : "LOSE", "닫기", winner !== "ally", false)}</button>;
  return <div className={`b-start5 ${size}`} data-dim="1" title="GM이 라운드를 진행합니다">{body("WAIT", "GM 진행 대기", true)}</div>;
}

/* ---------- 적 호버 카드 (마우스를 올린 사람 화면에만): 고른 스킬 · 스킬 효과 · 키워드 ---------- */
function EnemyHoverCard({ u, state, isGm, names, info }: { u: Unit; state: CombatState; isGm: boolean; names: Record<string, string>; info?: EnemyInfo }) {
  const hidden = !isGm; // 플레이어에게 적 스킬 이름·효과는 사용된 뒤 도감으로 공개
  const picks = state.slots.filter((s) => s.combatantId === u.id).map((s) => ({ s, p: state.picks[slotKey(u.id, s.slot)] }));
  const skills = picks.map(({ p }) => (p ? u.skills.find((x) => x.id === p.skillId) : undefined));
  const texts = hidden ? [] : skills.flatMap((sk) => (sk ? [sk.effectText ?? "", ...(sk.effects ?? []).map(describeEffect)] : [])).filter(Boolean);
  const keywords = hidden ? [] : Array.from(new Map(GLOSSARY_TERMS.filter((t) => texts.some((x) => x.includes(t.term))).map((t) => [t.entry.id, t.entry])).values()).slice(0, 4);
  const threatTag = info?.threat ? THREAT_TAG[info.threat] : undefined;
  return (
    <div className="b-pane p-1 text-[11px]">
      <div className="flex items-center gap-1.5 px-1 pb-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ui("tag-enemy")} alt="적" className="h-4" draggable={false} />
        <b className="truncate text-xs">{names[u.id]}</b>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {threatTag ? <img src={ui(threatTag)} alt={info!.threat} className="h-3.5" draggable={false} /> : null}
      </div>
      {picks.length === 0 ? <div className={`px-1 pb-1 ${u.staggered ? "text-amber-200" : "b-muted"}`}>{u.staggered ? "흐트러짐" : "행동 슬롯 없음"}</div> : picks.map(({ s, p }, i) => { const sk = skills[i];
        return (
          <div key={s.slot} className="flex items-center gap-2 px-1 py-1">
            <span className="b-num w-5 text-center text-base text-red-300">{s.speed}</span>
            {sk ? <SkillChip skill={sk} size={40} /> : <span className="b-slot b-slot-empty h-10 w-10" data-side="enemy" />}
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{sk ? (hidden ? "???" : sk.name) : "미선택"}</div>
              {sk && !hidden ? <div className="b-muted flex items-center gap-1 tabular-nums">{powerText(sk)}<span className="inline-flex">{Array.from({ length: Math.min(sk.coinCount, 8) }).map((_, j) => <CoinIcon key={j} heads size={9} />)}</span></div> : null}
              {p ? <div className="b-gold truncate">→ {names[p.targetId]}{p.targetSlot !== undefined ? " 다이스" : ""}</div> : null}
            </div>
          </div>
        ); })}
      {texts.length ? (
        <div className="mt-1">
          <div className="b-head-plate px-2 py-0.5 text-[10px] font-bold" data-tone="red">스킬 효과</div>
          <div className="space-y-0.5 px-1 py-1">{texts.map((t, i) => <div key={i}><KeywordText text={t} /></div>)}</div>
        </div>
      ) : hidden && skills.some(Boolean) ? <div className="b-muted px-1 pb-1 text-[10px]">스킬 이름·효과는 사용된 뒤 도감에 공개됩니다</div> : null}
      {keywords.length ? (
        <div className="mt-1">
          <div className="b-head-plate px-2 py-0.5 text-[10px] font-bold">키워드</div>
          <div className="px-1 py-1">{keywords.map((k) => <div key={k.id} className="py-0.5"><b className="b-gold">{k.term}</b> <span className="b-muted">{k.short}</span></div>)}</div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- 적 정보 패널 (적을 누른 사람 화면에만, 왼쪽 큰 틀): 이름 · 체력 · 정신력, 요약(스킬 아이콘+코인) / 스킬 / 기믹 / 상태·내성 ---------- */
function EnemyPanel({ u, state, isGm, names, rules, campaignId, combatId, onApply, onClose, info }: { u: Unit; state: CombatState; isGm: boolean; names: Record<string, string>; rules: RuleConfig; campaignId: string; combatId: string; onApply: (s: CombatState) => void; onClose: () => void; info?: EnemyInfo }) {
  const hide = !isGm;
  const [tab, setTab] = useState<"sum" | "skills" | "gimmick" | "status">("sum");
  const [edit, setEdit] = useState(false);
  const [revealing, startReveal] = useTransition();
  const router = useRouter();
  const hpPct = Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100));
  const attacks = u.skills.filter((s) => s.kind === "attack" && !s.ego), defense = u.skills.filter((s) => s.kind === "defense" && !s.ego);
  const gimmicks = info ? (isGm ? info.gimmicks : info.gimmicks.filter((g) => info.revealed.includes(g.id))) : [];
  const hiddenGimmicks = info && !isGm ? info.gimmicks.length - gimmicks.length : 0;
  const enemyId = u.source.kind === "enemy" ? u.source.id : null;
  const statuses = (Object.entries(u.statuses) as [StatusId, number][]).filter(([, v]) => v > 0);
  const threatTag = info?.threat ? THREAT_TAG[info.threat] : undefined;
  const corroded = isCorroded(u, state.round);
  const chipBig = (s: Skill) => (
    <div key={s.id} className="flex flex-col items-center gap-1" title={hide ? "미공개 스킬" : `${s.name} · ${powerText(s)}${s.effectText ? `\n${s.effectText}` : ""}`}>
      <div className="relative mt-2">
        <SkillChip skill={s} size={60} />
        <span className="b-num absolute -left-2 top-1/2 -translate-y-1/2 text-2xl text-white" style={{ textShadow: "0 1px 0 #000, 0 0 6px #000" }}>{hide ? "?" : s.basePower}</span>
        <span className="b-num absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-sm px-1 text-[13px] leading-tight text-white" style={{ background: SIN_COLOR[s.sin], border: "1px solid #0008", textShadow: "0 1px 1px #000" }}>{hide ? "?" : `${s.coinPower >= 0 ? "+" : ""}${s.coinPower}`}</span>
      </div>
      <span className="flex items-center justify-center gap-0.5">{Array.from({ length: Math.min(s.coinCount, 8) }).map((_, j) => <CoinIcon key={j} heads size={11} />)}</span>
      {!hide ? <span className="w-16 truncate text-center text-[10px]">{s.name}</span> : null}
    </div>
  );
  const tabBtn = (k: typeof tab, label: string) => <button key={k} type="button" className={`b-tabx ${tab === k ? "b-tabx-on" : ""}`} onClick={() => setTab(k)}>{label}</button>;
  const resistCell = (icon: ReactNode, r: Resistance, label: string) => (
    <span key={label} className="flex items-center gap-1" title={label}>{icon}<span className="flex flex-col leading-tight"><span className={r === "weak" || r === "fatal" ? "text-red-300" : r === "normal" ? "" : "text-sky-200"}>{RESIST_LABEL[r]}</span><span className="b-muted text-[9px]">[{RESIST_MULT[r]}]</span></span></span>
  );
  return (
    <div className="b-card text-xs" data-side="enemy">
      <div className="flex items-start gap-2 px-1 pt-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ui("tag-enemy")} alt="적" className="mt-1.5 h-5" draggable={false} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {threatTag ? <img src={ui(threatTag)} alt={info!.threat} title={info!.threat} className="mt-1.5 h-5" draggable={false} /> : null}
        <h2 className="font-title min-w-0 flex-1 truncate text-2xl leading-tight" style={{ color: "#ff5a3c", textShadow: "0 2px 0 #000, 0 0 14px rgba(255,60,30,.45)" }}>{names[u.id]}</h2>
        <button type="button" onClick={onClose} className="b-muted hover:text-white">✕</button>
      </div>
      <div className="mt-2 flex items-center gap-3 px-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <span className="flex shrink-0 items-center gap-1 text-[12px]"><img src={ui("ico-heart")} alt="" className="h-4" />체력</span>
        <div className="relative h-3 min-w-0 flex-1 bg-black/70">
          <div className="h-full" style={{ width: `${hpPct}%`, background: "linear-gradient(90deg,#7a0f13,#e04b52)" }} />
          {rules.staggerThresholds.map((t, i) => <span key={i} className="absolute top-0 h-full w-px bg-amber-200/80" style={{ left: `${t * 100}%` }} title={`흐트러짐 ${Math.round(t * 100)}%`} />)}
        </div>
        <span className="b-num shrink-0 text-base text-[#ffb08a]">{hide ? `${Math.round(hpPct)}%` : `${u.hp}/${u.maxHp}`}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {!u.sanityLocked ? <span className="flex shrink-0 items-center gap-1 text-[12px]"><img src={ui("ico-mind")} alt="" className="h-4" />정신력 <span className="b-num flex h-7 w-7 items-center justify-center rounded-full text-sm text-white" style={{ background: "#1f5fb8", border: "2px solid #9fd0ff" }}>{u.sanity}</span></span> : null}
      </div>
      <div className="b-muted mt-1 flex flex-wrap gap-x-2 px-1 text-[10px]">
        <StaggerPips u={u} rules={rules} />
        {u.incapacitated ? <Keyword id="down">전투불능</Keyword> : corroded ? <Keyword id="corrosion" className="text-red-400">침식</Keyword> : u.staggered ? <Keyword id="stagger">흐트러짐</Keyword> : null}
        {state.grid ? <span>이동 {u.move ?? 0}</span> : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1 px-1">
        {tabBtn("sum", "요약")}{tabBtn("skills", "스킬")}{tabBtn("gimmick", gimmicks.length || hiddenGimmicks ? `기믹 ${gimmicks.length}${hiddenGimmicks ? `+${hiddenGimmicks}` : ""}` : "기믹")}{tabBtn("status", "상태·내성")}
        {isGm ? <span className="ml-auto flex flex-wrap gap-1">
          {enemyId ? <Link href={`/campaigns/${campaignId}/enemies/${enemyId}`} target="_blank" className="b-btn text-[10px]">도감</Link> : null}
          {state.phase !== "ended" ? <button type="button" onClick={() => setEdit(!edit)} className="b-btn text-[10px]">수치 조정</button> : null}
          {enemyId && info && info.gimmicks.some((g) => !info.revealed.includes(g.id)) ? <button type="button" disabled={revealing} className="b-btn-red text-[10px]" onClick={() => startReveal(async () => { await revealToAll(campaignId, enemyId, [], info.gimmicks.map((g) => g.id)); router.refresh(); })}>기믹 전부 공개</button> : null}
        </span> : null}
      </div>
      <div className="mt-2 px-1 pb-1">
        {tab === "sum" ? (<>
          {attacks.length ? <div className="flex flex-wrap gap-4">{attacks.map(chipBig)}</div> : <div className="b-muted text-[10px]">공격 스킬 없음</div>}
          {defense.length ? <div className="mt-3 flex flex-wrap items-end gap-4">{defense.map(chipBig)}<span className="b-num mb-5 text-[12px] tracking-wider text-[#d9c08a]">DEFENSE</span></div> : null}
          {info?.description && isGm ? <div className="b-muted mt-3 whitespace-pre-wrap text-[10px]">{info.description}</div> : null}
          {hide ? <div className="b-muted mt-2 text-[10px]">스킬 이름·수치는 사용된 뒤 도감에 공개됩니다</div> : null}
        </>) : null}
        {tab === "skills" ? (
          <div className="space-y-1.5">
            {[...attacks, ...defense].map((s) => <div key={s.id} className="flex items-center gap-2"><SkillChip skill={s} size={30} /><span className="min-w-0 flex-1"><span className="font-semibold">{hide ? "???" : s.name}</span> {!hide ? <span className="b-muted">{powerText(s)}</span> : null}{!hide && s.effectText ? <span className="b-muted block"><KeywordText text={s.effectText} /></span> : null}</span></div>)}
            {hide ? <div className="b-muted text-[10px]">스킬 이름·효과는 사용된 뒤 도감에 공개됩니다</div> : null}
          </div>
        ) : null}
        {tab === "gimmick" ? (
          <div className="space-y-1.5">
            {gimmicks.map((g) => <div key={g.id} className="text-[11px]"><span className="flex items-center gap-1"><b className="b-gold">{g.name}</b>{isGm && info && !info.revealed.includes(g.id) ? <button type="button" disabled={revealing} className="b-muted text-[9px] underline" onClick={() => startReveal(async () => { await revealToAll(campaignId, enemyId!, [], [g.id]); router.refresh(); })}>미공개 · 공개하기</button> : <span className="text-[9px] text-emerald-300">공개</span>}</span><span className="b-muted block whitespace-pre-wrap"><KeywordText text={g.text} /></span></div>)}
            {hiddenGimmicks > 0 ? <div className="b-muted text-[10px]">미식별 기믹 {hiddenGimmicks}개</div> : null}
            {gimmicks.length === 0 && hiddenGimmicks === 0 ? <div className="b-muted text-[10px]">기믹 없음</div> : null}
          </div>
        ) : null}
        {tab === "status" ? (<>
          <div className="b-head-plate mb-1 w-fit px-2 py-0.5 text-[10px] font-bold">스테이터스</div>
          {statuses.length ? <div className="flex flex-wrap gap-1">{statuses.map(([k, v]) => <Keyword key={k} id={k} className="border-0"><StatusBadge status={k} value={v} /></Keyword>)}</div> : <div className="b-muted text-[10px]">없음</div>}
          <div className="b-head-plate mb-1 mt-3 w-fit px-2 py-0.5 text-[10px] font-bold">내성 정보</div>
          {rules.resistanceMode === "off" ? <div className="b-muted text-[10px]">이 캠페인은 저항을 쓰지 않습니다 (룰 설정)</div> : (
            <div className="grid grid-cols-3 gap-x-3 gap-y-2 text-[10px] sm:grid-cols-5">
              {(["slash", "pierce", "blunt"] as DamageType[]).map((t) => resistCell(<DamageIcon type={t} size={20} />, u.resist?.damage?.[t] ?? "normal", t))}
              {SINS.map((sn) => resistCell(<SinIcon sin={sn} size={20} />, u.resist?.sin?.[sn] ?? "normal", sn))}
            </div>
          )}
        </>) : null}
        {edit ? <GmAdjust u={u} campaignId={campaignId} combatId={combatId} onDone={() => setEdit(false)} onApply={onApply} /> : null}
      </div>
    </div>
  );
}

/* ---------- 유닛 카드 (아군, 오른쪽) ---------- */
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
    <div key={s.id} className="flex items-center gap-2 text-[11px]"><SkillChip skill={s} size={26} /><span className="min-w-0 flex-1"><span className="font-semibold">{s.name}</span> <span className="b-muted">{powerText(s)}</span>{s.effectText ? <span className="b-muted block truncate">{s.effectText}</span> : null}</span></div>
  );
  const threatTag = info?.threat ? THREAT_TAG[info.threat] : undefined;
  return (
    <div className="b-card text-xs" data-side={enemy ? "enemy" : "ally"}>
      <div className="b-head-plate flex items-center gap-2 px-2 py-1" data-tone={enemy ? "red" : "gold"}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {enemy ? <img src={ui("tag-enemy")} alt="적" className="h-5" draggable={false} /> : <span className="rounded-sm px-1 text-[10px] font-black" style={{ background: "#c9a24a", color: "#1a1208" }}>아군</span>}
        <span className="truncate text-sm font-bold">{names[u.id]}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {threatTag ? <img src={ui(threatTag)} alt={info!.threat} title={info!.threat} className="h-4" draggable={false} /> : info?.threat ? <span className="b-muted text-[10px]">{info.threat}</span> : null}
        <button type="button" onClick={onClose} className="b-muted ml-auto hover:text-white">✕</button>
      </div>
      <div className="px-2.5 py-2">
        <div className="relative h-2.5 w-full bg-black/70">
          <div className="h-full" style={{ width: `${hpPct}%`, background: enemy ? "linear-gradient(90deg,#7a0f13,#e04b52)" : "linear-gradient(90deg,#2f7a4a,#4fb374)" }} />
          {rules.staggerThresholds.map((t, i) => <span key={i} className="absolute top-0 h-full w-px bg-amber-200/80" style={{ left: `${t * 100}%` }} title={`흐트러짐 ${Math.round(t * 100)}%`} />)}
        </div>
        <div className="b-muted mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] tabular-nums">
          <span className="text-white">{hideNumbers ? `체력 ${Math.round(hpPct)}%` : `체력 ${u.hp}/${u.maxHp}`}</span>
          <StaggerPips u={u} rules={rules} />
          {!u.sanityLocked ? <span>정신력 <span className="text-sky-300">{u.sanity > 0 ? "+" : ""}{u.sanity}</span></span> : null}
          {u.source.kind === "character" ? <span><Keyword id="light">빛</Keyword> {u.light} · <Keyword id="erosion">침식도</Keyword> {u.erosion} <span className={erosionStage(u.erosion, rules) >= 3 ? "text-red-400" : erosionStage(u.erosion, rules) >= 2 ? "text-orange-300" : "text-sky-300"}>({EROSION_STAGE_LABEL[erosionStage(u.erosion, rules)]})</span></span> : null}
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

/** 흐트러짐 구간 표시 (참고: 타 팀 VTT 의 부상 단계 ◇◇◇): 구간마다 ◇, 이미 넘긴 구간은 ◆(주황), 지금 흐트러진 상태면 깜빡임 */
function StaggerPips({ u, rules, compact }: { u: Unit; rules: RuleConfig; compact?: boolean }) {
  const hpPct = u.maxHp > 0 ? u.hp / u.maxHp : 0;
  return (
    <span className="inline-flex items-center gap-1 tabular-nums" title={`흐트러짐 구간: 체력이 ${rules.staggerThresholds.map((t) => `${Math.round(t * 100)}%`).join(" · ")} 아래로 처음 떨어질 때 (전투당 구간마다 1회)`}>
      {!compact ? <span className="b-muted">흐트러짐</span> : null}
      {rules.staggerThresholds.map((t) => { const done = u.staggerTriggered.includes(t); const next = !done && hpPct > t;
        return <span key={t} className={`inline-flex items-center gap-0.5 rounded-sm border px-1 text-[10px] ${done ? "border-amber-400/70 text-amber-300" : next ? "border-white/25 text-white/80" : "border-white/15 text-white/40"} ${u.staggered && done && t === u.staggerTriggered[u.staggerTriggered.length - 1] ? "b-pulse" : ""}`}>{done ? "◆" : "◇"}{Math.round(t * 100)}%</span>; })}
    </span>
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
