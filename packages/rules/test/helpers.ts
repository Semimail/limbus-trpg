import type { Combatant, Skill } from "../src";

export function mkSkill(p: Partial<Skill> = {}): Skill {
  return {
    id: p.id ?? "s1", name: p.name ?? "스킬", kind: p.kind ?? "attack", tier: p.tier ?? 1,
    basePower: p.basePower ?? 4, coinPower: p.coinPower ?? 2, coinCount: p.coinCount ?? 2,
    damageType: p.damageType ?? "slash", sin: p.sin ?? "wrath", ...p,
  };
}

export function mkCombatant(p: Partial<Combatant> = {}): Combatant {
  return {
    id: p.id ?? "c1", name: p.name ?? "캐릭터", side: p.side ?? "ally",
    maxHp: p.maxHp ?? 100, hp: p.hp ?? p.maxHp ?? 100, sanity: p.sanity ?? 0,
    speed: p.speed ?? { min: 2, max: 5, dice: 1 },
    skills: p.skills ?? [mkSkill()], statuses: p.statuses ?? {},
    staggered: false, staggerTriggered: [], incapacitated: false, ...p,
  };
}
