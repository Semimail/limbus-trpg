"use client";
import { useState, useTransition } from "react";
import { DEFAULT_RULES, DEFAULT_PROGRESSION, DEFAULT_AFFILIATIONS, parseEffectText, describeEffect, type RuleConfig, type ProgressionConfig, type AffiliationDef } from "@limbus/rules";
import { saveRules } from "./actions";
import { Button } from "@/components/ui";
import { Panel } from "@/components/office/panel";

export function RulesForm({ campaignId, rules, progression }: { campaignId: string; rules: RuleConfig; progression: ProgressionConfig }) {
  const [r, setR] = useState<RuleConfig>(rules);
  const [p, setP] = useState<ProgressionConfig>(progression);
  const [thr, setThr] = useState(rules.staggerThresholds.map((t) => Math.round(t * 100)).join(", "));
  const [aff, setAff] = useState<AffiliationDef[]>((rules.affiliations ?? DEFAULT_AFFILIATIONS).map((a) => ({ ...a })));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const cls = "w-full rounded-md border border-border bg-elev px-2 py-1 text-sm tabular-nums";
  const N = (label: string, v: number, on: (n: number) => void, step = 1) => (
    <label className="block text-xs"><span className="text-muted">{label}</span><input type="number" step={step} value={v} onChange={(e) => on(Number(e.target.value))} className={cls} /></label>
  );
  // 소속 목록 정리: 이름 없는 줄 제외, 같은 이름은 앞의 것만
  const affClean = aff.map((a) => ({ name: a.name.trim(), passive: a.passive.trim(), desc: a.desc.trim() })).filter((a, i, arr) => a.name && arr.findIndex((x) => x.name === a.name) === i);
  const dupNames = aff.map((a) => a.name.trim()).filter((n, i, arr) => n && arr.indexOf(n) !== i);
  const submit = () => start(async () => {
    const thresholds = thr.split(",").map((x) => Number(x.trim()) / 100).filter((x) => x > 0 && x < 1).sort((a, b) => b - a);
    const res = await saveRules(campaignId, { ...r, staggerThresholds: thresholds, affiliations: affClean.length ? affClean : DEFAULT_AFFILIATIONS }, p);
    setMsg(res.error ?? "저장됨");
  });
  const setAffAt = (i: number, patch: Partial<AffiliationDef>) => setAff(aff.map((a, k) => (k === i ? { ...a, ...patch } : a)));
  return (
    <div className="space-y-4">
      <Panel title="전투 규칙">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <label className="block text-xs"><span className="text-muted">저항</span>
            <select value={r.resistanceMode} onChange={(e) => setR({ ...r, resistanceMode: e.target.value as RuleConfig["resistanceMode"] })} className={cls}>
              <option value="off">사용 안 함</option><option value="enemyOnly">적에게만</option><option value="all">전체</option>
            </select></label>
          <label className="block text-xs"><span className="text-muted">흐트러짐 구간 (%)</span><input value={thr} onChange={(e) => setThr(e.target.value)} className={cls} placeholder="50, 30" /></label>
          {N("흐트러짐 피해 배율", r.staggerDamageMult, (n) => setR({ ...r, staggerDamageMult: n }), 0.1)}
          {N("치명타 배율", r.critMult, (n) => setR({ ...r, critMult: n }), 0.1)}
          {N("호흡 1당 치명타 확률", r.poiseCritPerPotency, (n) => setR({ ...r, poiseCritPerPotency: n }), 0.01)}
          {N("합 승리 정신력", r.sanityOnClashWin, (n) => setR({ ...r, sanityOnClashWin: n }))}
          {N("합 패배 정신력", r.sanityOnClashLose, (n) => setR({ ...r, sanityOnClashLose: n }))}
          {N("회피 승리 추가 정신력", r.evadeWinSanity ?? 5, (n) => setR({ ...r, evadeWinSanity: n }))}
          {N("정신력 최소", r.sanityMin, (n) => setR({ ...r, sanityMin: n }))}
          {N("정신력 최대", r.sanityMax, (n) => setR({ ...r, sanityMax: n }))}
          {N("진동 1당 흐트러짐 배율 가산", r.tremorStaggerBonus, (n) => setR({ ...r, tremorStaggerBonus: n }), 0.05)}
          {N("상태 상한", r.statusCap, (n) => setR({ ...r, statusCap: n }))}
          {N("충전 상한", r.chargeCap, (n) => setR({ ...r, chargeCap: n }))}
          {N("침식 판정 정신력 기준", r.egoCorrosionSanityBelow, (n) => setR({ ...r, egoCorrosionSanityBelow: n }))}
          {N("침식도 상한", r.erosionMax, (n) => setR({ ...r, erosionMax: n }))}
          {N("손패 교체 빛 비용", r.lightRedrawCost, (n) => setR({ ...r, lightRedrawCost: n }))}
        </div>
      </Panel>
      <Panel title="배경 규칙 · 소속 패시브">
        <p className="mb-2 text-xs text-muted">소속마다 이름, 소속 패시브 한 문장(특기와 같은 효과 문장 형태, 룰북 9장 — 해석되면 전투에서 자동 발동), 설명. 캐릭터는 소속 이름으로 연결되므로 이름을 바꾸면 기존 캐릭터는 다시 골라야 합니다. 출신(둥지·뒷골목·외곽·그 밖)은 판정 코인 +1 전용이라 설정이 없습니다.</p>
        <div className="space-y-2">
          {aff.map((a, i) => {
            const parsed = a.passive.trim() ? parseEffectText(a.passive, "passive") : null;
            const auto = !!parsed && parsed.effects.length > 0;
            const dup = a.name.trim() && dupNames.includes(a.name.trim());
            return (
              <div key={i} className="grid gap-1 rounded-md border border-border p-2 sm:grid-cols-[8rem_1fr_auto]">
                <div>
                  <span className="text-[10px] text-muted">이름</span>
                  <input value={a.name} onChange={(e) => setAffAt(i, { name: e.target.value })} className={`${cls} ${dup ? "border-danger" : ""}`} placeholder="예: 사무소" />
                  {dup ? <span className="text-[10px] text-danger">이름이 겹칩니다</span> : null}
                </div>
                <div className="space-y-1">
                  <div>
                    <span className="text-[10px] text-muted">소속 패시브 <span className={`ml-1 rounded-sm px-1 ${a.passive.trim() ? (auto ? "bg-ok/20 text-ok" : "bg-danger/20 text-danger") : "bg-fg/10 text-muted"}`}>{a.passive.trim() ? (auto ? "자동" : "수동(GM)") : "없음"}</span></span>
                    <input value={a.passive} onChange={(e) => setAffAt(i, { passive: e.target.value })} className={cls} placeholder="예: 합 승리 시 정신력 +3" />
                    {parsed && auto ? <div className="mt-0.5 text-[10px] text-ok">{parsed.effects.map((e, k) => <div key={k}>자동 · {describeEffect(e)}</div>)}</div> : null}
                    {parsed && !auto ? <div className="mt-0.5 text-[10px] text-danger">해석되지 않는 문장 — 전투에서 GM이 수동으로 적용합니다</div> : null}
                  </div>
                  <div>
                    <span className="text-[10px] text-muted">설명 (선택)</span>
                    <input value={a.desc} onChange={(e) => setAffAt(i, { desc: e.target.value })} className={cls} placeholder="누가 이 소속인지 한 줄" />
                  </div>
                </div>
                <div className="flex items-start gap-1 sm:flex-col">
                  <Button variant="ghost" className="px-2 py-0.5 text-[11px]" disabled={i === 0} onClick={() => { const n = [...aff]; [n[i - 1], n[i]] = [n[i]!, n[i - 1]!]; setAff(n); }}>▲</Button>
                  <Button variant="ghost" className="px-2 py-0.5 text-[11px]" disabled={i === aff.length - 1} onClick={() => { const n = [...aff]; [n[i + 1], n[i]] = [n[i]!, n[i + 1]!]; setAff(n); }}>▼</Button>
                  <Button variant="danger" className="px-2 py-0.5 text-[11px]" onClick={() => setAff(aff.filter((_, k) => k !== i))}>삭제</Button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
          <span>{affClean.length}개 · 자동 {affClean.filter((a) => a.passive && parseEffectText(a.passive, "passive").effects.length > 0).length}개</span>
          <span className="flex gap-1">
            <Button variant="ghost" className="px-2 py-0.5 text-[11px]" onClick={() => setAff([...aff, { name: "", passive: "", desc: "" }])}>+ 소속 추가</Button>
            <Button variant="ghost" className="px-2 py-0.5 text-[11px]" onClick={() => setAff(DEFAULT_AFFILIATIONS.map((a) => ({ ...a })))}>기본값으로</Button>
          </span>
        </div>
      </Panel>
      <Panel title="성장 규칙">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {N("최대 레벨", p.maxLevel, (n) => setP({ ...p, maxLevel: n }))}
          {N("등급당 레벨", p.levelsPerGrade, (n) => setP({ ...p, levelsPerGrade: n }))}
          {N("1레벨 체력", p.baseHp, (n) => setP({ ...p, baseHp: n }))}
          {N("레벨당 체력 배율", p.hpGrowth, (n) => setP({ ...p, hpGrowth: n }), 0.01)}
          {N("레벨당 위력 배율", p.powerGrowth, (n) => setP({ ...p, powerGrowth: n }), 0.01)}
          {N("코인 상한 기본", p.baseCoinCap, (n) => setP({ ...p, baseCoinCap: n }))}
          {N("코인 +1 레벨 간격", p.coinCapPerLevels, (n) => setP({ ...p, coinCapPerLevels: n }))}
          {N("최대 코인", p.maxCoins, (n) => setP({ ...p, maxCoins: n }))}
          {N("능력치 총점", p.statPoints, (n) => setP({ ...p, statPoints: n }))}
          {N("능력치 최대", p.statMax, (n) => setP({ ...p, statMax: n }))}
          {N("최대치 허용 개수", p.statMaxCount, (n) => setP({ ...p, statMaxCount: n }))}
          {N("생성 시 특기", p.traitsAtCreation, (n) => setP({ ...p, traitsAtCreation: n }))}
          {N("세션당 빛", p.lightPerSession, (n) => setP({ ...p, lightPerSession: n }))}
          {N("세션당 경험치(기본값)", p.expPerSession ?? 2, (n) => setP({ ...p, expPerSession: n }))}
          {N("레벨업 비용 배율(×등급)", p.expCostPerGrade ?? 1, (n) => setP({ ...p, expCostPerGrade: n }))}
          {N("등급당 능력치 +", p.statPointsPerGrade ?? 1, (n) => setP({ ...p, statPointsPerGrade: n }))}
        </div>
      </Panel>
      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={pending}>{pending ? "저장 중..." : "저장"}</Button>
        <Button variant="ghost" onClick={() => { setR(DEFAULT_RULES); setP(DEFAULT_PROGRESSION); setThr("50, 30"); setAff(DEFAULT_AFFILIATIONS.map((a) => ({ ...a }))); }}>기본값으로</Button>
        {msg ? <span className="text-xs text-muted">{msg}</span> : null}
      </div>
    </div>
  );
}
