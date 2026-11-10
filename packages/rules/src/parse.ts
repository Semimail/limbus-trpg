/**
 * 한국어 효과 문장 → 구조화 효과 파서 (규칙 기반).
 * 예) "매 라운드 시작 시 자신에게 호흡 2 부여", "앞면 적중 시 대상에게 출혈 3 부여",
 *     "충전 5 이상이면 충전 5 소모하고 기본 위력 +10", "합 승리 시 정신력 +5 (전투당 1회)"
 * 해석 못 한 조각은 unparsed로 돌려주어 GM이 수동 처리한다.
 */
import type { Action, Condition, Effect, StatusId, Target, Trigger } from "./types";

const STATUS: Record<string, StatusId> = { 화상: "burn", 출혈: "bleed", 진동: "tremor", 파열: "rupture", 침잠: "sinking", 호흡: "poise", 충전: "charge" };

const TRIGGERS: [RegExp, Trigger][] = [
  [/(매\s*)?(라운드|턴)\s*시작\s*(시|때|마다)/, "roundStart"],
  [/(매\s*)?(라운드|턴)\s*(종료|끝)\s*(시|때|마다)/, "roundEnd"],
  [/전투\s*시작\s*(시|때)/, "combatStart"],
  [/(스킬\s*)?사용\s*(시|때)/, "skillUse"],
  [/앞면\s*(적중\s*)?(시|때|마다)/, "onHeads"],
  [/뒷면\s*(적중\s*)?(시|때|마다)/, "onTails"],
  [/치명타\s*(시|때)/, "onCrit"],
  [/합\s*(승리|승)\s*(시|때)/, "clashWin"],
  [/합\s*(패배|패)\s*(시|때)/, "clashLose"],
  [/(적\s*)?처치\s*(시|때)/, "onKill"],
  [/흐트러(질\s*때|짐\s*시)/, "onStaggered"],
  [/(피격\s*(시|때)|피해를\s*(받을|입을)\s*때)/, "onDamaged"],
  [/적중\s*(시|때|마다)/, "onHit"],
];

const TARGETS: [RegExp, Target][] = [
  [/(아군\s*전체|모든\s*아군|아군\s*모두)/, "allies"],
  [/(적\s*전체|모든\s*적|적\s*모두)/, "enemies"],
  [/(전체|모두)에게/, "all"],
  [/자신(에게|의|이)?/, "self"],
  [/(대상|상대|적)(에게|의|이)/, "clashTarget"],
];

function num(s: string): number { return Number(s.replace(/\s/g, "")); }

export function parseCondition(text: string): { condition?: Condition; rest: string } {
  let m: RegExpMatchArray | null;
  if ((m = text.match(/충전(이)?\s*(\d+)\s*이상(이면|일\s*때|인\s*경우)/))) return { condition: { type: "chargeAtLeast", n: num(m[2]!) }, rest: text.replace(m[0], " ") };
  if ((m = text.match(/정신력(이)?\s*(-?\d+)\s*이상(이면|일\s*때)/))) return { condition: { type: "sanityAtLeast", n: num(m[2]!) }, rest: text.replace(m[0], " ") };
  if ((m = text.match(/정신력(이)?\s*(-?\d+)\s*(미만|이하)(이면|일\s*때)/))) return { condition: { type: "sanityBelow", n: num(m[2]!) + (m[3] === "이하" ? 1 : 0) }, rest: text.replace(m[0], " ") };
  if ((m = text.match(/체력(이)?\s*(\d+)\s*%\s*(미만|이하)(이면|일\s*때)/))) return { condition: { type: "hpBelowPct", pct: num(m[2]!) + (m[3] === "이하" ? 0.01 : 0) }, rest: text.replace(m[0], " ") };
  if ((m = text.match(/(대상|상대|적|자신)(에게|의|이)\s*(화상|출혈|진동|파열|침잠|호흡|충전)(이)?\s*(\d+)\s*이상(이면|일\s*때)/))) {
    return { condition: { type: "statusAtLeast", status: STATUS[m[3]!]!, n: num(m[5]!), who: m[1] === "자신" ? "self" : "clashTarget" }, rest: text.replace(m[0], " ") };
  }
  return { rest: text };
}

export function parseActions(text: string): { actions: Action[]; rest: string } {
  const actions: Action[] = [];
  let rest = text;
  const take = (re: RegExp, f: (m: RegExpMatchArray) => Action | null) => {
    let m: RegExpMatchArray | null;
    while ((m = rest.match(re))) { const a = f(m); if (a) actions.push(a); rest = rest.replace(m[0], " "); }
  };
  take(/충전\s*(\d+)\s*(을|를)?\s*소모/, (m) => ({ type: "consumeCharge", amount: num(m[1]!) }));
  take(/(화상|출혈|진동|파열|침잠|호흡|충전)\s*(\d+)\s*(을|를)?\s*(부여|추가|획득|얻)/, (m) => ({ type: "applyStatus", status: STATUS[m[1]!]!, amount: num(m[2]!) }));
  take(/(\d+)\s*(의)?\s*(화상|출혈|진동|파열|침잠|호흡|충전)\s*(을|를)?\s*(부여|추가|획득)/, (m) => ({ type: "applyStatus", status: STATUS[m[3]!]!, amount: num(m[1]!) }));
  take(/정신력\s*([+-]\s*\d+)/, (m) => ({ type: "sanity", delta: num(m[1]!) }));
  take(/정신력\s*(\d+)\s*(회복|상승|증가)/, (m) => ({ type: "sanity", delta: num(m[1]!) }));
  take(/정신력\s*(\d+)\s*(감소|하락|소모)/, (m) => ({ type: "sanity", delta: -num(m[1]!) }));
  take(/체력\s*(\d+)\s*%\s*(회복|치유)/, (m) => ({ type: "healPct", pct: num(m[1]!) }));
  take(/(체력\s*)?(\d+)\s*(을|를)?\s*(회복|치유)/, (m) => ({ type: "heal", amount: num(m[2]!) }));
  take(/코인\s*위력\s*([+-]\s*\d+)/, (m) => ({ type: "addCoinPower", delta: num(m[1]!) }));
  take(/(기본\s*)?위력\s*([+-]\s*\d+)/, (m) => ({ type: "addBasePower", delta: num(m[2]!) }));
  take(/(\d+)\s*(의)?\s*(고정\s*)?피해/, (m) => ({ type: "damage", amount: num(m[1]!) }));
  return { actions, rest };
}

export interface ParseResult { effects: Effect[]; unparsed: string[] }

/** mode: skill이면 기본 트리거 onHit·기본 대상 clashTarget, passive면 roundStart·self */
export function parseEffectText(text: string, mode: "skill" | "passive"): ParseResult {
  const effects: Effect[] = [];
  const unparsed: string[] = [];
  const chunks = text.split(/[\n.。/]|,(?=\s*(?:매|앞면|뒷면|적중|합|사용|치명|라운드|턴|전투|피격|처치|흐트))/).map((c) => c.trim()).filter(Boolean);
  for (const chunk of chunks) {
    let rest = chunk;
    const once = /(전투\s*(당|중)\s*1\s*회|한\s*번만|1회\s*한정)/.test(rest);
    rest = rest.replace(/\(?\s*(전투\s*(당|중)\s*1\s*회|한\s*번만|1회\s*한정)\s*\)?/g, " ");
    let trigger: Trigger | undefined;
    for (const [re, t] of TRIGGERS) { const m = rest.match(re); if (m) { trigger = t; rest = rest.replace(m[0], " "); break; } }
    const cond = parseCondition(rest); rest = cond.rest;
    let target: Target | undefined;
    for (const [re, t] of TARGETS) { const m = rest.match(re); if (m) { target = t; rest = rest.replace(m[0], " "); break; } }
    const acts = parseActions(rest); rest = acts.rest;
    if (acts.actions.length === 0) { unparsed.push(chunk); continue; }
    const tr = trigger ?? (mode === "skill" ? "onHit" : "roundStart");
    for (const action of acts.actions) {
      let tg = target;
      if (!tg) {
        const selfish = action.type === "addCoinPower" || action.type === "addBasePower" || action.type === "consumeCharge" || action.type === "sanity" || action.type === "heal" || action.type === "healPct";
        tg = mode === "passive" || selfish || tr === "skillUse" ? "self" : "clashTarget";
      }
      // 위력 보정과 충전 소모는 사용 시점에서만 의미가 있다
      const finalTrigger = (action.type === "addCoinPower" || action.type === "addBasePower" || action.type === "consumeCharge") && tr !== "skillUse" && mode === "skill" ? "skillUse" : tr;
      effects.push({ trigger: finalTrigger, target: tg, action, ...(cond.condition ? { condition: cond.condition } : {}), ...(once ? { once: true } : {}), source: chunk });
    }
  }
  return { effects, unparsed };
}

export const TRIGGER_LABEL: Record<Trigger, string> = {
  combatStart: "전투 시작 시", roundStart: "라운드 시작 시", roundEnd: "라운드 종료 시", skillUse: "사용 시",
  onHeads: "앞면 시", onTails: "뒷면 시", onHit: "적중 시", onCrit: "치명타 시", clashWin: "합 승리 시", clashLose: "합 패배 시",
  onKill: "처치 시", onStaggered: "흐트러질 때", onDamaged: "피격 시",
};
export const TARGET_LABEL: Record<Target, string> = { self: "자신", clashTarget: "대상", allies: "아군 전체", enemies: "적 전체", all: "전체" };

export function describeEffect(e: Effect): string {
  const a = e.action;
  const act = a.type === "applyStatus" ? `${({ burn: "화상", bleed: "출혈", tremor: "진동", rupture: "파열", sinking: "침잠", poise: "호흡", charge: "충전" })[a.status]} ${a.amount} 부여`
    : a.type === "sanity" ? `정신력 ${a.delta >= 0 ? "+" : ""}${a.delta}`
    : a.type === "heal" ? `체력 ${a.amount} 회복` : a.type === "healPct" ? `체력 ${a.pct}% 회복`
    : a.type === "damage" ? `${a.amount} 피해` : a.type === "addCoinPower" ? `코인 위력 ${a.delta >= 0 ? "+" : ""}${a.delta}`
    : a.type === "addBasePower" ? `기본 위력 ${a.delta >= 0 ? "+" : ""}${a.delta}` : `충전 ${a.amount} 소모`;
  const c = e.condition;
  const cond = !c ? "" : c.type === "chargeAtLeast" ? `충전 ${c.n} 이상이면 ` : c.type === "sanityAtLeast" ? `정신력 ${c.n} 이상이면 `
    : c.type === "sanityBelow" ? `정신력 ${c.n} 미만이면 ` : c.type === "hpBelowPct" ? `체력 ${c.pct}% 미만이면 `
    : `${c.who === "self" ? "자신" : "대상"}의 ${c.status} ${c.n} 이상이면 `;
  return `${TRIGGER_LABEL[e.trigger]} ${cond}${TARGET_LABEL[e.target]}에게 ${act}${e.once ? " (전투당 1회)" : ""}`;
}
