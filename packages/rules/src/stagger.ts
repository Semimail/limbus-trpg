import type { Combatant, RuleConfig } from "./types";

/**
 * 피해를 적용하고 흐트러짐 구간(50% / 30%)을 넘었는지 검사한다.
 * 각 구간은 전투 중 1회만 발동한다. 체력 0이면 전투불능.
 */
export interface DamageOutcome {
  hpBefore: number;
  hpAfter: number;
  staggerTriggeredAt?: number;
  incapacitated: boolean;
}

export function applyDamage(target: Combatant, amount: number, currentRound: number, rules: RuleConfig): DamageOutcome {
  const hpBefore = target.hp;
  const hpAfter = Math.max(0, hpBefore - Math.max(0, Math.floor(amount)));
  target.hp = hpAfter;

  let staggerTriggeredAt: number | undefined;
  for (const t of rules.staggerThresholds) {
    const line = Math.floor(target.maxHp * t);
    if (hpBefore > line && hpAfter <= line && hpAfter > 0 && !target.staggerTriggered.includes(t)) {
      target.staggerTriggered.push(t);
      target.staggered = true;
      target.staggeredUntilRound = currentRound + 1; // 다음 라운드 종료 시 해제
      staggerTriggeredAt = t;
      break; // 한 번에 여러 구간을 넘어도 흐트러짐은 1회
    }
  }

  if (hpAfter === 0) {
    target.incapacitated = true;
    target.staggered = false;
  }
  return { hpBefore, hpAfter, staggerTriggeredAt, incapacitated: target.incapacitated };
}

/** 라운드 종료 시 호출. 만료된 흐트러짐을 해제한다. */
export function tickStagger(c: Combatant, roundJustEnded: number): boolean {
  if (c.staggered && c.staggeredUntilRound !== undefined && roundJustEnded >= c.staggeredUntilRound) {
    c.staggered = false;
    c.staggeredUntilRound = undefined;
    return true;
  }
  return false;
}
