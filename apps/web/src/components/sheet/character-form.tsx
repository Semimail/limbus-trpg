"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  SINS, SIN_LABEL, DAMAGE_TYPE_LABEL, DEFAULT_PROGRESSION,
  coinCapAt, expectedPower, gradeOf, maxHpAt, skillBudget, validateCharacter,
  type CharacterData, type DamageType, type DefenseKind, type Sin, type SkillDraft,
} from "@limbus/rules";
import { saveCharacter } from "@/app/characters/actions";
import { Button, Input } from "@/components/ui";
import { Panel } from "@/components/office/panel";
import { PortraitUpload } from "./portrait-upload";

interface Props {
  id?: string;
  campaignId: string | null;
  initialName: string;
  initialPortrait: string | null;
  initial: CharacterData;
  readOnly: boolean;
}

const DEFENSE_LABEL: Record<DefenseKind, string> = { guard: "가드", evade: "회피", counter: "반격" };

export function CharacterForm({ id, campaignId, initialName, initialPortrait, initial, readOnly }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [portrait, setPortrait] = useState<string | null>(initialPortrait);
  const [d, setD] = useState<CharacterData>(initial);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const issues = useMemo(() => validateCharacter(d), [d]);
  const errors = issues.filter((i) => i.level === "error");
  const statSum = SINS.reduce((a, s) => a + d.stats[s], 0);
  const coinCap = coinCapAt(d.level);
  const p = DEFAULT_PROGRESSION;

  const setStat = (s: Sin, v: number) => setD({ ...d, stats: { ...d.stats, [s]: Math.max(p.statMin, Math.min(p.statMax, v)) } });
  const setSkill = (sid: string, patch: Partial<SkillDraft>) =>
    setD({ ...d, skills: d.skills.map((s) => (s.id === sid ? { ...s, ...patch } : s)) });
  const setTrait = (tid: string, patch: { name?: string; description?: string }) =>
    setD({ ...d, traits: d.traits.map((t) => (t.id === tid ? { ...t, ...patch } : t)) });

  const submit = () => {
    setServerError(null);
    start(async () => {
      const r = await saveCharacter({ id, campaignId, name, portraitUrl: portrait, data: d });
      if (r.error) { setServerError(r.error); return; }
      router.push(`/characters/${r.id}`);
      router.refresh();
    });
  };

  const ro = readOnly;
  const field = "w-full rounded-md border border-border bg-elev px-2 py-1 text-sm outline-none focus:border-accent disabled:opacity-70";

  return (
    <div className="space-y-4">
      {/* 기본 정보 */}
      <Panel title="기본 정보" stamp={gradeOf(d.level)}>
        <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
          <PortraitUpload value={portrait} onChange={setPortrait} disabled={ro} />
          <div className="space-y-2">
            <label className="block text-xs text-muted">이름</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={ro} placeholder="캐릭터 이름" />
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <Stat label="레벨" value={`${d.level}`} />
              <Stat label="체력" value={`${d.hp} / ${d.maxHp}`} />
              <Stat label="정신력" value={`${d.sanity > 0 ? "+" : ""}${d.sanity}`} />
              <Stat label="빛" value={`${d.light}`} />
              <Stat label="동기화" value={`${d.sync}단계`} />
              <Stat label="침식도" value={`${d.erosion}`} />
              <Stat label="속도" value={`${d.speed.min}~${d.speed.max} ×${d.speed.dice}`} />
              <Stat label="코인 상한" value={`${coinCap}`} />
            </div>
            <p className="text-xs text-muted">레벨, 체력, 정신력, 빛은 GM이 조정합니다. {d.level}레벨 기준 최대 체력 {maxHpAt(d.level)}.</p>
          </div>
        </div>
      </Panel>

      {/* 능력치 */}
      <Panel title="능력치 (죄악)" right={<span className={`text-xs ${statSum === p.statPoints ? "text-muted" : "text-danger"}`}>합계 {statSum} / {p.statPoints}</span>}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {SINS.map((s) => (
            <div key={s} className="border border-border p-2 text-center">
              <div className="text-xs text-muted">{SIN_LABEL[s]}</div>
              <div className="my-1 text-2xl font-semibold tabular-nums">{d.stats[s]}</div>
              {!ro ? (
                <div className="flex justify-center gap-1">
                  <button type="button" onClick={() => setStat(s, d.stats[s] - 1)} className="h-7 w-7 border border-border hover:bg-fg/5">−</button>
                  <button type="button" onClick={() => setStat(s, d.stats[s] + 1)} className="h-7 w-7 border border-border hover:bg-fg/5">+</button>
                </div>
              ) : null}
              <div className="mt-1 flex justify-center gap-0.5">
                {Array.from({ length: p.statMax }).map((_, i) => (
                  <span key={i} className={`h-1.5 w-3 ${i < d.stats[s] ? "bg-gold" : "bg-fg/10"}`} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">각 1~{p.statMax}, {p.statMax}는 하나까지. 비전투 판정에서 능력치 수만큼 코인을 던집니다.</p>
      </Panel>

      {/* 특기 */}
      <Panel title="특기">
        <div className="grid gap-3 sm:grid-cols-2">
          {d.traits.map((t, i) => (
            <div key={t.id} className="space-y-1">
              <Input value={t.name} onChange={(e) => setTrait(t.id, { name: e.target.value })} disabled={ro} placeholder={`특기 ${i + 1} 이름`} />
              <textarea value={t.description} onChange={(e) => setTrait(t.id, { description: e.target.value })} disabled={ro} rows={2}
                placeholder="자연어로 적으세요. 예: 매 라운드 시작 시 자신에게 호흡 1 부여" className={field} />
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">상황에 맞는 특기는 판정에 코인 +1. 전투 효과가 있는 특기는 GM 승인 후 자동 처리로 바뀝니다.</p>
      </Panel>

      {/* 스킬 */}
      <Panel title="스킬" right={<span className="text-xs text-muted">코인 1~{coinCap}개</span>}>
        <div className="space-y-3">
          {d.skills.map((s) => {
            const tier = s.kind === "defense" ? "defense" : (s.tier ?? 1);
            const budget = skillBudget(tier, d.level);
            const ev = expectedPower(s.basePower, s.coinPower, s.coinCount);
            const over = ev > budget;
            return (
              <div key={s.id} className={`border p-3 ${over ? "border-danger" : "border-border"}`}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="stamp">{s.kind === "defense" ? "방어" : `스킬 ${s.tier}`}</span>
                  <Input value={s.name} onChange={(e) => setSkill(s.id, { name: e.target.value })} disabled={ro} placeholder="스킬 이름" className="max-w-xs" />
                  <span className={`ml-auto text-xs tabular-nums ${over ? "text-danger" : "text-muted"}`}>기대 위력 {ev.toFixed(1)} / 상한 {budget}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <Num label="기본 위력" value={s.basePower} min={0} onChange={(v) => setSkill(s.id, { basePower: v })} ro={ro} />
                  <Num label="코인 위력" value={s.coinPower} min={-20} onChange={(v) => setSkill(s.id, { coinPower: v })} ro={ro} />
                  <Num label="코인 수" value={s.coinCount} min={1} max={coinCap} onChange={(v) => setSkill(s.id, { coinCount: v })} ro={ro} />
                  <Sel label="피해 유형" value={s.damageType} ro={ro} onChange={(v) => setSkill(s.id, { damageType: v as DamageType })}
                    options={Object.entries(DAMAGE_TYPE_LABEL)} />
                  <Sel label="죄악" value={s.sin} ro={ro} onChange={(v) => setSkill(s.id, { sin: v as Sin })}
                    options={SINS.map((x) => [x, SIN_LABEL[x]])} />
                  {s.kind === "defense" ? (
                    <Sel label="방어 종류" value={s.defenseKind ?? "guard"} ro={ro} onChange={(v) => setSkill(s.id, { defenseKind: v as DefenseKind })}
                      options={Object.entries(DEFENSE_LABEL)} />
                  ) : <div />}
                </div>
                <textarea value={s.effectText} onChange={(e) => setSkill(s.id, { effectText: e.target.value })} disabled={ro} rows={1}
                  placeholder="부가 효과 (예: 앞면 적중 시 출혈 2 부여). 1차에서는 GM이 수동 적용" className={`${field} mt-2`} />
                <div className="mt-1 text-xs text-muted">
                  위력 흐름: {s.basePower}
                  {Array.from({ length: s.coinCount }).map((_, i) => ` → ${s.basePower + s.coinPower * (i + 1)}`)}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted">기대 위력 = 기본 + 코인 수 × 코인 위력 × 0.5. 상한은 레벨에 따라 오릅니다. 공격 스킬은 3:2:1 비율로 덱에 들어가고 방어는 항상 사용 가능합니다.</p>
      </Panel>

      {/* 서사 */}
      <Panel title="배경과 소지품">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs text-muted">배경</label>
            <textarea value={d.background} onChange={(e) => setD({ ...d, background: e.target.value })} disabled={ro} rows={5} className={field}
              placeholder="출신, 소속, 해결사가 된 계기 등. 규칙 효과는 나중에 추가됩니다." />
          </div>
          <div>
            <label className="block text-xs text-muted">소지품</label>
            <textarea value={d.inventory} onChange={(e) => setD({ ...d, inventory: e.target.value })} disabled={ro} rows={5} className={field}
              placeholder="자유 기입" />
          </div>
        </div>
      </Panel>

      {!ro ? (
        <div className="sticky bottom-0 -mx-4 border-t border-border bg-bg/90 px-4 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={submit} disabled={pending || errors.length > 0 || !name.trim()}>{pending ? "저장 중..." : id ? "저장" : "만들기"}</Button>
            {!name.trim() ? <span className="text-xs text-danger">이름을 입력하세요</span> : null}
            {errors.slice(0, 3).map((e, i) => <span key={i} className="text-xs text-danger">{e.message}</span>)}
            {errors.length > 3 ? <span className="text-xs text-danger">외 {errors.length - 3}건</span> : null}
            {serverError ? <span className="text-xs text-danger">{serverError}</span> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="border border-border px-2 py-1"><div className="text-[11px] text-muted">{label}</div><div className="tabular-nums">{value}</div></div>;
}

function Num({ label, value, min, max, onChange, ro }: { label: string; value: number; min?: number; max?: number; onChange: (v: number) => void; ro: boolean }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-muted">{label}</span>
      <input type="number" value={value} min={min} max={max} disabled={ro}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-md border border-border bg-elev px-2 py-1 text-sm tabular-nums outline-none focus:border-accent disabled:opacity-70" />
    </label>
  );
}

function Sel({ label, value, options, onChange, ro }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void; ro: boolean }) {
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
