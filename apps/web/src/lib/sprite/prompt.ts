/**
 * SD 스프라이트 프롬프트. 스타일 문장은 여기 한 곳에서만 관리한다.
 * 원작 이미지를 참고 이미지로 보내지 않고, 스타일은 글로만 지정한다.
 */
import type { SpritePose, SpriteAnimKey } from "@limbus/rules";

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

const SAME_CHARACTER = "Redraw the exact same character from the reference image. Keep identical face, hairstyle, hair and eye color, clothing, accessories, weapon, proportions, line weight and color palette. Same scale as the reference. Do not add or remove items.";

/** 대기 결과를 참고 이미지로 넣고 같은 인물의 다른 포즈를 그리게 한다 */
export function buildPosePrompt(pose: SpritePose, label?: string): string {
  const p = POSES.find((x) => x.id === pose);
  if (!p) throw new Error(`알 수 없는 포즈: ${pose}`);
  return [
    SAME_CHARACTER.replace("Redraw the exact same character from the reference image.", "Redraw the exact same character from the reference image in a different pose."),
    label?.trim() ? `Character name: ${label.trim()}.` : "",
    p.desc,
    "The character still faces to the right of the image in three-quarter view.",
    SPRITE_STYLE,
  ].filter(Boolean).join(" ");
}

/** 프레임 띠 모션 목록과 프레임별 설명 (칸 수는 strip.ts 의 STRIP_SPECS 와 맞춘다) */
export const STRIPS: { id: SpriteAnimKey; label: string; frames: string[] }[] = [
  { id: "idle", label: "대기(루프)", frames: ["relaxed stance, chest at rest", "chest slightly rising, shoulders lift a little", "fullest breath, head tilts up a touch", "exhaling back toward the first frame so the loop is seamless"] },
  { id: "attack", label: "공격", frames: ["anticipation: weight shifts back, weapon drawn back", "coiled, about to strike", "lunge begins, body leaning forward", "full swing, weapon slashing forward to the right with motion lines", "follow-through, weapon past the target", "recovering toward the idle stance"] },
  { id: "hit", label: "피격", frames: ["impact: flinch begins, head snaps back", "pushed back, off balance, eyes shut", "staggering, arms flung", "regaining footing"] },
  { id: "evade", label: "회피", frames: ["alert, knees bending", "leaning back and away to the left, foot lifted", "fully dodged, body stretched back", "returning to stance"] },
  { id: "down", label: "전투불능", frames: ["struck hard, reeling", "knees buckling", "falling forward", "landing on one knee, hand on the ground", "collapsed on one knee, head hanging, weapon dropped (final pose held)"] },
  { id: "win", label: "승리", frames: ["lifting the weapon or fist", "raised high, chest out", "small hop or flourish", "settling into a confident stance"] },
];

/** 한 번의 호출로 N칸 띠를 그리게 한다. 칸은 같은 너비·같은 크기의 인물·같은 발 위치 */
export function buildStripPrompt(key: SpriteAnimKey, frames: number, label?: string): string {
  const s = STRIPS.find((x) => x.id === key);
  if (!s) throw new Error(`알 수 없는 모션: ${key}`);
  const list = s.frames.slice(0, frames).map((d, i) => `panel ${i + 1}: ${d}`).join("; ");
  return [
    `A sprite sheet animation strip: exactly ${frames} panels of equal width arranged in a single horizontal row, left to right, with no gaps, borders, numbers or labels.`,
    `Every panel shows the same character at the same scale, feet on the same baseline, centered horizontally in its panel, facing to the right in three-quarter view.`,
    SAME_CHARACTER,
    label?.trim() ? `Character name: ${label.trim()}.` : "",
    `The panels are consecutive animation frames of: ${s.label.replace("(루프)", "")}. ${list}.`,
    key === "idle" ? "The motion is subtle breathing; the last panel should flow back into the first." : "Make each frame clearly different so the motion reads when played in sequence.",
    SPRITE_STYLE.replace("Full-body chibi (super-deformed) battle sprite of a single character,", "Full-body chibi (super-deformed) battle sprite of a single character in every panel,"),
  ].filter(Boolean).join(" ");
}
