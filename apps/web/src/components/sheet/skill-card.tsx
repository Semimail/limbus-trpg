"use client";
import type { SkillDraft } from "@limbus/rules";
import { SIN_LABEL, DAMAGE_TYPE_LABEL } from "@limbus/rules";
import { SinIcon, DamageIcon, DefenseIcon, CoinIcon } from "@/components/icons";
import { Keyword, KeywordText } from "@/components/keyword/keyword";

const SIN_COLOR: Record<string, string> = { wrath: "#b3161c", lust: "#d4621c", sloth: "#c9a227", gluttony: "#4f8a3a", gloom: "#2e6f9e", pride: "#2b3f8c", envy: "#6a3d9a" };
const DEF_LABEL: Record<string, string> = { guard: "가드", evade: "회피", counter: "반격" };

export function SkillCard({ s, label, compact = false }: { s: SkillDraft; label: string; compact?: boolean }) {
  const flow = [s.basePower, ...Array.from({ length: s.coinCount }, (_, i) => s.basePower + s.coinPower * (i + 1))];
  const isEgo = !!s.ego;
  return (
    <div className={`panel flex overflow-hidden ${isEgo ? "border-gold/70" : ""}`}>
      <div className="flex w-14 shrink-0 flex-col items-center justify-center gap-1 text-white" style={{ background: `linear-gradient(180deg, ${SIN_COLOR[s.sin]}cc, ${SIN_COLOR[s.sin]}66)` }}>
        {s.kind === "defense" ? <DefenseIcon kind={s.defenseKind ?? "guard"} size={26} /> : <DamageIcon type={s.damageType} size={26} />}
        <SinIcon sin={s.sin} size={18} />
      </div>
      <div className="min-w-0 flex-1 p-2.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="stamp">{label}</span>
          <span className="font-semibold">{s.name || <span className="text-muted">(이름 없음)</span>}</span>
          <span className="text-xs text-muted">
            {s.kind === "defense" ? <Keyword id={s.defenseKind ?? "guard"}>{DEF_LABEL[s.defenseKind ?? "guard"]}</Keyword> : <Keyword id={s.damageType}>{DAMAGE_TYPE_LABEL[s.damageType]}</Keyword>}
            {" · "}<Keyword id={s.sin}>{SIN_LABEL[s.sin]}</Keyword>
            {" · "}사거리 {s.range ?? 1}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-lg font-bold tabular-nums">{s.basePower}</span>
          <span className="tabular-nums text-muted">{s.coinPower >= 0 ? "+" : ""}{s.coinPower}</span>
          <span className="inline-flex gap-0.5">{Array.from({ length: s.coinCount }).map((_, i) => <CoinIcon key={i} heads size={16} />)}</span>
          {!compact ? <span className="ml-auto font-mono text-[11px] text-muted">{flow.join(" → ")}</span> : null}
        </div>
        {isEgo ? <div className="mt-1 text-[11px] text-gold">정신력 −{s.ego!.sanityCost} · 침식도 +{s.ego!.erosionGain} · 전투당 {s.ego!.usesPerCombat}회</div> : null}
        {s.effectText ? <p className="mt-1 text-xs text-muted"><KeywordText text={s.effectText} /></p> : null}
      </div>
    </div>
  );
}
