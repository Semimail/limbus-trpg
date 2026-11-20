"use client";
/*
 * 비전투 판정 팝업 + 판정 컷인 (참고: 타 팀 VTT 의 "7죄악 판정" 팝업과 3초 컷인).
 *  - 팝업: 인물 → 죄악 7개(능력치 = 코인 수) → 상황 보너스(특기·출신, 합쳐서 +1) / 빛(+1) → 난이도 → 판정.
 *    결과는 기존 "/coin 죄악 난이도 +보너스 빛" 명령으로 보내서 서버 처리를 그대로 쓴다.
 *  - 컷인(약 3.6초): 어둡게 + 대각 띠 → 초상 카드 슬라이드 → 죄악 → 코인이 하나씩 뒤집힘(0.7초에 흰 섬광) → 1.6초에 결과 문구 → 유지 → 페이드.
 */
import { useEffect, useMemo, useState } from "react";
import { SINS, SIN_LABEL, ORIGINS, type Sin } from "@limbus/rules";
import { CoinIcon, SinIcon } from "@/components/icons";
import { judgeSummary, type CoinPayload, type VsPayload } from "./log-cards";

export interface JudgeChar { id: string; name: string; stats: Record<Sin, number>; origin?: string | null; traits: string[]; light: number; portraitUrl: string | null; cardUrl?: string | null }

export function JudgePopup({ chars, defaultCharId, onSubmit, onClose, pending }: { chars: JudgeChar[]; defaultCharId: string | null; onSubmit: (characterId: string, command: string) => void; onClose: () => void; pending: boolean }) {
  const [charId, setCharId] = useState<string>(defaultCharId ?? chars[0]?.id ?? "");
  const ch = chars.find((c) => c.id === charId) ?? chars[0];
  const [sin, setSin] = useState<Sin>("wrath");
  const [situ, setSitu] = useState(false);
  const [light, setLight] = useState(false);
  const [difficulty, setDifficulty] = useState(0);
  const origin = ORIGINS.find((o) => o.name === ch?.origin);
  const stat = ch ? ch.stats[sin] : 0;
  const bonus = (situ ? 1 : 0) + (light ? 1 : 0);
  const total = stat + bonus;
  const best = useMemo(() => ch ? [...SINS].sort((a, b) => ch.stats[b] - ch.stats[a])[0] : null, [ch]);
  const cmd = `/coin ${SIN_LABEL[sin]}${difficulty ? ` ${difficulty}` : ""}${situ ? " +1" : ""}${light ? " 빛" : ""}`;
  if (!ch) return null;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-3" onClick={onClose}>
      <div className="b-pane w-[min(96vw,34rem)] p-3 text-xs" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center gap-2">
          <span className="b-head-plate px-2 py-0.5 text-sm font-bold">7죄악 판정</span>
          <select value={charId} onChange={(e) => setCharId(e.target.value)} className="b-input h-7 px-1">{chars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <span className="b-muted">빛 {ch.light}</span>
          <button type="button" className="b-muted ml-auto hover:text-white" onClick={onClose}>✕</button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {SINS.map((s) => (
            <button key={s} type="button" onClick={() => setSin(s)} className={`flex flex-col items-center gap-0.5 border py-1.5 ${sin === s ? "border-[#ffd54a] bg-[#ffd54a14]" : "border-[#3a2626] hover:border-[#8a6a3a]"}`}>
              <SinIcon sin={s} size={26} />
              <span className="text-[11px]">{SIN_LABEL[s]}</span>
              <span className={`text-base font-black tabular-nums ${sin === s ? "text-[#ffd54a]" : ""}`}>{ch.stats[s]}</span>
              {best === s ? <span className="rounded-sm bg-[#c9a24a] px-1 text-[9px] font-black text-[#1a1208]">주력</span> : <span className="h-3" />}
            </button>
          ))}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className={`flex cursor-pointer items-start gap-2 border p-2 ${situ ? "border-[#ffd54a]" : "border-[#3a2626]"}`}>
            <input type="checkbox" checked={situ} onChange={(e) => setSitu(e.target.checked)} className="mt-0.5" />
            <span><b>상황 보너스 +1</b> <span className="b-muted">특기·출신이 맞는 상황 (합쳐서 최대 +1)</span>
              {origin ? <span className="b-muted block">출신 {origin.name}: {origin.situations}</span> : null}
              {ch.traits.length ? <span className="b-muted block">특기: {ch.traits.join(" · ")}</span> : null}</span>
          </label>
          <label className={`flex cursor-pointer items-start gap-2 border p-2 ${light ? "border-[#ffd54a]" : "border-[#3a2626]"} ${ch.light < 1 ? "opacity-50" : ""}`}>
            <input type="checkbox" checked={light} disabled={ch.light < 1} onChange={(e) => setLight(e.target.checked)} className="mt-0.5" />
            <span><b>빛 사용 +1</b> <span className="b-muted">빛 1을 쓰고 코인을 하나 더 던진다 (남은 빛 {ch.light})</span></span>
          </label>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span className="b-gold mr-1 font-semibold">난이도</span>
          {[0, 1, 2, 3, 4, 5].map((n) => <button key={n} type="button" onClick={() => setDifficulty(n)} className={`b-tabx px-2 py-0 ${difficulty === n ? "b-tabx-on" : ""}`}>{n === 0 ? "없음" : n}</button>)}
          <span className="b-muted ml-auto">앞면이 난이도 이상이면 성공</span>
        </div>
        <div className="mt-3 flex items-center gap-2 border-t pt-2" style={{ borderColor: "var(--b-line)" }}>
          <span className="flex items-center gap-1">{Array.from({ length: Math.min(total, 10) }).map((_, i) => <CoinIcon key={i} heads size={16} />)}<span className="b-muted ml-1">코인 {total}개</span></span>
          <code className="b-muted ml-auto hidden sm:inline">{cmd}</code>
          <button type="button" className="b-btn-red" disabled={pending || total < 1} onClick={() => onSubmit(ch.id, cmd)}>{SIN_LABEL[sin]} 판정 · {total}코인</button>
        </div>
      </div>
    </div>
  );
}

/** 컷인에 넣을 내용 (코인 메시지 payload 에서 만든다) */
export interface JudgeCut { key: string; name: string; tag?: string | null; portrait: string | null; sin: Sin | null; coins: boolean[]; title: string; result: string; tone: "gold" | "red" | "white"; sub?: string }

export function judgeCutFromPayload(key: string, p: CoinPayload | VsPayload, who: { name: string; tag?: string | null; portrait: string | null }): JudgeCut {
  const s = judgeSummary(p);
  if (p.type === "coin") return { key, name: p.name ?? who.name, tag: who.tag, portrait: who.portrait, sin: p.sin ?? null, coins: p.coins, title: s.title, result: s.result, tone: s.tone, sub: p.difficulty && p.difficulty > 0 ? `앞면 ${p.heads} / 난이도 ${p.difficulty}` : undefined };
  return { key, name: p.name ?? who.name, tag: who.tag, portrait: who.portrait, sin: p.mySin ?? null, coins: p.attacker.coins, title: s.title, result: s.result, tone: s.tone, sub: `앞면 ${p.attacker.heads} vs ${p.opName ?? "상대"} ${p.defender.heads}` };
}

const CUT_MS = 3600;
export function JudgeCutIn({ cut, onDone }: { cut: JudgeCut; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, CUT_MS); return () => clearTimeout(t); }, [cut.key, onDone]);
  const color = cut.tone === "gold" ? "#ffd54a" : cut.tone === "red" ? "#ff5a5a" : "#f1ebe0";
  return (
    <div key={cut.key} className="st-judge pointer-events-none absolute inset-0 z-30 overflow-hidden" onClick={onDone}>
      <div className="st-judge-dim absolute inset-0" />
      <div className="st-judge-band absolute" data-tone={cut.tone} />
      <div className="st-judge-flash absolute inset-0" />
      {/* 초상 카드 */}
      <div className="st-judge-card absolute left-[6%] top-[14%] flex w-[22%] max-w-[15rem] flex-col items-center">
        <div className="aspect-[2/3] w-full overflow-hidden border-2" style={{ borderColor: "#8a6a3a", background: "#120c0c", boxShadow: "0 10px 30px rgba(0,0,0,.8)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {cut.portrait ? <img src={cut.portrait} alt="" className="h-full w-full object-cover" draggable={false} /> : <div className="flex h-full items-center justify-center text-4xl font-black text-white/70">{cut.name.slice(0, 1)}</div>}
        </div>
        <div className="mt-2 text-base font-bold text-white" style={{ textShadow: "0 1px 2px #000" }}>{cut.name}</div>
        {cut.tag ? <div className="text-[11px] text-[#d9c08a]">{cut.tag}</div> : null}
      </div>
      {/* 죄악 */}
      <div className="st-judge-sin absolute left-[33%] top-[36%] flex flex-col items-center">
        {cut.sin ? <SinIcon sin={cut.sin} size={72} /> : <span className="text-5xl">●</span>}
        <div className="mt-1 text-2xl font-black text-[#ffb347]" style={{ textShadow: "0 2px 0 #000" }}>{cut.sin ? SIN_LABEL[cut.sin] : "코인"}</div>
        <div className="text-[11px] text-white/70">{cut.title}</div>
      </div>
      {/* 코인 */}
      <div className="absolute left-[48%] top-[38%] flex flex-wrap gap-2" style={{ maxWidth: "40%" }}>
        {cut.coins.map((h, i) => (
          <span key={i} className="st-judge-coin flex flex-col items-center" style={{ animationDelay: `${400 + i * 160}ms` }}>
            <span className="flex h-12 w-12 items-center justify-center border-2" style={{ borderColor: h ? "#ffd54a" : "#5a4a3a", background: h ? "#2a2010" : "#1a1410", boxShadow: "0 4px 12px rgba(0,0,0,.7)" }}><CoinIcon heads={h} size={34} /></span>
            <span className="text-[10px] font-bold" style={{ color: h ? "#ffd54a" : "#9a8f86" }}>{h ? "앞" : "뒤"}</span>
          </span>
        ))}
      </div>
      {/* 결과 */}
      <div className="st-judge-result absolute right-[8%] top-[22%] text-right">
        <div className="text-4xl font-black tracking-wider md:text-6xl" style={{ color, textShadow: "0 0 24px rgba(0,0,0,.9), 0 3px 0 #000" }}>{cut.result}</div>
        {cut.sub ? <div className="mt-1 text-sm text-white/80" style={{ textShadow: "0 1px 2px #000" }}>{cut.sub}</div> : null}
      </div>
    </div>
  );
}
