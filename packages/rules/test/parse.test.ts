import { parseEffectText } from "../src";

describe("효과 문장 파서", () => {
  it("매 라운드 시작 시 자신에게 호흡 2 부여", () => {
    const r = parseEffectText("매 라운드 시작 시 자신에게 호흡 2 부여", "passive");
    expect(r.unparsed).toEqual([]);
    expect(r.effects).toEqual([expect.objectContaining({ trigger: "roundStart", target: "self", action: { type: "applyStatus", status: "poise", amount: 2 } })]);
  });
  it("앞면 적중 시 대상에게 출혈 3 부여 (스킬)", () => {
    const r = parseEffectText("앞면 적중 시 대상에게 출혈 3 부여", "skill");
    expect(r.effects[0]).toMatchObject({ trigger: "onHeads", target: "clashTarget", action: { type: "applyStatus", status: "bleed", amount: 3 } });
  });
  it("조건과 복수 행동: 충전 5 이상이면 충전 5 소모하고 기본 위력 +10", () => {
    const r = parseEffectText("충전 5 이상이면 충전 5 소모하고 기본 위력 +10", "skill");
    expect(r.effects).toHaveLength(2);
    expect(r.effects[0]).toMatchObject({ trigger: "skillUse", condition: { type: "chargeAtLeast", n: 5 }, action: { type: "consumeCharge", amount: 5 } });
    expect(r.effects[1]).toMatchObject({ trigger: "skillUse", target: "self", action: { type: "addBasePower", delta: 10 } });
  });
  it("전투당 1회, 정신력", () => {
    const r = parseEffectText("합 승리 시 정신력 +5 (전투당 1회)", "passive");
    expect(r.effects[0]).toMatchObject({ trigger: "clashWin", target: "self", once: true, action: { type: "sanity", delta: 5 } });
  });
  it("여러 문장과 해석 불가 조각", () => {
    const r = parseEffectText("적중 시 대상에게 화상 2 부여. 라운드 종료 시 아군 전체 체력 5 회복. 바닥이 흔들린다", "skill");
    expect(r.effects).toHaveLength(2);
    expect(r.effects[1]).toMatchObject({ trigger: "roundEnd", target: "allies", action: { type: "heal", amount: 5 } });
    expect(r.unparsed).toEqual(["바닥이 흔들린다"]);
  });
  it("기본값: 스킬은 적중 시 대상, 패시브는 라운드 시작 시 자신", () => {
    expect(parseEffectText("출혈 2 부여", "skill").effects[0]).toMatchObject({ trigger: "onHit", target: "clashTarget" });
    expect(parseEffectText("호흡 1 부여", "passive").effects[0]).toMatchObject({ trigger: "roundStart", target: "self" });
  });
});
