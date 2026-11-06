import type { Rng } from "./rng";
import type { Combatant } from "./types";

export interface SpeedSlot {
  combatantId: string;
  slot: number;   // 0 또는 1 (다이스 번호)
  speed: number;
}

/**
 * 라운드 시작 시 모든 생존 참가자의 속도 다이스를 굴리고 내림차순으로 정렬한다.
 * 흐트러짐/전투불능 상태는 슬롯을 받지 않는다. 동속은 RNG로 순서를 가른다.
 */
export function rollSpeed(combatants: Combatant[], rng: Rng): SpeedSlot[] {
  const slots: SpeedSlot[] = [];
  for (const c of combatants) {
    if (c.incapacitated || c.staggered) continue;
    for (let s = 0; s < c.speed.dice; s++) {
      slots.push({ combatantId: c.id, slot: s, speed: rng.int(c.speed.min, c.speed.max) });
    }
  }
  // 동속 처리를 결정적으로 하기 위해 먼저 RNG로 가중치를 부여
  const tie = new Map<SpeedSlot, number>();
  for (const s of slots) tie.set(s, rng.next());
  return slots.sort((x, y) => (y.speed - x.speed) || (tie.get(y)! - tie.get(x)!));
}
