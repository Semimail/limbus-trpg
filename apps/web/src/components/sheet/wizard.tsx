"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  SINS, SIN_LABEL, DAMAGE_TYPE_LABEL, DEFAULT_PROGRESSION, coinCapAt, skillBudget, skillPresets, expectedPower,
  validateCharacter, newEgoDraft, parseEffectText,
  type CharacterData, type DamageType, type DefenseKind, type Sin, type SkillDraft,
} from "@limbus/rules";
import { saveCharacter } from "@/app/characters/actions";
import { Button, Input } from "@/components/ui";
import { SinIcon, DamageIcon, DefenseIcon } from "@/components/icons";
import { Keyword } from "@/components/keyword/keyword";
import { PortraitUpload } from "./portrait-upload";
import { SkillEditor, Num } from "./skill-editor";
import { SkillCard } from "./skill-card";
import { EffectPreview } from "./effect-preview";

interface Props { id?: string; campaignId: string | null; initialName: string; initialPortrait: string | null; initial: CharacterData }

const STEPS = ["기본", "능력치", "특기", "스킬", "E.G.O", "확인"] as const;
const DEF_LABEL: Record<DefenseKind, string> = { guard: "가드", evade: "회피", counter: "반격" };
const field = "w-full rounded-md border border-border bg-elev px-3 py-2 text-sm outline-none focus:border-accent";

const TRAIT_EXAMPLES = [
  "매 라운드 시작 시 자신에게 호흡 1 부여",
  "합 승리 시 정신력 +5 (전투당 1회)",
  "체력 30% 미만이면 라운드 시작 시 자신에게 충전 3 부여",
  "뒷골목에서 자란 눈치 (판정 코인 +1, 서사)",
];
const SKILL_FX_EXAMPLES = ["앞면 적중 시 대상에게 출혈 2 부여", "적중 시 대상에게 파열 2 부여", "충전 5 이상이면 충전 5 소모하고 기본 위력 +4", "합 승리 시 자신에게 호흡 2 부여"];

export function CharacterWizard({ id, campaignId, initialName, initialPortrait, initial }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initialName);
  const [portrait, setPortrait] = useState<string | null>(initialPortrait);
  const [d, setD] = useState<CharacterData>(initial);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const p = DEFAULT_PROGRESSION;
  const issues = useMemo(() => validateCharacter(d).filter((i) => i.level === "error"), [d]);
  const statSum = SINS.reduce((a, s) => a + d.stats[s], 0);

  const stepErrors = (i: number): string[] => {
    if (i === 0) return name.trim() ? [] : ["이름을 입력하세요"];
    if (i === 1) return issues.filter((x) => x.path === "stats").map((x) => x.message);
    if (i === 2) return issues.filter((x) => x.path === "traits").map((x) => x.message);
    if (i === 3) return issues.filter((x) => x.path.startsWith("skills")).map((x) => x.message);
    if (i === 4) return issues.filter((x) => x.path.startsWith("ego")).map((x) => x.message);
    return [...(name.trim() ? [] : ["이름을 입력하세요"]), ...issues.map((x) => x.message)];
  };
  const canNext = stepErrors(step).length === 0;

  const submit = () => start(async () => {
    setServerError(null);
    const r = await saveCharacter({ id, campaignId, name, portraitUrl: portrait, data: d });
    if (r.error) { setServerError(r.error); return; }
    router.push(`/characters/${r.id}`); router.refresh();
  });

  return (
    <div className="space-y-4">
      {/* 진행 표시 */}
      <ol className="flex flex-wrap items-center gap-1 text-xs">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-1">
            <button type="button" onClick={() => { if (i <= step || id) setStep(i); }}
              className={`border px-2 py-1 ${i === step ? "border-accent text-accent" : i < step || id ? "border-border text-fg" : "border-border text-muted"}`}>
              {i + 1}. {s}
            </button>
            {i < STEPS.length - 1 ? <span className="text-muted">›</span> : null}
          </li>
        ))}
      </ol>

      <div className="panel p-4 sm:p-6">
        {step === 0 ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">누구입니까?</h2>
            <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
              <PortraitUpload value={portrait} onChange={setPortrait} />
              <div className="space-y-3">
                <label className="block"><span className="text-xs text-muted">이름</span><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="해결사의 이름" autoFocus /></label>
                <label className="block"><span className="text-xs text-muted">대사 한 줄 (선택) · 시트 맨 위에 크게 실립니다</span><Input value={d.quote ?? ""} onChange={(e) => setD({ ...d, quote: e.target.value })} placeholder="예: 퇴사 마렵네. 오늘인가?" /></label>
                <label className="block"><span className="text-xs text-muted">정체성 · 이 캐릭터를 한 줄로</span><Input value={d.identity ?? ""} onChange={(e) => setD({ ...d, identity: e.target.value })} placeholder="예: 날고 싶은 직장인" /></label>
                <div>
                  <span className="text-xs text-muted">면모 3개 · 성격, 과거, 관계 같은 서사 태그. GM이 빛 보상과 판정 보너스의 근거로 씁니다</span>
                  <div className="mt-1 grid gap-1 sm:grid-cols-3">
                    {[0, 1, 2].map((i) => <Input key={i} value={(d.aspects ?? ["", "", ""])[i] ?? ""} onChange={(e) => { const a = [...(d.aspects ?? ["", "", ""])]; a[i] = e.target.value; setD({ ...d, aspects: a }); }} placeholder={["예: 숨겨둔 반골기질", "예: 기약 없는 재단", "예: 묻어둔 다정함"][i]} />)}
                  </div>
                </div>
                <label className="block"><span className="text-xs text-muted">배경 (선택) · 시트 맨 아래 서사 칸</span>
                  <textarea value={d.background} onChange={(e) => setD({ ...d, background: e.target.value })} rows={4} className={field}
                    placeholder="출신(둥지·뒷골목·외곽), 소속이 있다면 어디, 해결사가 된 계기, 지키고 싶은 것. 길지 않아도 됩니다." /></label>
              </div>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div><h2 className="text-lg font-semibold">무엇에 끌립니까?</h2><p className="text-sm text-muted">죄악 7종에 {p.statPoints}포인트를 나눕니다. 각 {p.statMin}~{p.statMax}, {p.statMax}는 {p.statMaxCount}개까지. 비전투 판정에서 능력치만큼 코인을 던집니다.</p></div>
              <div className={`text-sm tabular-nums ${statSum === p.statPoints ? "text-ok" : "text-danger"}`}>남은 포인트 {p.statPoints - statSum}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {SINS.map((s) => (
                <div key={s} className="flex flex-col items-center border border-border p-2">
                  <SinIcon sin={s} size={28} />
                  <div className="mt-1 text-xs"><Keyword id={s}>{SIN_LABEL[s]}</Keyword></div>
                  <div className="my-1 text-3xl font-bold tabular-nums">{d.stats[s]}</div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => setD({ ...d, stats: { ...d.stats, [s]: Math.max(p.statMin, d.stats[s] - 1) } })} className="h-8 w-8 border border-border hover:bg-fg/5">−</button>
                    <button type="button" onClick={() => setD({ ...d, stats: { ...d.stats, [s]: Math.min(p.statMax, d.stats[s] + 1) } })} className="h-8 w-8 border border-border hover:bg-fg/5">+</button>
                  </div>
                  <div className="mt-1.5 flex gap-0.5">{Array.from({ length: p.statMax }).map((_, i) => <span key={i} className={`h-1.5 w-2.5 ${i < d.stats[s] ? "bg-gold" : "bg-fg/10"}`} />)}</div>
                </div>
              ))}
            </div>
            <div className="grid gap-1 text-xs text-muted sm:grid-cols-2">
              <span>분노 힘·위협 / 색욕 매력·유혹 / 나태 인내·침착 / 탐식 생명력·탐색</span>
              <span>우울 감수성·통찰 / 오만 지성·설득 / 질투 민첩·눈치</span>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">무엇이 특별합니까?</h2>
            <p className="text-sm text-muted">특기 {p.traitsAtCreation}개. 상황에 맞으면 판정에 코인 +1. 규칙 형태로 적으면 전투에서 자동으로 발동합니다.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {d.traits.map((t, i) => (
                <div key={t.id} className="space-y-2 border border-border p-3">
                  <Input value={t.name} onChange={(e) => setD({ ...d, traits: d.traits.map((x) => (x.id === t.id ? { ...x, name: e.target.value } : x)) })} placeholder={`특기 ${i + 1} 이름 (예: 흔들리지 않는 호흡)`} />
                  <textarea value={t.description} onChange={(e) => setD({ ...d, traits: d.traits.map((x) => (x.id === t.id ? { ...x, description: e.target.value } : x)) })} rows={2} className={field} placeholder="무엇을 하는 특기인지 한 문장" />
                  <EffectPreview text={t.description} mode="passive" />
                </div>
              ))}
            </div>
            <div className="text-xs text-muted">예시를 눌러 넣기:
              <div className="mt-1 flex flex-wrap gap-1">
                {TRAIT_EXAMPLES.map((ex) => <button key={ex} type="button" className="border border-border px-2 py-0.5 hover:border-fg/40" onClick={() => { const empty = d.traits.find((x) => !x.description.trim()) ?? d.traits[0]!; setD({ ...d, traits: d.traits.map((x) => (x.id === empty.id ? { ...x, description: ex.replace(/ \(.*\)$/, "") } : x)) }); }}>{ex}</button>)}
              </div>
            </div>
          </div>
        ) : null}

        {step === 3 ? <SkillStep d={d} setD={setD} /> : null}

        {step === 4 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div><h2 className="text-lg font-semibold"><Keyword id="ego">E.G.O</Keyword></h2><p className="text-sm text-muted">처음에는 보통 없습니다. GM이 서사로 열어줄 때 추가하세요. 건너뛰어도 됩니다.</p></div>
              <Button variant="ghost" onClick={() => setD({ ...d, ego: [...d.ego, newEgoDraft()] })}>+ E.G.O 추가</Button>
            </div>
            {d.ego.map((e) => (
              <div key={e.id} className="space-y-2">
                <SkillEditor s={e} ro={false} coinCap={14} label="E.G.O" onChange={(patch) => setD({ ...d, ego: d.ego.map((x) => (x.id === e.id ? { ...x, ...patch } : x)) })} onRemove={() => setD({ ...d, ego: d.ego.filter((x) => x.id !== e.id) })} />
                <div className="grid grid-cols-3 gap-2 px-3">
                  <Num label="정신력 소모" value={e.ego?.sanityCost ?? 20} min={0} ro={false} onChange={(v) => setD({ ...d, ego: d.ego.map((x) => (x.id === e.id ? { ...x, ego: { ...(x.ego ?? { sanityCost: 20, erosionGain: 10, usesPerCombat: 1 }), sanityCost: v } } : x)) })} />
                  <Num label="침식도 증가" value={e.ego?.erosionGain ?? 10} min={0} ro={false} onChange={(v) => setD({ ...d, ego: d.ego.map((x) => (x.id === e.id ? { ...x, ego: { ...(x.ego ?? { sanityCost: 20, erosionGain: 10, usesPerCombat: 1 }), erosionGain: v } } : x)) })} />
                  <Num label="전투당 횟수" value={e.ego?.usesPerCombat ?? 1} min={1} ro={false} onChange={(v) => setD({ ...d, ego: d.ego.map((x) => (x.id === e.id ? { ...x, ego: { ...(x.ego ?? { sanityCost: 20, erosionGain: 10, usesPerCombat: 1 }), usesPerCombat: v } } : x)) })} />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {step === 5 ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">이대로 {id ? "저장" : "등록"}할까요?</h2>
            <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
              <div className="h-32 w-32 overflow-hidden border-2 border-gold/70 bg-fg/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {portrait ? <img src={portrait} alt="" className="h-full w-full object-cover" /> : null}
              </div>
              <div>
                <div className="text-2xl font-bold">{name || "(이름 없음)"}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-sm">{SINS.map((s) => <span key={s} className="inline-flex items-center gap-1"><SinIcon sin={s} size={16} />{d.stats[s]}</span>)}</div>
                <div className="mt-2 text-sm">{d.traits.map((t) => t.name).filter(Boolean).join(" · ") || <span className="text-muted">특기 없음</span>}</div>
              </div>
            </div>
            <div className="grid gap-2 lg:grid-cols-2">{d.skills.map((s) => <SkillCard key={s.id} s={s} label={s.kind === "defense" ? "방어" : `스킬 ${s.tier}`} compact />)}{d.ego.map((e) => <SkillCard key={e.id} s={e} label="E.G.O" compact />)}</div>
            <label className="block"><span className="text-xs text-muted">소지품 (선택)</span><textarea value={d.inventory} onChange={(e) => setD({ ...d, inventory: e.target.value })} rows={2} className={field} placeholder="자유 기입" /></label>
            {stepErrors(5).length ? <ul className="text-xs text-danger">{stepErrors(5).map((e, i) => <li key={i}>{e}</li>)}</ul> : <p className="text-xs text-muted">{id ? "저장하면 바로 반영됩니다." : "등록하면 GM 승인 대기 상태가 됩니다. 승인 전에도 수정할 수 있습니다."}</p>}
            {serverError ? <p className="text-xs text-danger">{serverError}</p> : null}
          </div>
        ) : null}
      </div>

      {/* 이동 */}
      <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t border-border bg-bg/90 px-4 py-3 backdrop-blur">
        <Button variant="ghost" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>이전</Button>
        <div className="min-w-0 flex-1 truncate text-xs text-danger">{stepErrors(step)[0] ?? ""}</div>
        {step < STEPS.length - 1
          ? <Button onClick={() => setStep(step + 1)} disabled={!canNext}>{step === 4 && d.ego.length === 0 ? "건너뛰기" : "다음"}</Button>
          : <Button onClick={submit} disabled={pending || stepErrors(5).length > 0}>{pending ? "저장 중..." : id ? "저장" : "등록"}</Button>}
      </div>
    </div>
  );
}

/* ---------- 스킬 단계: 틀 고르기 + 꾸미기 ---------- */
function SkillStep({ d, setD }: { d: CharacterData; setD: (d: CharacterData) => void }) {
  const [cur, setCur] = useState(0);
  const [advanced, setAdvanced] = useState<Record<string, boolean>>({});
  const s = d.skills[cur]!;
  const tier = s.kind === "defense" ? "defense" : (s.tier ?? 1);
  const presets = skillPresets(tier, d.level);
  const budget = skillBudget(tier, d.level);
  const cap = coinCapAt(d.level);
  const ev = expectedPower(s.basePower, s.coinPower, s.coinCount);
  const matched = presets.find((x) => x.basePower === s.basePower && x.coinPower === s.coinPower && x.coinCount === s.coinCount)?.key;
  const set = (patch: Partial<SkillDraft>) => setD({ ...d, skills: d.skills.map((x) => (x.id === s.id ? { ...x, ...patch } : x)) });
  const done = (x: SkillDraft) => !!x.name.trim() && expectedPower(x.basePower, x.coinPower, x.coinCount) <= skillBudget(x.kind === "defense" ? "defense" : (x.tier ?? 1), d.level);
  return (
    <div className="space-y-4">
      <div><h2 className="text-lg font-semibold">어떻게 싸웁니까?</h2><p className="text-sm text-muted">공격 스킬 3개와 방어 스킬 1개. 틀을 고르고 이름과 속성을 정하면 됩니다. 숫자를 직접 만지고 싶으면 「직접 조정」.</p></div>
      <div className="flex flex-wrap gap-1">
        {d.skills.map((x, i) => (
          <button key={x.id} type="button" onClick={() => setCur(i)} className={`border px-3 py-1.5 text-sm ${i === cur ? "border-accent text-accent" : "border-border"}`}>
            {x.kind === "defense" ? "방어" : `스킬 ${x.tier}`} {done(x) ? <span className="text-ok">✓</span> : <span className="text-muted">·</span>}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <div>
            <div className="mb-1 text-xs text-muted">1. 틀 고르기 <span className="ml-1">(이 스킬의 <Keyword id="skillbudget">기대 위력</Keyword> 상한 {budget})</span></div>
            <div className="grid gap-2 sm:grid-cols-2">
              {presets.map((pr) => (
                <button key={pr.key} type="button" onClick={() => { set({ basePower: pr.basePower, coinPower: pr.coinPower, coinCount: pr.coinCount }); setAdvanced({ ...advanced, [s.id]: false }); }}
                  className={`border p-3 text-left ${matched === pr.key ? "border-accent bg-accent/5" : "border-border hover:border-fg/40"}`}>
                  <div className="flex items-center justify-between"><b>{pr.label}</b><span className="font-mono text-xs text-muted">{pr.basePower} {pr.coinPower >= 0 ? "+" : ""}{pr.coinPower} ×{pr.coinCount}</span></div>
                  <div className="mt-0.5 text-xs text-muted">{pr.desc}</div>
                  <div className="mt-1 font-mono text-[11px] text-muted">{[pr.basePower, ...Array.from({ length: pr.coinCount }, (_, i) => pr.basePower + pr.coinPower * (i + 1))].join(" → ")}</div>
                </button>
              ))}
            </div>
            <button type="button" className="mt-2 text-xs text-muted underline" onClick={() => setAdvanced({ ...advanced, [s.id]: !advanced[s.id] })}>{advanced[s.id] ? "직접 조정 닫기" : "직접 조정"}</button>
            {advanced[s.id] ? <div className="mt-2"><SkillEditor s={s} ro={false} coinCap={cap} budget={budget} label={s.kind === "defense" ? "방어" : `스킬 ${s.tier}`} onChange={set} /></div> : null}
          </div>
          {!advanced[s.id] ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block"><span className="text-xs text-muted">2. 이름</span><Input value={s.name} onChange={(e) => set({ name: e.target.value })} placeholder={s.kind === "defense" ? "예: 흘려내기" : "예: 베기"} /></label>
              <div><span className="text-xs text-muted">스킬 이미지 (선택)</span><div className="mt-1"><PortraitUpload value={s.imageUrl ?? null} onChange={(u) => set({ imageUrl: u })} label="이미지" size="h-16 w-16" hint="카드 왼쪽에 들어갑니다" /></div></div>
              <div>
                <span className="text-xs text-muted">3. {s.kind === "defense" ? "방어 종류" : "피해 유형"}</span>
                <div className="mt-1 flex gap-1">
                  {s.kind === "defense"
                    ? (Object.keys(DEF_LABEL) as DefenseKind[]).map((k) => <button key={k} type="button" onClick={() => set({ defenseKind: k })} className={`flex items-center gap-1 border px-2 py-1 text-xs ${s.defenseKind === k ? "border-accent" : "border-border"}`}><DefenseIcon kind={k} size={16} />{DEF_LABEL[k]}</button>)
                    : (Object.keys(DAMAGE_TYPE_LABEL) as DamageType[]).map((k) => <button key={k} type="button" onClick={() => set({ damageType: k })} className={`flex items-center gap-1 border px-2 py-1 text-xs ${s.damageType === k ? "border-accent" : "border-border"}`}><DamageIcon type={k} size={16} />{DAMAGE_TYPE_LABEL[k]}</button>)}
                </div>
              </div>
              <div className="sm:col-span-2">
                <span className="text-xs text-muted">4. 죄악 속성</span>
                <div className="mt-1 flex flex-wrap gap-1">
                  {SINS.map((k) => <button key={k} type="button" onClick={() => set({ sin: k as Sin })} className={`flex items-center gap-1 border px-2 py-1 text-xs ${s.sin === k ? "border-accent" : "border-border"}`}><SinIcon sin={k} size={16} />{SIN_LABEL[k]}</button>)}
                </div>
              </div>
              <div className="sm:col-span-2">
                <span className="text-xs text-muted">5. 부가 효과 (선택)</span>
                <textarea value={s.effectText} onChange={(e) => set({ effectText: e.target.value })} rows={1} className={field} placeholder="예: 앞면 적중 시 대상에게 출혈 2 부여" />
                <EffectPreview text={s.effectText} mode="skill" />
                <div className="mt-1 flex flex-wrap gap-1 text-[11px]">{SKILL_FX_EXAMPLES.map((ex) => <button key={ex} type="button" className="border border-border px-1.5 py-0.5 text-muted hover:text-fg" onClick={() => set({ effectText: ex })}>{ex}</button>)}</div>
              </div>
            </div>
          ) : null}
        </div>
        <div className="space-y-2">
          <div className="text-xs text-muted">미리보기 <span className={ev > budget ? "text-danger" : ""}>기대 위력 {ev.toFixed(1)} / {budget}</span></div>
          <SkillCard s={s} label={s.kind === "defense" ? "방어" : `스킬 ${s.tier}`} />
          <p className="text-[11px] text-muted">공격 스킬은 <Keyword id="hand">덱</Keyword>에 스킬1 3장, 스킬2 2장, 스킬3 1장이 들어갑니다. 강한 스킬일수록 드물게 나옵니다. {parseEffectText(s.effectText || "", "skill").unparsed.length ? "해석되지 않은 효과는 GM이 수동 적용합니다." : ""}</p>
          <div className="flex justify-end gap-1">
            <Button variant="ghost" className="px-2 py-1 text-xs" disabled={cur === 0} onClick={() => setCur(cur - 1)}>이전 스킬</Button>
            <Button variant="ghost" className="px-2 py-1 text-xs" disabled={cur === d.skills.length - 1} onClick={() => setCur(cur + 1)}>다음 스킬</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
