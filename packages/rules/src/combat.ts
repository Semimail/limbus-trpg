/**
 * 전투 진행 오케스트레이터.
 * 상태(CombatState)는 JSON으로 저장 가능해야 하므로 함수와 클래스를 담지 않는다.
 * 모든 난수는 state.rngState에서 이어지는 시드 RNG를 쓴다 → 로그 재생 가능.
 */
import { createRng, type Rng } from "./rng";
import type { Combatant, RuleConfig, Skill, Statuses } from "./types";
import { rollSpeed, type SpeedSlot } from "./speed";
import { resolveClash, oneSidedAttack, afterAttack, roundEndBurn, type ClashResult, type AttackCoin, type StatusTick } from "./clash";
import { tickStagger } from "./stagger";

export interface Unit extends Combatant {
  portraitUrl: string | null;
  /** 출처: 캐릭터 또는 적 도감 */
  source: { kind: "character"; id: string; ownerId: string } | { kind: "enemy"; id: string };
  /** 공격 스킬 덱 (스킬 id, 3:2:1 비율). 방어 스킬은 덱 밖 */
  deck: string[];
  discard: string[];
  /** 이번 라운드 손패 (스킬 id) */
  hand: string[];
}

export interface Pick {
  skillId: string;
  targetId: string;
  /** 가로채기: 상대의 특정 슬롯을 지정 */
  targetSlot?: number;
}

export type Phase = "select" | "resolving" | "ended";

export interface CombatState {
  version: 1;
  round: number;
  phase: Phase;
  rngState: number;
  units: Unit[];
  slots: SpeedSlot[];
  /** key = `${combatantId}:${slot}` */
  picks: Record<string, Pick>;
  handSize: number;
  /** 라운드 결과 요약 (최근 라운드) */
  lastRound: RoundEvent[] | null;
  winner: "ally" | "enemy" | null;
}

export const slotKey = (id: string, slot: number) => `${id}:${slot}`;

/* ---------- 이벤트 (로그/재생용) ---------- */
export type RoundEvent =
  | { type: "roundStart"; round: number; slots: SpeedSlot[] }
  | { type: "clash"; actor: string; target: string; actorSkill: string; targetSkill: string; result: ClashResult }
  | { type: "attack"; actor: string; target: string; skill: string; coins: AttackCoin[]; ticks: StatusTick[] }
  | { type: "idle"; actor: string; skill: string; reason: string }
  | { type: "burn"; ticks: StatusTick[] }
  | { type: "staggerEnd"; unit: string }
  | { type: "down"; unit: string }
  | { type: "end"; winner: "ally" | "enemy" };

/* ---------- 유틸 ---------- */
function rng(state: CombatState): { r: Rng; save: () => void } {
  const r = createRng(state.rngState);
  return { r, save: () => { state.rngState = r.state(); } };
}
export function findSkill(u: Unit, id: string): Skill | undefined { return u.skills.find((s) => s.id === id); }
const alive = (u: Unit) => !u.incapacitated;
const living = (state: CombatState, side: Unit["side"]) => state.units.filter((u) => u.side === side && alive(u));

function shuffle<T>(arr: T[], r: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = r.int(0, i); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}

export function buildDeckIds(skills: Skill[]): string[] {
  const out: string[] = [];
  for (const s of skills) {
    if (s.kind !== "attack") continue;
    const n = s.tier === 1 ? 3 : s.tier === 2 ? 2 : 1;
    for (let i = 0; i < n; i++) out.push(s.id);
  }
  return out;
}

function drawHand(u: Unit, n: number, r: Rng) {
  while (u.hand.length < n) {
    if (u.deck.length === 0) {
      if (u.discard.length === 0) break;
      u.deck = shuffle(u.discard, r); u.discard = [];
    }
    u.hand.push(u.deck.pop()!);
  }
}

/* ---------- 시작 ---------- */
export interface UnitInput {
  id: string; name: string; side: "ally" | "enemy"; maxHp: number; hp: number;
  sanity: number; sanityLocked?: boolean; speed: Unit["speed"]; skills: Skill[];
  statuses?: Statuses; resist?: Combatant["resist"]; portraitUrl: string | null; source: Unit["source"];
}

export function startCombat(inputs: UnitInput[], seed: number, handSize = 3): CombatState {
  const r = createRng(seed);
  const units: Unit[] = inputs.map((i) => ({
    ...i, statuses: i.statuses ?? {}, staggered: false, staggerTriggered: [], incapacitated: i.hp <= 0,
    deck: shuffle(buildDeckIds(i.skills), r), discard: [], hand: [],
  }));
  const state: CombatState = { version: 1, round: 0, phase: "select", rngState: r.state(), units, slots: [], picks: {}, handSize, lastRound: null, winner: null };
  beginRound(state);
  return state;
}

/* ---------- 라운드 시작: 속도, 손패, 적 자동 선택 ---------- */
export function beginRound(state: CombatState) {
  const { r, save } = rng(state);
  state.round += 1;
  state.phase = "select";
  state.picks = {};
  state.slots = rollSpeed(state.units, r);
  for (const u of state.units) if (alive(u)) drawHand(u, state.handSize, r);
  autoPickEnemies(state, r);
  save();
}

/** 적: 손패에서 무작위 스킬, 생존 아군 중 무작위 대상 */
export function autoPickEnemies(state: CombatState, r: Rng) {
  const allies = living(state, "ally");
  for (const s of state.slots) {
    const u = state.units.find((x) => x.id === s.combatantId)!;
    if (u.side !== "enemy" || state.picks[slotKey(u.id, s.slot)]) continue;
    if (allies.length === 0 || u.hand.length === 0) continue;
    const skillId = u.hand[r.int(0, u.hand.length - 1)]!;
    const target = allies[r.int(0, allies.length - 1)]!;
    state.picks[slotKey(u.id, s.slot)] = { skillId, targetId: target.id };
  }
}

/* ---------- 선택 ---------- */
export function setPick(state: CombatState, unitId: string, slot: number, pick: Pick | null): string | null {
  if (state.phase !== "select") return "선택 단계가 아닙니다";
  const u = state.units.find((x) => x.id === unitId);
  const s = state.slots.find((x) => x.combatantId === unitId && x.slot === slot);
  if (!u || !s) return "행동 슬롯이 없습니다";
  if (!pick) { delete state.picks[slotKey(unitId, slot)]; return null; }
  const skill = findSkill(u, pick.skillId);
  if (!skill) return "스킬이 없습니다";
  if (skill.kind === "attack" && !u.hand.includes(skill.id)) return "손패에 없는 스킬입니다";
  // 같은 라운드에 같은 손패 카드를 두 슬롯에 쓸 수 없다
  const dup = Object.entries(state.picks).some(([k, p]) => k.startsWith(unitId + ":") && k !== slotKey(unitId, slot) && p.skillId === pick.skillId && skill.kind === "attack"
    && u.hand.filter((h) => h === pick.skillId).length < 2);
  if (dup) return "이미 다른 슬롯에서 쓴 카드입니다";
  const t = state.units.find((x) => x.id === pick.targetId);
  if (!t || !alive(t)) return "대상이 없습니다";
  if (t.side === u.side) return "같은 편은 대상으로 지정할 수 없습니다";
  if (pick.targetSlot !== undefined) {
    const ts = state.slots.find((x) => x.combatantId === t.id && x.slot === pick.targetSlot);
    if (!ts) return "상대 슬롯이 없습니다";
    if (ts.speed > s.speed) return "속도가 더 빠른 상대만 가로챌 수 있습니다";
  }
  state.picks[slotKey(unitId, slot)] = pick;
  return null;
}

/* ---------- 라운드 처리 ---------- */
export function resolveRound(state: CombatState, rules: RuleConfig): RoundEvent[] {
  if (state.phase !== "select") return [];
  const { r, save } = rng(state);
  state.phase = "resolving";
  const events: RoundEvent[] = [{ type: "roundStart", round: state.round, slots: [...state.slots] }];
  const resolved = new Set<string>();
  const unitOf = (id: string) => state.units.find((x) => x.id === id)!;

  // 1) 가로채기 적용: 아군 선택이 상대 슬롯을 지정했으면 그 슬롯의 대상을 아군으로 바꾼다
  for (const [k, p] of Object.entries(state.picks)) {
    if (p.targetSlot === undefined) continue;
    const [actorId] = k.split(":");
    const tk = slotKey(p.targetId, p.targetSlot);
    const tp = state.picks[tk];
    if (tp) state.picks[tk] = { ...tp, targetId: actorId! };
  }

  // 2) 속도 순 처리
  for (const s of state.slots) {
    const key = slotKey(s.combatantId, s.slot);
    if (resolved.has(key)) continue;
    const actor = unitOf(s.combatantId);
    const pick = state.picks[key];
    resolved.add(key);
    if (!pick) continue;
    const skill = findSkill(actor, pick.skillId);
    if (!skill) continue;
    if (!alive(actor) || actor.staggered) { events.push({ type: "idle", actor: actor.id, skill: skill.name, reason: actor.staggered ? "흐트러짐" : "전투불능" }); continue; }

    // 대상 (죽었으면 같은 편 생존자 중 무작위)
    let target = unitOf(pick.targetId);
    if (!alive(target)) {
      const pool = living(state, target.side);
      if (pool.length === 0) { events.push({ type: "idle", actor: actor.id, skill: skill.name, reason: "대상 없음" }); continue; }
      target = pool[r.int(0, pool.length - 1)]!;
    }

    // 맞서는 슬롯: 대상이 나를 노리는 미처리 슬롯
    const counterSlot = state.slots.find((x) => x.combatantId === target.id && !resolved.has(slotKey(x.combatantId, x.slot)) && state.picks[slotKey(x.combatantId, x.slot)]?.targetId === actor.id);
    useCard(actor, skill);

    if (counterSlot && !target.staggered) {
      const ck = slotKey(counterSlot.combatantId, counterSlot.slot);
      const tp = state.picks[ck]!;
      const tSkill = findSkill(target, tp.skillId)!;
      resolved.add(ck);
      useCard(target, tSkill);
      const result = resolveClash({ combatant: actor, skill }, { combatant: target, skill: tSkill }, state.round, rules, r);
      events.push({ type: "clash", actor: actor.id, target: target.id, actorSkill: skill.name, targetSkill: tSkill.name, result });
      noteDowns(state, events);
    } else if (skill.kind === "attack") {
      const coins = oneSidedAttack(actor, target, skill, skill.coinCount, state.round, rules, r);
      const ticks = afterAttack(actor, target, coins, state.round, rules);
      events.push({ type: "attack", actor: actor.id, target: target.id, skill: skill.name, coins, ticks });
      noteDowns(state, events);
    } else {
      events.push({ type: "idle", actor: actor.id, skill: skill.name, reason: "맞설 공격 없음" });
    }
    if (checkEnd(state, events)) { save(); state.lastRound = events; return events; }
  }

  // 3) 라운드 종료: 화상, 흐트러짐 해제
  const burnTicks: StatusTick[] = [];
  for (const u of state.units) { const t = roundEndBurn(u, state.round, rules); if (t) burnTicks.push(t); }
  if (burnTicks.length) { events.push({ type: "burn", ticks: burnTicks }); noteDowns(state, events); }
  for (const u of state.units) if (tickStagger(u, state.round)) events.push({ type: "staggerEnd", unit: u.id });
  if (!checkEnd(state, events)) { save(); beginRound(state); }
  else save();
  state.lastRound = events;
  return events;
}

function useCard(u: Unit, skill: Skill) {
  if (skill.kind !== "attack") return;
  const i = u.hand.indexOf(skill.id);
  if (i >= 0) { u.hand.splice(i, 1); u.discard.push(skill.id); }
}

const downNoted = new WeakMap<CombatState, Set<string>>();
function noteDowns(state: CombatState, events: RoundEvent[]) {
  let set = downNoted.get(state); if (!set) { set = new Set(); downNoted.set(state, set); }
  for (const u of state.units) if (u.incapacitated && !set.has(u.id)) { set.add(u.id); events.push({ type: "down", unit: u.id }); }
}

function checkEnd(state: CombatState, events: RoundEvent[]): boolean {
  const a = living(state, "ally").length, e = living(state, "enemy").length;
  if (a > 0 && e > 0) return false;
  state.phase = "ended";
  state.winner = a > 0 ? "ally" : "enemy";
  events.push({ type: "end", winner: state.winner });
  return true;
}

export function endCombat(state: CombatState) {
  state.phase = "ended";
  if (!state.winner) state.winner = living(state, "enemy").length === 0 ? "ally" : "enemy";
}
