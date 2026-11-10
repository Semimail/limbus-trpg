import { startCombat, setPick, resolveRound, redrawHand, slotKey, DEFAULT_RULES, type UnitInput, type Effect, type RoundEvent } from "../src";
import { mkSkill } from "./helpers";

const base = (id: string, side: "ally" | "enemy", extra: Partial<UnitInput> = {}): UnitInput => ({
  id, name: id, side, maxHp: 300, hp: 300, sanity: side === "ally" ? 45 : 0, sanityLocked: side === "enemy",
  speed: { min: side === "ally" ? 5 : 2, max: side === "ally" ? 5 : 2, dice: 1 }, portraitUrl: null,
  source: side === "ally" ? { kind: "character", id, ownerId: "u" } : { kind: "enemy", id },
  skills: [mkSkill({ id: "a1", tier: 1, basePower: 4, coinPower: 2, coinCount: 2 }), mkSkill({ id: "g", kind: "defense", defenseKind: "guard", basePower: 5, coinPower: 1, coinCount: 1 })],
  ...extra,
});
const fxLogs = (ev: RoundEvent[]) => ev.filter((e): e is Extract<RoundEvent, { type: "fx" }> => e.type === "fx").flatMap((e) => e.logs.map((l) => l.text));

describe("구조화 효과", () => {
  it("라운드 시작 시 자신에게 호흡 부여 (특기 패시브)", () => {
    const passives: Effect[] = [{ trigger: "roundStart", target: "self", action: { type: "applyStatus", status: "poise", amount: 2 }, source: "매 라운드 시작 시 자신에게 호흡 2 부여" }];
    const st = startCombat([base("A", "ally", { passives }), base("E", "enemy")], 1, DEFAULT_RULES);
    expect(st.units.find((u) => u.id === "A")!.statuses.poise).toBe(2);
    expect(st.notices.some((n) => n.includes("호흡"))).toBe(true);
  });

  it("스킬 효과: 앞면 적중 시 대상에게 출혈 부여, 사용 시 코인 위력 +2", () => {
    const skill = mkSkill({ id: "a1", tier: 1, basePower: 4, coinPower: 2, coinCount: 2, effects: [
      { trigger: "onHit", target: "clashTarget", action: { type: "applyStatus", status: "bleed", amount: 3 } },
      { trigger: "skillUse", target: "self", action: { type: "addCoinPower", delta: 2 } },
    ] });
    const st = startCombat([base("A", "ally", { skills: [skill, mkSkill({ id: "g", kind: "defense" })] }), base("E", "enemy", { skills: [mkSkill({ id: "g2", kind: "defense", basePower: 0, coinPower: 0, coinCount: 1 })] })], 2, DEFAULT_RULES);
    // 적은 공격 카드가 없어 선택 없음 → A의 일방 공격
    expect(setPick(st, "A", 0, { skillId: "a1", targetId: "E" }, DEFAULT_RULES)).toBeNull();
    const ev = resolveRound(st, DEFAULT_RULES);
    const atk = ev.find((e): e is Extract<RoundEvent, { type: "attack" }> => e.type === "attack")!;
    expect(atk).toBeTruthy();
    // 코인 위력 보정: 두 코인 모두 앞면이면 4+4+4=12 (보정 없으면 8)
    const heads = atk.coins.filter((c) => c.heads).length;
    const last = atk.coins[atk.coins.length - 1]!;
    expect(last.hit.rawPower).toBe(4 + 4 * heads);
    if (heads > 0) expect(st.units.find((u) => u.id === "E")!.statuses.bleed).toBeGreaterThan(0);
    expect(fxLogs(ev).length).toBeGreaterThan(0);
  });

  it("조건부 효과: 충전 5 이상이면 소모하고 기본 위력 +10", () => {
    const skill = mkSkill({ id: "a1", tier: 1, basePower: 4, coinPower: 2, coinCount: 1, effects: [
      { trigger: "skillUse", target: "self", condition: { type: "chargeAtLeast", n: 5 }, action: { type: "consumeCharge", amount: 5 } },
      { trigger: "skillUse", target: "self", condition: { type: "chargeAtLeast", n: 0 }, action: { type: "addBasePower", delta: 10 } },
    ] });
    const st = startCombat([base("A", "ally", { skills: [skill], statuses: { charge: 7 } }), base("E", "enemy", { skills: [mkSkill({ id: "g2", kind: "defense" })] })], 3, DEFAULT_RULES);
    setPick(st, "A", 0, { skillId: "a1", targetId: "E" }, DEFAULT_RULES);
    const ev = resolveRound(st, DEFAULT_RULES);
    const atk = ev.find((e): e is Extract<RoundEvent, { type: "attack" }> => e.type === "attack")!;
    expect(atk.coins[0]!.hit.rawPower).toBeGreaterThanOrEqual(14);
    expect(st.units.find((u) => u.id === "A")!.statuses.charge).toBe(2);
  });

  it("전투당 1회(once) 효과는 두 번 발동하지 않는다", () => {
    const passives: Effect[] = [{ trigger: "roundStart", target: "self", once: true, action: { type: "applyStatus", status: "charge", amount: 5 } }];
    const st = startCombat([base("A", "ally", { passives }), base("E", "enemy", { maxHp: 99999, hp: 99999 })], 4, DEFAULT_RULES);
    setPick(st, "A", 0, { skillId: "g", targetId: "E" }, DEFAULT_RULES);
    resolveRound(st, DEFAULT_RULES);
    expect(st.round).toBe(2);
    expect(st.units.find((u) => u.id === "A")!.statuses.charge).toBe(5);
  });
});

describe("E.G.O와 빛", () => {
  const ego = mkSkill({ id: "ego1", name: "E.G.O", tier: 3, basePower: 10, coinPower: 5, coinCount: 3, ego: { sanityCost: 20, erosionGain: 10, usesPerCombat: 1 } });
  it("E.G.O는 손패 없이 선택 가능, 정신력 지불, 침식도 증가, 횟수 제한, 선택 확정", () => {
    const st = startCombat([base("A", "ally", { skills: [mkSkill({ id: "a1" }), ego] }), base("E", "enemy")], 5, DEFAULT_RULES);
    expect(setPick(st, "A", 0, { skillId: "ego1", targetId: "E" }, DEFAULT_RULES)).toBeNull();
    const a = st.units.find((u) => u.id === "A")!;
    expect(a.sanity).toBe(25); expect(a.erosion).toBe(10);
    expect(st.picks[slotKey("A", 0)]?.locked).toBe(true);
    expect(setPick(st, "A", 0, { skillId: "a1", targetId: "E" }, DEFAULT_RULES)).toContain("확정");
    expect(st.notices.some((n) => n.includes("발현"))).toBe(true);
  });

  it("정신력이 음수로 떨어지면 침식 판정, 침식도 상한이면 무조건 침식", () => {
    const st = startCombat([base("A", "ally", { skills: [mkSkill({ id: "a1" }), ego], erosion: 95, sanity: 45 }), base("E", "enemy")], 6, DEFAULT_RULES);
    expect(setPick(st, "A", 0, { skillId: "ego1", targetId: "E" }, DEFAULT_RULES)).toBeNull();
    const a = st.units.find((u) => u.id === "A")!;
    expect(a.corrodedUntilRound).toBe(1);
    expect(st.notices.some((n) => n.includes("침식!"))).toBe(true);
    expect(setPick(st, "A", 0, null, DEFAULT_RULES)).toBeTruthy(); // 조종 불가
    resolveRound(st, DEFAULT_RULES);
    expect(a.corrodedUntilRound).toBeUndefined(); // 라운드 끝나면 해제
  });

  it("빛을 써서 손패 교체", () => {
    const st = startCombat([base("A", "ally", { light: 2 }), base("E", "enemy")], 7, DEFAULT_RULES);
    const a = st.units.find((u) => u.id === "A")!;
    expect(redrawHand(st, "A", DEFAULT_RULES)).toBeNull();
    expect(a.light).toBe(1); expect(a.hand).toHaveLength(3);
    expect(redrawHand(st, "A", DEFAULT_RULES)).toBeNull();
    expect(redrawHand(st, "A", DEFAULT_RULES)).toContain("부족");
  });
});
