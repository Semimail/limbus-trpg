import type { Rng } from "./rng";
import type { RuleConfig } from "./types";

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 정신력에 따른 앞면 확률. 원작: 50% + 정신력% */
export function headsProbability(sanity: number, rules: RuleConfig): number {
  const s = clamp(sanity, rules.sanityMin, rules.sanityMax);
  return clamp(rules.headsBase + s / 100, 0, 1);
}

export function flipCoin(sanity: number, rules: RuleConfig, rng: Rng): boolean {
  return rng.next() < headsProbability(sanity, rules);
}

/** 정신력을 범위 안에서 조정 */
export function adjustSanity(sanity: number, delta: number, rules: RuleConfig): number {
  return clamp(sanity + delta, rules.sanityMin, rules.sanityMax);
}
