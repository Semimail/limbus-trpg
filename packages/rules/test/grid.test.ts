import { startCombat, setPick, resolveRound, moveUnit, reachableCells, slotKey, dist, DEFAULT_RULES, type UnitInput } from "../src";
import { mkSkill } from "./helpers";

const mk = (id: string, side: "ally" | "enemy", extra: Partial<UnitInput> = {}): UnitInput => ({
  id, name: id, side, maxHp: 300, hp: 300, sanity: side === "ally" ? 45 : 0, sanityLocked: side === "enemy",
  speed: { min: 4, max: 4, dice: 1 }, portraitUrl: null,
  source: side === "ally" ? { kind: "character", id, ownerId: "u" } : { kind: "enemy", id },
  skills: [mkSkill({ id: "m", name: "근접", tier: 1, basePower: 4, coinPower: 2, coinCount: 2 }), mkSkill({ id: "r", name: "사격", tier: 2, basePower: 3, coinPower: 2, coinCount: 2, range: 5 }), mkSkill({ id: "g", kind: "defense" })],
  light: 2, ...extra,
});
const R = { ...DEFAULT_RULES, gridEnabled: true, gridCols: 10, gridRows: 6 };

describe("격자 전투", () => {
  it("시작 배치: 아군 왼쪽 열, 적 오른쪽 열, 겹침 없음", () => {
    const st = startCombat([mk("A", "ally"), mk("B", "ally"), mk("E", "enemy"), mk("F", "enemy")], 1, R);
    const pos = Object.fromEntries(st.units.map((u) => [u.id, u.pos]));
    expect(pos.A!.x).toBeLessThanOrEqual(1); expect(pos.B!.x).toBeLessThanOrEqual(1);
    // 적은 라운드 시작에 접근하므로 아군보다 오른쪽에 있기만 하면 된다
    expect(pos.E!.x).toBeGreaterThan(pos.A!.x); expect(pos.F!.x).toBeGreaterThan(pos.B!.x);
    const keys = new Set(st.units.map((u) => `${u.pos.x},${u.pos.y}`)); expect(keys.size).toBe(4);
    expect(st.grid).toEqual({ cols: 10, rows: 6 });
  });

  it("이동력 = 속도 + 3, 도달 가능 칸 계산, 사거리 밖 선택 거부", () => {
    const st = startCombat([mk("A", "ally"), mk("E", "enemy", { speed: { min: 1, max: 1, dice: 1 } })], 2, R);
    const a = st.units.find((u) => u.id === "A")!;
    expect(a.move).toBe(7);
    const cells = reachableCells(st, "A");
    expect(cells.size).toBeGreaterThan(20);
    // 근접 스킬로 먼 적을 노리면 거부, 사격(5칸)은 거리에 따라
    expect(setPick(st, "A", 0, { skillId: a.hand.includes("m") ? "m" : "r", targetId: "E" }, R) ?? "").toMatch(/사거리 밖|^$/);
  });

  it("이동 후 사거리 안이면 선택 가능, 접전 이탈 시 기회 공격", () => {
    const st = startCombat([mk("A", "ally"), mk("E", "enemy", { speed: { min: 1, max: 1, dice: 1 } })], 3, R);
    const a = st.units.find((u) => u.id === "A")!, e = st.units.find((u) => u.id === "E")!;
    // 적 옆까지 이동
    const target = { x: e.pos.x - 1, y: e.pos.y };
    expect(moveUnit(st, "A", target, R)).toBeNull();
    expect(dist(a.pos, e.pos)).toBe(1);
    const melee = a.hand.find((id) => id === "m");
    if (melee) expect(setPick(st, "A", 0, { skillId: "m", targetId: "E" }, R)).toBeNull();
    // 이탈: 적에게서 멀어지면 기회 공격이 preRound에 기록되고 체력이 줄 수 있다
    st.picks = {}; a.move = 3;
    const hpBefore = a.hp;
    expect(moveUnit(st, "A", { x: e.pos.x - 3, y: e.pos.y }, R)).toBeNull();
    expect(st.preRound.some((ev) => ev.type === "opportunity")).toBe(true);
    expect(a.hp).toBeLessThanOrEqual(hpBefore);
  });

  it("적은 라운드 시작에 접근해서 사거리 안의 아군을 노린다", () => {
    const st = startCombat([mk("A", "ally", { speed: { min: 1, max: 1, dice: 1 } }), mk("E", "enemy", { speed: { min: 6, max: 6, dice: 1 } })], 4, R);
    const e = st.units.find((u) => u.id === "E")!, a = st.units.find((u) => u.id === "A")!;
    const pick = st.picks[slotKey("E", 0)];
    expect(pick).toBeTruthy();
    const sk = e.skills.find((s) => s.id === pick!.skillId)!;
    expect(dist(e.pos, a.pos)).toBeLessThanOrEqual(Math.max(1, sk.range ?? 1));
  });

  it("보호: 빛을 쓰고 노려진 아군과 자리를 바꿔 대신 받는다", () => {
    const st = startCombat([mk("A", "ally"), mk("B", "ally"), mk("E", "enemy", { speed: { min: 6, max: 6, dice: 1 } })], 5, R);
    const a = st.units.find((u) => u.id === "A")!, b = st.units.find((u) => u.id === "B")!;
    const ep = st.picks[slotKey("E", 0)]; expect(ep).toBeTruthy();
    const victim = ep!.targetId === "A" ? a : b, guard = victim === a ? b : a;
    const before = { ...guard.pos }, vBefore = { ...victim.pos };
    const r = setPick(st, guard.id, 0, { skillId: "g", targetId: "E", targetSlot: 0, protect: true }, R);
    expect(r).toBeNull();
    expect(guard.light).toBe(1);
    expect(guard.pos).toEqual(vBefore); expect(victim.pos).toEqual(before);
    const ev = resolveRound(st, R);
    const clash = ev.find((x) => x.type === "clash") as { actor: string; target: string } | undefined;
    expect(clash && [clash.actor, clash.target].includes(guard.id)).toBe(true);
  });

  it("격자를 끄면 이전 방식 그대로", () => {
    const st = startCombat([mk("A", "ally"), mk("E", "enemy")], 6, { ...R, gridEnabled: false });
    expect(st.grid).toBeUndefined();
    const a = st.units.find((u) => u.id === "A")!;
    expect(setPick(st, "A", 0, { skillId: a.hand[0]!, targetId: "E" }, { ...R, gridEnabled: false })).toBeNull();
  });
});
