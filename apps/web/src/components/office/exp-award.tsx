"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { awardExp } from "@/app/characters/actions";
import { Button } from "@/components/ui";

/** GM: 세션 뒤 참가 캐릭터에게 경험치 일괄 지급 */
export function ExpAward({ campaignId, characters, defaultAmount }: { campaignId: string; characters: { id: string; name: string; level: number; exp: number }[]; defaultAmount: number }) {
  const router = useRouter();
  const [sel, setSel] = useState<string[]>(() => characters.map((c) => c.id));
  const [amount, setAmount] = useState(defaultAmount);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const give = () => start(async () => {
    setMsg(null);
    const r = await awardExp(campaignId, sel, amount);
    setMsg(r.error ?? `${r.count}명에게 경험치 ${amount > 0 ? "+" : ""}${amount}`);
    router.refresh();
  });
  if (characters.length === 0) return null;
  return (
    <div>
      <div className="mb-1 text-xs text-muted">경험치 지급 (세션 뒤)</div>
      <ul className="space-y-1">
        {characters.map((c) => (
          <li key={c.id}>
            <label className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2"><input type="checkbox" checked={sel.includes(c.id)} onChange={() => toggle(c.id)} /> <span className="truncate">{c.name}</span></span>
              <span className="text-xs tabular-nums text-muted">Lv.{c.level} · 경험치 {c.exp}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center gap-2">
        <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="w-20 rounded-md border border-border bg-elev px-2 py-1 text-sm tabular-nums" />
        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={give} disabled={pending || sel.length === 0 || !amount}>{pending ? "지급 중…" : `지급 (${sel.length}명)`}</Button>
        {msg ? <span className="text-xs text-muted">{msg}</span> : null}
      </div>
      <p className="mt-1 text-[11px] text-muted">레벨업은 각자 시트에서 누릅니다. 비용은 현재 등급 번호(뜬소문 1 … 불순물 7).</p>
    </div>
  );
}
