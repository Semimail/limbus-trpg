import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, estimateClash, type Skill } from "../src";

const sk = (p: Partial<Skill>): Skill => ({ id: "s", name: "s", kind: "attack", basePower: 3, coinPower: 2, coinCount: 2, damageType: "slash", sin: "wrath", ...p });

describe("estimateClash", () => {
  it("강한 스킬이 유리하게 나온다", () => {
    const e = estimateClash(sk({ basePower: 8, coinPower: 4, coinCount: 3 }), 20, sk({ basePower: 2, coinPower: 1, coinCount: 1 }), -20, DEFAULT_RULES);
    expect(e.winRate).toBeGreaterThan(0.85);
    expect(e.label).toBe("압도");
  });
  it("같은 스킬끼리는 보통", () => {
    const e = estimateClash(sk({}), 0, sk({}), 0, DEFAULT_RULES);
    expect(e.label).toBe("보통");
  });
  it("같은 시드는 같은 결과", () => {
    expect(estimateClash(sk({}), 5, sk({ coinCount: 3 }), 0, DEFAULT_RULES)).toEqual(estimateClash(sk({}), 5, sk({ coinCount: 3 }), 0, DEFAULT_RULES));
  });
});
