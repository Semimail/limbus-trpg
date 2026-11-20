"use client";
/*
 * 그림 초점 맞추기 (참고: 타 팀 VTT 의 "그림 초점 맞추기" 팝업).
 *  그림 한 장(스탠딩 또는 올린 그림)에서 초점(얼굴 등)을 누르거나 끌고 배율을 정하면
 *  정사각 초상(512², portrait_url)과 세로 카드(400×600, data.cardUrl)를 잘라 올린다. 가로 띠(3:1)는 미리보기만.
 *  크롭은 브라우저 canvas 로 한다 (Supabase Storage 공개 파일은 CORS 가 열려 있어 그릴 수 있다).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface FocusValue { src: string; x: number; y: number; zoom: number }
interface Props { src: string | null; initial?: FocusValue | null; onApply: (r: { portraitUrl: string; cardUrl: string; focus: FocusValue }) => void; onClose: () => void; onUploadSource: (file: File) => Promise<string | null> }

const RATIOS: { key: "square" | "banner" | "card"; label: string; w: number; h: number; out: [number, number] | null }[] = [
  { key: "square", label: "초상 (원형·사각)", w: 1, h: 1, out: [512, 512] }, { key: "banner", label: "가로 띠", w: 3, h: 1, out: null }, { key: "card", label: "세로 카드", w: 2, h: 3, out: [400, 600] },
];

/** 초점·배율로 원본에서 잘라낼 사각형 (원본 픽셀). 배율 1 = 짧은 쪽을 꽉 채움 */
function cropRect(iw: number, ih: number, fx: number, fy: number, zoom: number, rw: number, rh: number) {
  const base = Math.min(iw / rw, ih / rh) / zoom;   // 결과 1칸당 원본 픽셀
  const w = base * rw, h = base * rh;
  const x = Math.max(0, Math.min(iw - w, fx * iw - w / 2)), y = Math.max(0, Math.min(ih - h, fy * ih - h / 2));
  return { x, y, w, h };
}

export function FocusCrop({ src: initialSrc, initial, onApply, onClose, onUploadSource }: Props) {
  const [src, setSrc] = useState<string | null>(initial?.src ?? initialSrc);
  const [loaded, setLoaded] = useState<HTMLImageElement | null>(null);
  const img = loaded && src && loaded.src === src ? loaded : null;   // 지금 src 와 맞는 그림만
  const [fx, setFx] = useState(initial?.x ?? 0.5);
  const [fy, setFy] = useState(initial?.y ?? 0.3);
  const [zoom, setZoom] = useState(initial?.zoom ?? 1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dragging = useRef(false);
  useEffect(() => {
    if (!src) return;
    const im = new Image(); im.crossOrigin = "anonymous";
    im.onload = () => setLoaded(im); im.onerror = () => setErr("그림을 불러오지 못했습니다 (다른 사이트 그림은 잘라낼 수 없습니다)");
    im.src = src;
  }, [src]);
  const previews = useMemo(() => {
    if (!img) return null;
    return RATIOS.map((r) => ({ ...r, rect: cropRect(img.naturalWidth, img.naturalHeight, fx, fy, zoom, r.w, r.h) }));
  }, [img, fx, fy, zoom]);
  const pick = (e: React.PointerEvent<HTMLDivElement>) => { const b = e.currentTarget.getBoundingClientRect(); setFx(Math.max(0, Math.min(1, (e.clientX - b.left) / b.width))); setFy(Math.max(0, Math.min(1, (e.clientY - b.top) / b.height))); };
  const apply = async () => {
    if (!img || !src) return; setBusy(true); setErr(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new Error("로그인이 필요합니다");
      const out: Record<string, string> = {};
      for (const r of RATIOS) {
        if (!r.out) continue;
        const c = document.createElement("canvas"); c.width = r.out[0]; c.height = r.out[1];
        const ctx = c.getContext("2d")!; const rc = cropRect(img.naturalWidth, img.naturalHeight, fx, fy, zoom, r.w, r.h);
        ctx.drawImage(img, rc.x, rc.y, rc.w, rc.h, 0, 0, c.width, c.height);
        const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/png"));
        if (!blob) throw new Error("그림을 만들지 못했습니다");
        const path = `${user.id}/${Date.now()}-${r.key}.png`;
        const { error } = await supabase.storage.from("portraits").upload(path, blob, { upsert: true, contentType: "image/png" });
        if (error) throw error;
        out[r.key] = supabase.storage.from("portraits").getPublicUrl(path).data.publicUrl;
      }
      onApply({ portraitUrl: out.square!, cardUrl: out.card!, focus: { src, x: fx, y: fy, zoom } });
    } catch (e) { setErr(e instanceof Error ? e.message : "실패"); } finally { setBusy(false); }
  };
  // 미리보기: 결과 상자 안에 원본을 background 로 놓고 크롭 사각형이 상자를 채우도록 맞춘다
  const previewStyle = (rect: { x: number; y: number; w: number; h: number }, boxW: number, boxH: number): React.CSSProperties => {
    if (!img) return {};
    const scale = boxW / rect.w;
    return { backgroundImage: `url(${src})`, backgroundSize: `${img.naturalWidth * scale}px ${img.naturalHeight * scale}px`, backgroundPosition: `${-rect.x * scale}px ${-rect.y * scale}px`, width: boxW, height: boxH };
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3" onClick={onClose}>
      <div className="w-[min(96vw,52rem)] rounded-lg border border-border bg-bg p-4 text-sm" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center gap-2"><b className="text-base">그림 초점 맞추기</b><span className="text-xs text-muted">그림 한 장으로 초상·카드를 만듭니다. 보여 주고 싶은 곳(얼굴 등)을 누르거나 끌고, 배율을 정하세요.</span><button type="button" className="ml-auto text-muted hover:text-fg" onClick={onClose}>✕</button></div>
        <div className="grid gap-4 md:grid-cols-[1fr_14rem]">
          <div>
            <div className="relative aspect-[4/3] w-full cursor-crosshair select-none overflow-hidden border border-border bg-black/40" onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); pick(e); }} onPointerMove={(e) => { if (dragging.current) pick(e); }} onPointerUp={() => { dragging.current = false; }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {src ? <img src={src} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-contain" draggable={false} /> : <div className="flex h-full items-center justify-center text-muted">먼저 그림을 올리세요</div>}
              {src && img ? (() => {
                // object-contain 으로 놓인 그림의 실제 영역 위에 초점 표시
                return <Marker img={img} fx={fx} fy={fy} zoom={zoom} />;
              })() : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <label className="flex items-center gap-2">확대 {zoom.toFixed(2)}배<input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-40" /></label>
              <button type="button" className="rounded-md border border-border px-2 py-1 hover:bg-fg/5" onClick={() => { setFx(0.5); setFy(0.3); setZoom(1); }}>기본값 (가운데 위)</button>
              <label className="cursor-pointer rounded-md border border-border px-2 py-1 hover:bg-fg/5">{busy ? "…" : "다른 그림 올리기"}<input type="file" accept="image/*" className="hidden" disabled={busy} onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; setBusy(true); const u = await onUploadSource(f); setBusy(false); if (u) setSrc(u); }} /></label>
            </div>
          </div>
          <div className="space-y-2">
            {previews ? previews.map((r) => (
              <div key={r.key}>
                <div className="text-[11px] text-muted">{r.label}{r.out ? "" : " (미리보기만)"}</div>
                <div className={`overflow-hidden border border-gold/60 bg-black/40 ${r.key === "square" ? "rounded-full" : ""}`} style={previewStyle(r.rect, r.key === "banner" ? 200 : r.key === "card" ? 100 : 96, r.key === "banner" ? 66 : r.key === "card" ? 150 : 96)} />
              </div>
            )) : <div className="text-xs text-muted">그림을 올리면 미리보기가 나옵니다.</div>}
          </div>
        </div>
        {err ? <p className="mt-2 text-xs text-danger">{err}</p> : null}
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className="rounded-md border border-border px-3 py-1.5 hover:bg-fg/5" onClick={onClose}>닫기</button>
          <button type="button" className="rounded-md bg-accent px-3 py-1.5 font-medium text-accent-fg disabled:opacity-50" disabled={!img || busy} onClick={() => void apply()}>{busy ? "만드는 중…" : "초상·카드 만들기"}</button>
        </div>
      </div>
    </div>
  );
}

/** 초점 표시: object-contain 그림의 실제 위치를 계산해 초점 점과 정사각 크롭 테두리를 그린다 */
function Marker({ img, fx, fy, zoom }: { img: HTMLImageElement; fx: number; fy: number; zoom: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => { const el = ref.current?.parentElement; if (!el) return; const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el); setBox({ w: el.clientWidth, h: el.clientHeight }); return () => ro.disconnect(); }, []);
  const s = Math.min(box.w / img.naturalWidth, box.h / img.naturalHeight);
  const dw = img.naturalWidth * s, dh = img.naturalHeight * s, ox = (box.w - dw) / 2, oy = (box.h - dh) / 2;
  const rc = cropRect(img.naturalWidth, img.naturalHeight, fx, fy, zoom, 1, 1);
  return (
    <div ref={ref} className="pointer-events-none absolute inset-0">
      <div className="absolute border-2 border-gold/80" style={{ left: ox + rc.x * s, top: oy + rc.y * s, width: rc.w * s, height: rc.h * s, boxShadow: "0 0 0 9999px rgba(0,0,0,.45)" }} />
      <div className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent" style={{ left: ox + fx * dw, top: oy + fy * dh }} />
    </div>
  );
}
