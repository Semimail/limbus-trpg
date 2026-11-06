import type { Rng } from "./rng";
import type { Combatant, RuleConfig, Skill } from "./types";
import { RESISTANCE_MULT } from "./types";

export interface HitBreakdown {
  rawPower: number;
  crit: boolean;
  resistMult: number;
  staggerMult: number;
  critMult: number;
  final: number;
}

function resistanceMultiplier(target: Combatant, skill: Skill, rules: RuleConfig): number {
  if (rules.resistanceMode === "off") return 1;
  if (rules.resistanceMode === "enemyOnly" && target.side !== "enemy") return 1;
  const d = target.resist?.damage?.[skill.damageType] ?? "normal";
  const s = target.resist?.sin?.[skill.sin] ?? "normal";
  return RESISTANCE_MULT[d] * RESISTANCE_MULT[s];
}

/**
 * 호흡 기반 치명타 판정. 앞면 적중에서만 호출된다.
 * 확률 = 호흡 위력 x 5%. 치명타가 나면 호흡 횟수 1 감소, 0이면 제거.
 */
export function rollCrit(attacker: Combatant, rules: RuleConfig, rng: Rng): boolean {
  const poise = attacker.statuses.poise;
  if (!poise || poise.count <= 0 || poise.potency <= 0) return false;
  const chance = Math.min(1, poise.potency * rules.poiseCritPerPotency);
  if (rng.next() >= chance) return false;
  poise.count -= 1;
  if (poise.count <= 0) delete attacker.statuses.poise;
  return true;
}

/** 코인 1개의 적중 피해 계산 (피해 적용은 하지 않는다) */
export function computeHit(
  attacker: Combatant, target: Combatant, skill: Skill, rawPower: number, heads: boolean,
  rules: RuleConfig, rng: Rng,
): HitBreakdown {
  const crit = heads && rollCrit(attacker, rules, rng);
  const resistMult = resistanceMultiplier(target, skill, rules);
  const staggerMult = target.staggered ? rules.staggerDamageMult : 1;
  const critMult = crit ? rules.critMult : 1;
  const final = Math.floor(rawPower * resistMult * staggerMult * critMult);
  return { rawPower, crit, resistMult, staggerMult, critMult, final };
}
