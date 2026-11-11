"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { RoundEvent, Unit, AttackCoin } from "@limbus/rules";
import { CoinIcon } from "@/components/icons";

type UnitLite = Pick<Unit, "id" | "name" | "side" | "spriteUrl" | "portraitUrl">;

interface Step {
  kind: "face" | "clashRound" | "coin" | "text" | "end";
  left?: UnitLite; right?: UnitLite;            // 왼쪽 = 아군 쪽(또는 행위자), 오른쪽 = 상대
  leftSkill?: string; rightSkill?: string;
  leftPower?: number; rightPower?: number; winner?: "left" | "right" | "draw";
  coin?: AttackCoin; attackerSide?: "left" | "right";
  text?: string; sub?: string; tone?: "red" | "gold" | "white";
  hold: number;                                  // ms
}

/** 라운드 이벤트를 연출 단계로 변환 */
export function buildSteps(events: RoundEvent[], units: UnitLite[]): Step[] {
  const u = (id: string) => units.find((x) => x.id === id)!;
  const steps: Step[] = [];
  const coinsOf = (coins: AttackCoin[], attackerSide: "left" | "right", left: UnitLite, right: UnitLite) =>
    coins.forEach((c) => {
      const dmg = c.hit.final;
      const txt = !c.heads && dmg === 0 ? "빗나감" : c.hit.crit ? "치명타!" : dmg > 0 ? "적중" : "무효";
      steps.push({ kind: "coin", left, right, coin: c, attackerSide, text: txt, sub: dmg > 0 ? `${dmg} 피해${c.damage.staggerTriggeredAt ? " · 흐트러짐!" : ""}${c.damage.incapacitated ? " · 전투불능" : ""}` : undefined, tone: c.hit.crit ? "gold" : dmg > 0 ? "red" : "white", hold: c.hit.crit ? 1300 : 950 });
    });
  for (const e of events) {
    if (e.type === "clash") {
      const a = u(e.actor), t = u(e.target);
      const left = a.side === "ally" ? a : t, right = a.side === "ally" ? t : a;
      const leftSkill = left === a ? e.actorSkill : e.targetSkill, rightSkill = left === a ? e.targetSkill : e.actorSkill;
      steps.push({ kind: "face", left, right, leftSkill, rightSkill, text: "합", tone: "white", hold: 900 });
      for (const r of e.result.rounds) {
        const lp = left === a ? r.a.totalPower : r.b.totalPower, rp = left === a ? r.b.totalPower : r.a.totalPower;
        const w = r.winner === "draw" ? "draw" : (r.winner === "a") === (left === a) ? "left" : "right";
        steps.push({ kind: "clashRound", left, right, leftSkill, rightSkill, leftPower: lp, rightPower: rp, winner: w, text: w === "draw" ? "동률" : w === "left" ? `${left.name} 우세` : `${right.name} 우세`, tone: "white", hold: 900 });
      }
      const winnerUnit = e.result.winner === "a" ? a : t;
      const attackerSide: "left" | "right" = winnerUnit === left ? "left" : "right";
      steps.push({ kind: "text", left, right, leftSkill, rightSkill, text: `${winnerUnit.name} 합 승리`, tone: "red", hold: 900 });
      coinsOf(e.result.attacks, attackerSide, left, right);
    } else if (e.type === "attack") {
      const a = u(e.actor), t = u(e.target);
      const left = a.side === "ally" ? a : t, right = a.side === "ally" ? t : a;
      steps.push({ kind: "face", left, right, leftSkill: left === a ? e.skill : undefined, rightSkill: left === a ? undefined : e.skill, text: "일방 공격", tone: "white", hold: 800 });
      coinsOf(e.coins, left === a ? "left" : "right", left, right);
    } else if (e.type === "opportunity") {
      const a = u(e.actor), t = u(e.target);
      const left = a.side === "ally" ? a : t, right = a.side === "ally" ? t : a;
      steps.push({ kind: "face", left, right, leftSkill: left === a ? e.skill : undefined, rightSkill: left === a ? undefined : e.skill, text: "기회 공격", tone: "white", hold: 700 });
      coinsOf(e.coins, left === a ? "left" : "right", left, right);
    } else if (e.type === "down") {
      steps.push({ kind: "text", text: `${u(e.unit).name} 전투불능`, tone: "red", hold: 1100 });
    } else if (e.type === "end") {
      steps.push({ kind: "end", text: e.winner === "ally" ? "승리" : "패배", tone: e.winner === "ally" ? "gold" : "red", hold: 1600 });
    }
  }
  return steps;
}

function Side({ who, skill, power, win, align, attacking }: { who?: UnitLite; skill?: string; power?: number; win?: boolean; align: "left" | "right"; attacking?: boolean }) {
  return (
    <div className={`relative flex h-full w-1/2 flex-col ${align === "left" ? "items-start" : "items-end"} justify-end`}>
      {who ? (
        <>
          <div className={`absolute top-[6%] ${align === "left" ? "left-[6%]" : "right-[6%]"} flex items-center gap-2 ${align === "right" ? "flex-row-reverse" : ""}`}>
            {power !== undefined ? <div className="flex h-14 w-14 items-center justify-center text-2xl font-black text-white" style={{ background: win ? "#b3161c" : "#3a2a2a", clipPath: "polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)", boxShadow: win ? "0 0 24px rgba(227,58,64,.8)" : "none" }}>{power}</div> : null}
            {skill ? <div className="bg-black/70 px-2 py-1 text-xs font-semibold text-white sm:text-sm" style={{ borderLeft: `3px solid ${who.side === "ally" ? "#d9b35b" : "#b3161c"}` }}>{skill}</div> : null}
          </div>
          <div className={`flex h-[78%] w-full items-end ${align === "left" ? "justify-start pl-[4%]" : "justify-end pr-[4%]"} transition-transform duration-300`} style={{ transform: attacking ? (align === "left" ? "translateX(6%)" : "translateX(-6%)") : "none" }}>
            {who.spriteUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={who.spriteUrl} alt="" className="max-h-full w-auto object-contain drop-shadow-[0_10px_24px_rgba(0,0,0,.8)]" style={{ transform: align === "right" ? "scaleX(-1)" : undefined }} draggable={false} />
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="aspect-square w-28 overflow-hidden border-2 sm:w-44" style={{ borderColor: who.side === "ally" ? "#d9b35b" : "#b3161c" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {who.portraitUrl ? <img src={who.portraitUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center bg-black/60 text-2xl font-bold text-white">{who.name.slice(0, 2)}</div>}
                </div>
                <div className="text-sm font-semibold text-white">{who.name}</div>
              </div>
            )}
          </div>
          <div className={`absolute bottom-[3%] ${align === "left" ? "left-[6%]" : "right-[6%]"} text-xs text-white/70`}>{who.name}</div>
        </>
      ) : null}
    </div>
  );
}

export function Cinematic({ events, units, onClose, inline }: { events: RoundEvent[]; units: UnitLite[]; onClose: () => void; inline?: boolean }) {
  const steps = useMemo(() => buildSteps(events, units), [events, units]);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const step = steps[i];
  useEffect(() => {
    if (!step || paused) return;
    const t = setTimeout(() => { if (i >= steps.length - 1) onClose(); else setI(i + 1); }, step.hold);
    return () => clearTimeout(t);
  }, [i, paused, step, steps.length, onClose]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === " " || e.key === "ArrowRight") { e.preventDefault(); setI((x) => Math.min(steps.length - 1, x + 1)); } };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [steps.length, onClose]);
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  if (!step || !mounted) return null;
  const tone = step.tone === "gold" ? "#d9b35b" : step.tone === "red" ? "#e23a40" : "#f1ebe0";
  const attackerIsLeft = step.attackerSide === "left";
  const body = (
    <div className={`${inline ? "absolute inset-0 z-30" : "fixed inset-0 z-50"} select-none`} style={{ background: inline ? "radial-gradient(70% 60% at 50% 40%, rgba(70,10,12,.72), rgba(5,3,3,.82))" : "radial-gradient(70% 60% at 50% 40%, rgba(70,10,12,.97), rgba(5,3,3,.99))" }} onClick={() => setI((x) => Math.min(steps.length - 1, x + 1))}>
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-2 text-xs text-white/70">
        <span>{inline ? `합 연출 ${i + 1}/${steps.length}` : `합 연출 · ${i + 1}/${steps.length} · 클릭/스페이스로 다음, Esc로 닫기`}</span>
        <span className="flex gap-2">
          <button type="button" onClick={(e) => { e.stopPropagation(); setPaused(!paused); }} className="border border-white/30 px-2 py-0.5">{paused ? "재생" : "일시정지"}</button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onClose(); }} className="border border-white/30 px-2 py-0.5">건너뛰기</button>
        </span>
      </div>
      {step.kind === "end" || (step.kind === "text" && !step.left) ? (
        <div className="flex h-full items-center justify-center"><div className={`font-black tracking-widest ${inline ? "text-4xl sm:text-6xl" : "text-6xl sm:text-8xl"}`} style={{ color: tone, textShadow: "0 0 40px rgba(0,0,0,.9)" }}>{step.text}</div></div>
      ) : (
        <div className="relative flex h-full w-full">
          <Side who={step.left} skill={step.leftSkill} power={step.kind === "clashRound" ? step.leftPower : undefined} win={step.winner === "left"} align="left" attacking={step.kind === "coin" && attackerIsLeft} />
          <Side who={step.right} skill={step.rightSkill} power={step.kind === "clashRound" ? step.rightPower : undefined} win={step.winner === "right"} align="right" attacking={step.kind === "coin" && !attackerIsLeft} />
          {/* 가운데 텍스트 */}
          <div className="pointer-events-none absolute inset-x-0 top-[38%] flex flex-col items-center gap-2 text-center">
            <div className={`font-black tracking-widest ${inline ? "text-3xl sm:text-5xl" : "text-5xl sm:text-7xl"}`} style={{ color: tone, textShadow: "0 0 30px rgba(0,0,0,.9), 0 2px 0 #000" }}>{step.text}</div>
            {step.sub ? <div className={`font-bold text-white ${inline ? "text-base sm:text-xl" : "text-lg sm:text-2xl"}`} style={{ textShadow: "0 2px 6px #000" }}>{step.sub}</div> : null}
            {step.kind === "coin" && step.coin ? <div className="mt-1 flex items-center gap-2 bg-black/60 px-3 py-1"><CoinIcon heads={step.coin.heads} size={28} /><span className="text-sm text-white">{step.coin.heads ? "앞면" : "뒷면"} · 위력 {step.coin.hit.rawPower}</span></div> : null}
            {step.kind === "clashRound" ? <div className="text-sm text-white/70">코인 남음 {step.winner === "left" ? "▶ 상대 코인 파괴" : step.winner === "right" ? "◀ 내 코인 파괴" : "다시 던짐"}</div> : null}
          </div>
        </div>
      )}
    </div>
  );
  return inline ? body : createPortal(body, document.body);
}
