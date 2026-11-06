import { createRng, rollSpeed, buildDeck, drawSkills, discardSkill } from "../src";
import { mkCombatant, mkSkill } from "./helpers";

describe("속도 다이스", () => {
  it("다이스 수만큼 슬롯, 내림차순, 흐트러짐/전투불능 제외", () => {
    const a = mkCombatant({ id: "a", speed: { min: 3, max: 3, dice: 2 } });
    const b = mkCombatant({ id: "b", speed: { min: 5, max: 5, dice: 1 } });
    const c = mkCombatant({ id: "c", staggered: true });
    const d = mkCombatant({ id: "d", incapacitated: true });
    const slots = rollSpeed([a, b, c, d], createRng(1));
    expect(slots.map(s => s.combatantId)).toEqual(["b", "a", "a"]);
  });
});

describe("스킬 덱", () => {
  it("3:2:1 비율로 구성되고 방어 스킬은 제외", () => {
    const s1 = mkSkill({ id: "s1", tier: 1 }), s2 = mkSkill({ id: "s2", tier: 2 }), s3 = mkSkill({ id: "s3", tier: 3 });
    const g = mkSkill({ id: "g", kind: "defense" });
    const deck = buildDeck([s1, s2, s3, g], createRng(1));
    const count = (id: string) => deck.draw.filter(s => s.id === id).length;
    expect(count("s1")).toBe(3); expect(count("s2")).toBe(2); expect(count("s3")).toBe(1); expect(count("g")).toBe(0);
  });

  it("덱이 비면 버린 패를 섞어 다시 쓴다", () => {
    const deck = buildDeck([mkSkill({ id: "s1", tier: 3 })], createRng(1));
    const rng = createRng(2);
    const [first] = drawSkills(deck, 1, rng);
    discardSkill(deck, first!);
    const again = drawSkills(deck, 1, rng);
    expect(again).toHaveLength(1);
  });
});
