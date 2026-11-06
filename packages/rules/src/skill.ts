import type { Rng } from "./rng";
import type { RuleConfig, Skill } from "./types";
import { flipCoin } from "./coin";

export interface CoinResult {
  heads: boolean;
  /** 이 코인까지 누적된 위력 */
  power: number;
}

export interface SkillRoll {
  skillId: string;
  coins: CoinResult[];
  /** 마지막 코인까지의 총 위력 (합 비교용) */
  totalPower: number;
}

/**
 * 남은 코인 수(remaining)만큼 코인을 던져 위력을 계산한다.
 * 위력 = 기본 위력 + (앞면 수 x 코인 위력). 0 미만으로 내려가지 않는다.
 */
export function rollSkill(skill: Skill, sanity: number, remaining: number, rules: RuleConfig, rng: Rng): SkillRoll {
  const coins: CoinResult[] = [];
  let power = skill.basePower;
  for (let i = 0; i < remaining; i++) {
    const heads = flipCoin(sanity, rules, rng);
    if (heads) power += skill.coinPower;
    coins.push({ heads, power: Math.max(0, power) });
  }
  return { skillId: skill.id, coins, totalPower: Math.max(0, power) };
}
