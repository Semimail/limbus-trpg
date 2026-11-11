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
import { dist, reachable, stepToward, inBounds, type Pos } from "./grid";

export interface Unit extends Combatant {
  portraitUrl: string | null;
  spriteUrl?: string | null;
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
  /** 격자 위치 */
  pos: Pos;
  /** 이번 라운드 남은 이동력 */
  move: number;
}

export interface Pick {
  skillId: string;
  targetId: string;
  targetSlot?: number;
  /** E.G.O 사용으로 확정된 선택 (변경 불가) */
  locked?: boolean;
  /** 보호: 빛을 쓰고 대상 슬롯이 노리던 아군과 자리를 바꿔 대신 받는다 */
  protect?: boolean;
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
  /** 이미 "전투불능" 공지를 낸 유닛 (재공지 방지) */
  downNoted?: string[];
  winner: "ally" | "enemy" | null;
  /** 선택 단계에서 일어난 알림 (E.G.O 발현, 침식, 손패 교체, 이동, 기회 공격) */
  notices: string[];
  /** 격자 크기. 없으면 격자 미사용 */
  grid?: { cols: number; rows: number };
  /** 선택 단계의 기회 공격 결과 (라운드 로그에 합침) */
  preRound: RoundEvent[];
}

export const slotKey = (id: string, slot: number) => `${id}:${slot}`;

export type RoundEvent =
  | { type: "roundStart"; round: number; slots: SpeedSlot[] }
  | { type: "clash"; actor: string; target: string; actorSkill: string; targetSkill: string; result: ClashResult }
  | { type: "attack"; actor: string; target: string; skill: string; coins: AttackCoin[]; ticks: StatusTick[] }
  | { type: "idle"; actor: string; skill: string; reason: string }
  | { type: "fx"; logs: FxLog[] }
  | { type: "move"; unit: string; from: Pos; to: Pos }
  | { type: "opportunity"; actor: string; target: string; skill: string; coins: AttackCoin[] }
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

export const skillRange = (s: Skill) => Math.max(1, s.range ?? 1);
export const inRange = (a: Unit, b: Unit, s: Skill) => dist(a.pos, b.pos) <= skillRange(s);
function passableFor(state: CombatState, mover: Unit) {
  return (p: Pos): "free" | "pass" | "block" => {
    const occ = state.units.find((u) => alive(u) && u.pos.x === p.x && u.pos.y === p.y);
    if (!occ) return "free";
    if (occ.id === mover.id) return "free";
    return occ.side === mover.side ? "pass" : "block";
  };
}
export function reachableCells(state: CombatState, unitId: string): Map<string, number> {
  const u = state.units.find((x) => x.id === unitId);
  if (!u || !state.grid) return new Map();
  return reachable(u.pos, u.move, state.grid.cols, state.grid.rows, passableFor(state, u));
}
const adjacentEnemies = (state: CombatState, u: Unit) => state.units.filter((e) => e.side !== u.side && alive(e) && !e.staggered && dist(e.pos, u.pos) <= 1);

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
  passives?: Effect[]; light?: number; erosion?: number; spriteUrl?: string | null;
}

export function startCombat(inputs: UnitInput[], seed: number, rules: RuleConfig, handSize = 3): CombatState {
  const r = createRng(seed);
  const grid = rules.gridEnabled ? { cols: rules.gridCols, rows: rules.gridRows } : undefined;
  const units: Unit[] = inputs.map((i) => ({
    ...i, statuses: i.statuses ?? {}, staggered: false, staggerTriggered: [], incapacitated: i.hp <= 0,
    deck: shuffle(buildDeckIds(i.skills), r), discard: [], hand: [],
    passives: i.passives ?? [], usedOnce: [], light: i.light ?? 0, erosion: i.erosion ?? 0, egoUsed: {},
    pos: { x: 0, y: 0 }, move: 0,
  }));
  if (grid) placeUnits(units, grid);
  const state: CombatState = { version: 1, round: 0, phase: "select", rngState: r.state(), units, slots: [], picks: {}, handSize, lastRound: null, winner: null, notices: [], grid, preRound: [], downNoted: units.filter((u) => u.incapacitated).map((u) => u.id) };
  const sink: FxLog[] = [];
  const hooks = makeHooks(state, rules, sink);
  for (const u of units) hooks("combatStart", { self: u });
  if (sink.length) state.notices.push(...sink.map((l) => l.text));
  state.rngState = r.state();
  beginRound(state, rules);
  return state;
}

/** 아군은 왼쪽 두 열, 적은 오른쪽 두 열에 세로로 퍼뜨린다 */
function placeUnits(units: Unit[], grid: { cols: number; rows: number }) {
  const place = (list: Unit[], cols: number[]) => {
    list.forEach((u, i) => { const col = cols[i % cols.length]!; const row = Math.floor(i / cols.length); const y = Math.min(grid.rows - 1, Math.floor((grid.rows - 1) / 2) + (row % 2 === 0 ? 1 : -1) * Math.ceil(row / 2)); u.pos = { x: col, y }; });
  };
  place(units.filter((u) => u.side === "ally"), [1, 0]);
  place(units.filter((u) => u.side === "enemy"), [grid.cols - 2, grid.cols - 1]);
  // 겹침 방지
  const taken = new Set<string>();
  for (const u of units) {
    let p = { ...u.pos };
    while (taken.has(`${p.x},${p.y}`)) { p = { x: p.x, y: (p.y + 1) % grid.rows }; }
    u.pos = p; taken.add(`${p.x},${p.y}`);
  }
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
  state.preRound = [];
  for (const u of state.units) {
    const best = Math.max(0, ...state.slots.filter((s) => s.combatantId === u.id).map((s) => s.speed));
    u.move = alive(u) && !u.staggered && best > 0 ? best + rules.moveBonus : 0;
  }
  for (const u of state.units) if (alive(u)) drawHand(u, state.handSize, r);
  autoPickEnemies(state, r, rules);
  save();
}

/** 적과 침식 상태 유닛: 가까운 대상 쪽으로 이동한 뒤, 사거리 안의 대상을 손패 스킬로 노린다 */
export function autoPickEnemies(state: CombatState, r: Rng, rules: RuleConfig) {
  const handled = new Set<string>();
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
    const skill = findSkill(u, skillId)!;
    if (state.grid && !handled.has(u.id)) {
      handled.add(u.id);
      // 가장 가까운 대상에게 사거리 안에 들 때까지 이동
      let target = pool.reduce((b, x) => (dist(x.pos, u.pos) < dist(b.pos, u.pos) ? x : b), pool[0]!);
      let guard = 0;
      while (u.move > 0 && dist(u.pos, target.pos) > skillRange(skill) && guard++ < 20) {
        const next = stepToward(u.pos, target.pos, state.grid.cols, state.grid.rows, passableFor(state, u));
        if (!next) break;
        moveUnitRaw(state, u, next, rules, true);
      }
      target = pool.filter((x) => inRange(u, x, skill)).sort((a, b) => dist(a.pos, u.pos) - dist(b.pos, u.pos))[0] ?? target;
      if (!inRange(u, target, skill)) continue; // 닿지 않으면 이 슬롯은 대기
      state.picks[slotKey(u.id, s.slot)] = { skillId, targetId: target.id, locked: corroded };
    } else {
      const inR = state.grid ? pool.filter((x) => inRange(u, x, skill)) : pool;
      if (inR.length === 0) continue;
      const target = inR[r.int(0, inR.length - 1)]!;
      state.picks[slotKey(u.id, s.slot)] = { skillId, targetId: target.id, locked: corroded };
    }
  }
}

/* ---------- 이동 ---------- */
/** 한 칸 이동 + 기회 공격 처리 (검증은 호출자가) */
function moveUnitRaw(state: CombatState, u: Unit, to: Pos, rules: RuleConfig, silent = false) {
  const from = { ...u.pos };
  const threats = adjacentEnemies(state, u);
  u.pos = to; u.move -= 1;
  if (!silent) state.preRound.push({ type: "move", unit: u.id, from, to });
  // 접전 이탈: 떠난 뒤 더 이상 인접하지 않은 적이 기회 공격 (공격 스킬 코인 1개)
  const { r, save } = rng(state);
  for (const e of threats) {
    if (dist(e.pos, u.pos) <= 1) continue;
    const atk = e.skills.find((sk) => sk.kind === "attack" && !sk.ego && e.hand.includes(sk.id)) ?? e.skills.find((sk) => sk.kind === "attack" && !sk.ego);
    if (!atk) continue;
    const coins = oneSidedAttack(e, u, { ...atk, coinCount: 1 }, 1, state.round, rules, r);
    state.preRound.push({ type: "opportunity", actor: e.id, target: u.id, skill: atk.name, coins });
    state.notices.push(`${e.name}의 기회 공격 → ${u.name}: ${coins.map((c) => `${c.heads ? "앞" : "뒤"}${c.hit.final}`).join(" ")} 피해`);
    if (u.incapacitated) break;
  }
  save();
}

/** 플레이어 이동: 도달 가능한 칸으로만 */
export function moveUnit(state: CombatState, unitId: string, to: Pos, rules: RuleConfig): string | null {
  if (state.phase !== "select") return "선택 단계가 아닙니다";
  if (!state.grid) return "격자를 사용하지 않는 전투입니다";
  const u = state.units.find((x) => x.id === unitId);
  if (!u || !alive(u)) return "유닛이 없습니다";
  if (u.staggered) return "흐트러진 상태에서는 움직일 수 없습니다";
  if (isCorroded(u, state.round)) return "침식 상태에서는 조종할 수 없습니다";
  if (Object.entries(state.picks).some(([k, p]) => k.startsWith(unitId + ":") && p.locked)) return "확정된 행동이 있어 움직일 수 없습니다";
  if (!inBounds(to, state.grid.cols, state.grid.rows)) return "판 밖입니다";
  const cells = reachableCells(state, unitId);
  const cost = cells.get(`${to.x},${to.y}`);
  if (cost === undefined) return "그 칸까지 갈 수 없습니다";
  // 한 칸씩 탐욕 경로로 이동 (기회 공격을 칸마다 평가)
  let guard = 0;
  while (!(u.pos.x === to.x && u.pos.y === to.y) && guard++ < 30 && !u.incapacitated) {
    const next = stepToward(u.pos, to, state.grid.cols, state.grid.rows, passableFor(state, u));
    if (!next) break;
    moveUnitRaw(state, u, next, rules);
  }
  // 이동 후 사거리 밖이 된 선택은 해제
  for (const [k, p] of Object.entries(state.picks)) {
    const [actorId] = k.split(":");
    if (actorId !== unitId) continue;
    const t = state.units.find((x) => x.id === p.targetId); const sk = findSkill(u, p.skillId);
    if (t && sk && !inRange(u, t, sk)) delete state.picks[k];
  }
  return null;
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
  if (state.grid && !pick.protect && !inRange(u, t, skill)) return `사거리 밖입니다 (사거리 ${skillRange(skill)}칸, 거리 ${dist(u.pos, t.pos)}칸)`;
  if (pick.targetSlot !== undefined) {
    const ts = state.slots.find((x) => x.combatantId === t.id && x.slot === pick.targetSlot);
    if (!ts) return "상대 슬롯이 없습니다";
    const tp = state.picks[slotKey(t.id, pick.targetSlot)];
    if (pick.protect) {
      // 보호: 빛을 쓰고, 노려지던 아군(주변 N칸)과 자리를 바꾼다
      if (!tp) return "그 슬롯은 아무도 노리지 않습니다";
      const victim = state.units.find((x) => x.id === tp.targetId);
      if (!victim || victim.side !== u.side || victim.id === u.id) return "보호할 아군이 없습니다";
      if (state.grid && dist(u.pos, victim.pos) > rules.protectRange) return `보호는 주변 ${rules.protectRange}칸 안의 아군만 가능합니다`;
      if (u.light < rules.protectLightCost) return "빛이 부족합니다";
      u.light -= rules.protectLightCost;
      const tmp = { ...u.pos }; u.pos = { ...victim.pos }; victim.pos = tmp;
      state.notices.push(`${u.name} 보호: 빛 ${rules.protectLightCost} 소모, ${victim.name}과 자리를 바꿔 ${t.name}의 공격을 대신 받는다`);
      state.picks[key] = { skillId: pick.skillId, targetId: pick.targetId, targetSlot: pick.targetSlot, protect: true, locked: true };
      return null;
    }
    if (ts.speed > s.speed) return "속도가 더 빠른 상대만 가로챌 수 있습니다";
    if (state.grid) {
      // 가로채기: 상대 공격 경로(직선) 위이거나 공격자에게 인접해야 한다
      const victim = tp ? state.units.find((x) => x.id === tp.targetId) : undefined;
      const nearAttacker = dist(u.pos, t.pos) <= 1;
      const onLine = victim ? dist(u.pos, t.pos) + dist(u.pos, victim.pos) <= dist(t.pos, victim.pos) + 1 : false;
      if (!nearAttacker && !onLine) return "가로채기는 공격자에게 인접하거나 공격 경로 위에 있어야 합니다";
    }
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
  const events: RoundEvent[] = [{ type: "roundStart", round: state.round, slots: [...state.slots] }, ...state.preRound];
  state.preRound = [];
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
      let pool = isCorroded(actor, state.round) ? state.units.filter((x) => x.id !== actor.id && alive(x)) : living(state, target.side);
      if (state.grid) pool = pool.filter((x) => inRange(actor, x, skill));
      if (pool.length === 0) { events.push({ type: "idle", actor: actor.id, skill: skill.name, reason: state.grid ? "사거리 안에 대상 없음" : "대상 없음" }); continue; }
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

function noteDowns(state: CombatState, events: RoundEvent[]) {
  // 상태는 DB를 오가며 직렬화되므로 전투불능 공지 여부도 상태에 보관한다
  const set = new Set(state.downNoted ?? []);
  for (const u of state.units) if (u.incapacitated && !set.has(u.id)) { set.add(u.id); events.push({ type: "down", unit: u.id }); }
  state.downNoted = [...set];
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
