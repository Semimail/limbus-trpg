import { erosionStage, erosionStageChanged, startCombat, DEFAULT_RULES, type UnitInput } from "../src";
import { mkSkill } from "./helpers";

describe("침식도 단계 (표시용)", () => {
  it("상한 100을 4등분: 0~24 안정, 25~49 동요, 50~74 잠식, 75~99 임계, 100 침식", () => {
    const r = { erosionMax: 100 };
    expect([0, 24, 25, 49, 50, 74, 75, 99, 100, 130].map((e) => erosionStage(e, r))).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
  it("상한이 바뀌면 구간도 따라간다", () => {
    expect(erosionStage(10, { erosionMax: 40 })).toBe(1);
    expect(erosionStage(40, { erosionMax: 40 })).toBe(4);
  });
  it("단계 변화만 보고한다", () => {
    expect(erosionStageChanged(10, 20, DEFAULT_RULES)).toBeNull();
    expect(erosionStageChanged(10, 30, DEFAULT_RULES)).toEqual({ from: 0, to: 1 });
  });
  it("전투 시작 때 침식도를 erosionStart 에 남긴다", () => {
    const u: UnitInput = { id: "A", name: "A", side: "ally", maxHp: 50, hp: 50, sanity: 0, speed: { min: 3, max: 3, dice: 1 }, portraitUrl: null, source: { kind: "character", id: "A", ownerId: "u" }, skills: [mkSkill()], erosion: 35 };
    const st = startCombat([u], 1, { ...DEFAULT_RULES, gridEnabled: false });
    expect(st.units[0]!.erosionStart).toBe(35);
    expect(st.units[0]!.erosion).toBe(35);
  });
});
