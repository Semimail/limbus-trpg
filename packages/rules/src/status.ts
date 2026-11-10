import type { Combatant, RuleConfig, StatusId } from "./types";

/** 상태 부여. 같은 상태는 더해지며 상한이 있다. */
export function addStatus(c: Combatant, id: StatusId, amount: number, rules: RuleConfig): number {
  const cap = id === "charge" ? rules.chargeCap : rules.statusCap;
  const next = Math.max(0, Math.min(cap, (c.statuses[id] ?? 0) + Math.floor(amount)));
  if (next === 0) delete c.statuses[id]; else c.statuses[id] = next;
  return next;
}

export function getStatus(c: Combatant, id: StatusId): number {
  return c.statuses[id] ?? 0;
}

/** 발동 후 절반(내림). 0이 되면 제거. 반환값은 발동 시점의 N. */
export function triggerStatus(c: Combatant, id: StatusId): number {
  const n = c.statuses[id] ?? 0;
  if (n <= 0) return 0;
  const half = Math.floor(n / 2);
  if (half <= 0) delete c.statuses[id]; else c.statuses[id] = half;
  return n;
}

/** 충전 소모. 부족하면 false. */
export function consumeCharge(c: Combatant, amount: number): boolean {
  const n = c.statuses.charge ?? 0;
  if (n < amount) return false;
  const left = n - amount;
  if (left <= 0) delete c.statuses.charge; else c.statuses.charge = left;
  return true;
}
