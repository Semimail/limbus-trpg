import type { Rng } from "./rng";
import type { RuleConfig } from "./types";
import { flipCoin } from "./coin";

/**
 * 비전투 판정.
 * 능력치(1~5) + 보너스 코인(특기, 빛 사용 등)만큼 코인을 던져 앞면 수를 난이도(1~5)와 비교.
 * 앞면 확률은 전투와 같이 정신력의 영향을 받는다.
 */
export interface Judgement {
  coins: boolean[];
  heads: number;
  difficulty: number;
  success: boolean;
  /** 앞면 - 난이도. 양수면 여유 성공, 음수면 실패 폭 */
  margin: number;
}

export function judge(stat: number, bonusCoins: number, difficulty: number, sanity: number, rules: RuleConfig, rng: Rng): Judgement {
  const n = Math.max(0, stat + bonusCoins);
  const coins: boolean[] = [];
  for (let i = 0; i < n; i++) coins.push(flipCoin(sanity, rules, rng));
  const heads = coins.filter(Boolean).length;
  return { coins, heads, difficulty, success: heads >= difficulty, margin: heads - difficulty };
}

/** 대립 판정 (PC vs NPC, PC vs PC). 동률이면 방어 측 승리. */
export interface OpposedJudgement {
  attacker: { coins: boolean[]; heads: number };
  defender: { coins: boolean[]; heads: number };
  winner: "attacker" | "defender";
}

export function judgeOpposed(
  att: { stat: number; bonus: number; sanity: number },
  def: { stat: number; bonus: number; sanity: number },
  rules: RuleConfig, rng: Rng,
): OpposedJudgement {
  const roll = (s: typeof att) => {
    const coins: boolean[] = [];
    for (let i = 0; i < Math.max(0, s.stat + s.bonus); i++) coins.push(flipCoin(s.sanity, rules, rng));
    return { coins, heads: coins.filter(Boolean).length };
  };
  const a = roll(att), d = roll(def);
  return { attacker: a, defender: d, winner: a.heads > d.heads ? "attacker" : "defender" };
}
