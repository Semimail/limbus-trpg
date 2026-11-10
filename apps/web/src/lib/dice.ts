/** 채팅 주사위 명령 파서. 예: 2d6+3, d20, 3d8-1 */
export interface DiceResult { expr: string; rolls: number[]; sides: number; count: number; mod: number; total: number }

export function parseDice(expr: string): { count: number; sides: number; mod: number } | null {
  const m = expr.trim().toLowerCase().match(/^(\d*)d(\d+)\s*([+-]\s*\d+)?$/);
  if (!m) return null;
  const count = m[1] ? Number(m[1]) : 1;
  const sides = Number(m[2]);
  const mod = m[3] ? Number(m[3].replace(/\s/g, "")) : 0;
  if (count < 1 || count > 100 || sides < 2 || sides > 1000) return null;
  return { count, sides, mod };
}

export function rollDice(expr: string, rand: () => number = Math.random): DiceResult | null {
  const p = parseDice(expr);
  if (!p) return null;
  const rolls = Array.from({ length: p.count }, () => 1 + Math.floor(rand() * p.sides));
  return { expr: expr.trim(), rolls, ...p, total: rolls.reduce((a, b) => a + b, 0) + p.mod };
}
