"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { levelUp } from "@/app/characters/actions";
import { Button } from "@/components/ui";

/** 시트 상단 "레벨 업" 버튼: 경험치가 비용 이상이면 활성 */
export function LevelUp({ characterId, level, exp, cost, maxLevel }: { characterId: string; level: number; exp: number; cost: number; maxLevel: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const can = level < maxLevel && exp >= cost;
  const run = () => start(async () => {
    setMsg(null);
    const r = await levelUp(characterId);
    if (r.error) { setMsg(r.error); return; }
    setMsg(`Lv.${r.level}!${r.unlocked?.length ? " " + r.unlocked.join(" · ") : ""}`);
    router.refresh();
  });
  return (
    <span className="flex items-center gap-2">
      <Button variant={can ? "primary" : "ghost"} className="px-3 py-1 text-xs" onClick={run} disabled={pending || !can}
        title={level >= maxLevel ? "최고 레벨" : can ? `경험치 ${cost} 사용` : `경험치 ${exp}/${cost}`}>
        {pending ? "올리는 중…" : level >= maxLevel ? "최고 레벨" : `레벨 업 (${exp}/${cost})`}
      </Button>
      {msg ? <span className="text-xs text-muted">{msg}</span> : null}
    </span>
  );
}
