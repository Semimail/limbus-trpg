import { createRng, DEFAULT_RULES, addStatus, triggerStatus, consumeCharge, oneSidedAttack, afterAttack, roundEndBurn, computeHit } from "../src";
import { mkCombatant, mkSkill } from "./helpers";

describe("상태이상: 숫자 하나, 발동 후 절반", () => {
  it("부여는 더해지고 상한이 있다", () => {
    const c = mkCombatant();
    addStatus(c, "burn", 5, DEFAULT_RULES); addStatus(c, "burn", 3, DEFAULT_RULES);
    expect(c.statuses.burn).toBe(8);
    addStatus(c, "charge", 50, DEFAULT_RULES);
    expect(c.statuses.charge).toBe(20);
  });

  it("발동 후 절반(내림), 1은 사라진다", () => {
    const c = mkCombatant({ statuses: { rupture: 5 } });
    expect(triggerStatus(c, "rupture")).toBe(5); expect(c.statuses.rupture).toBe(2);
    expect(triggerStatus(c, "rupture")).toBe(2); expect(c.statuses.rupture).toBe(1);
    expect(triggerStatus(c, "rupture")).toBe(1); expect(c.statuses.rupture).toBeUndefined();
    expect(triggerStatus(c, "rupture")).toBe(0);
  });

  it("출혈은 공격 코인마다 공격자에게 N 피해 후 절반", () => {
    const a = mkCombatant({ id: "a", maxHp: 100, sanity: 45, statuses: { bleed: 8 }, skills: [mkSkill({ basePower: 1, coinPower: 1, coinCount: 3 })] });
    const t = mkCombatant({ id: "t", side: "enemy", maxHp: 1000 });
    const coins = oneSidedAttack(a, t, a.skills[0]!, 3, 1, DEFAULT_RULES, createRng(1));
    expect(coins.map((c) => c.bleed?.amount)).toEqual([8, 4, 2]);
    expect(a.hp).toBe(100 - 14);
    expect(a.statuses.bleed).toBe(1);
  });

  it("파열/침잠은 피격 후 1회 발동", () => {
    const a = mkCombatant({ id: "a", sanity: 45, skills: [mkSkill({ basePower: 1, coinPower: 1, coinCount: 1 })] });
    const t = mkCombatant({ id: "t", side: "enemy", maxHp: 1000, sanity: 0, statuses: { rupture: 6, sinking: 10 } });
    const coins = oneSidedAttack(a, t, a.skills[0]!, 1, 1, DEFAULT_RULES, createRng(1));
    const hpAfterHits = t.hp;
    const ticks = afterAttack(a, t, coins, 1, DEFAULT_RULES);
    expect(ticks.find((x) => x.status === "rupture")?.amount).toBe(6);
    expect(t.hp).toBe(hpAfterHits - 6);
    expect(t.statuses.rupture).toBe(3);
    expect(t.sanity).toBe(-10);
    expect(t.statuses.sinking).toBe(5);
  });

  it("화상은 라운드 종료 시 N 피해 후 절반", () => {
    const c = mkCombatant({ maxHp: 100, statuses: { burn: 7 } });
    const tick = roundEndBurn(c, 1, DEFAULT_RULES);
    expect(tick?.amount).toBe(7); expect(c.hp).toBe(93); expect(c.statuses.burn).toBe(3);
  });

  it("진동은 흐트러진 대상의 피해 배율을 올리고 피격 후 절반", () => {
    const a = mkCombatant({ id: "a" });
    const t = mkCombatant({ id: "t", side: "enemy", staggered: true, statuses: { tremor: 5 } });
    const h = computeHit(a, t, mkSkill(), 10, true, DEFAULT_RULES, createRng(1));
    expect(h.staggerMult).toBeCloseTo(2.5); expect(h.final).toBe(25);
    const ticks = afterAttack(a, t, [{ coinIndex: 0, heads: true, hit: h, damage: { hpBefore: 100, hpAfter: 75, incapacitated: false } }], 1, DEFAULT_RULES);
    expect(ticks[0]?.status).toBe("tremor"); expect(t.statuses.tremor).toBe(2);
  });

  it("충전은 자원으로 소모", () => {
    const c = mkCombatant({ statuses: { charge: 7 } });
    expect(consumeCharge(c, 5)).toBe(true); expect(c.statuses.charge).toBe(2);
    expect(consumeCharge(c, 5)).toBe(false);
  });
});
