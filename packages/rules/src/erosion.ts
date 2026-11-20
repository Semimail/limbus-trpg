import type { RuleConfig } from "./types";

/**
 * 침식도 단계 (표시용). 룰 수치가 아니라 화면 연출·시트 표기의 구간이다.
 * 침식도 상한(rules.erosionMax, 기본 100)을 4등분해 0~3단계, 상한에 닿으면 4단계(침식).
 *   0 안정 / 1 동요 / 2 잠식 / 3 임계 / 4 침식
 */
export const EROSION_STAGE_LABEL = ["안정", "동요", "잠식", "임계", "침식"] as const;
export type ErosionStage = 0 | 1 | 2 | 3 | 4;

export function erosionStage(erosion: number, rules: Pick<RuleConfig, "erosionMax">): ErosionStage {
  const max = Math.max(1, rules.erosionMax);
  if (erosion >= max) return 4;
  const s = Math.floor((Math.max(0, erosion) / max) * 4);
  return Math.max(0, Math.min(3, s)) as ErosionStage;
}

/** 단계가 올라갔는지 (전투 종료 연출용) */
export function erosionStageChanged(before: number, after: number, rules: Pick<RuleConfig, "erosionMax">): { from: ErosionStage; to: ErosionStage } | null {
  const a = erosionStage(before, rules), b = erosionStage(after, rules);
  return a === b ? null : { from: a, to: b };
}
