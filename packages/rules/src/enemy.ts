import type { DamageType, Resistance, Sin } from "./types";
import type { SkillDraft } from "./character";
import type { Grade } from "./progression";

/** 적 도감 항목 데이터 (enemies.data) */
export interface Gimmick { id: string; name: string; text: string }

export interface EnemyData {
  version: 1;
  threat: Grade;
  maxHp: number;
  /** 정신력 사용 여부. false면 앞면 확률 50% 고정 */
  hasSanity: boolean;
  sanity: number;
  speed: { min: number; max: number; dice: 1 | 2 | 3 };
  skills: SkillDraft[];
  gimmicks: Gimmick[];
  resist: { damage: Partial<Record<DamageType, Resistance>>; sin: Partial<Record<Sin, Resistance>> };
  description: string;
}

export function newEnemyData(): EnemyData {
  return {
    version: 1, threat: "뜬소문", maxHp: 120, hasSanity: false, sanity: 0,
    speed: { min: 2, max: 5, dice: 1 },
    skills: [
      { id: "e1", name: "할퀴기", kind: "attack", tier: 1, basePower: 3, coinPower: 2, coinCount: 2, damageType: "slash", sin: "wrath", effectText: "" },
      { id: "e2", name: "물어뜯기", kind: "attack", tier: 2, basePower: 4, coinPower: 3, coinCount: 2, damageType: "pierce", sin: "gluttony", effectText: "" },
    ],
    gimmicks: [],
    resist: { damage: {}, sin: {} },
    description: "",
  };
}
