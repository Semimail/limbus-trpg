import type { Sin } from "./types";

/**
 * 성장 공식. 전부 캠페인 설정으로 덮어쓸 수 있다.
 * 목표: 1레벨은 원작 초반 수준(체력 100, 위력 한 자리), 최종 등급은 체력 6자리, 위력 3자리, 코인 14개.
 */
export interface ProgressionConfig {
  maxLevel: number;          // 49
  levelsPerGrade: number;    // 7
  baseHp: number;            // 100
  hpGrowth: number;          // 레벨당 배율 1.15 → 49레벨 ≈ 82,000
  powerGrowth: number;       // 레벨당 배율 1.08 → 49레벨 ≈ 40배
  baseCoinCap: number;       // 2
  coinCapPerLevels: number;  // 4레벨마다 +1 → 49레벨에 14
  maxCoins: number;          // 14
  statPoints: number;        // 생성 시 14
  statMin: number;           // 1
  statMax: number;           // 5
  statMaxCount: number;      // 최대치(5)를 가질 수 있는 능력치 수: 1
  traitsAtCreation: number;  // 특기 2
  lightPerSession: number;   // 빛 3
  /* ---- 성장: 경험치·해금 (2026-11-20) ---- */
  expPerSession: number;       // GM 지급 기본값 2
  expCostPerGrade: number;     // 레벨업 비용 = 현재 등급 번호(1~7) × 이 값 (기본 1)
  statPointsPerGrade: number;  // 등급이 오를 때마다 능력치 총점 +1
  passiveUnlockGrades: number[]; // 패시브 해금 등급 인덱스(0 뜬소문 … 6 불순물). 기본 [1, 4] = 도시괴담·도시의 재앙
  syncMinLevels: number[];     // 동기화 1~4단계 최소 레벨. 기본 [1, 8, 15, 29]
}

export const DEFAULT_PROGRESSION: ProgressionConfig = {
  maxLevel: 49, levelsPerGrade: 7,
  baseHp: 100, hpGrowth: 1.15, powerGrowth: 1.08,
  baseCoinCap: 2, coinCapPerLevels: 4, maxCoins: 14,
  statPoints: 14, statMin: 1, statMax: 5, statMaxCount: 1,
  traitsAtCreation: 2, lightPerSession: 3,
  expPerSession: 2, expCostPerGrade: 1, statPointsPerGrade: 1, passiveUnlockGrades: [1, 4], syncMinLevels: [1, 8, 15, 29],
};

export const GRADES = ["뜬소문", "도시괴담", "도시전설", "도시의 악몽", "도시의 재앙", "별", "불순물"] as const;
export type Grade = (typeof GRADES)[number];

/** 등급 인덱스 0(뜬소문)~6(불순물) */
export function gradeIndexOf(level: number, p = DEFAULT_PROGRESSION): number {
  return Math.min(GRADES.length - 1, Math.floor((Math.max(1, level) - 1) / p.levelsPerGrade));
}

export function gradeOf(level: number, p = DEFAULT_PROGRESSION): Grade {
  return GRADES[gradeIndexOf(level, p)]!;
}

/* ---------- 경험치·해금 ---------- */

/** level → level+1 에 드는 경험치. 등급이 높을수록 비싸다 (뜬소문 1, 도시괴담 2, … 불순물 7) */
export function levelUpCost(level: number, p = DEFAULT_PROGRESSION): number {
  return (gradeIndexOf(level, p) + 1) * p.expCostPerGrade;
}
/** 레벨에 따른 능력치 총점 (등급마다 +statPointsPerGrade) */
export function statPointsAt(level: number, p = DEFAULT_PROGRESSION): number {
  return p.statPoints + gradeIndexOf(level, p) * p.statPointsPerGrade;
}
/** 최대치(5)를 가질 수 있는 능력치 수: 두 등급마다 +1 */
export function statMaxCountAt(level: number, p = DEFAULT_PROGRESSION): number {
  return p.statMaxCount + Math.floor(gradeIndexOf(level, p) / 2);
}
/** 특기 칸 수: 생성 시 수 + 등급마다 1 */
export function traitSlotsAt(level: number, p = DEFAULT_PROGRESSION): number {
  return p.traitsAtCreation + gradeIndexOf(level, p);
}
/** 패시브 칸 수: 해금 등급에 도달할 때마다 1, 동기화 4단계에 고유 패시브 1 */
export function passiveSlotsAt(level: number, sync: number, p = DEFAULT_PROGRESSION): number {
  const g = gradeIndexOf(level, p);
  return p.passiveUnlockGrades.filter((x) => g >= x).length + (sync >= 4 ? 1 : 0);
}
/** 동기화 단계의 최소 레벨 */
export function syncMinLevel(sync: number, p = DEFAULT_PROGRESSION): number {
  return p.syncMinLevels[Math.max(0, Math.min(p.syncMinLevels.length - 1, sync - 1))] ?? 1;
}
/** 다음 등급(해금)까지 남은 레벨. 최고 등급이면 null */
export function levelsToNextGrade(level: number, p = DEFAULT_PROGRESSION): number | null {
  const g = gradeIndexOf(level, p);
  if (g >= GRADES.length - 1) return null;
  return (g + 1) * p.levelsPerGrade + 1 - Math.max(1, level);
}

export function maxHpAt(level: number, p = DEFAULT_PROGRESSION): number {
  return Math.round(p.baseHp * Math.pow(p.hpGrowth, Math.max(1, level) - 1));
}

/** 레벨에 따른 위력 배율 (1레벨 = 1.0) */
export function powerScaleAt(level: number, p = DEFAULT_PROGRESSION): number {
  return Math.pow(p.powerGrowth, Math.max(1, level) - 1);
}

export function coinCapAt(level: number, p = DEFAULT_PROGRESSION): number {
  return Math.min(p.maxCoins, p.baseCoinCap + Math.floor(Math.max(1, level) / p.coinCapPerLevels));
}

/* ---------- 스킬 포인트 ---------- */

/** 스킬 기대 위력 = 기본 + 코인 수 × 코인 위력 × 0.5 (앞면 확률 50% 기준) */
export function expectedPower(basePower: number, coinPower: number, coinCount: number): number {
  return basePower + coinCount * coinPower * 0.5;
}

/**
 * 티어별 1레벨 기대 위력 상한. 원작 0동기화 인격의 스킬1/2/3 기대값(약 5 / 7 / 9.5)과 방어 스킬 기준.
 * 레벨에 따라 powerScale 배율이 곱해진다.
 */
export const TIER_BUDGET_L1 = { 1: 5, 2: 7, 3: 10, defense: 7 } as const;

export function skillBudget(tier: 1 | 2 | 3 | "defense", level: number, p = DEFAULT_PROGRESSION): number {
  return Math.round(TIER_BUDGET_L1[tier] * powerScaleAt(level, p) * 10) / 10;
}

/* ---------- 능력치 검증 ---------- */

export interface StatIssue { code: "sum" | "range" | "maxCount"; message: string }

export function validateStats(stats: Record<Sin, number>, p = DEFAULT_PROGRESSION, level = 1): StatIssue[] {
  const issues: StatIssue[] = [];
  const values = Object.values(stats);
  const sum = values.reduce((a, b) => a + b, 0);
  const points = statPointsAt(level, p), maxCount = statMaxCountAt(level, p);
  if (sum !== points) issues.push({ code: "sum", message: `능력치 합계는 ${points}이어야 합니다 (현재 ${sum})` });
  if (values.some((v) => v < p.statMin || v > p.statMax)) issues.push({ code: "range", message: `각 능력치는 ${p.statMin}~${p.statMax} 사이여야 합니다` });
  if (values.filter((v) => v === p.statMax).length > maxCount) issues.push({ code: "maxCount", message: `${p.statMax}는 ${maxCount}개까지만 가능합니다` });
  return issues;
}

/* ---------- 스킬 틀 (프리셋) ---------- */

export interface SkillPreset {
  key: string;
  label: string;
  desc: string;
  basePower: number;
  coinPower: number;
  coinCount: number;
}

/**
 * 상한(budget)과 코인 상한에 맞춰 기대 위력이 상한을 넘지 않는 틀을 만든다.
 * 기대 위력 = base + coins × coinPower × 0.5 이므로 coinPower = floor((budget - base) / (coins × 0.5)).
 */
export function skillPresets(tier: 1 | 2 | 3 | "defense", level: number, p = DEFAULT_PROGRESSION): SkillPreset[] {
  const B = skillBudget(tier, level, p);
  const C = coinCapAt(level, p);
  const mk = (key: string, label: string, desc: string, baseRatio: number, coins: number): SkillPreset => {
    const coinCount = Math.max(1, Math.min(C, coins));
    const basePower = Math.max(0, Math.floor(B * baseRatio));
    const coinPower = Math.max(0, Math.floor((B - basePower) / (coinCount * 0.5)));
    return { key, label, desc, basePower, coinPower, coinCount };
  };
  if (tier === "defense") {
    return [
      mk("wall", "철벽", "기본 위력이 높고 코인 1개. 꾸준히 막는다.", 0.8, 1),
      mk("flow", "유연", "코인 2개. 운에 따라 더 크게 막거나 뚫린다.", 0.5, 2),
      mk("riposte", "역습", "기본은 낮고 코인이 세다. 반격용.", 0.3, 2),
    ];
  }
  const list = [
    mk("steady", "안정형", "기본 위력 위주. 뒷면이 나와도 크게 흔들리지 않는다.", 0.6, 2),
    mk("gamble", "도박형", "코인 위력 위주. 앞면이 이어지면 크게 터진다.", 0.2, 2),
    mk("heavy", "한방형", "코인 1개. 결과가 둘 중 하나다.", 0.5, 1),
  ];
  if (C >= 3) list.push(mk("multi", "다타형", `코인 ${C}개. 적중 횟수가 많아 상태이상 스킬과 잘 맞는다.`, 0.3, C));
  return list;
}
