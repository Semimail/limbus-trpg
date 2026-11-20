"use client";
/*
 * 카드형 주사위·코인 로그 (참고: 타 팀 VTT 의 주사위 서랍 카드).
 *  - 코인 판정: 머리(누가·무슨 판정) / 코인 타일(앞·뒤) / 큰 앞면 수 + 난이도 / 성공·실패 띠
 *  - 대립 판정: 두 줄(공격·방어) + 승패 띠
 *  - 주사위: 눈 타일 + 합계
 * 옛 메시지(상세 없는 payload)도 코인만으로 그린다.
 */
import type { ReactNode } from "react";
import { SIN_LABEL, type Sin } from "@limbus/rules";
import { CoinIcon, SinIcon } from "@/components/icons";

export interface CoinPayload { type: "coin"; coins: boolean[]; heads: number; difficulty?: number; sanity?: number; success?: boolean | null; sin?: Sin | null; stat?: number; bonus?: number; light?: boolean; name?: string | null }
export interface VsPayload { type: "vs"; attacker: { coins: boolean[]; heads: number }; defender: { coins: boolean[]; heads: number }; winner: "attacker" | "defender"; mySin?: Sin | null; myStat?: number; opSin?: Sin | null; opStat?: number; name?: string | null; opName?: string | null }
export interface DicePayload { type: "dice"; expr: string; rolls: number[]; sides: number; count: number; mod: number; total: number }

export function isCoinPayload(p: unknown): p is CoinPayload { return !!p && typeof p === "object" && (p as { type?: string }).type === "coin" && Array.isArray((p as { coins?: unknown }).coins); }
export function isVsPayload(p: unknown): p is VsPayload { const v = p as VsPayload | null; return !!v && typeof v === "object" && v.type === "vs" && !!v.attacker && Array.isArray(v.attacker.coins) && !!v.defender; }
export function isDicePayload(p: unknown): p is DicePayload { return !!p && typeof p === "object" && (p as { type?: string }).type === "dice" && Array.isArray((p as { rolls?: unknown }).rolls); }

/** 판정 한 줄 요약 (무대 대사 띠 위 작은 줄, 컷인 끝의 결과 문구) */
export function judgeSummary(p: CoinPayload | VsPayload): { title: string; result: string; tone: "gold" | "red" | "white" } {
  if (p.type === "coin") {
    const label = p.sin ? `${SIN_LABEL[p.sin]} 판정` : "코인 판정";
    const n = `${p.stat ?? p.coins.length}${p.bonus ? `+${p.bonus}` : ""}`;
    if (p.difficulty && p.difficulty > 0) {
      const ok = !!p.success; const margin = p.heads - p.difficulty;
      return { title: `${label} · ${n}`, result: ok ? (margin >= 2 ? "완전한 성공" : "성공") : (margin <= -2 ? "완전한 실패" : "실패"), tone: ok ? "gold" : "red" };
    }
    return { title: `${label} · ${n}`, result: `앞면 ${p.heads}`, tone: p.heads > 0 ? "white" : "red" };
  }
  const label = p.mySin ? `${SIN_LABEL[p.mySin]} 대립 판정` : "대립 판정";
  const win = p.winner === "attacker";
  return { title: `${label} · vs ${p.opName ?? "상대"}`, result: win ? "승리" : "패배", tone: win ? "gold" : "red" };
}

export function CoinTile({ heads, size = 24 }: { heads: boolean; size?: number }) {
  return (
    <span className="flex flex-col items-center">
      <CoinIcon heads={heads} size={size} />
      <span className="text-[9px] leading-none" style={{ color: heads ? "#ffd54a" : "#9a8f86" }}>{heads ? "앞" : "뒤"}</span>
    </span>
  );
}

function Band({ tone, children }: { tone: "gold" | "red" | "white"; children: ReactNode }) {
  const style = tone === "gold" ? { background: "rgba(255,213,74,.16)", color: "#ffd54a", borderColor: "rgba(255,213,74,.5)" }
    : tone === "red" ? { background: "rgba(224,75,82,.16)", color: "#ff7a7a", borderColor: "rgba(224,75,82,.5)" }
    : { background: "rgba(255,255,255,.06)", color: "#efe7da", borderColor: "rgba(255,255,255,.2)" };
  return <div className="mt-1 border-t px-2 py-1 text-center text-sm font-black tracking-wider" style={style}>{children}</div>;
}

export function CoinCard({ p, who, time, extra }: { p: CoinPayload; who: string; time: string; extra?: ReactNode }) {
  const s = judgeSummary(p);
  return (
    <div className="group border border-border bg-elev/70 text-xs">
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-1">
        {p.sin ? <SinIcon sin={p.sin} size={16} /> : null}
        <b className="text-gold">{p.name ?? who}</b>
        <span className="text-muted">{s.title}{p.light ? " · 빛" : ""}{typeof p.sanity === "number" ? ` · 정신력 ${p.sanity >= 0 ? "+" : ""}${p.sanity}` : ""}</span>
        <span className="ml-auto text-[10px] text-muted">{time}</span>{extra}
      </div>
      <div className="flex items-center gap-3 px-2 py-1.5">
        <div className="flex flex-wrap gap-1">{p.coins.map((h, i) => <CoinTile key={i} heads={h} />)}{p.coins.length === 0 ? <span className="text-muted">코인 없음</span> : null}</div>
        <div className="ml-auto shrink-0 text-right leading-tight">
          <div className="text-lg font-black tabular-nums">앞면 {p.heads}</div>
          {p.difficulty && p.difficulty > 0 ? <div className="text-[10px] text-muted">난이도 {p.difficulty}</div> : null}
        </div>
      </div>
      {p.difficulty && p.difficulty > 0 ? <Band tone={s.tone}>{s.result}</Band> : null}
    </div>
  );
}

export function VsCard({ p, who, time, extra }: { p: VsPayload; who: string; time: string; extra?: ReactNode }) {
  const s = judgeSummary(p);
  const row = (name: string, sin: Sin | null | undefined, stat: number | undefined, r: { coins: boolean[]; heads: number }, win: boolean) => (
    <div className={`flex items-center gap-2 px-2 py-1 ${win ? "" : "opacity-70"}`}>
      {sin ? <SinIcon sin={sin} size={16} /> : null}
      <span className="w-20 truncate font-semibold">{name}</span>
      <span className="text-muted">{sin ? SIN_LABEL[sin] : "코인"} {stat ?? r.coins.length}</span>
      <div className="flex flex-wrap gap-0.5">{r.coins.map((h, i) => <CoinIcon key={i} heads={h} size={18} />)}</div>
      <span className={`ml-auto text-base font-black tabular-nums ${win ? "text-gold" : ""}`}>{r.heads}</span>
    </div>
  );
  return (
    <div className="group border border-border bg-elev/70 text-xs">
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-1"><b className="text-gold">{p.name ?? who}</b><span className="text-muted">{s.title}</span><span className="ml-auto text-[10px] text-muted">{time}</span>{extra}</div>
      {row(p.name ?? who, p.mySin, p.myStat, p.attacker, p.winner === "attacker")}
      {row(p.opName ?? "상대", p.opSin, p.opStat, p.defender, p.winner === "defender")}
      <Band tone={s.tone}>{p.winner === "attacker" ? "공격 측 승리" : "방어 측 승리"}</Band>
    </div>
  );
}

export function DiceCard({ p, who, time, extra }: { p: DicePayload; who: string; time: string; extra?: ReactNode }) {
  const max = Math.max(...p.rolls);
  return (
    <div className="group border border-border bg-elev/70 text-xs">
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-1"><b className="text-gold">{who}</b><span className="text-muted">자유 굴림 {p.expr}</span><span className="ml-auto text-[10px] text-muted">{time}</span>{extra}</div>
      <div className="flex items-center gap-3 px-2 py-1.5">
        <div className="flex flex-wrap gap-1">{p.rolls.map((r, i) => <span key={i} className={`flex h-7 min-w-7 items-center justify-center border px-1 text-sm font-black tabular-nums ${r === p.sides ? "border-gold text-gold" : "border-border"}`}>{r}</span>)}{p.mod ? <span className="self-center text-muted">{p.mod > 0 ? `+${p.mod}` : p.mod}</span> : null}</div>
        <div className="ml-auto text-right leading-tight"><div className="text-lg font-black tabular-nums">합 {p.total}</div><div className="text-[10px] text-muted">최고 {max}</div></div>
      </div>
    </div>
  );
}
