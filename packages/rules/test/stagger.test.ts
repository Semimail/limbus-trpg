import { applyDamage, tickStagger, DEFAULT_RULES } from "../src";
import { mkCombatant } from "./helpers";

describe("흐트러짐", () => {
  it("50% 구간을 넘으면 흐트러짐, 1회만", () => {
    const c = mkCombatant({ maxHp: 100 });
    const r1 = applyDamage(c, 55, 1, DEFAULT_RULES);
    expect(r1.staggerTriggeredAt).toBe(0.5);
    expect(c.staggered).toBe(true);
    tickStagger(c, 2);
    expect(c.staggered).toBe(false);
    const r2 = applyDamage(c, 5, 3, DEFAULT_RULES); // 45 -> 40, 50% 구간 재발동 없음
    expect(r2.staggerTriggeredAt).toBeUndefined();
  });

  it("30% 구간도 따로 발동", () => {
    const c = mkCombatant({ maxHp: 100 });
    applyDamage(c, 55, 1, DEFAULT_RULES); tickStagger(c, 2);
    const r = applyDamage(c, 20, 3, DEFAULT_RULES); // 45 -> 25
    expect(r.staggerTriggeredAt).toBe(0.3);
  });

  it("한 번에 두 구간을 넘어도 흐트러짐은 한 번", () => {
    const c = mkCombatant({ maxHp: 100 });
    const r = applyDamage(c, 75, 1, DEFAULT_RULES); // 100 -> 25
    expect(r.staggerTriggeredAt).toBe(0.5);
    expect(c.staggerTriggered).toEqual([0.5]);
  });

  it("체력 0은 전투불능이며 흐트러짐 아님", () => {
    const c = mkCombatant({ maxHp: 100 });
    const r = applyDamage(c, 999, 1, DEFAULT_RULES);
    expect(r.incapacitated).toBe(true);
    expect(c.hp).toBe(0);
    expect(c.staggered).toBe(false);
  });

  it("흐트러짐은 다음 라운드 종료 시 해제", () => {
    const c = mkCombatant({ maxHp: 100 });
    applyDamage(c, 60, 3, DEFAULT_RULES);
    expect(tickStagger(c, 3)).toBe(false);
    expect(tickStagger(c, 4)).toBe(true);
  });
});
