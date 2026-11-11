/** 격자 유틸. 거리는 체비셰프(대각선도 1칸). */
export interface Pos { x: number; y: number }

export const dist = (a: Pos, b: Pos) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const samePos = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;
export const inBounds = (p: Pos, cols: number, rows: number) => p.x >= 0 && p.y >= 0 && p.x < cols && p.y < rows;

const DIRS: Pos[] = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]].map(([x, y]) => ({ x: x!, y: y! }));

/**
 * 이동 가능한 칸: BFS. 아군 칸은 통과 가능(멈출 수 없음), 적 칸과 장애물은 통과 불가.
 * 반환: 칸 키 "x,y" → 비용(이동 칸 수)
 */
export function reachable(from: Pos, move: number, cols: number, rows: number, passable: (p: Pos) => "free" | "pass" | "block"): Map<string, number> {
  const key = (p: Pos) => `${p.x},${p.y}`;
  const out = new Map<string, number>();
  const q: { p: Pos; c: number }[] = [{ p: from, c: 0 }];
  const seen = new Set<string>([key(from)]);
  while (q.length) {
    const { p, c } = q.shift()!;
    if (c >= move) continue;
    for (const d of DIRS) {
      const n = { x: p.x + d.x, y: p.y + d.y };
      if (!inBounds(n, cols, rows)) continue;
      const k = key(n);
      if (seen.has(k)) continue;
      const kind = passable(n);
      if (kind === "block") continue;
      seen.add(k);
      if (kind === "free") out.set(k, c + 1);
      q.push({ p: n, c: c + 1 });
    }
  }
  return out;
}

/** 목표에 가까워지는 다음 칸 (탐욕). 갈 수 없으면 null */
export function stepToward(from: Pos, to: Pos, cols: number, rows: number, passable: (p: Pos) => "free" | "pass" | "block"): Pos | null {
  let best: Pos | null = null; let bestD = dist(from, to);
  for (const d of DIRS) {
    const n = { x: from.x + d.x, y: from.y + d.y };
    if (!inBounds(n, cols, rows) || passable(n) !== "free") continue;
    const nd = dist(n, to);
    if (nd < bestD) { bestD = nd; best = n; }
  }
  return best;
}
