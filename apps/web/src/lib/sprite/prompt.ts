/**
 * SD 스프라이트 프롬프트. 스타일 문장은 여기 한 곳에서만 관리한다.
 * 원작 이미지를 참고 이미지로 보내지 않고, 스타일은 글로만 지정한다.
 */
export const SPRITE_STYLE = [
  "Full-body chibi (super-deformed) battle sprite of a single character, about 2.5 heads tall with a large head and small body.",
  "Style: dark urban-gothic game sprite in the manner of Limbus Company by Project Moon — thick dark ink outlines, flat cel shading with one shadow tone, muted desaturated palette with small accents, slightly gritty textures, serious expression.",
  "Pose: relaxed idle battle stance, body in three-quarter view facing to the right of the image, both feet planted and fully visible, arms and weapon (if any) resting naturally.",
  "Framing: the whole character centered and filling most of the frame, nothing cropped, no ground shadow, no floor, no background elements, no text, no watermark, no border.",
  "Background: fully transparent (alpha), not white.",
].join(" ");

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
  parts.push(SPRITE_STYLE);
  return parts.join(" ");
}
