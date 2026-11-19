/**
 * 프레임 띠(스프라이트 시트) 규격. 서버(생성 요청 크기)와 브라우저(자르기)가 같은 값을 쓴다.
 * 칸 너비 512, 띠 가로세로비는 모델 한계(3:1) 안에 들게 높이를 올린다.
 */
import type { SpriteAnimKey } from "@limbus/rules";

export const FRAME_W = 512;

export function stripSize(frames: number): { w: number; h: number } {
  const w = FRAME_W * frames;
  const minH = Math.ceil(w / 3 / 16) * 16;
  return { w, h: Math.max(768, minH) };
}

/** 모션별 칸 수와 재생 속도. idle 은 루프 */
export const STRIP_SPECS: Record<SpriteAnimKey, { frames: number; fps: number; loop: boolean }> = {
  idle: { frames: 4, fps: 3, loop: true },
  attack: { frames: 6, fps: 10, loop: false },
  hit: { frames: 4, fps: 8, loop: false },
  evade: { frames: 4, fps: 9, loop: false },
  down: { frames: 5, fps: 6, loop: false },
  win: { frames: 4, fps: 5, loop: false },
};
