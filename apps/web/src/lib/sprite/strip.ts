/**
 * 프레임 띠(스프라이트 시트) 규격. 서버(생성 요청 크기)와 브라우저(자르기)가 같은 값을 쓴다.
 * 칸 너비 512, 띠 가로세로비는 모델 한계(3:1) 안에 들게 높이를 올린다.
 */

export const FRAME_W = 512;

export function stripSize(frames: number): { w: number; h: number } {
  const w = FRAME_W * frames;
  const minH = Math.ceil(w / 3 / 16) * 16;
  return { w, h: Math.max(768, minH) };
}

export interface StripSpec { frames: number; fps: number; loop: boolean }
/** 스킬 띠 규격: 공격은 6칸, 방어 스킬은 종류별 */
export function skillStripSpec(skill: { kind: "attack" | "defense"; defenseKind?: "guard" | "evade" | "counter" }): StripSpec {
  if (skill.kind === "attack") return { frames: 6, fps: 10, loop: false };
  if (skill.defenseKind === "evade") return { frames: 4, fps: 9, loop: false };
  if (skill.defenseKind === "counter") return { frames: 6, fps: 9, loop: false };
  return { frames: 4, fps: 6, loop: false };
}
/** 저장된 띠의 재생 속도. 컬럼 없이 키와 칸 수에서 정한다 (스킬 띠: 6칸 10fps, 그 외 7fps) */
export function fpsFor(key: string, frames: number): number {
  const base = (STRIP_SPECS as Record<string, StripSpec | undefined>)[key];
  if (base) return base.fps;
  return frames >= 6 ? 10 : 7;
}
export const isSkillKey = (k: string): boolean => k.startsWith("skill:");

/** 기본 모션별 칸 수와 재생 속도. idle 은 루프 */
export const STRIP_SPECS: Record<"idle" | "attack" | "hit" | "evade" | "down" | "win", StripSpec> = {
  idle: { frames: 4, fps: 3, loop: true },
  attack: { frames: 6, fps: 10, loop: false },
  hit: { frames: 4, fps: 8, loop: false },
  evade: { frames: 4, fps: 9, loop: false },
  down: { frames: 5, fps: 6, loop: false },
  win: { frames: 4, fps: 5, loop: false },
};
