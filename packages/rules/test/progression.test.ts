import { DEFAULT_PROGRESSION, coinCapAt, expectedPower, gradeOf, maxHpAt, newCharacterData, powerScaleAt, skillBudget, skillPresets, validateCharacter, validateStats } from "../src";

describe("성장 공식", () => {
  it("등급은 7레벨 단위", () => {
    expect(gradeOf(1)).toBe("뜬소문"); expect(gradeOf(7)).toBe("뜬소문");
    expect(gradeOf(8)).toBe("도시괴담"); expect(gradeOf(49)).toBe("불순물"); expect(gradeOf(99)).toBe("불순물");
  });
  it("체력은 1레벨 100, 49레벨 6자리 근처", () => {
    expect(maxHpAt(1)).toBe(100);
    expect(maxHpAt(49)).toBeGreaterThan(50_000);
    expect(maxHpAt(49)).toBeLessThan(200_000);
  });
  it("위력 배율은 49레벨에 약 40배, 코인 상한은 14", () => {
    expect(powerScaleAt(1)).toBe(1);
    expect(powerScaleAt(49)).toBeGreaterThan(30); expect(powerScaleAt(49)).toBeLessThan(60);
    expect(coinCapAt(1)).toBe(2); expect(coinCapAt(49)).toBe(14);
  });
  it("스킬 상한: 1레벨 5/7/10/방어7", () => {
    expect(skillBudget(1, 1)).toBe(5); expect(skillBudget(3, 1)).toBe(10); expect(skillBudget("defense", 1)).toBe(7);
    expect(expectedPower(3, 2, 2)).toBe(5);
  });
});

describe("능력치/시트 검증", () => {
  const base = { wrath: 2, lust: 2, sloth: 2, gluttony: 2, gloom: 2, pride: 2, envy: 2 };
  it("합 14, 1~5, 5는 하나", () => {
    expect(validateStats(base)).toEqual([]);
    expect(validateStats({ ...base, wrath: 3 }).map(i => i.code)).toEqual(["sum"]);
    expect(validateStats({ ...base, wrath: 5, lust: 5, sloth: 1, gluttony: 1, gloom: 1, pride: 1, envy: 0 }).map(i => i.code)).toContain("maxCount");
  });
  it("새 시트 기본값은 이름 외에는 통과", () => {
    const d = newCharacterData();
    const errs = validateCharacter(d).filter(i => i.level === "error");
    expect(errs.every(e => e.path.endsWith(".name") || e.path === "traits")).toBe(true);
    d.traits[0]!.name = "눈치"; d.traits[1]!.name = "끈기";
    for (const s of d.skills) s.name = "x";
    expect(validateCharacter(d)).toEqual([]);
  });
  it("기대 위력이 상한을 넘으면 오류", () => {
    const d = newCharacterData();
    d.traits[0]!.name = "a"; d.traits[1]!.name = "b"; for (const s of d.skills) s.name = "x";
    d.skills[0]!.basePower = 10;
    expect(validateCharacter(d).some(i => i.message.includes("상한"))).toBe(true);
  });
});

describe("스킬 틀", () => {
  it("모든 틀의 기대 위력이 상한 이하", () => {
    for (const lv of [1, 5, 12, 25, 49]) for (const tier of [1, 2, 3, "defense"] as const) {
      const budget = skillBudget(tier, lv);
      for (const s of skillPresets(tier, lv)) {
        expect(expectedPower(s.basePower, s.coinPower, s.coinCount)).toBeLessThanOrEqual(budget + 1e-9);
        expect(s.coinCount).toBeLessThanOrEqual(coinCapAt(lv));
      }
    }
  });
  it("1레벨 스킬1 안정형은 원작 초반과 비슷 (3 +2 x2)", () => {
    const s = skillPresets(1, 1).find((x) => x.key === "steady")!;
    expect([s.basePower, s.coinPower, s.coinCount]).toEqual([3, 2, 2]);
  });
});
