import { notFound } from "next/navigation";
import { startCombat, setPick, resolveRound, newCharacterData, newEnemyData, DEFAULT_RULES, type UnitInput, type Skill, type CombatState } from "@limbus/rules";
import { BattleScreen } from "@/components/combat/battle-screen";

/*
 * 전투 화면 미리보기 (개발 전용, 프로덕션은 404). 로그인·DB 없이 가짜 전투 상태로 화면만 본다.
 *  - 그림은 public/dev/ (저장소 제외) 에 둔 추출본을 쓴다. 없으면 초상 없는 토큰으로 나온다.
 *  - ?gm=0 플레이어 시점, ?ended=1 종료 화면, ?round=n 라운드 수. 아군 둘 중 하나는 남의 캐릭터(선택 불가), 적은 GM 이 띠에서 지정
 *  - ?replay=round : 아군 1이 적 1의 다이스를 맞받아치게 해 두고 엔진으로 한 라운드를 실제로 굴린다 → "다시 보기"로 합 컷인(격돌·코인 토스)을 본다
 */
export const dynamic = "force-dynamic";

export default async function DevBattlePage({ searchParams }: { searchParams: Promise<{ gm?: string; ended?: string; round?: string; replay?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const q = await searchParams;
  const rules = DEFAULT_RULES;
  const c = newCharacterData();
  const named = (s: Skill, name: string): Skill => ({ ...s, name });
  const ally = (id: string, name: string, sprite: string, hp: number, sanity: number, owner = "me"): UnitInput => ({
    id, name, side: "ally", maxHp: c.maxHp, hp, sanity, speed: { min: 2, max: 6, dice: 2 },
    skills: [named(c.skills[0]! as Skill, "찢어발기기"), named(c.skills[1]! as Skill, "한 방"), named(c.skills[2]! as Skill, "쇄도"), named(c.skills[3]! as Skill, "막기"),
      { id: "ego1", name: "지평선 너머", kind: "attack", tier: 3, basePower: 6, coinPower: 3, coinCount: 3, damageType: "pierce", sin: "pride", effectText: "", ego: { sanityCost: 10, erosionGain: 2, usesPerCombat: 1 } } as Skill],
    portraitUrl: sprite, spriteUrl: sprite, light: 3, erosion: 1, source: { kind: "character", id, ownerId: owner },
  });
  const e = newEnemyData();
  const enemy = (id: string, name: string, sprite: string, hp: number): UnitInput => ({
    id, name, side: "enemy", maxHp: e.maxHp, hp, sanity: 0, sanityLocked: true, speed: { min: 2, max: 5, dice: 1 },
    skills: e.skills.map((s) => ({ ...s } as Skill)), resist: e.resist, portraitUrl: sprite, spriteUrl: sprite, source: { kind: "enemy", id },
  });
  const inputs: UnitInput[] = [
    ally("a1", "이상", "/dev/ally1.png", c.maxHp - 6, 12), ally("a2", "파우스트", "/dev/ally2.png", Math.round(c.maxHp * 0.45), -8, "other"), // 남의 캐릭터: GM 이라도 선택 못 함
    enemy("e1", "자치우", "/dev/enemy1.png", 90), enemy("e2", "구보", "/dev/enemy2.png", 40),
  ];
  const state: CombatState = startCombat(inputs, 7, rules);
  state.round = Number(q.round ?? 3) || 3;
  // 적 하나는 이미 선택한 것처럼, 아군 하나는 흐트러진 것처럼
  const e1 = state.slots.find((s) => s.combatantId === "e1");
  if (e1) state.picks[`e1:${e1.slot}`] = { skillId: "e1", targetId: "a1" };
  const a2 = state.units.find((u) => u.id === "a2"); if (a2) { a2.staggered = true; a2.staggerTriggered = [rules.staggerThresholds[0]!]; }
  if (q.ended === "1") { state.phase = "ended"; state.winner = "ally"; }
  // ?replay=win|lose : "다시 보기" 버튼으로 승리/패배 연출(원작 VICTORY/DEFEAT)을 볼 수 있게 가짜 라운드 결과를 넣는다
  if (q.replay === "round") {
    const a1 = state.units.find((u) => u.id === "a1")!; const a1slot = state.slots.find((s) => s.combatantId === "a1");
    if (a1slot && e1) setPick(state, "a1", a1slot.slot, { skillId: a1.hand[0]!, targetId: "e1", targetSlot: e1.slot }, rules);
    const events = resolveRound(state, rules);
    state.lastRound = events;
  } else if (q.replay) state.lastRound = [{ type: "roundStart", round: state.round, slots: state.slots }, { type: "down", unit: q.replay === "win" ? "e2" : "a2" }, { type: "end", winner: q.replay === "win" ? "ally" : "enemy" }];
  const enemyInfo = { e1: { threat: "도시전설", description: "뒷골목에서 활동하는 폭력단.", gimmicks: [{ id: "g1", name: "기세", text: "매 라운드 위력 +1" }], revealed: ["g1"] }, e2: { threat: "뜬소문", description: "", gimmicks: [], revealed: [] } };
  return (
    <BattleScreen campaignId="dev" combatId="dev" initial={state} meId="me" isGm={q.gm !== "0"} rules={rules} sessionTitle="미리보기 세션" sceneTitle="뒷골목" backHref="/" chat={<div className="p-2 text-xs text-muted">미리보기에서는 채팅이 없습니다</div>} enemyInfo={enemyInfo} background="/dev/bg.png" />
  );
}
