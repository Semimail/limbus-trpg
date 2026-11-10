"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { GLOSSARY_BY_ID, type GlossaryEntry } from "@limbus/rules";

interface Ctx { open: (id: string, anchor: HTMLElement) => void; close: () => void }
const KeywordCtx = createContext<Ctx>({ open: () => {}, close: () => {} });
export const useKeyword = () => useContext(KeywordCtx);

/** 키워드 팝업: 단어를 누르면 설명, 다른 곳을 누르거나 Esc면 닫힘 */
export function KeywordProvider({ children }: { children: ReactNode }) {
  const [entry, setEntry] = useState<GlossaryEntry | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean }>({ left: 0, top: 0, up: false });
  const anchorRef = useRef<HTMLElement | null>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const open = useCallback((id: string, anchor: HTMLElement) => {
    const e = GLOSSARY_BY_ID[id]; if (!e) return;
    if (anchorRef.current === anchor && entry?.id === id) { setEntry(null); anchorRef.current = null; return; }
    const r = anchor.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const width = Math.min(340, vw - 24);
    const left = Math.max(12, Math.min(vw - width - 12, r.left + r.width / 2 - width / 2));
    const up = r.bottom + 220 > vh && r.top > 220;
    setPos({ left, top: up ? r.top - 8 : r.bottom + 8, up });
    anchorRef.current = anchor; setEntry(e);
  }, [entry]);
  const close = useCallback(() => { setEntry(null); anchorRef.current = null; }, []);

  useEffect(() => {
    if (!entry) return;
    const onDown = (ev: PointerEvent) => {
      const t = ev.target as Node;
      if (popRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      close();
    };
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") close(); };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    return () => { document.removeEventListener("pointerdown", onDown, true); document.removeEventListener("keydown", onKey); window.removeEventListener("scroll", close, true); };
  }, [entry, close]);

  return (
    <KeywordCtx.Provider value={{ open, close }}>
      {children}
      {entry ? (
        <div ref={popRef} role="dialog" className="fixed z-50 w-[340px] max-w-[calc(100vw-24px)] border border-gold/60 bg-elev p-3 text-sm shadow-xl"
          style={{ left: pos.left, top: pos.top, transform: pos.up ? "translateY(-100%)" : undefined, clipPath: "polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)" }}>
          <div className="flex items-center gap-2">
            {entry.icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/assets/limbus/${entry.icon}.png`} alt="" width={22} height={22} className="shrink-0" />
            ) : null}
            <span className="font-semibold">{entry.term}</span>
            <span className="stamp ml-auto">{entry.category}</span>
          </div>
          <p className="mt-1 text-fg">{entry.short}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{entry.long}</p>
          <a href="/databook" className="mt-2 inline-block text-xs text-accent">데이터북에서 보기 →</a>
        </div>
      ) : null}
    </KeywordCtx.Provider>
  );
}
