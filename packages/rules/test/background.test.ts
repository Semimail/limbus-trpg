import { describe, it, expect } from "vitest";
import { DEFAULT_AFFILIATIONS, DEFAULT_RULES, ORIGINS, affiliationTrait, formatAffiliations, parseAffiliations, parseEffectText } from "../src";

describe("배경: 출신·소속", () => {
  it("기본 소속 패시브 문장은 전부 자동 해석된다", () => {
    expect(DEFAULT_RULES.affiliations).toBe(DEFAULT_AFFILIATIONS);
    for (const a of DEFAULT_AFFILIATIONS) {
      const r = parseEffectText(a.passive, "passive");
      expect(r.unparsed, a.name).toEqual([]);
      expect(r.effects.length, a.name).toBeGreaterThan(0);
      for (const e of r.effects) expect(e.target, a.name).toBe("self");
    }
    expect(new Set(DEFAULT_AFFILIATIONS.map((a) => a.name)).size).toBe(DEFAULT_AFFILIATIONS.length);
    expect(ORIGINS.length).toBe(4);
  });
  it("소속 패시브는 특기 형태로 전투에 들어가고, 목록에 없으면 null", () => {
    const t = affiliationTrait("사무소");
    expect(t?.name).toBe("소속 · 사무소");
    expect(t?.effects?.[0]).toMatchObject({ trigger: "clashWin", target: "self", action: { type: "sanity", delta: 3 } });
    expect(affiliationTrait("없는 조직")).toBeNull();
    expect(affiliationTrait(undefined)).toBeNull();
    expect(affiliationTrait("사무소", [{ name: "사무소", passive: "", desc: "" }])).toBeNull();
  });
  it("룰 설정 텍스트 왕복", () => {
    const text = formatAffiliations(DEFAULT_AFFILIATIONS);
    expect(parseAffiliations(text)).toEqual(DEFAULT_AFFILIATIONS);
    expect(parseAffiliations("새 조직 | 전투 시작 시 자신에게 충전 2 부여\n\n새 조직 | 중복\n이름만")).toEqual([
      { name: "새 조직", passive: "전투 시작 시 자신에게 충전 2 부여", desc: "" },
      { name: "이름만", passive: "", desc: "" },
    ]);
  });
});
