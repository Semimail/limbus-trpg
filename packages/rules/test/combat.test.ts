import { startCombat, setPick, resolveRound, slotKey, DEFAULT_RULES, type UnitInput } from "../src";
const NOGRID = { ...DEFAULT_RULES, gridEnabled: false };
import { mkSkill } from "./helpers";

function ally(id: string, hp = 200): UnitInput {
  return {
    id, name: id, side: "ally", maxHp: hp, hp, sanity: 20, speed: { min: 4, max: 4, dice: 1 }, portraitUrl: null,
    source: { kind: "character", id, ownerId: "u" },
    skills: [
      mkSkill({ id: "a1", tier: 1, basePower: 4, coinPower: 2, coinCount: 2 }),
      mkSkill({ id: "a2", tier: 2, basePower: 5, coinPower: 3, coinCount: 2 }),
      mkSkill({ id: "a3", tier: 3, basePower: 6, coinPower: 3, coinCount: 3 }),
      mkSkill({ id: "g", kind: "defense", defenseKind: "guard", basePower: 6, coinPower: 2, coinCount: 1 }),
    ],
  };
}
function enemy(id: string, hp = 60): UnitInput {
  return {
    id, name: id, side: "enemy", maxHp: hp, hp, sanity: 0, sanityLocked: true, speed: { min: 2, max: 2, dice: 1 }, portraitUrl: null,
    source: { kind: "enemy", id },
    skills: [mkSkill({ id: "e1", tier: 1, basePower: 2, coinPower: 1, coinCount: 2 }), mkSkill({ id: "e2", tier: 2, basePower: 3, coinPower: 2, coinCount: 2 })],
  };
}

describe("전투 진행", () => {
  it("시작: 1라운드, 속도 슬롯, 손패 3장, 적 자동 선택", () => {
    const st = startCombat([ally("A"), enemy("E")], 1, NOGRID);
    expect(st.round).toBe(1);
    expect(st.slots.map((s) => s.combatantId)).toEqual(["A", "E"]); // 속도 4 > 2
    expect(st.units.find((u) => u.id === "A")!.hand).toHaveLength(3);
    expect(st.picks[slotKey("E", 0)]?.targetId).toBe("A");
  });

  it("선택 검증: 손패 밖 카드, 같은 편 대상, 느린 쪽의 가로채기 거부", () => {
    const st = startCombat([ally("A"), ally("B"), enemy("E")], 2, NOGRID);
    const a = st.units.find((u) => u.id === "A")!;
    expect(setPick(st, "A", 0, { skillId: "zzz", targetId: "E" }, NOGRID)).toBeTruthy();
    expect(setPick(st, "A", 0, { skillId: a.hand[0]!, targetId: "B" }, NOGRID)).toBeTruthy();
    expect(setPick(st, "A", 0, { skillId: a.hand[0]!, targetId: "E" }, NOGRID)).toBeNull();
    expect(setPick(st, "A", 0, { skillId: "g", targetId: "E" }, NOGRID)).toBeNull(); // 방어는 항상 가능
    // 가로채기: A(4) >= E(2) 허용
    expect(setPick(st, "A", 0, { skillId: a.hand[0]!, targetId: "E", targetSlot: 0 }, NOGRID)).toBeNull();
  });

  it("라운드 처리: 서로 노리면 합, 아니면 일방 공격, 적이 쓰러지면 종료", () => {
    const st = startCombat([ally("A"), enemy("E", 30)], 3, NOGRID);
    const a = st.units.find((u) => u.id === "A")!;
    // 적은 A를 노린다. A도 적을 노리면 합.
    expect(setPick(st, "A", 0, { skillId: a.hand[0]!, targetId: "E" }, NOGRID)).toBeNull();
    const ev = resolveRound(st, NOGRID);
    const clash = ev.find((e) => e.type === "clash");
    expect(clash).toBeTruthy();
    // 두 라운드 안에 끝나는지 (A가 압도적으로 강함)
    let rounds = 1;
    while (st.phase === "select" && rounds < 6) {
      const au = st.units.find((u) => u.id === "A")!;
      setPick(st, "A", 0, { skillId: au.hand[0]!, targetId: "E" }, NOGRID);
      resolveRound(st, NOGRID); rounds++;
    }
    expect(st.phase).toBe("ended");
    expect(st.winner).toBe("ally");
    expect(st.lastRound!.some((e) => e.type === "end")).toBe(true);
  });

  it("가로채기: B를 노리던 적 슬롯이 A와 합을 겨룬다", () => {
    const st = startCombat([ally("A"), ally("B"), enemy("E", 500)], 5, NOGRID);
    // 적 선택을 B로 고정
    st.picks[slotKey("E", 0)] = { skillId: st.units.find((u) => u.id === "E")!.hand[0]!, targetId: "B" };
    const a = st.units.find((u) => u.id === "A")!;
    expect(setPick(st, "A", 0, { skillId: a.hand[0]!, targetId: "E", targetSlot: 0 }, NOGRID)).toBeNull();
    const ev = resolveRound(st, NOGRID);
    const clash = ev.find((e) => e.type === "clash") as Extract<typeof ev[number], { type: "clash" }> | undefined;
    expect(clash?.actor).toBe("A"); expect(clash?.target).toBe("E");
  });

  it("같은 시드면 같은 결과 (재생)", () => {
    const run = () => {
      const st = startCombat([ally("A"), enemy("E", 80)], 99, NOGRID);
      const a = st.units.find((u) => u.id === "A")!;
      setPick(st, "A", 0, { skillId: a.hand[0]!, targetId: "E" }, NOGRID);
      resolveRound(st, NOGRID);
      return JSON.stringify(st.units.map((u) => [u.hp, u.sanity]));
    };
    expect(run()).toBe(run());
  });

  it("손패는 쓴 카드를 버리고 다음 라운드에 다시 3장", () => {
    const st = startCombat([ally("A"), enemy("E", 9999)], 7, NOGRID);
    const a = st.units.find((u) => u.id === "A")!;
    const used = a.hand[0]!;
    setPick(st, "A", 0, { skillId: used, targetId: "E" }, NOGRID);
    resolveRound(st, NOGRID);
    const a2 = st.units.find((u) => u.id === "A")!;
    expect(st.round).toBe(2);
    expect(a2.hand).toHaveLength(3);
    expect(a2.discard.length + a2.deck.length + a2.hand.length).toBe(6);
  });
});
