import { createRng, rollSkill, DEFAULT_RULES } from "../src";
import { mkSkill } from "./helpers";

describe("스킬 굴림", () => {
  it("위력 = 기본 + 앞면 수 x 코인 위력, 누적 기록", () => {
    const skill = mkSkill({ basePower: 4, coinPower: 3, coinCount: 3 });
    const r = rollSkill(skill, 45, 3, DEFAULT_RULES, createRng(7)); // 거의 전부 앞면
    let expectPower = 4;
    for (const c of r.coins) {
      if (c.heads) expectPower += 3;
      expect(c.power).toBe(expectPower);
    }
    expect(r.totalPower).toBe(expectPower);
  });

  it("음수 코인 위력도 0 아래로는 내려가지 않는다", () => {
    const skill = mkSkill({ basePower: 2, coinPower: -5, coinCount: 2 });
    const r = rollSkill(skill, 45, 2, DEFAULT_RULES, createRng(3));
    for (const c of r.coins) expect(c.power).toBeGreaterThanOrEqual(0);
  });

  it("큰 수치(체력 6자리, 코인 14개)도 처리", () => {
    const skill = mkSkill({ basePower: 900, coinPower: 120, coinCount: 14 });
    const r = rollSkill(skill, 0, 14, DEFAULT_RULES, createRng(9));
    expect(r.coins).toHaveLength(14);
    expect(r.totalPower).toBeGreaterThanOrEqual(900);
    expect(r.totalPower).toBeLessThanOrEqual(900 + 14 * 120);
  });
});
