/**
 * SD 스프라이트 프롬프트. 스타일 문장은 여기 한 곳에서만 관리한다.
 * 원작 이미지를 참고 이미지로 보내지 않고, 스타일은 글로만 지정한다.
 */
import type { SpritePose } from "@limbus/rules";

export const SPRITE_STYLE = [
  "Full-body chibi (super-deformed) battle sprite of a single character, about 2.5 heads tall with a large head and small body.",
  "Style: dark urban-gothic game sprite in the manner of Limbus Company by Project Moon — thick dark ink outlines, flat cel shading with one shadow tone, muted desaturated palette with small accents, slightly gritty textures, serious expression.",
  "Framing: the whole character centered and filling most of the frame, nothing cropped, no ground shadow, no floor, no background elements, no text, no watermark, no border.",
  "Background: fully transparent (alpha), not white.",
].join(" ");

const IDLE_POSE = "Pose: relaxed idle battle stance, body in three-quarter view facing to the right of the image, both feet planted and fully visible, arms and weapon (if any) resting naturally.";

export interface PromptInput {
  /** 캐릭터/NPC 이름 */
  label?: string;
  /** 무기·복장·특징 메모 */
  notes?: string;
  /** 참고 이미지가 있는지 (있으면 '이 인물을 그대로' 지시) */
  hasSource: boolean;
}

export function buildSpritePrompt({ label, notes, hasSource }: PromptInput): string {
  const parts: string[] = [];
  if (hasSource) parts.push("Redraw the character shown in the reference image as a game sprite. Keep the same person: identical hairstyle, hair and eye color, clothing, accessories, weapon and color scheme. Do not add or remove items.");
  else parts.push("Design an original character for a dark city setting.");
  if (label?.trim()) parts.push(`Character name: ${label.trim()}.`);
  if (notes?.trim()) parts.push(`Details: ${notes.trim()}.`);
  parts.push(IDLE_POSE, SPRITE_STYLE);
  return parts.join(" ");
}

/** 포즈 목록 (코드 모션 이름과 같다). 순서는 UI 표시 순서 */
export const POSES: { id: SpritePose; label: string; desc: string }[] = [
  { id: "attack", label: "공격", desc: "Pose: mid-attack — lunging forward to the right with the weapon (or fist) swung in a powerful strike, body twisted with momentum, hair and clothes trailing, fierce expression." },
  { id: "hit", label: "피격", desc: "Pose: being struck — recoiling backward to the left, head and shoulders jerked back, eyes squeezed shut or wincing, arms flung slightly, off balance." },
  { id: "evade", label: "회피", desc: "Pose: dodging — leaning sharply back and away to the left with a quick side-step, one foot lifted, alert expression, weapon pulled in." },
  { id: "down", label: "전투불능", desc: "Pose: defeated — collapsed on one knee with one hand on the ground, head hanging, weapon dropped beside, exhausted expression. Keep the figure roughly the same height as the reference by kneeling, not lying flat." },
  { id: "win", label: "승리", desc: "Pose: triumphant — standing tall with weapon raised or fist up, chest out, confident grin or calm satisfied expression." },
];

/** 대기 결과를 참고 이미지로 넣고 같은 인물의 다른 포즈를 그리게 한다 */
export function buildPosePrompt(pose: SpritePose, label?: string): string {
  const p = POSES.find((x) => x.id === pose);
  if (!p) throw new Error(`알 수 없는 포즈: ${pose}`);
  return [
    "Redraw the exact same character from the reference image in a different pose. Keep identical face, hairstyle, hair and eye color, clothing, accessories, weapon, proportions, line weight and color palette. Same scale as the reference. Do not add or remove items.",
    label?.trim() ? `Character name: ${label.trim()}.` : "",
    p.desc,
    "The character still faces to the right of the image in three-quarter view.",
    SPRITE_STYLE,
  ].filter(Boolean).join(" ");
}
