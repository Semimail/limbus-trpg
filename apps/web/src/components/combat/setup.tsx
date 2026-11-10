"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startCombatAction } from "@/app/campaigns/[id]/sessions/[sid]/combat-actions";
import { Button } from "@/components/ui";

export interface AllyOption { id: string; name: string; owner: string; approved: boolean }
export interface EnemyOption { id: string; name: string; threat: string; maxHp: number }

export function CombatSetup({ campaignId, sessionId, sceneId, allies, enemies }: { campaignId: string; sessionId: string; sceneId: string; allies: AllyOption[]; enemies: EnemyOption[] }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set(allies.filter((a) => a.approved).map((a) => a.id)));
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const go = () => start(async () => {
    setErr(null);
    const r = await startCombatAction(campaignId, sessionId, sceneId, [...picked], Object.entries(counts).filter(([, c]) => c > 0).map(([enemyId, count]) => ({ enemyId, count })));
    if (r.error) setErr(r.error); else router.refresh();
  });
  return (
    <div className="space-y-4 text-sm">
      <div>
        <div className="mb-1 text-xs text-muted">아군 (승인된 캐릭터가 기본 선택)</div>
        <div className="flex flex-wrap gap-2">
          {allies.map((a) => (
            <label key={a.id} className={`cursor-pointer border px-2 py-1 ${picked.has(a.id) ? "border-accent" : "border-border text-muted"}`}>
              <input type="checkbox" className="mr-1" checked={picked.has(a.id)} onChange={() => toggle(a.id)} />{a.name} <span className="text-xs">({a.owner}{a.approved ? "" : " · 미승인"})</span>
            </label>
          ))}
          {allies.length === 0 ? <span className="text-muted">캠페인에 캐릭터가 없습니다.</span> : null}
        </div>
      </div>
      <div>
        <div className="mb-1 text-xs text-muted">적 (도감에서, 수량)</div>
        <div className="grid gap-1 sm:grid-cols-2">
          {enemies.map((e) => (
            <div key={e.id} className="flex items-center justify-between border border-border px-2 py-1">
              <span>{e.name} <span className="text-xs text-muted">{e.threat} · 체력 {e.maxHp}</span></span>
              <input type="number" min={0} max={10} value={counts[e.id] ?? 0} onChange={(ev) => setCounts({ ...counts, [e.id]: Number(ev.target.value) })}
                className="w-14 rounded-md border border-border bg-elev px-1 py-0.5 text-right tabular-nums" />
            </div>
          ))}
          {enemies.length === 0 ? <span className="text-muted">적 도감이 비어 있습니다. 먼저 적을 등록하세요.</span> : null}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={go} disabled={pending}>{pending ? "준비 중..." : "전투 시작"}</Button>
        {err ? <span className="text-xs text-danger">{err}</span> : null}
      </div>
    </div>
  );
}
