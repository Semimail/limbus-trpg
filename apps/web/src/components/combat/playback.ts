import type { RoundEvent, Unit, AttackCoin, StatusTick } from "@limbus/rules";
import { STATUS_LABEL } from "@limbus/rules";

/*
 * 라운드 결과를 "판 위에서" 한 단계씩 보여주기 위한 단계 목록 (참고 영상의 합 연출).
 *  - header: 상단 띠 문구 ("적 → 캐릭터 · 코인 2 앞면 · 피해 13 · HP 77")
 *  - cards: 유닛 옆에 뜨는 카드 (코인 앞/뒤, "6 → 12", "위력 9", 피해·HP)
 *  - arc: 두 유닛 사이 강조 선
 */
export interface PlayCard { unitId: string; title: string; coins?: boolean[]; big?: string; sub?: string; tone: "gold" | "red" | "white" | "dim" }
export interface PlayStep { header: string; cards: PlayCard[]; arc?: { from: string; to: string; kind: "clash" | "ally" | "enemy" }; banner?: { text: string; tone: "gold" | "red" | "white" }; hold: number }

type UnitLite = Pick<Unit, "id" | "name" | "side" | "skills">;

export function buildPlaySteps(events: RoundEvent[], units: UnitLite[]): PlayStep[] {
  const u = (id: string) => units.find((x) => x.id === id);
  // 이벤트의 스킬 필드는 엔진이 이름으로 넣는다(로그용). id가 와도 되게 둘 다 찾는다
  const find = (unit: UnitLite | undefined, key: string) => unit?.skills.find((s) => s.id === key || s.name === key);
  const sname = (unit: UnitLite | undefined, key: string) => find(unit, key)?.name ?? key;
  const sbase = (unit: UnitLite | undefined, key: string) => find(unit, key)?.basePower ?? 0;
  const steps: PlayStep[] = [];
  const arcKind = (a: UnitLite): "ally" | "enemy" => (a.side === "ally" ? "ally" : "enemy");

  const coinSteps = (attacker: UnitLite, defender: UnitLite, skillName: string, coins: AttackCoin[], arc: PlayStep["arc"]) => {
    coins.forEach((c, k) => {
      const dmg = c.hit.final;
      const miss = !c.heads && dmg === 0;
      const extra = `${c.hit.crit ? " · 치명타!" : ""}${c.damage.staggerTriggeredAt !== undefined ? " · 흐트러짐!" : ""}${c.damage.incapacitated ? " · 전투불능" : ""}`;
      steps.push({
        header: `${attacker.name} → ${defender.name} · ${skillName} · 코인 ${k + 1} ${c.heads ? "앞면" : "뒷면"} · 피해 ${dmg} · HP ${c.damage.hpAfter}${extra}`,
        cards: [
          { unitId: attacker.id, title: `${attacker.name} · 공격 · 코인 ${k + 1}`, coins: [c.heads], big: `위력 ${c.hit.rawPower}`, sub: c.hit.crit ? "치명타!" : undefined, tone: c.hit.crit ? "gold" : "white" },
          { unitId: defender.id, title: defender.name, big: miss ? "빗나감" : dmg > 0 ? `-${dmg}` : "무효", sub: `HP ${c.damage.hpBefore} → ${c.damage.hpAfter}${extra}`, tone: dmg > 0 ? "red" : "dim" },
        ],
        arc, hold: c.hit.crit || c.damage.incapacitated ? 1400 : 1000,
      });
      if (c.bleed) steps.push({ header: `${attacker.name} 출혈 ${c.bleed.amount} 피해 · HP ${c.bleed.damage.hpAfter}`, cards: [{ unitId: attacker.id, title: `${attacker.name} · 출혈`, big: `-${c.bleed.damage.hpBefore - c.bleed.damage.hpAfter}`, sub: `HP ${c.bleed.damage.hpAfter}`, tone: "red" }], arc, hold: 700 });
    });
  };
  const tickSteps = (ticks: StatusTick[]) => {
    for (const t of ticks) {
      const who = u(t.target); if (!who) continue;
      const label = STATUS_LABEL[t.status];
      const dmg = t.damage ? t.damage.hpBefore - t.damage.hpAfter : 0;
      steps.push({ header: `${who.name} ${label} ${t.amount} 발동${dmg ? ` · 피해 ${dmg} · HP ${t.damage!.hpAfter}` : ""}`, cards: [{ unitId: who.id, title: `${who.name} · ${label}`, big: dmg ? `-${dmg}` : `${label} ${t.amount}`, sub: t.damage ? `HP ${t.damage.hpAfter}` : undefined, tone: dmg ? "red" : "white" }], hold: 800 });
    }
  };

  for (const e of events) {
    if (e.type === "clash") {
      const a = u(e.actor), t = u(e.target); if (!a || !t) continue;
      const as = sname(a, e.actorSkill), ts = sname(t, e.targetSkill);
      const arc = { from: a.id, to: t.id, kind: "clash" as const };
      steps.push({ header: `${a.name} ↔ ${t.name} 합 · ${as} vs ${ts}`, cards: [{ unitId: a.id, title: `${a.name} · 합`, sub: as, tone: "white" }, { unitId: t.id, title: `${t.name} · 합`, sub: ts, tone: "white" }], arc, hold: 900 });
      e.result.rounds.forEach((r, i) => {
        const aw = r.winner === "a", bw = r.winner === "b";
        steps.push({
          header: `합 ${i + 1} · ${a.name} ${r.a.totalPower} ${aw ? "▶" : bw ? "◀" : "="} ${r.b.totalPower} ${t.name}${r.winner === "draw" ? " · 동률, 다시" : ""}`,
          cards: [
            { unitId: a.id, title: `${a.name} · 합 ${i + 1}`, coins: r.a.coins.map((c) => c.heads), big: `${sbase(a, e.actorSkill)} → ${r.a.totalPower}`, sub: bw ? "코인 파괴" : aw ? "우세" : "동률", tone: aw ? "gold" : bw ? "dim" : "white" },
            { unitId: t.id, title: `${t.name} · 합 ${i + 1}`, coins: r.b.coins.map((c) => c.heads), big: `${sbase(t, e.targetSkill)} → ${r.b.totalPower}`, sub: aw ? "코인 파괴" : bw ? "우세" : "동률", tone: bw ? "gold" : aw ? "dim" : "white" },
          ],
          arc, hold: 1000,
        });
      });
      const winner = e.result.winner === "a" ? a : t, loser = winner === a ? t : a;
      steps.push({ header: `${winner.name} 합 승리 · ${loser.name} 무방비`, cards: [{ unitId: winner.id, title: winner.name, big: "합 승리", tone: "gold" }, { unitId: loser.id, title: loser.name, big: "합 패배", tone: "dim" }], arc, banner: { text: `${winner.name} 합 승리`, tone: winner.side === "ally" ? "gold" : "red" }, hold: 900 });
      coinSteps(winner, loser, sname(winner, winner === a ? e.actorSkill : e.targetSkill), e.result.attacks, arc);
      tickSteps(e.result.ticks);
    } else if (e.type === "attack" || e.type === "opportunity") {
      const a = u(e.actor), t = u(e.target); if (!a || !t) continue;
      const sn = sname(a, e.skill); const arc = { from: a.id, to: t.id, kind: arcKind(a) };
      steps.push({ header: `${a.name} → ${t.name} · ${sn} · ${e.type === "attack" ? "일방 공격" : "기회 공격"}`, cards: [{ unitId: a.id, title: `${a.name} · ${e.type === "attack" ? "일방 공격" : "기회 공격"}`, sub: sn, tone: "white" }, { unitId: t.id, title: t.name, sub: "무방비", tone: "dim" }], arc, hold: 800 });
      coinSteps(a, t, sn, e.coins, arc);
      if (e.type === "attack") tickSteps(e.ticks);
    } else if (e.type === "burn") {
      tickSteps(e.ticks);
    } else if (e.type === "down") {
      const who = u(e.unit); if (!who) continue;
      steps.push({ header: `${who.name} 전투불능`, cards: [{ unitId: who.id, title: who.name, big: "전투불능", tone: "red" }], banner: { text: `${who.name} 전투불능`, tone: "red" }, hold: 1100 });
    } else if (e.type === "staggerEnd") {
      const who = u(e.unit); if (who) steps.push({ header: `${who.name} 흐트러짐 회복`, cards: [{ unitId: who.id, title: who.name, big: "회복", tone: "white" }], hold: 600 });
    } else if (e.type === "end") {
      steps.push({ header: e.winner === "ally" ? "승리" : "패배", cards: [], banner: { text: e.winner === "ally" ? "승리" : "패배", tone: e.winner === "ally" ? "gold" : "red" }, hold: 1800 });
    }
  }
  return steps;
}
