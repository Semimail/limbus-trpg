"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GIFEncoder } from "gifenc";
import { DEFAULTS, Rasterizer, buildFrames, makePalette, slotsOf, toRGBA, type TerminalOptions } from "./anim";

const PRESETS: { label: string; text: string }[] = [
  { label: "clear.", text: "clear." },
  { label: "해금 대기", text: "-- 해금 1단계 수신 대기 중 --\n> 터치하여 수신 시작" },
  { label: "지령 수행", text: "지령을 수행하라." },
  { label: "접속", text: "> 검지 단말기 접속 중\n> 인증 완료" },
];

export function TerminalClient() {
  const [o, setO] = useState<TerminalOptions>(DEFAULTS);
  const [fontReady, setFontReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const set = <K extends keyof TerminalOptions>(k: K, v: TerminalOptions[K]) => setO((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    document.fonts.load("16px DungGeunMo").then(() => setFontReady(true));
  }, []);

  const frames = useMemo(() => buildFrames(o), [o]);
  const slots = useMemo(() => slotsOf(o), [o]);
  const slotCount = slots.reduce((a, s) => a + s.length, 0);
  const totalMs = frames.reduce((a, f) => a + f.ms, 0);

  // 미리보기: 같은 프레임 목록을 캔버스에 재생
  useEffect(() => {
    if (!fontReady || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ras = new Rasterizer(o, slots);
    canvas.width = ras.width; canvas.height = ras.height;
    const ctx = canvas.getContext("2d")!;
    const pal = makePalette(o.color);
    const imgs = frames.map((f) => new ImageData(toRGBA(ras.indices(f), pal, o.transparent), ras.width, ras.height));
    let i = 0, timer = 0, alive = true;
    const tick = () => {
      if (!alive) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.putImageData(imgs[i], 0, 0);
      timer = window.setTimeout(() => { i = (i + 1) % imgs.length; tick(); }, frames[i].ms);
    };
    tick();
    return () => { alive = false; window.clearTimeout(timer); };
  }, [fontReady, frames, slots, o]);

  const download = useCallback(async () => {
    if (!fontReady) return;
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 0));
      const ras = new Rasterizer(o, slots);
      const pal = makePalette(o.color);
      const gif = GIFEncoder();
      frames.forEach((f, i) => {
        gif.writeFrame(ras.indices(f), ras.width, ras.height, {
          palette: i === 0 ? pal : undefined,
          delay: f.ms,
          transparent: o.transparent,
          transparentIndex: 0,
          dispose: 2,
          repeat: 0,
        });
      });
      gif.finish();
      const bytes = gif.bytes();
      const blob = new Blob([bytes as BlobPart], { type: "image/gif" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const name = o.text.split("\n")[0].replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "terminal";
      a.href = url; a.download = `index-${name}.gif`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setInfo(`${ras.width}×${ras.height}, ${frames.length}프레임, ${(bytes.length / 1024).toFixed(0)}KB`);
    } finally {
      setBusy(false);
    }
  }, [fontReady, frames, o, slots]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">검지 단말기 지령 생성기</h1>
      <p className="mt-1 text-sm text-muted">
        둥근모꼴 픽셀 글자로 삐빗 → 무작위 문자 → 지령 고정 연출을 만들어 GIF로 내려받습니다. 무작위 문자는 입력한 글자 수(커서 포함)만큼만 흔들립니다.
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_280px]">
        <section>
          <div
            className="flex min-h-48 items-center justify-center overflow-auto rounded border border-border p-4"
            style={{
              background: o.transparent
                ? "repeating-conic-gradient(#2a2a2a 0% 25%, #1a1a1a 0% 50%) 0 0 / 16px 16px"
                : "#000",
            }}
          >
            {fontReady ? (
              <canvas ref={canvasRef} style={{ imageRendering: "pixelated", maxWidth: "100%" }} />
            ) : (
              <span className="text-sm text-muted">폰트 불러오는 중…</span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
            <span>슬롯 {slotCount}칸 · {frames.length}프레임 · 약 {(totalMs / 1000).toFixed(1)}초 루프</span>
            {info && <span>마지막 저장: {info}</span>}
          </div>

          <label className="mt-4 block text-sm">
            지령 문구 (줄바꿈 가능)
            <textarea
              value={o.text}
              onChange={(e) => set("text", e.target.value)}
              rows={3}
              spellCheck={false}
              className="mt-1 w-full rounded border border-border bg-elev px-3 py-2 font-mono text-base"
            />
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button key={p.label} type="button" onClick={() => set("text", p.text)}
                className="rounded border border-border px-2 py-1 text-xs text-muted hover:border-gold hover:text-fg">
                {p.label}
              </button>
            ))}
          </div>
        </section>

        <aside className="space-y-3 text-sm">
          <label className="flex items-center justify-between gap-2">
            <span>글자 색</span>
            <span className="flex items-center gap-2">
              <input type="color" value={o.color} onChange={(e) => set("color", e.target.value)} />
              <input value={o.color} onChange={(e) => set("color", e.target.value)}
                className="w-24 rounded border border-border bg-elev px-2 py-1 font-mono text-xs" />
            </span>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>배경</span>
            <select value={o.transparent ? "t" : "b"} onChange={(e) => set("transparent", e.target.value === "t")}
              className="rounded border border-border bg-elev px-2 py-1">
              <option value="t">투명</option>
              <option value="b">검정</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>배율 (글자 {16 * o.scale}px)</span>
            <select value={o.scale} onChange={(e) => set("scale", Number(e.target.value))}
              className="rounded border border-border bg-elev px-2 py-1">
              {[1, 2, 3, 4, 5].map((s) => <option key={s} value={s}>×{s}</option>)}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>끝에 커서 _</span>
            <input type="checkbox" checked={o.cursor} onChange={(e) => set("cursor", e.target.checked)} />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>주사선 느낌</span>
            <input type="checkbox" checked={o.scanlines} onChange={(e) => set("scanlines", e.target.checked)} />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>무작위 문자</span>
            <select value={o.charset} onChange={(e) => set("charset", e.target.value as TerminalOptions["charset"])}
              className="rounded border border-border bg-elev px-2 py-1">
              <option value="ascii">영문·기호</option>
              <option value="mixed">영문·기호·한글</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>흔들림 길이 ({(o.scrambleFrames * 0.06).toFixed(1)}초)</span>
            <input type="range" min={4} max={40} value={o.scrambleFrames}
              onChange={(e) => set("scrambleFrames", Number(e.target.value))} />
          </label>
          <label className="flex items-center justify-between gap-2">
            <span>완성 후 유지 ({(o.holdBlinks * 0.26).toFixed(1)}초)</span>
            <input type="range" min={2} max={30} step={2} value={o.holdBlinks}
              onChange={(e) => set("holdBlinks", Number(e.target.value))} />
          </label>
          <button type="button" onClick={download} disabled={!fontReady || busy}
            className="mt-2 w-full rounded bg-accent px-3 py-2 font-semibold text-accent-fg disabled:opacity-50">
            {busy ? "만드는 중…" : "GIF 다운로드"}
          </button>
          <button type="button" onClick={() => setO(DEFAULTS)}
            className="w-full rounded border border-border px-3 py-1.5 text-muted hover:text-fg">
            기본값으로
          </button>
        </aside>
      </div>
    </main>
  );
}
