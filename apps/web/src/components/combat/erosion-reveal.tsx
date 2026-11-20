"use client";
/*
 * 전투 종료 뒤 침식도 단계 변화 연출 (참고: 타 팀 VTT 의 "목소리 판정 → 뒤틀림 n단계" 흐름, 약 5초).
 *  어두운 화면 + 대각 띠 → 초상 카드 슬라이드 + 침식도 전후 → 1.5초에 흰 섬광 → "침식 n단계 · 이름" 큰 글자 + 파편 → 유지 → 페이드.
 *  단계가 오른 아군 캐릭터마다 한 장씩 차례로 보여준다.
 */
import { useEffect, useState } from "react";
import { EROSION_STAGE_LABEL, type ErosionStage } from "@limbus/rules";

export interface ErosionCard { unitId: string; name: string; portrait: string | null; before: number; after: number; from: ErosionStage; to: ErosionStage; max: number }

const CARD_MS = 5200;
export function ErosionReveal({ cards, onDone }: { cards: ErosionCard[]; onDone: () => void }) {
  const [i, setI] = useState(0);
  const card = cards[i];
  useEffect(() => {
    if (!card) { onDone(); return; }
    const t = setTimeout(() => setI((k) => k + 1), CARD_MS);
    return () => clearTimeout(t);
  }, [card, i, onDone]);
  if (!card) return null;
  const up = card.to > card.from;
  const color = card.to >= 4 ? "#ff3b3b" : card.to >= 3 ? "#ff6b4a" : card.to >= 2 ? "#e0803a" : "#7fb6ff";
  return (
    <div key={card.unitId} className="b-erode pointer-events-auto absolute inset-0 z-40 overflow-hidden" onClick={() => setI((k) => k + 1)} title="누르면 다음">
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,.9)" }} />
      <div className="b-erode-band" data-stage={card.to} />
      <div className="b-erode-flash absolute inset-0" />
      {/* 초상 카드 */}
      <div className="b-erode-card absolute left-[8%] top-[16%] flex w-[20%] max-w-[14rem] flex-col items-center">
        <div className="aspect-[2/3] w-full overflow-hidden border-2" style={{ borderColor: color, background: "#120c0c", boxShadow: `0 0 28px ${color}55, 0 10px 30px rgba(0,0,0,.8)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {card.portrait ? <img src={card.portrait} alt="" className="h-full w-full object-cover" draggable={false} /> : <div className="flex h-full items-center justify-center text-4xl font-black text-white/70">{card.name.slice(0, 1)}</div>}
        </div>
        <div className="mt-2 text-base font-bold text-white" style={{ textShadow: "0 1px 2px #000" }}>{card.name}</div>
        <div className="text-[11px] text-[#d9c08a]">침식도 {card.before} → <b style={{ color }}>{card.after}</b> / {card.max}</div>
      </div>
      {/* 단계 */}
      <div className="b-erode-stage absolute left-[36%] top-[30%]">
        <div className="text-sm tracking-[.3em] text-white/70">{up ? "침식도 단계 상승" : "침식도 단계 하락"}</div>
        <div className="mt-1 text-5xl font-black tracking-wider md:text-7xl" style={{ color, textShadow: `0 0 30px ${color}88, 0 3px 0 #000` }}>{card.to >= 4 ? "침식" : `${card.to}단계`}</div>
        <div className="mt-2 text-xl font-bold text-[#f7e7c3] md:text-2xl" style={{ textShadow: "0 1px 2px #000" }}>{EROSION_STAGE_LABEL[card.to]}</div>
        <div className="mt-1 text-xs text-white/60">{EROSION_STAGE_LABEL[card.from]} {card.from}단계에서</div>
      </div>
      {/* 파편 (CSS 로 그린 조각들) */}
      <div className="b-erode-shards pointer-events-none absolute right-[8%] top-[18%] h-[50%] w-[32%]">
        {Array.from({ length: 9 }).map((_, k) => <span key={k} className="absolute block" style={{ left: `${(k * 37) % 90}%`, top: `${(k * 53) % 85}%`, width: `${12 + (k % 4) * 6}%`, height: `${8 + (k % 3) * 5}%`, background: `linear-gradient(135deg, ${color}cc, ${color}22)`, clipPath: "polygon(0 20%, 60% 0, 100% 55%, 40% 100%)", transform: `rotate(${(k * 41) % 360}deg)`, opacity: 0.8 }} />)}
      </div>
      <div className="absolute bottom-[12%] left-1/2 -translate-x-1/2 text-[11px] text-white/50">{i + 1}/{cards.length} · 누르면 다음</div>
    </div>
  );
}
