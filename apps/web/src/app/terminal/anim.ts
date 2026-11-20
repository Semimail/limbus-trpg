// 검지 단말기 연출: 삐빗 → 글자 수만큼 무작위 문자 → 왼쪽부터 고정 → 커서 깜빡 → 페이드.
// 미리보기(캔버스)와 GIF 인코딩이 같은 프레임 목록을 쓴다.

export type TerminalOptions = {
  text: string;          // 줄바꿈 허용
  cursor: boolean;       // 마지막 줄 끝에 "_" 커서 한 칸 (슬롯에 포함)
  color: string;         // #rrggbb
  transparent: boolean;  // 배경 투명 (아니면 검정)
  scale: number;         // 정수 배율 (기본 글자 16px)
  scrambleFrames: number;
  holdBlinks: number;    // 완성 후 커서 깜빡 횟수(프레임 수, 260ms씩)
  charset: "ascii" | "mixed";
  scanlines: boolean;
};

export type Frame = { rows: string[][]; bright: number; dy: number; ms: number };

export const DEFAULTS: TerminalOptions = {
  text: "clear.",
  cursor: true,
  color: "#66b3ff",
  transparent: true,
  scale: 3,
  scrambleFrames: 16,
  holdBlinks: 10,
  charset: "ascii",
  scanlines: true,
};

const ASCII = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#%&*+=<>/\\|?!@$^~";

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function slotsOf(o: TerminalOptions): string[][] {
  const lines = o.text.replace(/\r/g, "").split("\n");
  const slots = lines.map((l) => Array.from(l));
  if (o.cursor) slots[slots.length - 1].push("_");
  return slots;
}

export function buildFrames(o: TerminalOptions, seed = 7): Frame[] {
  const rand = rng(seed);
  const slots = slotsOf(o);
  const randChar = () => {
    if (o.charset === "mixed" && rand() < 0.5) return String.fromCharCode(0xac00 + Math.floor(rand() * 11172));
    return ASCII[Math.floor(rand() * ASCII.length)];
  };
  const blank = slots.map((s) => s.map(() => " "));
  const scrambled = (fixed: number[]) =>
    slots.map((s, li) => s.map((c, j) => (j < fixed[li] || c === " " ? c : randChar())));
  const final = (cur: boolean) => {
    const r = slots.map((s) => [...s]);
    if (o.cursor && !cur) r[r.length - 1][r[r.length - 1].length - 1] = " ";
    return r;
  };
  const frames: Frame[] = [];
  const add = (rows: string[][], ms: number, bright = 1, dy = 0) => frames.push({ rows, bright, dy, ms });

  add(blank, 300);
  for (let i = 0; i < 2; i++) {               // 삐빗: 블록 커서 두 번
    const b = blank.map((r) => [...r]); b[0][0] = "█";
    add(b, 90); add(blank, 110);
  }
  const zero = slots.map(() => 0);
  for (let i = 0; i < o.scrambleFrames; i++) {
    const dy = rand() < 0.4 ? (rand() < 0.5 ? -1 : 1) : 0;
    add(scrambled(zero), 60, 0.75 + rand() * 0.25, dy);
  }
  for (let li = 0; li < slots.length; li++) {
    for (let k = 1; k <= slots[li].length; k++) {
      const fixed = slots.map((s, i) => (i < li ? s.length : i === li ? k : 0));
      add(scrambled(fixed), 65); add(scrambled(fixed), 65);
    }
  }
  for (let i = 0; i < o.holdBlinks; i++) add(final(i % 2 === 0), 260);
  add(final(false), 160, 0.55); add(final(false), 160, 0.25); add(blank, 500);
  return frames;
}

const BASE_PX = 16;
const LINE_H = 24;
const PAD = 8;
export const LEVELS = 8;

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0x66b3ff;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 팔레트: 0 투명/검정, 1..LEVELS 밝기 단계, LEVELS+1..2*LEVELS 주사선(72%) 단계 */
export function makePalette(color: string): number[][] {
  const [r, g, b] = hexToRgb(color);
  const pal: number[][] = [[0, 0, 0]];
  for (let i = 1; i <= LEVELS; i++) pal.push([r, g, b].map((c) => Math.round((c * i) / LEVELS)));
  for (let i = 1; i <= LEVELS; i++) pal.push([r, g, b].map((c) => Math.round((c * i * 0.72) / LEVELS)));
  while (pal.length < 256) pal.push([0, 0, 0]);
  return pal;
}

export class Rasterizer {
  readonly baseW: number;
  readonly baseH: number;
  readonly width: number;
  readonly height: number;
  private ctx: CanvasRenderingContext2D;
  constructor(private o: TerminalOptions, slots: string[][]) {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.font = `${BASE_PX}px DungGeunMo`;
    const w = Math.max(...slots.map((s) => ctx.measureText(s.join("")).width), 1);
    this.baseW = Math.ceil(w) + PAD * 2;
    this.baseH = LINE_H * slots.length + PAD * 2;
    c.width = this.baseW; c.height = this.baseH;
    this.ctx = ctx;
    this.width = this.baseW * o.scale;
    this.height = this.baseH * o.scale;
  }
  /** 프레임 → 팔레트 인덱스 배열 (width×height) */
  indices(f: Frame): Uint8Array {
    const { ctx, baseW, baseH, o } = this;
    ctx.clearRect(0, 0, baseW, baseH);
    ctx.font = `${BASE_PX}px DungGeunMo`;
    ctx.textBaseline = "top";
    ctx.fillStyle = "#fff";
    f.rows.forEach((r, li) => {
      const t = r.join("");
      const w = ctx.measureText(t).width;
      ctx.fillText(t, Math.round((baseW - w) / 2), PAD + li * LINE_H + 2 + f.dy);
    });
    const src = ctx.getImageData(0, 0, baseW, baseH).data;
    const S = o.scale;
    const lv = Math.max(1, Math.round(f.bright * LEVELS));
    const out = new Uint8Array(this.width * this.height);
    for (let y = 0; y < baseH; y++) {
      for (let x = 0; x < baseW; x++) {
        if (src[(y * baseW + x) * 4 + 3] < 100) continue;
        for (let sy = 0; sy < S; sy++) {
          const row = (y * S + sy) * this.width;
          const v = o.scanlines && S >= 3 && sy === S - 1 ? LEVELS + lv : lv;
          for (let sx = 0; sx < S; sx++) out[row + x * S + sx] = v;
        }
      }
    }
    return out;
  }
}

/** 인덱스 배열 → RGBA (미리보기용) */
export function toRGBA(idx: Uint8Array, pal: number[][], transparent: boolean): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(new ArrayBuffer(idx.length * 4));
  for (let i = 0; i < idx.length; i++) {
    const p = pal[idx[i]];
    out[i * 4] = p[0]; out[i * 4 + 1] = p[1]; out[i * 4 + 2] = p[2];
    out[i * 4 + 3] = idx[i] === 0 && transparent ? 0 : 255;
  }
  return out;
}
