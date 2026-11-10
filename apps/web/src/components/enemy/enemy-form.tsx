"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GRADES, SINS, SIN_LABEL, DAMAGE_TYPE_LABEL, RESISTANCE_MULT, type EnemyData, type Resistance, type SkillDraft, type DamageType } from "@limbus/rules";
import { saveEnemy } from "@/app/campaigns/[id]/enemies/actions";
import { Button, Input } from "@/components/ui";
import { Panel } from "@/components/office/panel";
import { PortraitUpload } from "@/components/sheet/portrait-upload";
import { SkillEditor, Num, Sel } from "@/components/sheet/skill-editor";
import { SinIcon, DamageIcon } from "@/components/icons";
import { EffectPreview } from "@/components/sheet/effect-preview";

const RES_LABEL: Record<Resistance, string> = { fatal: "치명 x2", weak: "취약 x1.5", normal: "보통 x1", endure: "견딤 x0.75", resist: "내성 x0.5", immune: "면역 x0" };
const field = "w-full rounded-md border border-border bg-elev px-2 py-1 text-sm outline-none focus:border-accent";

export function EnemyForm({ campaignId, id, initialName, initialPortrait, initial }: { campaignId: string; id?: string; initialName: string; initialPortrait: string | null; initial: EnemyData }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [portrait, setPortrait] = useState<string | null>(initialPortrait);
  const [d, setD] = useState<EnemyData>(initial);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const setSkill = (sid: string, patch: Partial<SkillDraft>) => setD({ ...d, skills: d.skills.map((s) => (s.id === sid ? { ...s, ...patch } : s)) });
  const addSkill = () => setD({ ...d, skills: [...d.skills, { id: `e${Date.now().toString(36)}`, name: "", kind: "attack", tier: 1, basePower: 3, coinPower: 2, coinCount: 2, damageType: "slash", sin: "wrath", effectText: "" }] });
  const addGimmick = () => setD({ ...d, gimmicks: [...d.gimmicks, { id: `g${Date.now().toString(36)}`, name: "", text: "" }] });
  const submit = () => start(async () => {
    setErr(null);
    const r = await saveEnemy(campaignId, id ?? null, name, portrait, d);
    if (r.error) { setErr(r.error); return; }
    router.push(`/campaigns/${campaignId}/enemies/${r.id}`); router.refresh();
  });

  return (
    <div className="space-y-4">
      <Panel title="기본 정보" stamp={d.threat}>
        <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
          <PortraitUpload value={portrait} onChange={setPortrait} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="col-span-2 block sm:col-span-4"><span className="block text-xs text-muted">이름</span><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="적 이름" /></label>
            <Sel label="위험 등급" value={d.threat} ro={false} onChange={(v) => setD({ ...d, threat: v as EnemyData["threat"] })} options={GRADES.map((g) => [g, g])} />
            <Num label="최대 체력" value={d.maxHp} min={1} onChange={(v) => setD({ ...d, maxHp: v })} ro={false} />
            <Num label="속도 최소" value={d.speed.min} min={1} onChange={(v) => setD({ ...d, speed: { ...d.speed, min: v } })} ro={false} />
            <Num label="속도 최대" value={d.speed.max} min={1} onChange={(v) => setD({ ...d, speed: { ...d.speed, max: v } })} ro={false} />
            <Sel label="행동 슬롯" value={String(d.speed.dice)} ro={false} onChange={(v) => setD({ ...d, speed: { ...d.speed, dice: Number(v) as 1 | 2 | 3 } })} options={[["1", "1"], ["2", "2"], ["3", "3"]]} />
            <Sel label="정신력" value={d.hasSanity ? "yes" : "no"} ro={false} onChange={(v) => setD({ ...d, hasSanity: v === "yes" })} options={[["no", "없음 (50% 고정)"], ["yes", "있음"]]} />
            {d.hasSanity ? <Num label="초기 정신력" value={d.sanity} min={-45} max={45} onChange={(v) => setD({ ...d, sanity: v })} ro={false} /> : <div />}
            <label className="col-span-2 block sm:col-span-4"><span className="block text-xs text-muted">설명 (플레이어에게 공개되지 않음)</span>
              <textarea value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} rows={3} className={field} /></label>
          </div>
        </div>
      </Panel>

      <Panel title="스킬" right={<Button variant="ghost" className="px-2 py-1 text-xs" onClick={addSkill}>+ 스킬</Button>}>
        <div className="space-y-3">
          {d.skills.map((s) => (
            <SkillEditor key={s.id} s={s} ro={false} coinCap={14} label={s.kind === "defense" ? "방어" : `스킬 ${s.tier ?? 1}`}
              onChange={(p) => setSkill(s.id, p)} onRemove={d.skills.length > 1 ? () => setD({ ...d, skills: d.skills.filter((x) => x.id !== s.id) }) : undefined} />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">적 스킬에는 포인트 상한이 없습니다. 공격 스킬은 티어 비율로 덱에 들어가고 매 라운드 무작위로 뽑힙니다.</p>
      </Panel>

      <Panel title="기믹" right={<Button variant="ghost" className="px-2 py-1 text-xs" onClick={addGimmick}>+ 기믹</Button>}>
        {d.gimmicks.length === 0 ? <p className="text-sm text-muted">없음. 해석되는 문장은 자동 실행되고, 나머지는 GM이 수동 적용합니다.</p> : null}
        <div className="space-y-2">
          {d.gimmicks.map((g) => (
            <div key={g.id} className="grid gap-1 sm:grid-cols-[14rem_1fr_auto]">
              <Input value={g.name} onChange={(e) => setD({ ...d, gimmicks: d.gimmicks.map((x) => (x.id === g.id ? { ...x, name: e.target.value } : x)) })} placeholder="기믹 이름" />
              <div>
                <Input value={g.text} onChange={(e) => setD({ ...d, gimmicks: d.gimmicks.map((x) => (x.id === g.id ? { ...x, text: e.target.value } : x)) })} placeholder="효과 설명 (예: 매 라운드 시작 시 자신에게 충전 3 부여)" />
                <EffectPreview text={g.text} mode="passive" />
              </div>
              <button type="button" className="text-xs text-muted hover:text-danger" onClick={() => setD({ ...d, gimmicks: d.gimmicks.filter((x) => x.id !== g.id) })}>제거</button>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="저항 (캠페인 설정에서 저항을 켰을 때만 적용)">
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-xs text-muted">피해 유형</div>
            <div className="grid grid-cols-3 gap-1">
              {(Object.keys(DAMAGE_TYPE_LABEL) as DamageType[]).map((t) => (
                <label key={t} className="text-xs"><span className="flex items-center gap-1"><DamageIcon type={t} size={16} />{DAMAGE_TYPE_LABEL[t]}</span>
                  <select value={d.resist.damage[t] ?? "normal"} onChange={(e) => setD({ ...d, resist: { ...d.resist, damage: { ...d.resist.damage, [t]: e.target.value as Resistance } } })} className="w-full rounded-md border border-border bg-elev px-1 py-0.5">
                    {(Object.keys(RESISTANCE_MULT) as Resistance[]).map((r) => <option key={r} value={r}>{RES_LABEL[r]}</option>)}
                  </select></label>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs text-muted">죄악</div>
            <div className="grid grid-cols-4 gap-1">
              {SINS.map((s) => (
                <label key={s} className="text-xs"><span className="flex items-center gap-1"><SinIcon sin={s} size={16} />{SIN_LABEL[s]}</span>
                  <select value={d.resist.sin[s] ?? "normal"} onChange={(e) => setD({ ...d, resist: { ...d.resist, sin: { ...d.resist.sin, [s]: e.target.value as Resistance } } })} className="w-full rounded-md border border-border bg-elev px-1 py-0.5">
                    {(Object.keys(RESISTANCE_MULT) as Resistance[]).map((r) => <option key={r} value={r}>{RES_LABEL[r]}</option>)}
                  </select></label>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      <div className="sticky bottom-0 -mx-4 border-t border-border bg-bg/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-3">
          <Button onClick={submit} disabled={pending || !name.trim()}>{pending ? "저장 중..." : id ? "저장" : "등록"}</Button>
          {err ? <span className="text-xs text-danger">{err}</span> : null}
        </div>
      </div>
    </div>
  );
}
