/** 죄악 속성 7종. 비전투 능력치로도 쓰인다. */
export type Sin = "wrath" | "lust" | "sloth" | "gluttony" | "gloom" | "pride" | "envy";
export const SINS: readonly Sin[] = ["wrath", "lust", "sloth", "gluttony", "gloom", "pride", "envy"];
export const SIN_LABEL: Record<Sin, string> = {
  wrath: "분노", lust: "색욕", sloth: "나태", gluttony: "탐식", gloom: "우울", pride: "오만", envy: "질투",
};

/** 피해 유형 3종 */
export type DamageType = "slash" | "pierce" | "blunt";
export const DAMAGE_TYPE_LABEL: Record<DamageType, string> = { slash: "참격", pierce: "관통", blunt: "타격" };

/** 저항 단계. 원작과 동일 (취약 2.0 / 보통 1.0 / 내성 0.5 / 면역 0) */
export type Resistance = "fatal" | "weak" | "normal" | "endure" | "resist" | "immune";
export const RESISTANCE_MULT: Record<Resistance, number> = {
  fatal: 2.0, weak: 1.5, normal: 1.0, endure: 0.75, resist: 0.5, immune: 0,
};

export type SkillKind = "attack" | "defense";
export type DefenseKind = "guard" | "evade" | "counter";

export interface Skill {
  id: string;
  name: string;
  kind: SkillKind;
  /** 방어 스킬일 때만 */
  defenseKind?: DefenseKind;
  /** 덱 비율. 원작 스킬1/2/3 = 3/2/1. 방어 스킬은 덱에 들어가지 않는다. */
  tier?: 1 | 2 | 3;
  basePower: number;
  coinPower: number;   // 음수 가능 (뒷면이 유리한 스킬은 다루지 않고, 음수 코인은 "앞면이면 감소")
  coinCount: number;   // 1~14
  damageType: DamageType;
  sin: Sin;
  /** 부가 효과 설명. 1차에서는 텍스트로만 표시하고 GM이 수동 적용 */
  effectText?: string;
  /** 구조화된 효과 (자동 실행) */
  effects?: Effect[];
  /** 사거리(칸). 1 = 근접(주변 8칸). 없으면 1 */
  range?: number;
  /** E.G.O 스킬이면 비용 정보. 덱에 들어가지 않고 항상 선택 가능 */
  ego?: { sanityCost: number; erosionGain: number; usesPerCombat: number };
}

/**
 * 상태이상 7종. 숫자 하나(N)로 관리하며 발동 후 절반(내림)으로 줄어든다.
 * burn 화상 / bleed 출혈 / tremor 진동 / rupture 파열 / sinking 침잠 / poise 호흡 / charge 충전
 */
export type StatusId = "burn" | "bleed" | "tremor" | "rupture" | "sinking" | "poise" | "charge";
export const STATUS_IDS: readonly StatusId[] = ["burn", "bleed", "tremor", "rupture", "sinking", "poise", "charge"];
export const STATUS_LABEL: Record<StatusId, string> = {
  burn: "화상", bleed: "출혈", tremor: "진동", rupture: "파열", sinking: "침잠", poise: "호흡", charge: "충전",
};
export type Statuses = Partial<Record<StatusId, number>>;

export interface Combatant {
  id: string;
  name: string;
  side: "ally" | "enemy";
  maxHp: number;
  hp: number;
  /** 정신력 -45 ~ +45 */
  sanity: number;
  /** true면 정신력이 변하지 않는다 (환상체 등) */
  sanityLocked?: boolean;
  /** 속도 다이스 범위와 개수 (캐릭터 귀속) */
  speed: { min: number; max: number; dice: 1 | 2 };
  skills: Skill[];
  statuses: Statuses;
  /** 흐트러짐 상태. staggeredUntilRound 이전 라운드까지 행동 불가, 피해 2배 */
  staggered: boolean;
  staggeredUntilRound?: number;
  /** 이미 발동한 흐트러짐 구간 (0.5, 0.3) */
  staggerTriggered: number[];
  /** 저항표. 토글이 꺼져 있으면 무시 */
  resist?: { damage?: Partial<Record<DamageType, Resistance>>; sin?: Partial<Record<Sin, Resistance>> };
  incapacitated: boolean;
}

/** 캠페인 단위 규칙 토글 */
export interface RuleConfig {
  sanityMin: number;         // -45
  sanityMax: number;         // 45
  headsBase: number;         // 0.5
  sanityOnClashWin: number;  // +10
  sanityOnClashLose: number; // -10
  staggerThresholds: number[]; // [0.5, 0.3]
  staggerDamageMult: number;   // 2
  critMult: number;            // 1.5 고정 (플레이어 수정 불가)
  poiseCritPerPotency: number; // 0.05
  statusCap: number;           // 99
  chargeCap: number;           // 20
  tremorStaggerBonus: number;  // 진동 N당 흐트러짐 피해 배율 +0.1
  resistanceMode: "off" | "enemyOnly" | "all";
  /** E.G.O 사용 후 정신력이 이 값 미만이면 침식 판정 (코인 뒷면 = 침식) */
  egoCorrosionSanityBelow: number; // 0
  /** 침식도가 이 값에 도달하면 무조건 침식 */
  erosionMax: number;              // 100
  /** 손패 교체에 드는 빛 */
  lightRedrawCost: number;         // 1
  /** 격자 사용 여부와 크기 */
  gridEnabled: boolean;            // true
  gridCols: number;                // 10
  gridRows: number;                // 6
  /** 이동력 = 속도 + moveBonus */
  moveBonus: number;               // 3
  /** 보호에 드는 빛 */
  protectLightCost: number;        // 1
  /** 보호 가능 거리(칸) */
  protectRange: number;            // 2
}

export const DEFAULT_RULES: RuleConfig = {
  sanityMin: -45,
  sanityMax: 45,
  headsBase: 0.5,
  sanityOnClashWin: 10,
  sanityOnClashLose: -10,
  staggerThresholds: [0.5, 0.3],
  staggerDamageMult: 2,
  critMult: 1.5,
  poiseCritPerPotency: 0.05,
  statusCap: 99,
  chargeCap: 20,
  tremorStaggerBonus: 0.1,
  resistanceMode: "off",
  egoCorrosionSanityBelow: 0,
  erosionMax: 100,
  lightRedrawCost: 1,
  gridEnabled: true,
  gridCols: 10,
  gridRows: 6,
  moveBonus: 3,
  protectLightCost: 1,
  protectRange: 2,
};

/* ---------- 구조화된 효과 (특기 / 패시브 / 스킬 부가효과 / 적 기믹 공용) ---------- */

export type Trigger =
  | "combatStart" | "roundStart" | "roundEnd"
  | "skillUse"                       // 이 스킬을 사용할 때 (위력 보정은 여기서만)
  | "onHeads" | "onTails"            // 공격 코인 하나하나
  | "onHit" | "onCrit"               // 적중 / 치명타
  | "clashWin" | "clashLose"
  | "onKill" | "onStaggered" | "onDamaged";

export type Target = "self" | "clashTarget" | "allies" | "enemies" | "all";

export type Condition =
  | { type: "chargeAtLeast"; n: number }
  | { type: "statusAtLeast"; status: StatusId; n: number; who: "self" | "clashTarget" }
  | { type: "sanityAtLeast"; n: number }
  | { type: "sanityBelow"; n: number }
  | { type: "hpBelowPct"; pct: number };

export type Action =
  | { type: "applyStatus"; status: StatusId; amount: number }
  | { type: "sanity"; delta: number }
  | { type: "heal"; amount: number }
  | { type: "healPct"; pct: number }
  | { type: "damage"; amount: number }
  | { type: "addCoinPower"; delta: number }
  | { type: "addBasePower"; delta: number }
  | { type: "consumeCharge"; amount: number };

export interface Effect {
  trigger: Trigger;
  target: Target;
  action: Action;
  condition?: Condition;
  /** 전투당 1회 */
  once?: boolean;
  /** 자연어 원문 */
  source?: string;
}
