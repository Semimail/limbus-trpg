/** 스프라이트 코드 모션 이름 (서버·클라이언트 공용 타입) */
export type SpriteMotion = "idle" | "ready" | "attack" | "evade" | "hit" | "down" | "win";
export const SPRITE_MOTIONS: { id: SpriteMotion; label: string }[] = [
  { id: "idle", label: "대기" }, { id: "ready", label: "준비" }, { id: "attack", label: "공격" }, { id: "evade", label: "회피" }, { id: "hit", label: "피격" }, { id: "down", label: "전투불능" }, { id: "win", label: "승리" },
];
