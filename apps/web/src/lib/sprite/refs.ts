/**
 * 원작 참고 스프라이트 세트 — 역할 정의와 파일 이름 분류 (서버·브라우저 공용, DOM 없음).
 * 원작 추출 폴더(`sd-pose-512/<그룹>/<프리팹>/<자세>.png`, `sd-render/<그룹>__<프리팹>__<스켈레톤>.png`)의 이름 규칙:
 *  idle(가끔 Default/idel/standing) · mov/move · gud(방어) · dmg(피격) · miss(회피) · dead · skill1_N/skill2_N/skill3_N/skill_N(스킬 프레임)
 *  · `…_e`/`…_eN`(이펙트 레이어) · `1`~`5`(피 튀김) · `Fx_*`(공용 이펙트) · 같은 이름 `__2`(같은 프레임의 다른 레이어 → 겹쳐야 한 장).
 */
import type { SpriteAnimKey } from "@limbus/rules";

export type RefRole = "idle" | "attack" | "hit" | "evade" | "guard" | "down";
export const REF_ROLES: { id: RefRole; label: string; desc: string; maxFrames: number }[] = [
  { id: "idle", label: "대기", desc: "스타일 참고 (정지 1장)", maxFrames: 1 },
  { id: "attack", label: "공격", desc: "skill1 프레임 → 띠", maxFrames: 6 },
  { id: "hit", label: "피격", desc: "dmg", maxFrames: 1 },
  { id: "evade", label: "회피", desc: "miss", maxFrames: 1 },
  { id: "guard", label: "방어", desc: "gud", maxFrames: 1 },
  { id: "down", label: "전투불능", desc: "dead", maxFrames: 1 },
];
export const isRefRole = (r: string): r is RefRole => REF_ROLES.some((x) => x.id === r);
export const refRoleLabel = (r: string) => REF_ROLES.find((x) => x.id === r)?.label ?? r;

/** 세트 설정 값: 'auto' 아무 세트에서 고름 · 'off' 참고 안 함 · 그 외 = 세트 이름 우선 */
export const REF_AUTO = "auto";
export const REF_OFF = "off";

export interface RefFileInfo { role: RefRole; frame: number; layer: number }

/** 이름만으로 "쓰지 않는 조각"임이 분명한 것 (이펙트·피 튀김·공용 이펙트·이동·skill2/3) */
export function isSkippedRefFile(fileName: string): boolean {
  const s = fileName.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "").replace(/__\d+$/, "").toLowerCase();
  return (/(^|_)e\d*$/.test(s) && s !== "e") || /^\d+$/.test(s) || s.startsWith("fx_") || /^mov(e)?$/.test(s) || (/^skill\d+_\d+$/.test(s) && !/^skill1_\d+$/.test(s));
}

/** 파일 이름(확장자 포함 가능) → 역할·프레임·레이어. 모르는 이름과 쓰지 않는 조각은 null (구분은 isSkippedRefFile) */
export function classifyRefFile(fileName: string): RefFileInfo | null {
  let stem = fileName.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
  let layer = 0;
  const dup = /^(.*)__(\d+)$/.exec(stem);
  if (dup) { stem = dup[1]!; layer = Number(dup[2]); }
  const s = stem.toLowerCase();
  if (/(^|_)e\d*$/.test(s) && !/^(idle|dead|miss|gud|dmg)$/.test(s)) return null;   // 이펙트 레이어
  if (/^\d+$/.test(s) || s.startsWith("fx_") || /^mov(e)?$/.test(s)) return null;    // 피 튀김·공용 이펙트·이동
  if (/^(idle|idel|default|standing)$/.test(s)) return { role: "idle", frame: 0, layer };
  if (s === "dmg") return { role: "hit", frame: 0, layer };
  if (s === "gud") return { role: "guard", frame: 0, layer };
  if (s === "miss") return { role: "evade", frame: 0, layer };
  if (s === "dead") return { role: "down", frame: 0, layer };
  const sk = /^skill(1)?_(\d+)$/.exec(s);                                           // skill1_N 또는 E.G.O 의 skill_N 만 공격 띠로
  if (sk) return { role: "attack", frame: Number(sk[2]), layer };
  if (/^skill\d+_\d+$/.test(s)) return null;                                          // skill2/3 는 쓰지 않음
  return null;
}

/** 세트 이름: 폴더로 올렸으면 상위 폴더, sd-render 파일명(`그룹__프리팹__스켈레톤`)이면 프리팹, 아니면 파일 이름 */
export function refSetNameOf(relativePath: string, fileName: string): string {
  const parts = relativePath.split(/[\\/]/).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2]!;
  const stem = fileName.replace(/\.[^.]+$/, "");
  const render = stem.split("__");
  if (render.length >= 2) return render[1]!;
  return stem;
}

/** 모션 키 → 참고 역할 (대기 띠는 숨쉬기라 동작 예시가 없고, 승리도 원작에 없다) */
export function refRoleForAnim(key: SpriteAnimKey | string, skill?: { kind: "attack" | "defense"; defenseKind?: "guard" | "evade" | "counter" } | null): RefRole | null {
  if (key.startsWith("skill:")) {
    if (!skill) return null;
    if (skill.kind === "attack") return "attack";
    return skill.defenseKind === "evade" ? "evade" : "guard";     // 반격은 막는 동작을 참고
  }
  switch (key) {
    case "attack": return "attack";
    case "hit": return "hit";
    case "evade": return "evade";
    case "down": return "down";
    default: return null;
  }
}

/** 프롬프트에 쓰는 영어 동작 이름 */
export const REF_ROLE_EN: Record<RefRole, string> = { idle: "idle stance", attack: "attack", hit: "being hit", evade: "dodging", guard: "guarding", down: "defeated" };
