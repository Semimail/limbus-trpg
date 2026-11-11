"use client";
import { useState } from "react";
import Link from "next/link";
import type { CharacterData, SkillDraft } from "@limbus/rules";
import { SINS, SIN_LABEL, DAMAGE_TYPE_LABEL, DEFAULT_PROGRESSION, DEFAULT_RULES, gradeOf, coinCapAt, describeEffect } from "@limbus/rules";
import { SinIcon, DamageIcon, DefenseIcon, CoinIcon } from "@/components/icons";
import { Keyword, KeywordText } from "@/components/keyword/keyword";
import { GmPanel } from "./gm-panel";
import { Button } from "@/components/ui";

interface Props {
  id: string; name: string; portraitUrl: string | null; data: CharacterData; approved: boolean; locked: boolean;
  ownerName: string; campaignName: string | null; campaignId: string | null;
  canEdit: boolean; isOwner: boolean; isGm: boolean; onDelete?: () => void;
}

const DEF_LABEL: Record<string, string> = { guard: "가드", evade: "회피", counter: "반격" };

export function SheetView({ id, name, portraitUrl, data: d, approved, locked, ownerName, campaignName, campaignId, canEdit, isOwner, isGm, onDelete }: Props) {
  const [gmOpen, setGmOpen] = useState(false);
  const grade = gradeOf(d.level);
  const hpPct = Math.max(0, Math.min(100, (d.hp / d.maxHp) * 100));
  const aspects = (d.aspects ?? ["", "", ""]).slice(0, 3);
  const dice = d.sync >= 3 ? 2 : d.speed.dice;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-3">
          {campaignId ? <Link href={`/campaigns/${campaignId}`} className="text-muted hover:text-fg">← 사무소</Link> : <Link href="/characters" className="text-muted hover:text-fg">← 내 캐릭터</Link>}
          <span className="text-xs text-muted">{approved ? "승인됨" : "승인 대기"}{locked ? " · 전투 중 잠금" : ""}</span>
        </div>
        <div className="flex items-center gap-2">
          {isGm ? <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setGmOpen(!gmOpen)}>{gmOpen ? "GM 조정 닫기" : "GM 조정"}</Button> : null}
          {canEdit ? <Link href={`/characters/${id}/edit`}><Button variant="ghost" className="px-3 py-1 text-xs">편집</Button></Link> : null}
          {isOwner && onDelete ? <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => { if (confirm(`"${name}"을(를) 삭제할까요? 되돌릴 수 없습니다.`)) onDelete(); }}>삭제</Button> : null}
        </div>
      </div>
      {gmOpen && isGm ? <GmPanel characterId={id} data={d} approved={approved} /> : null}

      {/* ===== 포스터 시트 ===== */}
      <div className="sheet -mx-4 px-3 py-4 sm:mx-0 sm:px-5 sm:py-5">
        <div className="s-rule mb-3" />
        {/* 상단 3열: 대사+초상화+정체성/면모 | 이름·등급·수치 | 특기 */}
        <div className="grid gap-3 lg:grid-cols-[17rem_1fr_15rem]">
          {/* 왼쪽 */}
          <div className="space-y-3">
            <div className="s-box s-cut px-3 py-3 text-center text-sm italic leading-relaxed">
              {d.quote ? <>&ldquo;<KeywordText text={d.quote} />&rdquo;</> : <span style={{ color: "var(--s-muted)" }}>대사 한 줄</span>}
            </div>
            <div className="s-box aspect-square w-full overflow-hidden" style={{ borderColor: "var(--s-gold)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {portraitUrl ? <img src={portraitUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs" style={{ color: "var(--s-muted)" }}>초상화</div>}
            </div>
          </div>

          {/* 가운데 */}
          <div className="space-y-3">
            <div className="s-box grid grid-cols-[1fr_auto] items-stretch">
              <div className="px-4 py-3">
                <div className="text-[11px] tracking-widest" style={{ color: "var(--s-muted)" }}>{campaignName ?? "캠페인 미참가"} · {ownerName}</div>
                <div className="mt-0.5 text-3xl font-extrabold tracking-tight">{name}</div>
              </div>
              <div className="flex flex-col items-center justify-center border-l px-4" style={{ borderColor: "var(--s-line)" }}>
                <div className="text-[10px] tracking-widest" style={{ color: "var(--s-muted)" }}>위험 등급</div>
                <div className="s-gold text-xl font-extrabold"><Keyword id="grade" className="border-0 text-inherit">{grade}</Keyword></div>
                <div className="text-[11px]" style={{ color: "var(--s-muted)" }}>Lv.{d.level} · <Keyword id="sync" className="border-0 text-inherit">동기화</Keyword> {d.sync}</div>
              </div>
            </div>

            {/* 능력치 표 */}
            <div className="s-box">
              <div className="s-label px-3 py-1">능력치 · 죄악</div>
              <div className="grid grid-cols-7">
                {SINS.map((s) => (
                  <div key={s} className="s-cell flex flex-col items-center py-2">
                    <SinIcon sin={s} size={22} />
                    <div className="mt-0.5 text-[11px]"><Keyword id={s} className="border-0 text-inherit">{SIN_LABEL[s]}</Keyword></div>
                    <div className="text-xl font-extrabold tabular-nums">{d.stats[s]}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* 체력 / 정신력 / 속도 / 빛 / 내성 */}
            <div className="s-box grid grid-cols-2 sm:grid-cols-4">
              <Stat label="체력" value={`${d.hp} / ${d.maxHp}`} />
              <Stat label="정신력" kw="sanity" value={`${d.sanity > 0 ? "+" : ""}${d.sanity} / 45`} />
              <Stat label="속도" kw="speed" value={`${d.speed.min}~${d.speed.max} ×${dice}`} />
              <Stat label="빛" kw="light" value={`${d.light} / ${DEFAULT_PROGRESSION.lightPerSession}`} />
              <Stat label="침식도" kw="erosion" value={`${d.erosion} / ${DEFAULT_RULES.erosionMax}`} />
              <Stat label="코인 상한" kw="coin" value={`${coinCapAt(d.level)}`} />
              <div className="s-cell col-span-2 flex items-center gap-2 px-3 py-2 text-xs">
                <span style={{ color: "var(--s-muted)" }}><Keyword id="resist" className="border-0 text-inherit">내성</Keyword></span>
                {(Object.keys(DAMAGE_TYPE_LABEL) as (keyof typeof DAMAGE_TYPE_LABEL)[]).map((t) => <span key={t} className="inline-flex items-center gap-1"><DamageIcon type={t} size={14} />보통</span>)}
              </div>
              {/* 체력 바 + 흐트러짐 선 */}
              <div className="s-cell col-span-2 px-3 py-2 sm:col-span-4">
                <div className="flex justify-between text-[11px]" style={{ color: "var(--s-muted)" }}><span><Keyword id="stagger" className="border-0 text-inherit">흐트러짐</Keyword> 구간 50% · 30%</span><span>{Math.round(hpPct)}%</span></div>
                <div className="relative mt-1 h-3 w-full" style={{ background: "#2a1414" }}>
                  <div className="h-full" style={{ width: `${hpPct}%`, background: "var(--s-red)" }} />
                  {DEFAULT_RULES.staggerThresholds.map((t) => <div key={t} className="absolute top-0 h-full w-px" style={{ left: `${t * 100}%`, background: "var(--s-gold)" }} />)}
                </div>
              </div>
            </div>

            {/* 정체성 · 면모 */}
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr]">
              <div className="sm:col-span-3"><Field label="정체성" value={d.identity} /></div>
              {aspects.map((a, i) => <Field key={i} label={`면모 ${i + 1}`} value={a} />)}
            </div>
          </div>

          {/* 오른쪽: 특기 */}
          <div className="space-y-2">
            {d.traits.map((t) => (
              <div key={t.id} className="s-box">
                <div className="s-label px-2 py-1"><Keyword id="trait" className="border-0 text-inherit">특기</Keyword> · {t.name || "(이름 없음)"}</div>
                <div className="px-2 py-2 text-xs leading-relaxed">
                  {t.description ? <KeywordText text={t.description} /> : <span style={{ color: "var(--s-muted)" }}>설명 없음</span>}
                  {t.effects?.length ? <div className="mt-1 text-[10px]" style={{ color: "#7fc28a" }}>{t.effects.map((e, i) => <div key={i}>자동 · {describeEffect(e)}</div>)}</div> : null}
                </div>
              </div>
            ))}
            {Array.from({ length: Math.max(0, 4 - d.traits.length) }).map((_, i) => (
              <div key={`e${i}`} className="s-box"><div className="s-label px-2 py-1">특기</div><div className="px-2 py-3 text-center text-[11px]" style={{ color: "var(--s-muted)" }}>등급 상승 시 해금</div></div>
            ))}
          </div>
        </div>

        <div className="s-rule my-4" />

        {/* 스킬 카드 */}
        <div className="grid gap-3 lg:grid-cols-2">
          {d.skills.map((s) => <PosterSkill key={s.id} s={s} label={s.kind === "defense" ? "방어" : `스킬 ${s.tier}`} />)}
        </div>
        {d.ego.length ? (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {d.ego.map((e) => <PosterSkill key={e.id} s={e} label="E.G.O" gold />)}
          </div>
        ) : null}

        <div className="s-rule my-4" />

        {/* 서사 */}
        <div className="s-box px-4 py-4 text-sm leading-relaxed">
          {d.background ? <p className="whitespace-pre-wrap text-center">{d.background}</p> : <p className="text-center" style={{ color: "var(--s-muted)" }}>배경 서사가 아직 없습니다.</p>}
          {d.inventory ? <><div className="s-rule my-3 opacity-60" /><div className="text-[11px] tracking-widest" style={{ color: "var(--s-muted)" }}>소지품</div><p className="mt-1 whitespace-pre-wrap">{d.inventory}</p></> : null}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="s-box">
      <div className="s-label px-2 py-1">{label}</div>
      <div className="px-2 py-2 text-center text-sm">{value ? <KeywordText text={value} /> : <span style={{ color: "var(--s-muted)" }}>—</span>}</div>
    </div>
  );
}
function Stat({ label, value, kw }: { label: string; value: string; kw?: string }) {
  return (
    <div className="s-cell flex items-center justify-between px-3 py-2">
      <span className="text-[11px]" style={{ color: "var(--s-muted)" }}>{kw ? <Keyword id={kw} className="border-0 text-inherit">{label}</Keyword> : label}</span>
      <span className="text-sm font-bold tabular-nums">{value}</span>
    </div>
  );
}

function PosterSkill({ s, label, gold = false }: { s: SkillDraft; label: string; gold?: boolean }) {
  const flow = [s.basePower, ...Array.from({ length: s.coinCount }, (_, i) => s.basePower + s.coinPower * (i + 1))];
  return (
    <div className="grid grid-cols-[5.5rem_1fr]">
      {/* 왼쪽: 이미지 + 피해 유형 */}
      <div className="flex flex-col gap-2">
        <div className="s-box aspect-square overflow-hidden" style={gold ? { borderColor: "var(--s-gold)" } : undefined}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {s.imageUrl ? <img src={s.imageUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><SinIcon sin={s.sin} size={36} /></div>}
        </div>
        <div className="flex flex-1 items-center justify-center">
          {s.kind === "defense" ? <DefenseIcon kind={s.defenseKind ?? "guard"} size={44} className="opacity-90" /> : <DamageIcon type={s.damageType} size={44} className="opacity-90" />}
        </div>
      </div>
      {/* 오른쪽: 띠 + 수치 + 효과 */}
      <div className="s-box flex flex-col" style={gold ? { borderColor: "var(--s-gold)" } : undefined}>
        <div className="flex items-center gap-2 px-2 pt-1 text-[10px]" style={{ color: "var(--s-muted)" }}>
          <span className="s-gold font-bold">{label}</span>
          <span>{s.kind === "defense" ? <Keyword id={s.defenseKind ?? "guard"} className="border-0 text-inherit">{DEF_LABEL[s.defenseKind ?? "guard"]}</Keyword> : <Keyword id={s.damageType} className="border-0 text-inherit">{DAMAGE_TYPE_LABEL[s.damageType]}</Keyword>}</span>
          <span><Keyword id={s.sin} className="border-0 text-inherit">{SIN_LABEL[s.sin]}</Keyword></span>
          <span className="ml-auto inline-flex gap-0.5">{Array.from({ length: s.coinCount }).map((_, i) => <CoinIcon key={i} heads size={13} />)}</span>
        </div>
        <div className={`${gold ? "s-banner-gold" : "s-banner"} mt-1 px-3 py-1.5`}>{s.name || "(이름 없음)"}</div>
        <div className="grid grid-cols-6 text-center text-xs">
          <div className="s-cell s-label whitespace-nowrap py-1 text-[10px] sm:text-[11px]">기본 위력</div><div className="s-cell py-1 font-bold tabular-nums">{s.basePower}</div>
          <div className="s-cell s-label whitespace-nowrap py-1 text-[10px] sm:text-[11px]">코인 위력</div><div className="s-cell py-1 font-bold tabular-nums">{s.coinPower >= 0 ? "+" : ""}{s.coinPower}</div>
          <div className="s-cell s-label whitespace-nowrap py-1 text-[10px] sm:text-[11px]">코인 개수</div><div className="s-cell py-1 font-bold tabular-nums">{s.coinCount}</div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-3 py-3 text-center text-xs leading-relaxed">
          {s.effectText ? <KeywordText text={s.effectText} /> : <span style={{ color: "var(--s-muted)" }}>부가 효과 없음</span>}
          {s.ego ? <div className="s-gold mt-1 text-[11px]">정신력 −{s.ego.sanityCost} · 침식도 +{s.ego.erosionGain} · 전투당 {s.ego.usesPerCombat}회</div> : null}
        </div>
        <div className="px-3 pb-1.5 text-right font-mono text-[10px]" style={{ color: "var(--s-muted)" }}>{flow.join(" → ")}</div>
      </div>
    </div>
  );
}
