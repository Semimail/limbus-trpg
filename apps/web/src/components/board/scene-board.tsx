"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { createClient, realtimeReady } from "@/lib/supabase/client";
import { updateBoard, type BoardData, type BoardToken } from "@/app/campaigns/[id]/sessions/[sid]/actions";
import { Button } from "@/components/ui";

export interface TokenSource { id: string; name: string; img: string | null; ownerId?: string | null; kind: "character" | "enemy" }

interface Props { campaignId: string; sceneId: string; initial: BoardData; isGm: boolean; meId: string; sources: TokenSource[]; readOnly?: boolean }

export function SceneBoard({ campaignId, sceneId, initial, isGm, meId, sources, readOnly }: Props) {
  const [board, setBoard] = useState<BoardData>({ background: initial.background ?? null, tokens: initial.tokens ?? [] });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [free, setFree] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; moved: boolean } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false; let ch: ReturnType<typeof supabase.channel> | null = null;
    void realtimeReady(supabase).then(() => {
      if (cancelled) return;
      ch = supabase.channel(`scene:${sceneId}:${Math.random().toString(36).slice(2, 8)}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "scenes", filter: `id=eq.${sceneId}` },
          (p) => { const b = (p.new as { board?: Partial<BoardData> }).board; if (b && !drag.current) setBoard({ background: b.background ?? null, tokens: b.tokens ?? [] }); })
        .subscribe();
    });
    return () => { cancelled = true; if (ch) void supabase.removeChannel(ch); };
  }, [sceneId]);

  const commit = (next: Partial<BoardData>, optimistic?: BoardData) => {
    if (optimistic) setBoard(optimistic);
    start(async () => { const r = await updateBoard(campaignId, sceneId, next); if (r.error) setErr(r.error); else if (r.board) setBoard(r.board); });
  };
  const canMove = (t: BoardToken) => !readOnly && (isGm || t.ownerId === meId);

  const onPointerDown = (e: React.PointerEvent, t: BoardToken) => {
    if (!canMove(t)) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: t.id, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
    drag.current.moved = true;
    setBoard((b) => ({ ...b, tokens: b.tokens.map((t) => (t.id === drag.current!.id ? { ...t, x, y } : t)) }));
  };
  const onPointerUp = () => {
    if (!drag.current) return;
    const moved = drag.current.moved; drag.current = null;
    if (moved) commit({ tokens: board.tokens });
  };

  const uploadBg = async (file: File) => {
    setUploading(true); setErr(null);
    try {
      const supabase = createClient();
      const path = `${meId}/bg-${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const { error } = await supabase.storage.from("uploads").upload(path, file, { contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("uploads").getPublicUrl(path);
      commit({ background: data.publicUrl }, { ...board, background: data.publicUrl });
    } catch (e) { setErr(e instanceof Error ? e.message : "업로드 실패"); } finally { setUploading(false); }
  };
  const addToken = (src: TokenSource | { id: string; name: string; img: null; ownerId: null; kind: "free" }) => {
    const t: BoardToken = { id: `t${Date.now().toString(36)}`, name: src.name, img: src.img, x: 20 + Math.random() * 60, y: 30 + Math.random() * 40, size: 9, ownerId: src.ownerId ?? null, refKind: src.kind, refId: src.id };
    const tokens = [...board.tokens, t]; commit({ tokens }, { ...board, tokens });
  };
  const removeToken = (id: string) => { const tokens = board.tokens.filter((t) => t.id !== id); commit({ tokens }, { ...board, tokens }); };
  const resize = (id: string, d: number) => { const tokens = board.tokens.map((t) => (t.id === id ? { ...t, size: Math.max(4, Math.min(30, t.size + d)) } : t)); commit({ tokens }, { ...board, tokens }); };

  return (
    <div className="space-y-2">
      <div ref={box} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
        className="relative w-full select-none overflow-hidden border border-border bg-black/60" style={{ aspectRatio: "16 / 9", touchAction: "none" }}>
        {board.background ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={board.background} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
        ) : <div className="absolute inset-0 flex items-center justify-center text-xs text-muted">{isGm ? "배경 이미지를 올리고 토큰을 추가하세요" : "GM이 장면을 준비하고 있습니다"}</div>}
        {board.tokens.map((t) => (
          <div key={t.id} onPointerDown={(e) => onPointerDown(e, t)}
            className={`group absolute -translate-x-1/2 -translate-y-1/2 ${canMove(t) ? "cursor-grab active:cursor-grabbing" : ""}`}
            style={{ left: `${t.x}%`, top: `${t.y}%`, width: `${t.size}%` }}>
            <div className={`aspect-square w-full overflow-hidden rounded-full border-2 bg-elev shadow ${t.refKind === "enemy" ? "border-danger" : t.ownerId === meId ? "border-gold" : "border-fg/50"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {t.img ? <img src={t.img} alt="" className="h-full w-full object-cover" draggable={false} /> : <div className="flex h-full items-center justify-center text-[10px] font-semibold">{t.name.slice(0, 2)}</div>}
            </div>
            <div className="mt-0.5 truncate text-center text-[10px] text-white drop-shadow">{t.name}</div>
            {isGm && !readOnly ? (
              <div className="absolute -right-1 -top-1 hidden gap-0.5 group-hover:flex">
                <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => resize(t.id, -1)} className="h-4 w-4 rounded-full bg-elev text-[10px] leading-4">−</button>
                <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => resize(t.id, 1)} className="h-4 w-4 rounded-full bg-elev text-[10px] leading-4">+</button>
                <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => removeToken(t.id)} className="h-4 w-4 rounded-full bg-danger text-[10px] leading-4 text-white">×</button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {isGm && !readOnly ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="cursor-pointer border border-border px-2 py-1 hover:bg-fg/5">{uploading ? "업로드 중..." : "배경 이미지"}
            <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadBg(f); e.target.value = ""; }} /></label>
          {board.background ? <button type="button" className="text-muted hover:text-fg" onClick={() => commit({ background: null }, { ...board, background: null })}>배경 제거</button> : null}
          <select className="border border-border bg-elev px-1 py-1" defaultValue="" onChange={(e) => { const s = sources.find((x) => x.id === e.target.value); if (s) addToken(s); e.target.value = ""; }}>
            <option value="">+ 토큰 추가</option>
            <optgroup label="캐릭터">{sources.filter((s) => s.kind === "character").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
            <optgroup label="적 도감">{sources.filter((s) => s.kind === "enemy").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
          </select>
          <span className="flex items-center gap-1">
            <input value={free} onChange={(e) => setFree(e.target.value)} placeholder="자유 토큰 이름" className="w-28 border border-border bg-elev px-1 py-1" />
            <Button variant="ghost" className="px-2 py-1 text-xs" disabled={!free.trim()} onClick={() => { addToken({ id: `f${Date.now()}`, name: free.trim(), img: null, ownerId: null, kind: "free" }); setFree(""); }}>추가</Button>
          </span>
          {pending ? <span className="text-muted">저장 중...</span> : null}
        </div>
      ) : <p className="text-xs text-muted">{readOnly ? "" : "자기 캐릭터 토큰(금색 테두리)은 끌어서 옮길 수 있습니다."}</p>}
      {err ? <p className="text-xs text-danger">{err}</p> : null}
    </div>
  );
}
