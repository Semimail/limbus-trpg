import { createRng, judge, judgeOpposed, DEFAULT_RULES } from "../src";

describe("비전투 판정", () => {
  it("능력치 + 보너스 코인만큼 던지고 난이도와 비교", () => {
    const r = judge(3, 1, 2, 45, DEFAULT_RULES, createRng(2));
    expect(r.coins).toHaveLength(4);
    expect(r.success).toBe(r.heads >= 2);
    expect(r.margin).toBe(r.heads - 2);
  });

  it("대립 판정은 동률이면 방어 측 승리", () => {
    const r = judgeOpposed({ stat: 0, bonus: 0, sanity: 0 }, { stat: 0, bonus: 0, sanity: 0 }, DEFAULT_RULES, createRng(1));
    expect(r.winner).toBe("defender");
  });
});
