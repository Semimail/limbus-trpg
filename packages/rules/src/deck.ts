import type { Rng } from "./rng";
import type { Skill } from "./types";

/**
 * 스킬 덱. 원작처럼 공격 스킬을 tier 비율(3:2:1)대로 섞어 뽑는다.
 * 방어 스킬은 덱에 넣지 않고 항상 사용 가능하다.
 */
export interface Deck {
  draw: Skill[];
  discard: Skill[];
}

export function buildDeck(skills: Skill[], rng: Rng): Deck {
  const cards: Skill[] = [];
  for (const s of skills) {
    if (s.kind !== "attack") continue;
    const n = s.tier === 1 ? 3 : s.tier === 2 ? 2 : 1;
    for (let i = 0; i < n; i++) cards.push(s);
  }
  return { draw: shuffle(cards, rng), discard: [] };
}

export function drawSkills(deck: Deck, n: number, rng: Rng): Skill[] {
  const out: Skill[] = [];
  for (let i = 0; i < n; i++) {
    if (deck.draw.length === 0) {
      deck.draw = shuffle(deck.discard, rng);
      deck.discard = [];
      if (deck.draw.length === 0) break;
    }
    out.push(deck.draw.pop()!);
  }
  return out;
}

export function discardSkill(deck: Deck, s: Skill) { deck.discard.push(s); }

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
