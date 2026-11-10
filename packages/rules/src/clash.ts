import type { Rng } from "./rng";
import type { Combatant, RuleConfig, Skill } from "./types";
import { rollSkill, type SkillRoll } from "./skill";
import { computeHit, type HitBreakdown } from "./damage";
import { applyDamage, type DamageOutcome } from "./stagger";
import { adjustSanity } from "./coin";
import { triggerStatus } from "./status";

export interface ClashRound {
  index: number;
  a: SkillRoll;
  b: SkillRoll;
  winner: "a" | "b" | "draw";
  aCoinsLeft: number;
  bCoinsLeft: number;
}

export interface AttackCoin {
  coinIndex: number;
  heads: boolean;
  hit: HitBreakdown;
  damage: DamageOutcome;
  /** 이 코인 뒤에 공격자가 받은 출혈 피해 (출혈은 공격 코인마다 발동 후 절반) */
  bleed?: { amount: number; damage: DamageOutcome };
}

/** 스킬 1회가 끝난 뒤 발동한 상태이상 기록 */
export interface StatusTick {
  target: string;        // combatant id
  status: "rupture" | "sinking" | "tremor" | "burn";
  amount: number;        // 발동 시점의 N
  damage?: DamageOutcome;
  sanityAfter?: number;
}

export interface ClashResult {
  rounds: ClashRound[];
  /** 합 최종 승자. 양쪽 코인이 동시에 0이 되는 일은 없으므로 draw는 코인 소진 전 종료 시에만 */
  winner: "a" | "b";
  /** 일방 공격 결과 (승자의 남은 코인) */
  attacks: AttackCoin[];
  /** 공격 종료 후 상태이상 발동 */
  ticks: StatusTick[];
  sanity: { a: number; b: number };
}

export interface Side {
  combatant: Combatant;
  skill: Skill;
}

/**
 * 합 처리. 원작 규칙:
 *  - 양쪽이 남은 코인을 전부 던져 총 위력을 비교한다.
 *  - 패자는 코인 1개를 잃는다. 동률이면 둘 다 다시 던진다.
 *  - 한쪽 코인이 0이 되면 승자가 남은 코인으로 일방 공격한다.
 *  - 합 승리 시 정신력 상승, 패배 시 하락 (수치는 캠페인 설정).
 *  - 방어 스킬(가드)이 합에서 지면 피해를 받지 않고 끝난다(가드는 공격 코인이 없다).
 */
export function resolveClash(a: Side, b: Side, round: number, rules: RuleConfig, rng: Rng): ClashResult {
  let aLeft = a.skill.coinCount;
  let bLeft = b.skill.coinCount;
  const rounds: ClashRound[] = [];
  let guard = 0;

  while (aLeft > 0 && bLeft > 0) {
    const ra = rollSkill(a.skill, a.combatant.sanity, aLeft, rules, rng);
    const rb = rollSkill(b.skill, b.combatant.sanity, bLeft, rules, rng);
    let winner: ClashRound["winner"] = "draw";
    if (ra.totalPower > rb.totalPower) { winner = "a"; bLeft--; }
    else if (rb.totalPower > ra.totalPower) { winner = "b"; aLeft--; }
    rounds.push({ index: rounds.length, a: ra, b: rb, winner, aCoinsLeft: aLeft, bCoinsLeft: bLeft });
    if (++guard > 200) break; // 동률 무한루프 방지 (실제로는 발생하기 어려움)
  }

  const winner: "a" | "b" = aLeft > 0 ? "a" : "b";
  const win = winner === "a" ? a : b;
  const lose = winner === "a" ? b : a;
  const left = winner === "a" ? aLeft : bLeft;

  if (!win.combatant.sanityLocked) win.combatant.sanity = adjustSanity(win.combatant.sanity, rules.sanityOnClashWin, rules);
  if (!lose.combatant.sanityLocked) lose.combatant.sanity = adjustSanity(lose.combatant.sanity, rules.sanityOnClashLose, rules);

  const attacks: AttackCoin[] = [];
  const ticks: StatusTick[] = [];
  if (win.skill.kind === "attack") {
    attacks.push(...oneSidedAttack(win.combatant, lose.combatant, win.skill, left, round, rules, rng));
    ticks.push(...afterAttack(win.combatant, lose.combatant, attacks, round, rules));
  }
  // 승자가 방어 스킬(가드/회피)이면 피해 없이 종료. 반격은 후속 구현.

  return { rounds, winner, attacks, ticks, sanity: { a: a.combatant.sanity, b: b.combatant.sanity } };
}

/**
 * 공격 스킬 1회가 끝난 뒤의 상태이상 발동. (출혈은 코인마다 oneSidedAttack에서 처리)
 *  - 파열: 피격자가 적중을 1회라도 받았으면 N 추가 피해 → 절반
 *  - 침잠: 피격자가 적중을 1회라도 받았으면 정신력 -N → 절반
 *  - 진동: 흐트러진 상태로 피격당했으면 (배율은 computeHit에서 이미 반영) → 절반
 */
export function afterAttack(_attacker: Combatant, target: Combatant, attacks: AttackCoin[], round: number, rules: RuleConfig): StatusTick[] {
  const ticks: StatusTick[] = [];
  const landed = attacks.length > 0;
  const wasStaggered = attacks.some((a) => a.hit.staggerMult > 1);

  if (landed && !target.incapacitated) {
    const rupture = triggerStatus(target, "rupture");
    if (rupture > 0) ticks.push({ target: target.id, status: "rupture", amount: rupture, damage: applyDamage(target, rupture, round, rules) });
  }
  if (landed && !target.incapacitated) {
    const sinking = triggerStatus(target, "sinking");
    if (sinking > 0) {
      if (!target.sanityLocked) target.sanity = adjustSanity(target.sanity, -sinking, rules);
      ticks.push({ target: target.id, status: "sinking", amount: sinking, sanityAfter: target.sanity });
    }
  }
  if (wasStaggered) {
    const tremor = triggerStatus(target, "tremor");
    if (tremor > 0) ticks.push({ target: target.id, status: "tremor", amount: tremor });
  }
  return ticks;
}

/** 라운드 종료: 화상 N 피해 → 절반. 흐트러짐 만료는 tickStagger에서. */
export function roundEndBurn(c: Combatant, round: number, rules: RuleConfig): StatusTick | null {
  if (c.incapacitated) return null;
  const burn = triggerStatus(c, "burn");
  if (burn <= 0) return null;
  return { target: c.id, status: "burn", amount: burn, damage: applyDamage(c, burn, round, rules) };
}

/**
 * 일방 공격: 남은 코인(remaining)만큼 순서대로 던지고, 각 코인의 누적 위력만큼 피해를 준다.
 * 피해는 매 코인마다 적용하며, 대상이 전투불능이 되면 즉시 중단한다.
 */
export function oneSidedAttack(
  attacker: Combatant, target: Combatant, skill: Skill, remaining: number,
  round: number, rules: RuleConfig, rng: Rng,
): AttackCoin[] {
  const roll = rollSkill(skill, attacker.sanity, remaining, rules, rng);
  const out: AttackCoin[] = [];
  for (let i = 0; i < roll.coins.length; i++) {
    const c = roll.coins[i]!;
    const hit = computeHit(attacker, target, skill, c.power, c.heads, rules, rng);
    const damage = applyDamage(target, hit.final, round, rules);
    const coin: AttackCoin = { coinIndex: i, heads: c.heads, hit, damage };
    const bleed = triggerStatus(attacker, "bleed");
    if (bleed > 0) coin.bleed = { amount: bleed, damage: applyDamage(attacker, bleed, round, rules) };
    out.push(coin);
    if (damage.incapacitated || attacker.incapacitated) break;
  }
  return out;
}
