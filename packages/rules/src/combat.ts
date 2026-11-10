/**
 * 전투 진행 오케스트레이터.
 * 상태(CombatState)는 JSON으로 저장 가능해야 하므로 함수와 클래스를 담지 않는다.
 * 모든 난수는 state.rngState에서 이어지는 시드 RNG를 쓴다 → 로그 재생 가능.
 */
import { createRng, type Rng } from "./rng";
import type { Combatant, Effect, RuleConfig, Skill, Statuses, Trigger } from "./types";
import { rollSpeed, type SpeedSlot } from "./speed";
import { resolveClash, oneSidedAttack, afterAttack, roundEndBurn, type ClashResult, type AttackCoin, type StatusTick } from "./clash";
import { tickStagger } from "./stagger";
import { fireEffects, type FxLog, type FxContext } from "./effects";
import { flipCoin, adjustSanity } from "./coin";

export interface Unit extends Combatant {
  portraitUrl: string | null;
  source: { kind: "character"; id: string; ownerId: string } | { kind: "enemy"; id: string };
  deck: string[];
  discard: string[];
  hand: string[];
  /** 상시 효과: 특기, 동기화 패시브, 적 기믹 */
  passives: Effect[];
  usedOnce: string[];
  /** 빛 (아군만 의미 있음) */
  light: number;
  /** 침식도 */
  erosion: number;
  /** E.G.O 사용 횟수 (스킬 id → 횟수) */
  egoUsed: Record<string, number>;
  /** 침식 상태: 이 라운드까지 GM/자동 조종 */
  corrodedUntilRound?: number;
}

export interface Pick {
  skillId: string;
  targetId: string;
  targetSlot?: number;
  /** E.G.O 사용으로 확정된 선택 (변경 불가) */
  locked?: boolean;
}

export type Phase = "select" | "resolving" | "ended";

export interface CombatState {
  version: 1;
  round: number;
  phase: Phase;
  rngState: number;
  units: Unit[];
  slots: SpeedSlot[];
  picks: Record<string, Pick>;
  handSize: number;
  lastRound: RoundEvent[] | null;
  winner: "ally" | "enemy" | null;
  /** 선택 단계에서 일어난 알림 (E.G.O 발현, 침식, 손패 교체) */
  notices: string[];
}

export const slotKey = (id: string, slot: number) => `${id}:${slot}`;

export type RoundEvent =
  | { type: "roundStart"; round: number; slots: SpeedSlot[] }
  | { type: "clash"; actor: string; target: string; actorSkill: string; targetSkill: string; result: ClashResult }
  | { type: "attack"; actor: string; target: string; skill: string; coins: AttackCoin[]; ticks: StatusTick[] }
  | { type: "idle"; actor: string; skill: string; reason: string }
  | { type: "fx"; logs: FxLog[] }
  | { type: "burn"; ticks: StatusTick[] }
  | { type: "staggerEnd"; unit: string }
  | { type: "corrosionEnd"; unit: string }
  | { type: "down"; unit: string }
  | { type: "end"; winner: "ally" | "enemy" };

function rng(state: CombatState): { r: Rng; save: () => void } {
  const r = createRng(state.rngState);
  return { r, save: () => { state.rngState = r.state(); } };
}
export function findSkill(u: Unit, id: string): Skill | undefined { return u.skills.find((s) => s.id === id); }
const alive = (u: Unit) => !u.incapacitated;
const living = (state: CombatState, side: Unit["side"]) => state.units.filter((u) => u.side === side && alive(u));
export const isCorroded = (u: Unit, round: number) => u.corrodedUntilRound !== undefined && u.corrodedUntilRound >= round;

function shuffle<T>(arr: T[], r: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = r.int(0, i); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}

export function buildDeckIds(skills: Skill[]): string[] {
  const out: string[] = [];
  for (const s of skills) {
    if (s.kind !== "attack" || s.ego) continue;
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

/* ---------- 효과 실행 연결 ---------- */
function makeHooks(state: CombatState, rules: RuleConfig, sink: FxLog[]) {
  const allies = () => living(state, "ally"), enemies = () => living(state, "enemy");
  return (trigger: Trigger, c: { self: Combatant; other?: Combatant; skill?: Skill }) => {
    const u = c.self as Unit;
    const bag = { passives: u.passives ?? [], usedOnce: new Set(u.usedOnce ?? []) };
    const ctx: FxContext = { trigger, self: c.self, other: c.other, skill: c.skill, round: state.round,
      allies: u.side === "ally" ? allies() : enemies(), enemies: u.side === "ally" ? enemies() : allies() };
    fireEffects(ctx, bag, rules, sink);
    u.usedOnce = [...bag.usedOnce];
  };
}

/* ---------- 시작 ---------- */
export interface UnitInput {
  id: string; name: string; side: "ally" | "enemy"; maxHp: number; hp: number;
  sanity: number; sanityLocked?: boolean; speed: Unit["speed"]; skills: Skill[];
  statuses?: Statuses; resist?: Combatant["resist"]; portraitUrl: string | null; source: Unit["source"];
  passives?: Effect[]; light?: number; erosion?: number;
}

export function startCombat(inputs: UnitInput[], seed: number, rules: RuleConfig, handSize = 3): CombatState {
  const r = createRng(seed);
  const units: Unit[] = inputs.map((i) => ({
    ...i, statuses: i.statuses ?? {}, staggered: false, staggerTriggered: [], incapacitated: i.hp <= 0,
    deck: shuffle(buildDeckIds(i.skills), r), discard: [], hand: [],
    passives: i.passives ?? [], usedOnce: [], light: i.light ?? 0, erosion: i.erosion ?? 0, egoUsed: {},
  }));
  const state: CombatState = { version: 1, round: 0, phase: "select", rngState: r.state(), units, slots: [], picks: {}, handSize, lastRound: null, winner: null, notices: [] };
  const sink: FxLog[] = [];
  const hooks = makeHooks(state, rules, sink);
  for (const u of units) hooks("combatStart", { self: u });
  if (sink.length) state.notices.push(...sink.map((l) => l.text));
  state.rngState = r.state();
  beginRound(state, rules);
  return state;
}

/* ---------- 라운드 시작 ---------- */
export function beginRound(state: CombatState, rules: RuleConfig) {
  const { r, save } = rng(state);
  state.round += 1;
  state.phase = "select";
  state.picks = {};
  state.notices = [];
  const sink: FxLog[] = [];
  const hooks = makeHooks(state, rules, sink);
  for (const u of state.units) if (alive(u)) hooks("roundStart", { self: u });
  if (sink.length) state.notices.push(...sink.map((l) => l.text));
  state.slots = rollSpeed(state.units, r);
  for (const u of state.units) if (alive(u)) drawHand(u, state.handSize, r);
  autoPickEnemies(state, r);
  save();
}

/** 적과 침식 상태 유닛: 손패에서 무작위 스킬, 무작위 대상 */
export function autoPickEnemies(state: CombatState, r: Rng) {
  for (const s of state.slots) {
    const u = state.units.find((x) => x.id === s.combatantId)!;
    const corroded = isCorroded(u, state.round);
    if ((u.side !== "enemy" && !corroded) || state.picks[slotKey(u.id, s.slot)]) continue;
    if (u.hand.length === 0) continue;
    const pool = corroded
      ? state.units.filter((x) => x.id !== u.id && alive(x))
      : living(state, u.side === "enemy" ? "ally" : "enemy");
    if (pool.length === 0) continue;
    const skillId = u.hand[r.int(0, u.hand.length - 1)]!;
    const target = pool[r.int(0, pool.length - 1)]!;
    state.picks[slotKey(u.id, s.slot)] = { skillId, targetId: target.id, locked: corroded };
  }
}

/* ---------- 선택 ---------- */
export function setPick(state: CombatState, unitId: string, slot: number, pick: Pick | null, rules: RuleConfig): string | null {
  if (state.phase !== "select") return "선택 단계가 아닙니다";
  const u = state.units.find((x) => x.id === unitId);
  const s = state.slots.find((x) => x.combatantId === unitId && x.slot === slot);
  if (!u || !s) return "행동 슬롯이 없습니다";
  const key = slotKey(unitId, slot);
  if (state.picks[key]?.locked) return "확정된 행동은 바꿀 수 없습니다";
  if (isCorroded(u, state.round)) return "침식 상태에서는 조종할 수 없습니다";
  if (!pick) { delete state.picks[key]; return null; }
  const skill = findSkill(u, pick.skillId);
  if (!skill) return "스킬이 없습니다";
  const t = state.units.find((x) => x.id === pick.targetId);
  if (!t || !alive(t)) return "대상이 없습니다";
  if (t.side === u.side) return "같은 편은 대상으로 지정할 수 없습니다";
  if (pick.targetSlot !== undefined) {
    const ts = state.slots.find((x) => x.combatantId === t.id && x.slot === pick.targetSlot);
    if (!ts) return "상대 슬롯이 없습니다";
    if (ts.speed > s.speed) return "속도가 더 빠른 상대만 가로챌 수 있습니다";
  }
  if (skill.ego) return useEgo(state, u, s, skill, pick, rules);
  if (skill.kind === "attack" && !u.hand.includes(skill.id)) return "손패에 없는 스킬입니다";
  if (skill.kind === "attack") {
    const usedElsewhere = Object.entries(state.picks).filter(([k, p]) => k.startsWith(unitId + ":") && k !== key && p.skillId === skill.id).length;
    if (usedElsewhere >= u.hand.filter((h) => h === skill.id).length) return "이미 다른 슬롯에서 쓴 카드입니다";
  }
  state.picks[key] = { skillId: pick.skillId, targetId: pick.targetId, targetSlot: pick.targetSlot };
  return null;
}

/**
 * E.G.O 발현: 횟수 확인 → 정신력 지불 → 침식도 증가 → 침식 판정.
 * 침식: 정신력이 기준 미만이면 코인을 던져 뒷면이면 침식. 침식도가 상한이면 무조건 침식.
 * 침식되면 이 라운드는 자동 조종(무작위 대상)으로 바뀐다.
 */
function useEgo(state: CombatState, u: Unit, s: SpeedSlot, skill: Skill, pick: Pick, rules: RuleConfig): string | null {
  const cost = skill.ego!;
  const used = u.egoUsed[skill.id] ?? 0;
  if (used >= cost.usesPerCombat) return "이 전투에서 더 쓸 수 없습니다";
  const { r, save } = rng(state);
  u.egoUsed[skill.id] = used + 1;
  if (!u.sanityLocked) u.sanity = adjustSanity(u.sanity, -cost.sanityCost, rules);
  u.erosion = Math.max(0, u.erosion + cost.erosionGain);
  let corroded = false;
  if (u.erosion >= rules.erosionMax) corroded = true;
  else if (u.sanity < rules.egoCorrosionSanityBelow) corroded = !flipCoin(u.sanity, rules, r);
  const key = slotKey(u.id, s.slot);
  if (corroded) {
    u.corrodedUntilRound = state.round;
    const pool = state.units.filter((x) => x.id !== u.id && alive(x));
    const target = pool[r.int(0, pool.length - 1)]!;
    state.picks[key] = { skillId: skill.id, targetId: target.id, locked: true };
    // 다른 슬롯도 자동으로
    for (const other of state.slots.filter((x) => x.combatantId === u.id && x.slot !== s.slot)) {
      const k2 = slotKey(u.id, other.slot);
      if (u.hand.length) state.picks[k2] = { skillId: u.hand[r.int(0, u.hand.length - 1)]!, targetId: pool[r.int(0, pool.length - 1)]!.id, locked: true };
    }
    state.notices.push(`${u.name} E.G.O [${skill.name}] 발현 → 침식! 이 라운드는 조종할 수 없습니다 (정신력 ${u.sanity}, 침식도 ${u.erosion})`);
  } else {
    state.picks[key] = { skillId: skill.id, targetId: pick.targetId, targetSlot: pick.targetSlot, locked: true };
    state.notices.push(`${u.name} E.G.O [${skill.name}] 발현 (정신력 ${u.sanity}, 침식도 ${u.erosion})`);
  }
  save();
  return null;
}

/** 빛 소모: 손패 전부 교체 */
export function redrawHand(state: CombatState, unitId: string, rules: RuleConfig): string | null {
  if (state.phase !== "select") return "선택 단계가 아닙니다";
  const u = state.units.find((x) => x.id === unitId);
  if (!u) return "유닛이 없습니다";
  if (u.light < rules.lightRedrawCost) return "빛이 부족합니다";
  if (Object.keys(state.picks).some((k) => k.startsWith(unitId + ":") && state.picks[k]!.locked)) return "확정된 행동이 있어 교체할 수 없습니다";
  const { r, save } = rng(state);
  u.light -= rules.lightRedrawCost;
  u.discard.push(...u.hand); u.hand = [];
  drawHand(u, state.handSize, r);
  for (const k of Object.keys(state.picks)) if (k.startsWith(unitId + ":")) delete state.picks[k];
  state.notices.push(`${u.name} 빛 ${rules.lightRedrawCost} 소모 → 손패 교체`);
  save();
  return null;
}

/* ---------- 라운드 처리 ---------- */
export function resolveRound(state: CombatState, rules: RuleConfig): RoundEvent[] {
  if (state.phase !== "select") return [];
  const { r, save } = rng(state);
  state.phase = "resolving";
  const events: RoundEvent[] = [{ type: "roundStart", round: state.round, slots: [...state.slots] }];
  const sink: FxLog[] = [];
  const hooks = makeHooks(state, rules, sink);
  const flush = () => { if (sink.length) { events.push({ type: "fx", logs: [...sink] }); sink.length = 0; } };
  const resolved = new Set<string>();
  const unitOf = (id: string) => state.units.find((x) => x.id === id)!;

  for (const [k, p] of Object.entries(state.picks)) {
    if (p.targetSlot === undefined) continue;
    const [actorId] = k.split(":");
    const tk = slotKey(p.targetId, p.targetSlot);
    const tp = state.picks[tk];
    if (tp) state.picks[tk] = { ...tp, targetId: actorId! };
  }

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

    let target = unitOf(pick.targetId);
    if (!alive(target)) {
      const pool = isCorroded(actor, state.round) ? state.units.filter((x) => x.id !== actor.id && alive(x)) : living(state, target.side);
      if (pool.length === 0) { events.push({ type: "idle", actor: actor.id, skill: skill.name, reason: "대상 없음" }); continue; }
      target = pool[r.int(0, pool.length - 1)]!;
    }

    const counterSlot = state.slots.find((x) => x.combatantId === target.id && !resolved.has(slotKey(x.combatantId, x.slot)) && state.picks[slotKey(x.combatantId, x.slot)]?.targetId === actor.id);
    useCard(actor, skill);

    if (counterSlot && !target.staggered && target.side !== actor.side) {
      const ck = slotKey(counterSlot.combatantId, counterSlot.slot);
      const tp = state.picks[ck]!;
      const tSkill = findSkill(target, tp.skillId)!;
      resolved.add(ck);
      useCard(target, tSkill);
      const result = resolveClash({ combatant: actor, skill }, { combatant: target, skill: tSkill }, state.round, rules, r, hooks);
      events.push({ type: "clash", actor: actor.id, target: target.id, actorSkill: skill.name, targetSkill: tSkill.name, result });
      flush(); noteDowns(state, events);
    } else if (skill.kind === "attack") {
      const coins = oneSidedAttack(actor, target, skill, skill.coinCount, state.round, rules, r, hooks);
      const ticks = afterAttack(actor, target, coins, state.round, rules);
      events.push({ type: "attack", actor: actor.id, target: target.id, skill: skill.name, coins, ticks });
      flush(); noteDowns(state, events);
    } else {
      events.push({ type: "idle", actor: actor.id, skill: skill.name, reason: "맞설 공격 없음" });
    }
    if (checkEnd(state, events)) { save(); state.lastRound = events; return events; }
  }

  const burnTicks: StatusTick[] = [];
  for (const u of state.units) { const t = roundEndBurn(u, state.round, rules); if (t) burnTicks.push(t); }
  if (burnTicks.length) { events.push({ type: "burn", ticks: burnTicks }); noteDowns(state, events); }
  for (const u of state.units) if (alive(u)) hooks("roundEnd", { self: u });
  flush(); noteDowns(state, events);
  for (const u of state.units) if (tickStagger(u, state.round)) events.push({ type: "staggerEnd", unit: u.id });
  for (const u of state.units) if (u.corrodedUntilRound !== undefined && u.corrodedUntilRound <= state.round) { delete u.corrodedUntilRound; events.push({ type: "corrosionEnd", unit: u.id }); }
  if (!checkEnd(state, events)) { save(); beginRound(state, rules); }
  else save();
  state.lastRound = events;
  return events;
}

function useCard(u: Unit, skill: Skill) {
  if (skill.kind !== "attack" || skill.ego) return;
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
