import { createRng } from "./rng";
import { rollSkill } from "./skill";
import type { RuleConfig, Skill } from "./types";

export type ClashOdds = "압도" | "유리" | "보통" | "불리" | "열세";

export interface ClashEstimate {
  /** a가 합에서 이길 확률 (0~1) */
  winRate: number;
  label: ClashOdds;
  /** 첫 교환의 기대 위력 */
  aPower: number;
  bPower: number;
}

/**
 * 합 예측 (림버스의 유리/보통/불리 표시용). 부작용 없이 코인만 던져 승률을 추정한다.
 * 효과·상태이상은 반영하지 않는 1차 수치다.
 */
export function estimateClash(a: Skill, aSanity: number, b: Skill, bSanity: number, rules: RuleConfig, trials = 400, seed = 1): ClashEstimate {
  const rng = createRng(seed);
  let wins = 0;
  for (let t = 0; t < trials; t++) {
    let al = a.coinCount, bl = b.coinCount, guard = 0;
    while (al > 0 && bl > 0 && guard++ < 100) {
      const ra = rollSkill(a, aSanity, al, rules, rng).totalPower;
      const rb = rollSkill(b, bSanity, bl, rules, rng).totalPower;
      if (ra > rb) bl--; else if (rb > ra) al--;
    }
    if (al > 0) wins++;
  }
  const winRate = wins / trials;
  const label: ClashOdds = winRate >= 0.85 ? "압도" : winRate >= 0.6 ? "유리" : winRate >= 0.4 ? "보통" : winRate >= 0.2 ? "불리" : "열세";
  const exp = (s: Skill, sanity: number) => s.basePower + s.coinPower * s.coinCount * Math.min(1, Math.max(0, rules.headsBase + Math.min(rules.sanityMax, Math.max(rules.sanityMin, sanity)) / 100));
  return { winRate, label, aPower: Math.round(exp(a, aSanity) * 10) / 10, bPower: Math.round(exp(b, bSanity) * 10) / 10 };
}
