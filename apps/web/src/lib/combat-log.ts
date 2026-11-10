import type { RoundEvent, CombatState, AttackCoin, StatusTick } from "@limbus/rules";
import { STATUS_LABEL } from "@limbus/rules";

export function unitNames(state: CombatState): Record<string, string> {
  return Object.fromEntries(state.units.map((u) => [u.id, u.name]));
}

function coinsText(coins: AttackCoin[]): string {
  return coins.map((c) => `${c.heads ? "앞" : "뒤"}${c.hit.final}${c.hit.crit ? "!" : ""}`).join(" ");
}
function ticksText(ticks: StatusTick[], n: Record<string, string>): string[] {
  return ticks.map((t) => {
    const who = n[t.target] ?? t.target;
    if (t.status === "sinking") return `${who} 침잠 ${t.amount} → 정신력 ${t.sanityAfter}`;
    if (t.status === "tremor") return `${who} 진동 ${t.amount} 발동`;
    return `${who} ${STATUS_LABEL[t.status]} ${t.amount} 피해`;
  });
}

/** 라운드 이벤트를 채팅용 한국어 줄로 */
export function formatRound(events: RoundEvent[], n: Record<string, string>): string[] {
  const out: string[] = [];
  for (const e of events) {
    switch (e.type) {
      case "roundStart":
        out.push(`[라운드 ${e.round}] 속도: ${e.slots.map((s) => `${n[s.combatantId] ?? s.combatantId}(${s.speed})`).join(", ")}`);
        break;
      case "clash": {
        const r = e.result;
        const a = n[e.actor] ?? e.actor, t = n[e.target] ?? e.target;
        const rounds = r.rounds.map((x) => `${x.a.totalPower}:${x.b.totalPower}`).join(" → ");
        const win = r.winner === "a" ? a : t;
        out.push(`합 ${a} [${e.actorSkill}] vs ${t} [${e.targetSkill}] ${rounds} → ${win} 승리`);
        if (r.attacks.length) out.push(`  ${win} 공격: ${coinsText(r.attacks)} = 총 ${r.attacks.reduce((s, c) => s + c.hit.final, 0)} 피해`);
        const bleed = r.attacks.filter((c) => c.bleed).map((c) => `출혈 ${c.bleed!.amount}`);
        if (bleed.length) out.push(`  ${win} ${bleed.join(", ")} 피해`);
        out.push(...ticksText(r.ticks, n).map((x) => `  ${x}`));
        break;
      }
      case "attack": {
        const a = n[e.actor] ?? e.actor, t = n[e.target] ?? e.target;
        out.push(`${a} [${e.skill}] → ${t} 일방 공격: ${coinsText(e.coins)} = 총 ${e.coins.reduce((s, c) => s + c.hit.final, 0)} 피해`);
        const bleed = e.coins.filter((c) => c.bleed).map((c) => `출혈 ${c.bleed!.amount}`);
        if (bleed.length) out.push(`  ${a} ${bleed.join(", ")} 피해`);
        out.push(...ticksText(e.ticks, n).map((x) => `  ${x}`));
        break;
      }
      case "idle": out.push(`${n[e.actor] ?? e.actor} [${e.skill}] 대기 (${e.reason})`); break;
      case "burn": out.push(...ticksText(e.ticks, n).map((x) => `화상: ${x}`)); break;
      case "staggerEnd": out.push(`${n[e.unit] ?? e.unit} 흐트러짐 해제`); break;
      case "down": out.push(`${n[e.unit] ?? e.unit} 전투불능!`); break;
      case "end": out.push(`전투 종료: ${e.winner === "ally" ? "아군 승리" : "아군 패배"}`); break;
    }
  }
  return out;
}
