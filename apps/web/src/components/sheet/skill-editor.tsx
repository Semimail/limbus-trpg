"use client";
import { SINS, SIN_LABEL, DAMAGE_TYPE_LABEL, expectedPower, type DamageType, type DefenseKind, type Sin, type SkillDraft } from "@limbus/rules";
import { Input } from "@/components/ui";
import { SinIcon, DamageIcon, DefenseIcon, CoinIcon } from "@/components/icons";
import { EffectPreview } from "./effect-preview";
import { Keyword } from "@/components/keyword/keyword";

const DEFENSE_LABEL: Record<DefenseKind, string> = { guard: "가드", evade: "회피", counter: "반격" };
const field = "w-full rounded-md border border-border bg-elev px-2 py-1 text-sm outline-none focus:border-accent disabled:opacity-70";

export function SkillEditor({ s, onChange, ro, coinCap, budget, label, onRemove }: {
  s: SkillDraft; onChange: (patch: Partial<SkillDraft>) => void; ro: boolean; coinCap: number;
  budget?: number; label: string; onRemove?: () => void;
}) {
  const ev = expectedPower(s.basePower, s.coinPower, s.coinCount);
  const over = budget !== undefined && ev > budget;
  return (
    <div className={`border p-3 ${over ? "border-danger" : "border-border"}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="stamp">{label}</span>
        <span className="inline-flex items-center gap-1 rounded-sm bg-fg/5 px-1.5 py-0.5">
          {s.kind === "defense" ? <DefenseIcon kind={s.defenseKind ?? "guard"} size={18} /> : <DamageIcon type={s.damageType} size={18} />}
          <SinIcon sin={s.sin} size={18} />
          <span className="ml-1 inline-flex items-center gap-0.5">
            {Array.from({ length: Math.min(s.coinCount, 14) }).map((_, i) => <CoinIcon key={i} heads size={14} />)}
          </span>
        </span>
        <Input value={s.name} onChange={(e) => onChange({ name: e.target.value })} disabled={ro} placeholder="스킬 이름" className="max-w-xs" />
        <span className={`ml-auto text-xs tabular-nums ${over ? "text-danger" : "text-muted"}`}>
          <Keyword id="skillbudget">기대 위력</Keyword> {ev.toFixed(1)}{budget !== undefined ? ` / 상한 ${budget}` : ""}
        </span>
        {!ro && onRemove ? <button type="button" onClick={onRemove} className="text-xs text-muted hover:text-danger">제거</button> : null}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
        {!ro ? (
          <Sel label="종류" value={s.kind} ro={ro} onChange={(v) => onChange(v === "defense" ? { kind: "defense", defenseKind: s.defenseKind ?? "guard", tier: undefined } : { kind: "attack", tier: s.tier ?? 1 })}
            options={[["attack", "공격"], ["defense", "방어"]]} />
        ) : <div />}
        {s.kind === "attack" ? (
          <Sel label="티어(덱 비율)" value={String(s.tier ?? 1)} ro={ro} onChange={(v) => onChange({ tier: Number(v) as 1 | 2 | 3 })} options={[["1", "1 (x3)"], ["2", "2 (x2)"], ["3", "3 (x1)"]]} />
        ) : (
          <Sel label="방어 종류" value={s.defenseKind ?? "guard"} ro={ro} onChange={(v) => onChange({ defenseKind: v as DefenseKind })} options={Object.entries(DEFENSE_LABEL)} />
        )}
        <Num label="기본 위력" value={s.basePower} min={0} onChange={(v) => onChange({ basePower: v })} ro={ro} />
        <Num label="코인 위력" value={s.coinPower} min={-999} onChange={(v) => onChange({ coinPower: v })} ro={ro} />
        <Num label="코인 수" value={s.coinCount} min={1} max={coinCap} onChange={(v) => onChange({ coinCount: v })} ro={ro} />
        <Sel label="피해 유형" value={s.damageType} ro={ro} onChange={(v) => onChange({ damageType: v as DamageType })} options={Object.entries(DAMAGE_TYPE_LABEL)} />
        <Sel label="죄악" value={s.sin} ro={ro} onChange={(v) => onChange({ sin: v as Sin })} options={SINS.map((x) => [x, SIN_LABEL[x]])} />
      </div>
      <textarea value={s.effectText} onChange={(e) => onChange({ effectText: e.target.value })} disabled={ro} rows={1}
        placeholder="부가 효과 (예: 앞면 적중 시 대상에게 출혈 2 부여)" className={`${field} mt-2`} />
      <EffectPreview text={s.effectText} mode="skill" />
      <div className="mt-1 text-xs text-muted">
        위력 흐름: {s.basePower}{Array.from({ length: s.coinCount }).map((_, i) => ` → ${s.basePower + s.coinPower * (i + 1)}`)}
      </div>
    </div>
  );
}

export function Num({ label, value, min, max, onChange, ro }: { label: string; value: number; min?: number; max?: number; onChange: (v: number) => void; ro: boolean }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-muted">{label}</span>
      <input type="number" value={value} min={min} max={max} disabled={ro} onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-md border border-border bg-elev px-2 py-1 text-sm tabular-nums outline-none focus:border-accent disabled:opacity-70" />
    </label>
  );
}

export function Sel({ label, value, options, onChange, ro }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void; ro: boolean }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-muted">{label}</span>
      <select value={value} disabled={ro} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-border bg-elev px-2 py-1 text-sm outline-none focus:border-accent disabled:opacity-70">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
