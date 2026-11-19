"use client";
/**
 * 브라우저에서 프레임 띠를 N칸으로 자르고, 칸마다 알파 경계 상자를 재서 발밑 가운데 기준으로 정렬한 뒤
 * 같은 크기의 PNG Blob 목록으로 돌려준다. (모델이 칸 안에서 인물을 조금씩 다르게 놓아도 흔들리지 않게)
 */

export interface SlicedFrames { blobs: Blob[]; width: number; height: number }

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("띠 이미지를 불러오지 못했습니다 (CORS?)"));
    img.src = url;
  });
}

function bbox(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number): { x: number; y: number; w: number; h: number } | null {
  const d = ctx.getImageData(x0, y0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3]! > 12) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  return maxX < 0 ? null : { x: x0 + minX, y: y0 + minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export async function sliceStrip(url: string, frames: number): Promise<SlicedFrames> {
  const img = await loadImage(url);
  const cw = Math.floor(img.naturalWidth / frames), ch = img.naturalHeight;
  const src = document.createElement("canvas"); src.width = img.naturalWidth; src.height = ch;
  const sctx = src.getContext("2d", { willReadFrequently: true }); if (!sctx) throw new Error("canvas 사용 불가");
  sctx.drawImage(img, 0, 0);
  const boxes = Array.from({ length: frames }, (_, i) => bbox(sctx, i * cw, 0, cw, ch));
  if (boxes.some((b) => !b)) throw new Error("빈 칸이 있어 자를 수 없습니다 (띠를 다시 생성하세요)");
  const bs = boxes as { x: number; y: number; w: number; h: number }[];
  const pad = 8;
  const W = Math.min(cw, Math.max(...bs.map((b) => b.w)) + pad * 2), H = Math.min(ch, Math.max(...bs.map((b) => b.h)) + pad);
  const blobs: Blob[] = [];
  for (const b of bs) {
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const ctx = c.getContext("2d")!;
    // 발밑 가운데 정렬: 경계 상자의 아래 가운데를 출력 캔버스의 아래 가운데에
    const dx = Math.round(W / 2 - b.w / 2), dy = H - b.h;
    ctx.drawImage(src, b.x, b.y, b.w, b.h, dx, dy, b.w, b.h);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/png"));
    if (!blob) throw new Error("PNG 변환 실패");
    blobs.push(blob);
  }
  return { blobs, width: W, height: H };
}
