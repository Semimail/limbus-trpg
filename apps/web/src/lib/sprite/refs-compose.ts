"use client";
/**
 * 브라우저에서 원작 자세 스프라이트 묶음을 참고 띠 한 장으로 합친다.
 *  - 같은 프레임의 레이어(`이름__2`)는 발밑 가운데 기준으로 겹친다.
 *  - 프레임이 많으면 역할의 최대 칸 수에 맞춰 고르게 뽑는다.
 *  - 칸은 512×512, 모든 칸이 같은 배율(가장 큰 프레임이 칸에 들어가게), 발밑을 같은 선에 맞춘다.
 */
import { classifyRefFile, isSkippedRefFile, refSetNameOf, REF_ROLES, type RefRole } from "./refs";

export interface RefDraftRole { role: RefRole; frames: File[][] }   // frames[i] = 그 프레임의 레이어 파일들
export interface RefSetDraft { name: string; roles: RefDraftRole[]; skipped: number }

const PANEL = 512, PAD = 24;
export const LOOSE_SET = "새 세트";

/** 올린 파일들을 세트 → 역할 → 프레임(레이어) 으로 묶는다 */
export function groupRefFiles(files: File[]): RefSetDraft[] {
  const sets = new Map<string, { roles: Map<RefRole, Map<number, File[]>>; skipped: number }>();
  for (const f of files) {
    if (!f.type.startsWith("image/")) continue;
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || "";
    // 폴더면 폴더 이름. 파일만 골랐으면 자세 이름(idle/dmg/skill1_N…)인 것은 한 세트("새 세트", 저장 전에 이름을 고친다)로, 그 외(sd-render 렌더)는 파일마다 한 세트
    const name = rel ? refSetNameOf(rel, f.name) : classifyRefFile(f.name) || isSkippedRefFile(f.name) ? LOOSE_SET : refSetNameOf("", f.name);
    const set = sets.get(name) ?? { roles: new Map(), skipped: 0 };
    sets.set(name, set);
    // 폴더로 올렸으면 이름 규칙에 맞는 것만, 파일을 직접 골라 올렸으면 모르는 이름(sd-render 렌더 등)도 대기(스타일)로 본다
    const info = classifyRefFile(f.name) ?? (!rel && !isSkippedRefFile(f.name) ? { role: "idle" as RefRole, frame: 0, layer: 0 } : null);
    if (!info) { set.skipped++; continue; }
    const frames = set.roles.get(info.role) ?? new Map<number, File[]>();
    set.roles.set(info.role, frames);
    const layers = frames.get(info.frame) ?? [];
    layers.push(f); layers.sort((a: File, b: File) => a.name.localeCompare(b.name));
    frames.set(info.frame, layers);
  }
  return Array.from(sets.entries()).map(([name, s]) => ({
    name, skipped: s.skipped,
    roles: REF_ROLES.filter((r) => s.roles.has(r.id)).map((r) => ({ role: r.id, frames: Array.from(s.roles.get(r.id)!.entries()).sort((a: [number, File[]], b: [number, File[]]) => a[0] - b[0]).map(([, layers]) => layers) })),
  })).filter((s) => s.roles.length > 0);
}

function loadFile(f: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${f.name}: 이미지를 읽지 못했습니다`)); };
    img.src = url;
  });
}
function bbox(c: HTMLCanvasElement): { x: number; y: number; w: number; h: number } | null {
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const { width: w, height: h } = c;
  const d = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3]! > 12) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
/** 고르게 n개 뽑기 (첫·끝 포함) */
export function sampleEvenly<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr;
  if (n <= 1) return [arr[0]!];
  return Array.from({ length: n }, (_, i) => arr[Math.round((i * (arr.length - 1)) / (n - 1))]!);
}

/** 한 역할의 프레임들을 띠 PNG 로. 반환 frames 는 실제 칸 수 */
export async function composeRefStrip(role: RefRole, frames: File[][]): Promise<{ blob: Blob; frames: number }> {
  const max = REF_ROLES.find((r) => r.id === role)?.maxFrames ?? 1;
  const picked = sampleEvenly(frames, max);
  // 프레임마다 레이어를 겹친 캔버스 → 경계 상자
  const comps: { c: HTMLCanvasElement; b: { x: number; y: number; w: number; h: number } }[] = [];
  for (const layers of picked) {
    const imgs = await Promise.all(layers.map(loadFile));
    const W = Math.max(...imgs.map((i) => i.naturalWidth)), H = Math.max(...imgs.map((i) => i.naturalHeight));
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const ctx = c.getContext("2d")!;
    for (const img of imgs) ctx.drawImage(img, Math.round((W - img.naturalWidth) / 2), H - img.naturalHeight);   // 발밑 가운데 기준으로 겹침
    const b = bbox(c);
    if (b) comps.push({ c, b });
  }
  if (!comps.length) throw new Error("비어 있는 이미지만 있습니다");
  const inner = PANEL - PAD * 2;
  const scale = Math.min(1, inner / Math.max(...comps.map((x) => x.b.w)), inner / Math.max(...comps.map((x) => x.b.h)));
  const out = document.createElement("canvas"); out.width = PANEL * comps.length; out.height = PANEL;
  const octx = out.getContext("2d")!;
  octx.imageSmoothingQuality = "high";
  comps.forEach(({ c, b }, i) => {
    const w = b.w * scale, h = b.h * scale;
    octx.drawImage(c, b.x, b.y, b.w, b.h, i * PANEL + (PANEL - w) / 2, PANEL - PAD - h, w, h);
  });
  const blob = await new Promise<Blob | null>((r) => out.toBlob(r, "image/png"));
  if (!blob) throw new Error("PNG 변환 실패");
  return { blob, frames: comps.length };
}
