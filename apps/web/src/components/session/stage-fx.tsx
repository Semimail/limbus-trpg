"use client";
/*
 * 무대 연출 (GM 콘솔 "무대" 탭의 버튼 → Realtime 브로드캐스트 `fx:<sceneId>` → 모두의 화면).
 *  - 장면 전환: 페이드 / 암전 / 섬광 / 즉시. GM 쪽에서 어두워진 순간에 배경을 바꾼다(updateBoard).
 *  - 제목 카드: 가운데 큰 제목 + 부제, 3초.
 *  - 캐릭터 동작 12종: 짧은 트윈(놀람·떨림·끄덕·고개 젓기·움찔·들이밀기·한숨)과 자세(다가서기·물러서기·쓰러짐·돌아서기), 제자리.
 *  - 효과음: 음원 파일 없이 WebAudio 로 합성 (쾅·타격·베기·휘익·노크·문 삐걱·발소리·심장박동·잡음·종).
 *  - BGM: 주소(mp3/ogg)로 재생. 현재 곡은 장면 보드(board.bgm)에 남아 늦게 들어온 사람도 듣는다.
 *  브라우저는 사용자가 한 번 누르기 전엔 소리를 못 내므로 하단 바의 소리 버튼으로 켠다.
 */
import { useEffect, useRef, useState } from "react";

export type StageMotion = "surprise" | "shiver" | "nod" | "shakeHead" | "flinch" | "lean" | "sigh" | "forward" | "back" | "down" | "turn" | "reset";
export type Stance = "forward" | "back" | "down" | "turn";
export const STAGE_MOTIONS: { id: StageMotion; label: string; stance?: Stance | "reset" }[] = [
  { id: "surprise", label: "놀람" }, { id: "shiver", label: "떨림" }, { id: "nod", label: "끄덕" }, { id: "shakeHead", label: "고개 젓기" },
  { id: "flinch", label: "움찔" }, { id: "lean", label: "들이밀기" }, { id: "sigh", label: "한숨" },
  { id: "forward", label: "다가서기", stance: "forward" }, { id: "back", label: "물러서기", stance: "back" }, { id: "down", label: "쓰러짐", stance: "down" }, { id: "turn", label: "돌아서기", stance: "turn" }, { id: "reset", label: "제자리", stance: "reset" },
];
export type TransitionMode = "fade" | "black" | "flash" | "cut";
export const TRANSITIONS: { id: TransitionMode; label: string; /** 배경을 바꿀 시점(ms) */ swapAt: number; total: number }[] = [
  { id: "fade", label: "페이드", swapAt: 450, total: 1400 }, { id: "black", label: "암전", swapAt: 350, total: 2000 }, { id: "flash", label: "섬광", swapAt: 60, total: 900 }, { id: "cut", label: "즉시", swapAt: 0, total: 0 },
];
export type SfxId = "bang" | "hit" | "slash" | "whoosh" | "knock" | "creak" | "steps" | "heart" | "static" | "bell";
export const SFX: { id: SfxId; label: string }[] = [
  { id: "bang", label: "쾅" }, { id: "hit", label: "타격" }, { id: "slash", label: "베기" }, { id: "whoosh", label: "휘익" }, { id: "knock", label: "노크" },
  { id: "creak", label: "문 삐걱" }, { id: "steps", label: "발소리" }, { id: "heart", label: "심장박동" }, { id: "static", label: "잡음" }, { id: "bell", label: "종" },
];

export type StageFx =
  | { type: "transition"; mode: TransitionMode; background: string | null }
  | { type: "title"; title: string; subtitle?: string }
  | { type: "motion"; actorId: string; motion: StageMotion }
  | { type: "sfx"; id: SfxId }
  | { type: "bgm"; url: string | null; title?: string };

/** 배우별 현재 동작(일회성, key 로 재생)과 자세(유지) */
export interface ActorFx { motion?: { id: StageMotion; key: number }; stance?: Stance }
export function applyMotion(cur: Record<string, ActorFx>, actorId: string, motion: StageMotion): Record<string, ActorFx> {
  const def = STAGE_MOTIONS.find((m) => m.id === motion);
  const prev = cur[actorId] ?? {};
  const next: ActorFx = { ...prev, motion: { id: motion, key: Date.now() } };
  if (def?.stance === "reset") { delete next.stance; delete next.motion; }
  else if (def?.stance) next.stance = def.stance;
  return { ...cur, [actorId]: next };
}

/* ---------- 오버레이 ---------- */
export function TransitionOverlay({ fx, onDone }: { fx: { mode: TransitionMode; key: number }; onDone: () => void }) {
  const def = TRANSITIONS.find((t) => t.id === fx.mode)!;
  useEffect(() => { if (def.total === 0) { onDone(); return; } const t = setTimeout(onDone, def.total); return () => clearTimeout(t); }, [fx.key, def.total, onDone]);
  if (def.total === 0) return null;
  return <div key={fx.key} className={`st-trans st-trans-${fx.mode} pointer-events-none absolute inset-0 z-40`} />;
}

export function TitleCard({ card, onDone }: { card: { title: string; subtitle?: string; key: number }; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3200); return () => clearTimeout(t); }, [card.key, onDone]);
  return (
    <div key={card.key} className="st-title pointer-events-none absolute inset-x-0 top-[30%] z-40 flex flex-col items-center">
      <div className="st-title-band w-full py-6 text-center">
        <div className="text-3xl font-black tracking-[.2em] text-[#f7e7c3] md:text-5xl" style={{ textShadow: "0 0 24px rgba(0,0,0,.9), 0 3px 0 #000" }}>{card.title}</div>
        {card.subtitle ? <div className="mt-2 text-sm tracking-[.3em] text-[#d9c08a] md:text-base">{card.subtitle}</div> : null}
      </div>
    </div>
  );
}

/* ---------- 소리 ---------- */
let ctx: AudioContext | null = null;
export function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) { const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext; if (!C) return null; ctx = new C(); }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}
function noise(c: AudioContext, sec: number) {
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * sec), c.sampleRate); const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf; return src;
}
function env(c: AudioContext, t0: number, a: number, d: number, peak = 1) { const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); return g; }
function thump(c: AudioContext, t0: number, f0: number, f1: number, dur: number, peak: number) { const o = c.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + dur); const g = env(c, t0, 0.005, dur, peak); o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.05); }
function burst(c: AudioContext, t0: number, dur: number, type: BiquadFilterType, f0: number, f1: number, peak: number, q = 1) { const n = noise(c, dur + 0.1); const fl = c.createBiquadFilter(); fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f0, t0); fl.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t0 + dur); const g = env(c, t0, 0.005, dur, peak); n.connect(fl).connect(g).connect(c.destination); n.start(t0); n.stop(t0 + dur + 0.1); }

/** 효과음 합성. 소리가 꺼져 있으면(컨텍스트 없음) 아무것도 하지 않는다 */
export function playSfx(id: SfxId) {
  const c = audioContext(); if (!c) return; const t = c.currentTime + 0.02;
  switch (id) {
    case "bang": burst(c, t, 0.5, "lowpass", 900, 80, 0.9); thump(c, t, 120, 35, 0.5, 0.9); break;
    case "hit": burst(c, t, 0.14, "bandpass", 1800, 300, 0.7, 0.7); thump(c, t, 180, 60, 0.18, 0.8); break;
    case "slash": burst(c, t, 0.22, "highpass", 6000, 1200, 0.6, 0.5); burst(c, t + 0.05, 0.12, "bandpass", 3000, 800, 0.4, 2); break;
    case "whoosh": burst(c, t, 0.45, "bandpass", 300, 2400, 0.5, 1.5); break;
    case "knock": thump(c, t, 220, 90, 0.12, 0.7); thump(c, t + 0.22, 220, 90, 0.12, 0.7); break;
    case "creak": { const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(140, t); o.frequency.linearRampToValueAtTime(220, t + 0.5); o.frequency.linearRampToValueAtTime(170, t + 1.1); const fl = c.createBiquadFilter(); fl.type = "bandpass"; fl.frequency.value = 900; fl.Q.value = 6; const g = env(c, t, 0.15, 1.0, 0.25); o.connect(fl).connect(g).connect(c.destination); o.start(t); o.stop(t + 1.3); break; }
    case "steps": for (let i = 0; i < 4; i++) { thump(c, t + i * 0.38, 150, 50, 0.1, 0.5); burst(c, t + i * 0.38, 0.06, "lowpass", 1200, 300, 0.25); } break;
    case "heart": for (let i = 0; i < 3; i++) { thump(c, t + i * 0.9, 80, 40, 0.18, 0.9); thump(c, t + i * 0.9 + 0.22, 70, 35, 0.16, 0.6); } break;
    case "static": burst(c, t, 1.0, "highpass", 1000, 1000, 0.3); break;
    case "bell": { for (const [f, p] of [[880, 0.5], [1760, 0.25], [2640, 0.12]] as [number, number][]) { const o = c.createOscillator(); o.type = "sine"; o.frequency.value = f; const g = env(c, t, 0.01, 1.8, p); o.connect(g).connect(c.destination); o.start(t); o.stop(t + 2); } break; }
  }
}

/** BGM 플레이어: url 이 바뀌면 바꿔 틀고, 소리가 꺼져 있으면 멈춘다 (루프) */
export function BgmPlayer({ url, enabled, volume = 0.5 }: { url: string | null; enabled: boolean; volume?: number }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const a = ref.current; if (!a) return;
    a.volume = volume;
    if (!url || !enabled) { a.pause(); return; }
    if (a.src !== url) { a.src = url; a.load(); }
    a.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
  }, [url, enabled, volume]);
  return <><audio ref={ref} loop preload="none" />{blocked && enabled && url ? <span className="b-muted text-[10px]">(BGM 재생 차단됨 · 화면을 한 번 누르세요)</span> : null}</>;
}
