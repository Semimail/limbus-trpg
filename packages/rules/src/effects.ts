/**
 * 효과 실행기. 전투 오케스트레이터가 트리거 시점마다 fire()를 호출한다.
 * 효과는 "스킬 효과"(그 스킬을 쓰는 동안만)와 "패시브"(특기, 동기화, 기믹: 항상)로 나뉜다.
 */
import type { Action, Combatant, Condition, Effect, RuleConfig, Skill, Trigger } from "./types";
import { addStatus, consumeCharge, getStatus } from "./status";
import { adjustSanity } from "./coin";
import { applyDamage } from "./stagger";

export interface FxContext {
  trigger: Trigger;
  self: Combatant;
  other?: Combatant;          // 합 상대 / 피격자 / 공격자
  skill?: Skill;              // 사용 중인 스킬 (skillUse에서 수정 가능)
  allies: Combatant[];
  enemies: Combatant[];
  round: number;
}

export interface FxLog { who: string; text: string }

export interface EffectBag {
  /** 유닛의 상시 효과 (특기, 패시브, 기믹) */
  passives: Effect[];
  /** 전투당 1회 효과 추적 키 */
  usedOnce: Set<string>;
}

export type Hooks = (trigger: Trigger, ctx: Omit<FxContext, "trigger" | "allies" | "enemies" | "round">) => void;

export function checkCondition(c: Condition | undefined, ctx: FxContext): boolean {
  if (!c) return true;
  switch (c.type) {
    case "chargeAtLeast": return getStatus(ctx.self, "charge") >= c.n;
    case "statusAtLeast": { const who = c.who === "self" ? ctx.self : ctx.other; return !!who && getStatus(who, c.status) >= c.n; }
    case "sanityAtLeast": return ctx.self.sanity >= c.n;
    case "sanityBelow": return ctx.self.sanity < c.n;
    case "hpBelowPct": return ctx.self.hp / ctx.self.maxHp * 100 < c.pct;
  }
}

function targetsOf(t: Effect["target"], ctx: FxContext): Combatant[] {
  switch (t) {
    case "self": return [ctx.self];
    case "clashTarget": return ctx.other ? [ctx.other] : [];
    case "allies": return ctx.allies;
    case "enemies": return ctx.enemies;
    case "all": return [...ctx.allies, ...ctx.enemies];
  }
}

export function applyAction(a: Action, who: Combatant, ctx: FxContext, rules: RuleConfig): string | null {
  if (who.incapacitated && a.type !== "heal" && a.type !== "healPct") return null;
  switch (a.type) {
    case "applyStatus": { const n = addStatus(who, a.status, a.amount, rules); return `${a.status} ${a.amount >= 0 ? "+" : ""}${a.amount} (→${n})`; }
    case "sanity": { if (who.sanityLocked) return null; who.sanity = adjustSanity(who.sanity, a.delta, rules); return `정신력 ${a.delta >= 0 ? "+" : ""}${a.delta} (→${who.sanity})`; }
    case "heal": { const before = who.hp; who.hp = Math.min(who.maxHp, who.hp + Math.max(0, Math.floor(a.amount))); if (who.hp > 0) who.incapacitated = false; return `체력 +${who.hp - before}`; }
    case "healPct": { const before = who.hp; who.hp = Math.min(who.maxHp, who.hp + Math.floor(who.maxHp * a.pct / 100)); return `체력 +${who.hp - before}`; }
    case "damage": { const r = applyDamage(who, a.amount, ctx.round, rules); return `피해 ${r.hpBefore - r.hpAfter}${r.staggerTriggeredAt ? " (흐트러짐)" : ""}${r.incapacitated ? " (전투불능)" : ""}`; }
    case "addCoinPower": { if (ctx.skill && who === ctx.self) { ctx.skill.coinPower += a.delta; return `코인 위력 ${a.delta >= 0 ? "+" : ""}${a.delta}`; } return null; }
    case "addBasePower": { if (ctx.skill && who === ctx.self) { ctx.skill.basePower += a.delta; return `기본 위력 ${a.delta >= 0 ? "+" : ""}${a.delta}`; } return null; }
    case "consumeCharge": return consumeCharge(who, a.amount) ? `충전 -${a.amount}` : null;
  }
}

/**
 * 트리거 발생. 스킬 효과(ctx.skill.effects)와 자기 패시브를 순서대로 평가한다.
 * once 효과는 bag.usedOnce 로 전투당 1회 제한.
 */
export function fireEffects(ctx: FxContext, bag: EffectBag | undefined, rules: RuleConfig, log: FxLog[]) {
  const list: { e: Effect; key: string }[] = [];
  if (ctx.skill?.effects) ctx.skill.effects.forEach((e, i) => list.push({ e, key: `skill:${ctx.skill!.id}:${i}` }));
  bag?.passives.forEach((e, i) => list.push({ e, key: `passive:${ctx.self.id}:${i}` }));
  for (const { e, key } of list) {
    if (e.trigger !== ctx.trigger) continue;
    if (e.once && bag?.usedOnce.has(key)) continue;
    if (!checkCondition(e.condition, ctx)) continue;
    const targets = targetsOf(e.target, ctx);
    let fired = false;
    for (const t of targets) {
      const r = applyAction(e.action, t, ctx, rules);
      if (r) { fired = true; log.push({ who: ctx.self.id, text: `${e.source ? `「${e.source}」 ` : ""}${t.name}: ${r}` }); }
    }
    if (fired && e.once) bag?.usedOnce.add(key);
  }
}
