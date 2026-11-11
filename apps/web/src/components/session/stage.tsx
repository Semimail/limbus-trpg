"use client";
import { useMemo, useState } from "react";
import type { ChatMessage } from "./chat";
import { KeywordText } from "@/components/keyword/keyword";
import { BACKGROUNDS } from "@/components/icons";

export interface StageActor { id: string; name: string; spriteUrl: string | null; portraitUrl: string | null }

interface Props { background: string | null; actors: StageActor[]; messages: ChatMessage[]; gmNames: Record<string, string> }

/** 배경 위에 최근 발언 캐릭터들의 스탠딩을 세우고, 마지막 대사를 상자에 보여준다 */
export function Stage({ background, actors, messages, gmNames }: Props) {
  const [cursor, setCursor] = useState<number | null>(null); // null = 최신
  const lines = useMemo(() => messages.filter((m) => m.kind === "ic" || m.kind === "gm"), [messages]);
  const idx = cursor === null ? lines.length - 1 : Math.max(0, Math.min(lines.length - 1, cursor));
  const current = lines[idx];
  // 무대에 올릴 배우: 현재 대사까지의 최근 IC 발언자 최대 5명 (등장 순)
  const onStage = useMemo(() => {
    const seen: string[] = [];
    for (let i = idx; i >= 0 && seen.length < 5; i--) {
      const m = lines[i]!;
      if (m.kind === "ic" && m.character_id && !seen.includes(m.character_id)) seen.push(m.character_id);
    }
    return seen.reverse().map((cid) => actors.find((a) => a.id === cid)).filter((a): a is StageActor => !!a);
  }, [lines, idx, actors]);
  const speakerId = current?.kind === "ic" ? current.character_id : null;
  const img = current?.payload && typeof current.payload.image === "string" ? (current.payload.image as string) : null;

  return (
    <div className="relative w-full overflow-hidden border border-border bg-black text-white" style={{ aspectRatio: "16 / 9" }}>
      {/* 배경 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={background ?? BACKGROUNDS.backstreet} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,.15) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,.65) 100%)" }} />
      {/* 스탠딩 */}
      <div className="absolute inset-x-0 bottom-[26%] top-[4%] flex items-end justify-center gap-[2%] px-[4%]">
        {onStage.map((a) => {
          const active = a.id === speakerId;
          return (
            <div key={a.id} className="relative flex h-full max-w-[26%] flex-1 items-end justify-center transition-all duration-300" style={{ filter: active ? "none" : "brightness(.55) saturate(.7)", transform: active ? "scale(1.04)" : "scale(1)" }}>
              {a.spriteUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.spriteUrl} alt={a.name} className="max-h-full w-auto object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,.7)]" draggable={false} />
              ) : (
                <div className="flex h-[70%] w-full flex-col items-center justify-end">
                  <div className="aspect-square w-[70%] overflow-hidden rounded-full border-2 border-gold/70 bg-black/60">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {a.portraitUrl ? <img src={a.portraitUrl} alt={a.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs">{a.name.slice(0, 2)}</div>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {onStage.length === 0 ? <div className="self-center text-xs text-white/60">캐릭터 발언이 올라오면 무대에 섭니다</div> : null}
      </div>
      {/* 대사 상자 */}
      <div className="absolute inset-x-[3%] bottom-[3%]">
        <div className="relative border border-[#7a1d20] bg-[#120a0a]/90 px-4 py-3 backdrop-blur-sm" style={{ clipPath: "polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)" }}>
          {current ? (
            <>
              <div className="mb-1 flex items-center gap-2 text-xs">
                {current.kind === "ic" ? <span className="bg-[#b3161c] px-2 py-0.5 font-semibold">{actors.find((a) => a.id === current.character_id)?.name ?? "?"}</span> : <span className="bg-[#3a2a1a] px-2 py-0.5 text-gold">GM · {current.author_id ? gmNames[current.author_id] ?? "" : ""}</span>}
                <span className="text-white/50">{new Date(current.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}</span>
                <span className="ml-auto flex items-center gap-1 text-white/60">
                  <button type="button" onClick={() => setCursor(Math.max(0, idx - 1))} disabled={idx <= 0} className="px-1 disabled:opacity-30">◀</button>
                  <span className="tabular-nums">{idx + 1}/{lines.length}</span>
                  <button type="button" onClick={() => setCursor(idx + 1 >= lines.length - 1 ? null : idx + 1)} disabled={idx >= lines.length - 1} className="px-1 disabled:opacity-30">▶</button>
                  {cursor !== null ? <button type="button" onClick={() => setCursor(null)} className="px-1 text-gold">최신</button> : null}
                </span>
              </div>
              <div className={`text-sm leading-relaxed sm:text-base ${current.kind === "gm" ? "italic text-white/90" : ""}`}><KeywordText text={current.content} /></div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {img ? <img src={img} alt="" className="mt-2 max-h-32 border border-white/20" /> : null}
            </>
          ) : <div className="text-sm text-white/60">아직 대사가 없습니다. 채팅에서 캐릭터 발언이나 GM 서술을 보내면 여기에 나옵니다.</div>}
        </div>
      </div>
    </div>
  );
}
