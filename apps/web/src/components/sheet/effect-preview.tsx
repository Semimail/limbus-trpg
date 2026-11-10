"use client";
import { useMemo } from "react";
import { parseEffectText, describeEffect } from "@limbus/rules";

/** 자연어 효과 문장을 어떻게 해석했는지 보여준다 */
export function EffectPreview({ text, mode }: { text: string; mode: "skill" | "passive" }) {
  const r = useMemo(() => (text.trim() ? parseEffectText(text, mode) : null), [text, mode]);
  if (!r) return null;
  return (
    <div className="mt-1 space-y-0.5 text-[11px]">
      {r.effects.map((e, i) => <div key={i} className="text-ok">자동 · {describeEffect(e)}</div>)}
      {r.unparsed.map((u, i) => <div key={i} className="text-muted">수동(GM) · {u}</div>)}
    </div>
  );
}
