import type { DamageType, DefenseKind, Effect, Sin } from "./types";
import { SINS } from "./types";
import { DEFAULT_PROGRESSION, coinCapAt, expectedPower, maxHpAt, skillBudget, validateStats, type ProgressionConfig } from "./progression";

/** 캐릭터 시트의 JSON 데이터 (characters.data) */
export interface SkillDraft {
  id: string;
  name: string;
  kind: "attack" | "defense";
  tier?: 1 | 2 | 3;
  defenseKind?: DefenseKind;
  basePower: number;
  coinPower: number;
  coinCount: number;
  damageType: DamageType;
  sin: Sin;
  effectText: string;
  effects?: Effect[];
  /** E.G.O 비용 (ego 목록의 스킬에만) */
  ego?: { sanityCost: number; erosionGain: number; usesPerCombat: number };
}

export interface Trait {
  id: string;
  name: string;
  description: string;   // 자연어 원문
  effects?: Effect[];    // 구조화된 효과 (GM 승인 후)
}

export interface CharacterData {
  version: 1;
  level: number;
  sync: 1 | 2 | 3 | 4;
  stats: Record<Sin, number>;
  traits: Trait[];
  skills: SkillDraft[];      // 공격 3 + 방어 1
  ego: SkillDraft[];         // E.G.O (초기 0개)
  maxHp: number;
  hp: number;
  sanity: number;
  light: number;
  erosion: number;           // 침식도
  speed: { min: number; max: number; dice: 1 | 2 };
  background: string;        // 배경 서사
  inventory: string;         // 자유 텍스트
  notes: string;
}

export function newEgoDraft(): SkillDraft {
  return { id: `ego${Date.now().toString(36)}`, name: "", kind: "attack", tier: 3, basePower: 8, coinPower: 4, coinCount: 3, damageType: "slash", sin: "gloom", effectText: "",
    ego: { sanityCost: 20, erosionGain: 10, usesPerCombat: 1 } };
}

export function newCharacterData(p: ProgressionConfig = DEFAULT_PROGRESSION): CharacterData {
  const stats = Object.fromEntries(SINS.map((s) => [s, 2])) as Record<Sin, number>;
  const hp = maxHpAt(1, p);
  return {
    version: 1, level: 1, sync: 1, stats,
    traits: [
      { id: "t1", name: "", description: "" },
      { id: "t2", name: "", description: "" },
    ],
    skills: [
      { id: "s1", name: "", kind: "attack", tier: 1, basePower: 3, coinPower: 2, coinCount: 2, damageType: "slash", sin: "wrath", effectText: "" },
      { id: "s2", name: "", kind: "attack", tier: 2, basePower: 4, coinPower: 3, coinCount: 2, damageType: "slash", sin: "lust", effectText: "" },
      { id: "s3", name: "", kind: "attack", tier: 3, basePower: 5, coinPower: 3, coinCount: 2, damageType: "slash", sin: "sloth", effectText: "" },
      { id: "d1", name: "", kind: "defense", defenseKind: "guard", basePower: 5, coinPower: 2, coinCount: 1, damageType: "blunt", sin: "gluttony", effectText: "" },
    ],
    ego: [],
    maxHp: hp, hp, sanity: 0, light: p.lightPerSession, erosion: 0,
    speed: { min: 2, max: 5, dice: 1 },
    background: "", inventory: "", notes: "",
  };
}

export interface SheetIssue { path: string; message: string; level: "error" | "warn" }

/** 시트 검증. error는 저장 불가, warn은 GM 승인 시 참고. */
export function validateCharacter(d: CharacterData, p: ProgressionConfig = DEFAULT_PROGRESSION): SheetIssue[] {
  const out: SheetIssue[] = [];
  for (const i of validateStats(d.stats, p)) out.push({ path: "stats", message: i.message, level: "error" });

  const filled = d.traits.filter((t) => t.name.trim() || t.description.trim());
  if (filled.length < p.traitsAtCreation) out.push({ path: "traits", message: `특기는 ${p.traitsAtCreation}개를 적어야 합니다`, level: "error" });

  const attacks = d.skills.filter((s) => s.kind === "attack");
  const defenses = d.skills.filter((s) => s.kind === "defense");
  if (attacks.length !== 3) out.push({ path: "skills", message: "공격 스킬은 3개여야 합니다", level: "error" });
  if (defenses.length !== 1) out.push({ path: "skills", message: "방어 스킬은 1개여야 합니다", level: "error" });

  const cap = coinCapAt(d.level, p);
  for (const s of d.skills) {
    if (!s.name.trim()) out.push({ path: `skills.${s.id}.name`, message: "스킬 이름이 비었습니다", level: "error" });
    if (s.coinCount < 1 || s.coinCount > cap) out.push({ path: `skills.${s.id}.coinCount`, message: `코인은 1~${cap}개`, level: "error" });
    if (s.basePower < 0) out.push({ path: `skills.${s.id}.basePower`, message: "기본 위력은 0 이상", level: "error" });
    const tier = s.kind === "defense" ? "defense" : (s.tier ?? 1);
    const budget = skillBudget(tier, d.level, p);
    const ev = expectedPower(s.basePower, s.coinPower, s.coinCount);
    if (ev > budget) out.push({ path: `skills.${s.id}`, message: `기대 위력 ${ev.toFixed(1)}이 상한 ${budget}을 넘습니다`, level: "error" });
  }
  for (const e of d.ego) {
    if (!e.name.trim()) out.push({ path: `ego.${e.id}.name`, message: "E.G.O 이름이 비었습니다", level: "error" });
    if (!e.ego) out.push({ path: `ego.${e.id}`, message: "E.G.O 비용이 없습니다", level: "error" });
    if (e.coinCount < 1 || e.coinCount > p.maxCoins) out.push({ path: `ego.${e.id}.coinCount`, message: `코인은 1~${p.maxCoins}개`, level: "error" });
  }
  if (d.sanity < -45 || d.sanity > 45) out.push({ path: "sanity", message: "정신력은 -45~45", level: "error" });
  if (d.hp > d.maxHp || d.hp < 0) out.push({ path: "hp", message: "체력 범위 오류", level: "error" });
  return out;
}
