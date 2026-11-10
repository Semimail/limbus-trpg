"use client";
import { useState, useTransition } from "react";
import { DEFAULT_RULES, DEFAULT_PROGRESSION, type RuleConfig, type ProgressionConfig } from "@limbus/rules";
import { saveRules } from "./actions";
import { Button } from "@/components/ui";
import { Panel } from "@/components/office/panel";

export function RulesForm({ campaignId, rules, progression }: { campaignId: string; rules: RuleConfig; progression: ProgressionConfig }) {
  const [r, setR] = useState<RuleConfig>(rules);
  const [p, setP] = useState<ProgressionConfig>(progression);
  const [thr, setThr] = useState(rules.staggerThresholds.map((t) => Math.round(t * 100)).join(", "));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const cls = "w-full rounded-md border border-border bg-elev px-2 py-1 text-sm tabular-nums";
  const N = (label: string, v: number, on: (n: number) => void, step = 1) => (
    <label className="block text-xs"><span className="text-muted">{label}</span><input type="number" step={step} value={v} onChange={(e) => on(Number(e.target.value))} className={cls} /></label>
  );
  const submit = () => start(async () => {
    const thresholds = thr.split(",").map((x) => Number(x.trim()) / 100).filter((x) => x > 0 && x < 1).sort((a, b) => b - a);
    const res = await saveRules(campaignId, { ...r, staggerThresholds: thresholds }, p);
    setMsg(res.error ?? "저장됨");
  });
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
        </div>
      </Panel>
      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={pending}>{pending ? "저장 중..." : "저장"}</Button>
        <Button variant="ghost" onClick={() => { setR(DEFAULT_RULES); setP(DEFAULT_PROGRESSION); setThr("50, 30"); }}>기본값으로</Button>
        {msg ? <span className="text-xs text-muted">{msg}</span> : null}
      </div>
    </div>
  );
}
