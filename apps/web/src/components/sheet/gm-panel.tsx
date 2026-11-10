"use client";
import { useState, useTransition } from "react";
import type { CharacterData } from "@limbus/rules";
import { maxHpAt } from "@limbus/rules";
import { gmAdjust } from "@/app/characters/actions";
import { Button } from "@/components/ui";
import { Panel } from "@/components/office/panel";

export function GmPanel({ characterId, data, approved }: { characterId: string; data: CharacterData; approved: boolean }) {
  const [f, setF] = useState({ level: data.level, hp: data.hp, maxHp: data.maxHp, sanity: data.sanity, light: data.light, erosion: data.erosion, sync: data.sync });
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const num = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Number(e.target.value) });
  const apply = (extra?: boolean) => start(async () => {
    const r = await gmAdjust(characterId, { ...f, sync: f.sync as 1 | 2 | 3 | 4 }, extra);
    setMsg(r.error ?? "저장됨");
  });
  const cls = "w-full rounded-md border border-border bg-elev px-2 py-1 text-sm tabular-nums";
  return (
    <Panel title="GM 조정" stamp="GM ONLY">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {([["level", "레벨"], ["maxHp", "최대 체력"], ["hp", "체력"], ["sanity", "정신력"], ["light", "빛"], ["erosion", "침식도"], ["sync", "동기화"]] as const).map(([k, l]) => (
          <label key={k} className="block"><span className="block text-[11px] text-muted">{l}</span>
            <input type="number" value={f[k]} onChange={num(k)} className={cls} /></label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={() => setF({ ...f, maxHp: maxHpAt(f.level), hp: maxHpAt(f.level) })}>레벨 기준 체력 재계산</Button>
        <Button onClick={() => apply()} disabled={pending}>저장</Button>
        <Button variant={approved ? "danger" : "primary"} onClick={() => apply(!approved)} disabled={pending}>{approved ? "승인 취소" : "승인"}</Button>
        {msg ? <span className="text-xs text-muted">{msg}</span> : null}
      </div>
    </Panel>
  );
}
