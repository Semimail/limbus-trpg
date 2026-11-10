import { createRng, resolveClash, DEFAULT_RULES, computeHit } from "../src";
import { mkCombatant, mkSkill } from "./helpers";

describe("합", () => {
  it("합 승자는 정신력 +10, 패자 -10, 승자의 남은 코인으로 일방 공격", () => {
    const a = mkCombatant({ id: "a", sanity: 45, skills: [mkSkill({ basePower: 10, coinPower: 5, coinCount: 3 })] });
    const b = mkCombatant({ id: "b", side: "enemy", sanity: -45, skills: [mkSkill({ basePower: 1, coinPower: 1, coinCount: 2 })] });
    const r = resolveClash({ combatant: a, skill: a.skills[0]! }, { combatant: b, skill: b.skills[0]! }, 1, DEFAULT_RULES, createRng(42));
    expect(r.winner).toBe("a");
    expect(a.sanity).toBe(45);   // 상한
    expect(b.sanity).toBe(-45);  // 하한
    expect(r.attacks.length).toBeGreaterThan(0);
    expect(b.hp).toBeLessThan(b.maxHp);
    // 패자 코인은 합 라운드마다 하나씩 줄어 0이 된다
    const last = r.rounds[r.rounds.length - 1]!;
    expect(last.bCoinsLeft).toBe(0);
  });

  it("방어(가드)가 합에서 이기면 피해가 없다", () => {
    const att = mkCombatant({ id: "a", sanity: -45, skills: [mkSkill({ basePower: 1, coinPower: 1, coinCount: 1 })] });
    const guard = mkSkill({ id: "g", kind: "defense", defenseKind: "guard", basePower: 20, coinPower: 2, coinCount: 1 });
    const def = mkCombatant({ id: "d", side: "enemy", sanity: 45, skills: [guard] });
    const r = resolveClash({ combatant: att, skill: att.skills[0]! }, { combatant: def, skill: guard }, 1, DEFAULT_RULES, createRng(5));
    expect(r.winner).toBe("b");
    expect(r.attacks).toHaveLength(0);
    expect(att.hp).toBe(att.maxHp);
  });

  it("일방 공격은 대상이 전투불능이 되면 멈춘다", () => {
    const a = mkCombatant({ id: "a", sanity: 45, skills: [mkSkill({ basePower: 100, coinPower: 50, coinCount: 5 })] });
    const b = mkCombatant({ id: "b", side: "enemy", maxHp: 50, sanity: -45, skills: [mkSkill({ basePower: 0, coinPower: 1, coinCount: 1 })] });
    const r = resolveClash({ combatant: a, skill: a.skills[0]! }, { combatant: b, skill: b.skills[0]! }, 1, DEFAULT_RULES, createRng(11));
    expect(b.incapacitated).toBe(true);
    expect(r.attacks.length).toBeLessThanOrEqual(5);
    expect(r.attacks[r.attacks.length - 1]!.damage.incapacitated).toBe(true);
  });
});

describe("치명타(호흡)", () => {
  it("호흡 20 = 100% 치명타, 1.5배, 발동 후 절반", () => {
    const a = mkCombatant({ statuses: { poise: 20 } });
    const t = mkCombatant({ id: "t", side: "enemy" });
    const h = computeHit(a, t, mkSkill(), 10, true, DEFAULT_RULES, createRng(1));
    expect(h.crit).toBe(true);
    expect(h.final).toBe(15);
    expect(a.statuses.poise).toBe(10);
  });

  it("호흡이 없으면 치명타 없음, 뒷면이면 치명타 없음", () => {
    const a = mkCombatant();
    const t = mkCombatant({ id: "t", side: "enemy" });
    expect(computeHit(a, t, mkSkill(), 10, true, DEFAULT_RULES, createRng(1)).crit).toBe(false);
    const b = mkCombatant({ statuses: { poise: 20 } });
    expect(computeHit(b, t, mkSkill(), 10, false, DEFAULT_RULES, createRng(1)).crit).toBe(false);
  });

  it("흐트러진 대상은 2배, 치명타와 곱연산", () => {
    const a = mkCombatant({ statuses: { poise: 20 } });
    const t = mkCombatant({ id: "t", side: "enemy", staggered: true });
    expect(computeHit(a, t, mkSkill(), 10, true, DEFAULT_RULES, createRng(1)).final).toBe(30);
  });

  it("저항은 토글이 꺼져 있으면 무시, 켜면 적용", () => {
    const a = mkCombatant();
    const t = mkCombatant({ id: "t", side: "enemy", resist: { damage: { slash: "weak" } } });
    expect(computeHit(a, t, mkSkill(), 10, true, DEFAULT_RULES, createRng(1)).final).toBe(10);
    const on = { ...DEFAULT_RULES, resistanceMode: "all" as const };
    expect(computeHit(a, t, mkSkill(), 10, true, on, createRng(1)).final).toBe(15);
  });
});
