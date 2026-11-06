import { createRng, headsProbability, flipCoin, DEFAULT_RULES, adjustSanity } from "../src";

describe("코인", () => {
  it("앞면 확률은 50% + 정신력%", () => {
    expect(headsProbability(0, DEFAULT_RULES)).toBe(0.5);
    expect(headsProbability(45, DEFAULT_RULES)).toBeCloseTo(0.95);
    expect(headsProbability(-45, DEFAULT_RULES)).toBeCloseTo(0.05);
    expect(headsProbability(100, DEFAULT_RULES)).toBeCloseTo(0.95); // 범위 밖은 잘린다
  });

  it("정신력 +45에서 앞면 비율이 약 95%", () => {
    const rng = createRng(1);
    let heads = 0;
    for (let i = 0; i < 20000; i++) if (flipCoin(45, DEFAULT_RULES, rng)) heads++;
    expect(heads / 20000).toBeGreaterThan(0.93);
    expect(heads / 20000).toBeLessThan(0.97);
  });

  it("정신력 조정은 -45~45로 제한", () => {
    expect(adjustSanity(40, 10, DEFAULT_RULES)).toBe(45);
    expect(adjustSanity(-40, -10, DEFAULT_RULES)).toBe(-45);
  });

  it("같은 시드는 같은 결과 (재생용)", () => {
    const a = createRng(123), b = createRng(123);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
});
