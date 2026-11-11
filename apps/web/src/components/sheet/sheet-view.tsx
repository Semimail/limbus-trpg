"use client";
import { useState } from "react";
import Link from "next/link";
import type { CharacterData } from "@limbus/rules";
import { SINS, SIN_LABEL, DEFAULT_PROGRESSION, gradeOf, coinCapAt, describeEffect } from "@limbus/rules";
import { SinIcon } from "@/components/icons";
import { Keyword, KeywordText } from "@/components/keyword/keyword";
import { SkillCard } from "./skill-card";
import { GmPanel } from "./gm-panel";
import { Button } from "@/components/ui";

interface Props {
  id: string; name: string; portraitUrl: string | null; data: CharacterData; approved: boolean; locked: boolean;
  ownerName: string; campaignName: string | null; campaignId: string | null;
  canEdit: boolean; isOwner: boolean; isGm: boolean;
  onDelete?: () => void;
}

export function SheetView({ id, name, portraitUrl, data: d, approved, locked, ownerName, campaignName, campaignId, canEdit, isOwner, isGm, onDelete }: Props) {
  const [gmOpen, setGmOpen] = useState(false);
  const grade = gradeOf(d.level);
  const hpPct = Math.max(0, Math.min(100, (d.hp / d.maxHp) * 100));
  const sanPct = Math.max(0, Math.min(100, ((d.sanity + 45) / 90) * 100));
  const p = DEFAULT_PROGRESSION;
  return (
    <div className="space-y-4">
      {/* 상단 바 */}
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

      {/* 히어로 */}
      <section className="panel relative overflow-hidden p-4 sm:p-6">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ background: "radial-gradient(60% 80% at 100% 0%, var(--accent), transparent 60%)" }} />
        <div className="relative grid gap-5 sm:grid-cols-[11rem_1fr]">
          <div className="mx-auto h-44 w-44 shrink-0 overflow-hidden border-2 border-gold/70 bg-fg/10 sm:mx-0" style={{ clipPath: "polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {portraitUrl ? <img src={portraitUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-muted">초상화 없음</div>}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="stamp"><Keyword id="grade" className="border-0 text-gold">{grade}</Keyword></span>
              <span className="text-xs text-muted">Lv.{d.level} · <Keyword id="sync">동기화</Keyword> {d.sync}단계</span>
            </div>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">{name}</h1>
            <p className="text-sm text-muted">{ownerName}{campaignName ? ` · ${campaignName}` : " · 캠페인 미참가"}</p>
            <div className="mt-4 space-y-2">
              <Gauge label="체력" value={`${d.hp} / ${d.maxHp}`} pct={hpPct} color="bg-danger" />
              <Gauge label="정신력" kw="sanity" value={`${d.sanity > 0 ? "+" : ""}${d.sanity}`} pct={sanPct} color="bg-gold" />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Chip kw="light" label="빛" value={d.light} />
              <Chip kw="erosion" label="침식도" value={d.erosion} />
              <Chip kw="speed" label="속도" value={`${d.speed.min}~${d.speed.max} ×${d.sync >= 3 ? 2 : d.speed.dice}`} />
              <Chip kw="coin" label="코인 상한" value={coinCapAt(d.level)} />
            </div>
          </div>
        </div>
      </section>

      {/* 능력치 */}
      <section className="panel p-4">
        <h2 className="mb-3 text-sm font-semibold">능력치 <span className="text-xs font-normal text-muted">죄악 7종 · 합 {SINS.reduce((a, s) => a + d.stats[s], 0)}</span></h2>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {SINS.map((s) => (
            <div key={s} className="flex flex-col items-center border border-border px-1 py-2">
              <SinIcon sin={s} size={26} />
              <div className="mt-1 text-[11px]"><Keyword id={s}>{SIN_LABEL[s]}</Keyword></div>
              <div className="text-2xl font-bold tabular-nums">{d.stats[s]}</div>
              <div className="mt-1 flex gap-0.5">{Array.from({ length: p.statMax }).map((_, i) => <span key={i} className={`h-1.5 w-2.5 ${i < d.stats[s] ? "bg-gold" : "bg-fg/10"}`} />)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 특기 */}
      <section className="panel p-4">
        <h2 className="mb-3 text-sm font-semibold"><Keyword id="trait">특기</Keyword></h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {d.traits.map((t) => (
            <div key={t.id} className="border border-border p-3">
              <div className="font-semibold">{t.name || <span className="text-muted">(이름 없음)</span>}</div>
              {t.description ? <p className="mt-1 text-sm text-muted"><KeywordText text={t.description} /></p> : null}
              {t.effects?.length ? <ul className="mt-1 space-y-0.5 text-[11px] text-ok">{t.effects.map((e, i) => <li key={i}>자동 · <KeywordText text={describeEffect(e)} /></li>)}</ul> : null}
            </div>
          ))}
        </div>
      </section>

      {/* 스킬 */}
      <section className="panel p-4">
        <h2 className="mb-3 text-sm font-semibold">스킬 <span className="text-xs font-normal text-muted"><Keyword id="hand">덱</Keyword> 3:2:1 · 방어는 항상</span></h2>
        <div className="grid gap-2 lg:grid-cols-2">
          {d.skills.map((s) => <SkillCard key={s.id} s={s} label={s.kind === "defense" ? "방어" : `스킬 ${s.tier}`} />)}
        </div>
      </section>

      {/* E.G.O */}
      <section className="panel p-4">
        <h2 className="mb-3 text-sm font-semibold"><Keyword id="ego">E.G.O</Keyword></h2>
        {d.ego.length === 0 ? <p className="text-sm text-muted">아직 발현한 E.G.O가 없습니다.</p> : <div className="grid gap-2 lg:grid-cols-2">{d.ego.map((e) => <SkillCard key={e.id} s={e} label="E.G.O" />)}</div>}
      </section>

      {/* 서사 */}
      {(d.background || d.inventory || d.notes) ? (
        <section className="grid gap-4 sm:grid-cols-2">
          {d.background ? <div className="panel p-4"><h2 className="mb-2 text-sm font-semibold">배경</h2><p className="whitespace-pre-wrap text-sm leading-relaxed">{d.background}</p></div> : null}
          {d.inventory ? <div className="panel p-4"><h2 className="mb-2 text-sm font-semibold">소지품</h2><p className="whitespace-pre-wrap text-sm leading-relaxed">{d.inventory}</p></div> : null}
        </section>
      ) : null}
    </div>
  );
}

function Gauge({ label, value, pct, color, kw }: { label: string; value: string; pct: number; color: string; kw?: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs"><span className="text-muted">{kw ? <Keyword id={kw}>{label}</Keyword> : label}</span><span className="tabular-nums">{value}</span></div>
      <div className="mt-0.5 h-2.5 w-full bg-fg/10"><div className={`h-full ${color}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
function Chip({ label, value, kw }: { label: string; value: string | number; kw: string }) {
  return <span className="border border-border px-2 py-0.5"><Keyword id={kw} className="text-muted">{label}</Keyword> <b className="tabular-nums">{value}</b></span>;
}
