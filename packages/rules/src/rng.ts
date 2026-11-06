/**
 * 시드 기반 난수 생성기 (mulberry32).
 * 세션 로그 재생을 위해 모든 굴림은 이 RNG를 통해서만 이뤄진다.
 * 상태(state)를 로그에 남기면 같은 결과를 그대로 재현할 수 있다.
 */
export interface Rng {
  /** [0, 1) 범위의 실수 */
  next(): number;
  /** [min, max] 범위의 정수 (양 끝 포함) */
  int(min: number, max: number): number;
  /** 현재 내부 상태 (재생용) */
  state(): number;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min, max) {
      if (max < min) [min, max] = [max, min];
      return min + Math.floor(next() * (max - min + 1));
    },
    state: () => a,
  };
}

/** 문자열(세션 ID 등)을 시드 숫자로 바꾼다. */
export function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
