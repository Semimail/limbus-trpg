import type { Rng } from "./rng";
import type { Combatant, RuleConfig, Skill } from "./types";
import { rollSkill, type SkillRoll } from "./skill";
import { computeHit, type HitBreakdown } from "./damage";
import { applyDamage, type DamageOutcome } from "./stagger";
import { adjustSanity } from "./coin";

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
}

export interface ClashResult {
  rounds: ClashRound[];
  /** 합 최종 승자. 양쪽 코인이 동시에 0이 되는 일은 없으므로 draw는 코인 소진 전 종료 시에만 */
  winner: "a" | "b";
  /** 일방 공격 결과 (승자의 남은 코인) */
  attacks: AttackCoin[];
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

  win.combatant.sanity = adjustSanity(win.combatant.sanity, rules.sanityOnClashWin, rules);
  lose.combatant.sanity = adjustSanity(lose.combatant.sanity, rules.sanityOnClashLose, rules);

  const attacks: AttackCoin[] = [];
  if (win.skill.kind === "attack") {
    attacks.push(...oneSidedAttack(win.combatant, lose.combatant, win.skill, left, round, rules, rng));
  }
  // 승자가 방어 스킬(가드/회피)이면 피해 없이 종료. 반격은 후속 구현.

  return { rounds, winner, attacks, sanity: { a: a.combatant.sanity, b: b.combatant.sanity } };
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
    out.push({ coinIndex: i, heads: c.heads, hit, damage });
    if (damage.incapacitated) break;
  }
  return out;
}
