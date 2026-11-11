"use client";
import { useMemo, useState } from "react";
import type { ChatMessage } from "./chat";
import { KeywordText } from "@/components/keyword/keyword";
import { BACKGROUNDS } from "@/components/icons";

/** 무대 배우. id는 "c:<characterId>"(PC) 또는 "e:<enemyId>"(NPC) */
export interface StageActor { id: string; name: string; spriteUrl: string | null; portraitUrl: string | null; kind: "pc" | "npc" }
export interface TypingLine { key: string; name: string; line: string }

interface Props {
  background: string | null; actors: StageActor[]; messages: ChatMessage[]; gmNames: Record<string, string>;
  /** 장면 출연진(board.stage.cast). null이면 최근 발언자로 추정 */
  cast?: string[] | null; split?: boolean; typing?: TypingLine[]; fill?: boolean; overlay?: React.ReactNode;
}

export const speakerOf = (m: ChatMessage): string | null => m.kind === "ic" && m.character_id ? `c:${m.character_id}` : m.kind === "gm" && m.payload && typeof m.payload.npc === "object" && m.payload.npc ? `e:${(m.payload.npc as { id: string }).id}` : null;

/** 배경 위에 출연진 스탠딩을 세우고, 마지막 대사를 상자에 보여준다 (비주얼 노벨식) */
export function Stage({ background, actors, messages, gmNames, cast, split, typing, fill, overlay }: Props) {
  const [cursor, setCursor] = useState<number | null>(null); // null = 최신
  const lines = useMemo(() => messages.filter((m) => m.kind === "ic" || m.kind === "gm"), [messages]);
  const idx = cursor === null ? lines.length - 1 : Math.max(0, Math.min(lines.length - 1, cursor));
  const current = lines[idx];
  const onStage = useMemo(() => {
    if (cast) return cast.map((id) => actors.find((a) => a.id === id)).filter((a): a is StageActor => !!a).slice(0, 8);
    const seen: string[] = [];
    for (let i = idx; i >= 0 && seen.length < 5; i--) { const sp = speakerOf(lines[i]!); if (sp && !seen.includes(sp)) seen.push(sp); }
    return seen.reverse().map((id) => actors.find((a) => a.id === id)).filter((a): a is StageActor => !!a);
  }, [cast, lines, idx, actors]);
  const speakerId = current ? speakerOf(current) : null;
  const speaker = speakerId ? actors.find((a) => a.id === speakerId) : undefined;
  const img = current?.payload && typeof current.payload.image === "string" ? (current.payload.image as string) : null;
  const left = split ? onStage.filter((a) => a.kind === "pc") : onStage;
  const right = split ? onStage.filter((a) => a.kind === "npc") : [];

  const standing = (a: StageActor) => {
    const active = a.id === speakerId;
    return (
      <div key={a.id} className="relative flex h-full max-w-[26%] flex-1 items-end justify-center transition-all duration-300" style={{ filter: active || !speakerId ? "none" : "brightness(.5) saturate(.6)", transform: active ? "scale(1.04)" : "scale(1)" }}>
        {a.spriteUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.spriteUrl} alt={a.name} className="max-h-full w-auto object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,.7)]" draggable={false} style={a.kind === "npc" && split ? { transform: "scaleX(-1)" } : undefined} />
        ) : (
          <div className="flex h-[70%] w-full flex-col items-center justify-end">
            <div className="aspect-square w-[46%] max-w-[9rem] overflow-hidden rounded-full border-2 bg-black/60" style={{ borderColor: a.kind === "npc" ? "#b3161c" : "rgba(217,179,91,.8)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {a.portraitUrl ? <img src={a.portraitUrl} alt={a.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm">{a.name.slice(0, 2)}</div>}
            </div>
            <div className="mt-1 text-xs" style={{ textShadow: "0 1px 2px #000" }}>{a.name}</div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`relative w-full overflow-hidden bg-black text-white ${fill ? "h-full" : "border border-border"}`} style={fill ? undefined : { aspectRatio: "16 / 9" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={background ?? BACKGROUNDS.backstreet} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,.25) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,.7) 100%)" }} />
      {/* 스탠딩 */}
      <div className="absolute inset-x-0 bottom-[24%] top-[6%] flex items-end px-[3%]">
        <div className={`flex h-full items-end justify-center gap-[2%] ${split ? "w-1/2" : "w-full"}`}>{left.map(standing)}</div>
        {split ? <div className="flex h-full w-1/2 items-end justify-center gap-[2%]">{right.map(standing)}</div> : null}
        {onStage.length === 0 ? <div className="absolute inset-0 flex items-center justify-center text-xs text-white/60">등장한 캐릭터가 없습니다. 대사를 보내면 무대에 섭니다.</div> : null}
      </div>
      {overlay}
      {/* 대사 상자 */}
      <div className="absolute inset-x-[2%] bottom-[2.5%] sm:inset-x-[4%]">
        {/* 이름 플레이트 */}
        {current ? (
          <div className="relative z-10 ml-2 flex items-end gap-2 sm:ml-6">
            <div className="relative flex h-10 min-w-[8rem] items-center justify-center px-5 text-base font-bold text-[#f7e7c3] sm:h-11 sm:text-lg" style={{ backgroundImage: "url(/assets/limbus/ui/plate-tag.png)", backgroundSize: "100% 100%", textShadow: "0 1px 2px #000" }}>
              {speaker ? speaker.name : current.kind === "gm" ? "GM" : "?"}
              <span className="absolute -top-3 left-3 rounded-sm px-1.5 text-[9px] font-black" style={{ background: speaker?.kind === "npc" ? "#b3161c" : current.kind === "gm" && !speaker ? "#3a2a1a" : "#c9a24a", color: speaker?.kind === "npc" || (current.kind === "gm" && !speaker) ? "#fff" : "#1a1208" }}>
                {speaker ? (speaker.kind === "npc" ? "NPC" : "PC") : "서술"}
              </span>
            </div>
          </div>
        ) : null}
        <div className="st-dialog relative -mt-2 min-h-[7.5rem] px-5 pb-3 pt-4 sm:min-h-[8.5rem] sm:px-8">
          {current ? (
            <>
              <div className={`text-sm leading-relaxed sm:text-base ${current.kind === "gm" && !speaker ? "italic text-white/90" : ""}`}><KeywordText text={current.content} /></div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {img ? <img src={img} alt="" className="mt-2 max-h-28 border border-white/20" /> : null}
              <div className="absolute right-3 top-1.5 flex items-center gap-1 text-[10px] text-white/50">
                <span>{current.author_id && current.kind === "gm" ? gmNames[current.author_id] ?? "" : ""} {new Date(current.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span>
                <button type="button" onClick={() => setCursor(Math.max(0, idx - 1))} disabled={idx <= 0} className="px-1 disabled:opacity-30">◀</button>
                <span className="tabular-nums">{idx + 1}/{lines.length}</span>
                <button type="button" onClick={() => setCursor(idx + 1 >= lines.length - 1 ? null : idx + 1)} disabled={idx >= lines.length - 1} className="px-1 disabled:opacity-30">▶</button>
                {cursor !== null ? <button type="button" onClick={() => setCursor(null)} className="px-1 text-gold">최신</button> : null}
              </div>
            </>
          ) : <div className="text-sm text-white/60">아직 대사가 없습니다. 아래에서 대사를 입력하면 여기에 나옵니다.</div>}
          {typing?.length ? <div className="mt-2 space-y-0.5 border-t border-white/10 pt-1.5 text-xs italic text-[#d9c08a]">{typing.map((t) => <div key={t.key} className="st-typing">{t.line}</div>)}</div> : null}
        </div>
      </div>
    </div>
  );
}
