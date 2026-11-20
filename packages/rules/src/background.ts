/**
 * 배경(출신·소속)의 규칙 효과.
 * - 출신: 비전투 전용. 출신에 맞는 상황이면 판정 코인 +1 (특기와 겹쳐도 합쳐서 최대 +1). 목록은 고정.
 * - 소속: 전투 전용. 소속마다 정해진 "소속 패시브" 한 문장을 받는다 (등급·동기화 패시브 칸과 별개).
 *   목록은 DEFAULT_RULES.affiliations 기본값 + 캠페인 룰 설정으로 바꾼다. 캐릭터는 소속 이름을 저장한다.
 */
import type { AffiliationDef } from "./types";
import { DEFAULT_AFFILIATIONS } from "./types";
import type { Trait } from "./character";
import { parseEffectText } from "./parse";

export interface OriginDef {
  name: string;
  /** 어디서 자랐는지 */
  desc: string;
  /** 판정 코인 +1 이 붙는 상황 예 */
  situations: string;
}

export const ORIGINS: OriginDef[] = [
  { name: "둥지", desc: "날개의 질서 아래, 정해진 삶이 있는 곳에서 자랐다.", situations: "제도·행정 지식, 사교와 격식 있는 거래, 기술·기계 다루기" },
  { name: "뒷골목", desc: "둥지 바깥, 사무소와 조직이 얽힌 거리에서 자랐다.", situations: "흥정, 거리 정보 모으기, 은신·잠복, 위협 읽기" },
  { name: "외곽", desc: "도시 바깥의 황야와 폐허에서 살아남았다.", situations: "추적, 생존, 괴물·환경 지식, 길 찾기" },
  { name: "그 밖", desc: "어디에도 속하지 않은 출신. 어떤 상황에서 +1 인지 GM과 정한다.", situations: "GM과 합의한 상황" },
];

export function originOf(name: string | undefined | null): OriginDef | undefined {
  return name ? ORIGINS.find((o) => o.name === name) : undefined;
}

export function affiliationOf(name: string | undefined | null, list: AffiliationDef[] = DEFAULT_AFFILIATIONS): AffiliationDef | undefined {
  return name ? list.find((a) => a.name === name) : undefined;
}

/** 소속 패시브를 특기와 같은 Trait 형태로. 전투 시작 때 유닛 패시브에 합친다. 목록에 없는 소속이면 null */
export function affiliationTrait(name: string | undefined | null, list: AffiliationDef[] = DEFAULT_AFFILIATIONS): Trait | null {
  const a = affiliationOf(name, list);
  if (!a || !a.passive.trim()) return null;
  return { id: `aff:${a.name}`, name: `소속 · ${a.name}`, description: a.passive, effects: parseEffectText(a.passive, "passive").effects };
}

/** 룰 설정 텍스트 ↔ 목록. 한 줄에 "이름 | 패시브 문장 | 설명(선택)" */
export function formatAffiliations(list: AffiliationDef[]): string {
  return list.map((a) => [a.name, a.passive, a.desc].filter((x, i) => i < 2 || x).join(" | ")).join("\n");
}
export function parseAffiliations(text: string): AffiliationDef[] {
  const out: AffiliationDef[] = [];
  for (const line of text.split(/\r?\n/)) {
    const [name = "", passive = "", ...rest] = line.split("|").map((s) => s.trim());
    if (!name) continue;
    if (out.some((a) => a.name === name)) continue;
    out.push({ name, passive, desc: rest.join(" | ") });
  }
  return out;
}
