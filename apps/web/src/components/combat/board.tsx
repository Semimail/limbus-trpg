"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { STATUS_IDS, slotKey, isCorroded, type CombatState, type Unit, type StatusId, type Skill } from "@limbus/rules";
import { setPickAction, resolveRoundAction, endCombatAction, gmAdjustUnitAction, redrawHandAction } from "@/app/campaigns/[id]/sessions/[sid]/combat-actions";
import { formatRound, unitNames } from "@/lib/combat-log";
import { Button } from "@/components/ui";
import { SinIcon, DamageIcon, DefenseIcon, CoinIcon, StatusBadge, StatusIcon } from "@/components/icons";
import { Keyword, KeywordText } from "@/components/keyword/keyword";

interface Props { campaignId: string; combatId: string; initial: CombatState; meId: string; isGm: boolean }

export function CombatBoard({ campaignId, combatId, initial, meId, isGm }: Props) {
  const router = useRouter();
  const [state, setState] = useState<CombatState>(initial);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase.channel(`combat:${combatId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "combats", filter: `id=eq.${combatId}` },
        (p) => { const s = (p.new as { state?: CombatState }).state; if (s) setState(s); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [combatId]);

  const names = useMemo(() => unitNames(state), [state]);
  const allies = state.units.filter((u) => u.side === "ally");
  const enemies = state.units.filter((u) => u.side === "enemy");
  const mine = (u: Unit) => isGm || (u.source.kind === "character" && u.source.ownerId === meId);
  const mySlots = state.slots.filter((s) => { const u = state.units.find((x) => x.id === s.combatantId)!; return u.side === "ally" && mine(u); });
  const unpicked = mySlots.filter((s) => !state.picks[slotKey(s.combatantId, s.slot)]);
  const allyUnpicked = state.slots.filter((s) => state.units.find((x) => x.id === s.combatantId)!.side === "ally" && !state.picks[slotKey(s.combatantId, s.slot)]);

  const act = (fn: () => Promise<{ error?: string; state?: CombatState }>) => start(async () => { setErr(null); const r = await fn(); if (r.error) setErr(r.error); if (r.state) setState(r.state); });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="stamp">라운드 {state.round}</span>
        <span className="text-muted">{state.phase === "select" ? "스킬 선택 중" : state.phase === "ended" ? (state.winner === "ally" ? "종료 · 아군 승리" : "종료 · 아군 패배") : "처리 중"}</span>
        {state.phase === "select" ? <span className="text-xs text-muted">미선택 아군 슬롯 {allyUnpicked.length}</span> : null}
        {isGm && state.phase === "select" ? (
          <span className="ml-auto flex gap-2">
            <Button onClick={() => act(() => resolveRoundAction(campaignId, combatId))} disabled={pending}>{pending ? "처리 중..." : "라운드 진행"}</Button>
            <Button variant="ghost" onClick={() => { if (confirm("전투를 종료할까요? 체력과 정신력이 캐릭터에 반영됩니다.")) act(() => endCombatAction(campaignId, combatId)); }} disabled={pending}>전투 종료</Button>
          </span>
        ) : null}
        {isGm && state.phase === "ended" ? <span className="ml-auto"><Button variant="ghost" onClick={() => router.refresh()}>닫기</Button></span> : null}
      </div>
      {err ? <p className="text-xs text-danger">{err}</p> : null}
      {state.notices?.length ? (
        <ul className="space-y-0.5 border-l-2 border-gold bg-gold/5 px-2 py-1 text-xs">
          {state.notices.map((n, i) => <li key={i}><KeywordText text={n} /></li>)}
        </ul>
      ) : null}

      <div className="space-y-2">
        <Row units={enemies} state={state} isGm={isGm} hideNumbers={!isGm} names={names} campaignId={campaignId} combatId={combatId} onApply={setState} />
        <div className="h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
        <Row units={allies} state={state} isGm={isGm} hideNumbers={false} names={names} campaignId={campaignId} combatId={combatId} onApply={setState} />
      </div>

      {state.phase === "select" && mySlots.length > 0 ? (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="text-sm font-semibold">행동 선택 {unpicked.length === 0 ? <span className="text-xs font-normal text-ok">· 모두 선택됨</span> : null}</div>
          {mySlots.map((s) => <PickRow key={slotKey(s.combatantId, s.slot)} state={state} unit={state.units.find((u) => u.id === s.combatantId)!} slot={s.slot} speed={s.speed}
            onPick={(pick) => act(() => setPickAction(campaignId, combatId, s.combatantId, s.slot, pick))} names={names}
            onRedraw={() => act(() => redrawHandAction(campaignId, combatId, s.combatantId))} />)}
        </div>
      ) : null}

      {state.lastRound ? (
        <details className="border-t border-border pt-2" open>
          <summary className="cursor-pointer text-sm font-semibold">지난 라운드 결과</summary>
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed"><KeywordText text={formatRound(state.lastRound, names).join("\n")} /></pre>
        </details>
      ) : null}
    </div>
  );
}

function Row({ units, state, isGm, hideNumbers, names, campaignId, combatId, onApply }: { units: Unit[]; state: CombatState; isGm: boolean; hideNumbers: boolean; names: Record<string, string>; campaignId: string; combatId: string; onApply: (s: CombatState) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {units.map((u) => <UnitCard key={u.id} u={u} state={state} isGm={isGm} hideNumbers={hideNumbers} names={names} campaignId={campaignId} combatId={combatId} onApply={onApply} />)}
    </div>
  );
}

function UnitCard({ u, state, isGm, hideNumbers, names, campaignId, combatId, onApply }: { u: Unit; state: CombatState; isGm: boolean; hideNumbers: boolean; names: Record<string, string>; campaignId: string; combatId: string; onApply: (s: CombatState) => void }) {
  const slots = state.slots.filter((s) => s.combatantId === u.id);
  const hpPct = Math.max(0, Math.min(100, (u.hp / u.maxHp) * 100));
  const statuses = (Object.entries(u.statuses) as [StatusId, number][]).filter(([, v]) => v > 0);
  const [edit, setEdit] = useState(false);
  return (
    <div className={`panel p-2 ${u.incapacitated ? "opacity-50" : ""} ${u.staggered ? "ring-1 ring-gold" : ""}`}>
      <div className="flex gap-2">
        <div className="h-14 w-14 shrink-0 overflow-hidden bg-fg/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {u.portraitUrl ? <img src={u.portraitUrl} alt="" className="h-full w-full object-cover" /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <span className="truncate text-sm font-medium">{u.name}</span>
            <span className="text-[11px] text-muted">{u.incapacitated ? <Keyword id="down">전투불능</Keyword> : isCorroded(u, state.round) ? <Keyword id="corrosion" className="text-danger">침식</Keyword> : u.staggered ? <Keyword id="stagger">흐트러짐</Keyword> : ""}</span>
          </div>
          <div className="mt-1 h-2 w-full bg-fg/10"><div className="h-full bg-danger" style={{ width: `${hpPct}%` }} /></div>
          <div className="mt-0.5 flex justify-between text-[11px] tabular-nums text-muted">
            <span>{hideNumbers ? "체력" : `체력 ${u.hp}/${u.maxHp}`}</span>
            {!u.sanityLocked ? <span>정신력 {u.sanity > 0 ? "+" : ""}{u.sanity}</span> : null}
          </div>
          {u.source.kind === "character" ? <div className="text-[11px] tabular-nums text-muted"><Keyword id="light">빛</Keyword> {u.light} · <Keyword id="erosion">침식도</Keyword> {u.erosion}</div> : null}
          {statuses.length ? <div className="mt-1 flex flex-wrap gap-1">{statuses.map(([k, v]) => <Keyword key={k} id={k} className="border-0"><StatusBadge status={k} value={v} /></Keyword>)}</div> : null}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {slots.map((s) => {
          const p = state.picks[slotKey(u.id, s.slot)];
          const sk = p ? u.skills.find((x) => x.id === p.skillId) : undefined;
          const hidden = u.side === "enemy" && !isGm;
          return (
            <span key={s.slot} className="inline-flex items-center gap-1 border border-border px-1.5 py-0.5 text-[11px]">
              <span className="font-semibold tabular-nums">{s.speed}</span>
              {sk ? (<>
                {sk.kind === "defense" ? <DefenseIcon kind={sk.defenseKind ?? "guard"} size={14} /> : <DamageIcon type={sk.damageType} size={14} />}
                <SinIcon sin={sk.sin} size={14} />
                <span className="max-w-24 truncate">{hidden ? "???" : sk.name}</span>
                <span className="text-muted">→ {names[p!.targetId]}</span>
              </>) : <span className="text-muted">{state.phase === "select" ? "미선택" : "-"}</span>}
            </span>
          );
        })}
        {isGm && state.phase !== "ended" ? <button type="button" onClick={() => setEdit(!edit)} className="ml-auto text-[11px] text-muted hover:text-fg">조정</button> : null}
      </div>
      {edit ? <GmAdjust u={u} campaignId={campaignId} combatId={combatId} onDone={() => setEdit(false)} onApply={onApply} /> : null}
    </div>
  );
}

function GmAdjust({ u, campaignId, combatId, onDone, onApply }: { u: Unit; campaignId: string; combatId: string; onDone: () => void; onApply: (s: CombatState) => void }) {
  const [hp, setHp] = useState(u.hp);
  const [sanity, setSanity] = useState(u.sanity);
  const [st, setSt] = useState<Record<string, number>>(Object.fromEntries(STATUS_IDS.map((k) => [k, u.statuses[k] ?? 0])));
  const [pending, start] = useTransition();
  const cls = "w-full rounded-md border border-border bg-elev px-1 py-0.5 text-xs tabular-nums";
  return (
    <div className="mt-2 space-y-1 border-t border-border pt-2 text-xs">
      <div className="grid grid-cols-2 gap-1">
        <label>체력<input type="number" value={hp} onChange={(e) => setHp(Number(e.target.value))} className={cls} /></label>
        <label>정신력<input type="number" value={sanity} onChange={(e) => setSanity(Number(e.target.value))} className={cls} /></label>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {STATUS_IDS.map((k) => <label key={k} className="flex items-center gap-1"><StatusIcon status={k} size={14} /><input type="number" min={0} value={st[k]} onChange={(e) => setSt({ ...st, [k]: Number(e.target.value) })} className={cls} /></label>)}
      </div>
      <div className="flex gap-1">
        <Button className="px-2 py-0.5 text-xs" disabled={pending} onClick={() => start(async () => { const r = await gmAdjustUnitAction(campaignId, combatId, u.id, { hp, sanity, statuses: st as Unit["statuses"] }); if (r.state) onApply(r.state); onDone(); })}>적용</Button>
        <Button variant="ghost" className="px-2 py-0.5 text-xs" onClick={onDone}>취소</Button>
      </div>
    </div>
  );
}

function PickRow({ state, unit, slot, speed, onPick, names, onRedraw }: { state: CombatState; unit: Unit; slot: number; speed: number; onPick: (p: { skillId: string; targetId: string; targetSlot?: number } | null) => void; names: Record<string, string>; onRedraw: () => void }) {
  const current = state.picks[slotKey(unit.id, slot)];
  const egos = unit.skills.filter((s) => s.ego);
  const corroded = isCorroded(unit, state.round);
  const enemies = state.units.filter((u) => u.side === "enemy" && !u.incapacitated);
  const [targetId, setTargetId] = useState(current?.targetId ?? enemies[0]?.id ?? "");
  const [targetSlot, setTargetSlot] = useState<number | "">(current?.targetSlot ?? "");
  const handSkills: Skill[] = unit.hand.map((id) => unit.skills.find((s) => s.id === id)!).filter(Boolean);
  const defense = unit.skills.filter((s) => s.kind === "defense" && !s.ego);
  const interceptable = state.slots.filter((s) => s.combatantId === targetId && s.speed <= speed && state.picks[slotKey(s.combatantId, s.slot)] && state.picks[slotKey(s.combatantId, s.slot)]!.targetId !== unit.id);
  const choose = (skillId: string) => onPick({ skillId, targetId, ...(targetSlot !== "" ? { targetSlot: Number(targetSlot) } : {}) });
  const card = (s: Skill, i: number) => {
    const sel = current?.skillId === s.id;
    const used = s.ego ? (unit.egoUsed?.[s.id] ?? 0) : 0;
    const egoBlocked = s.ego ? used >= s.ego.usesPerCombat : false;
    const disabled = corroded || current?.locked || egoBlocked;
    return (
      <button key={`${s.id}-${i}`} type="button" disabled={disabled}
        onClick={() => { if (s.ego && !confirm(`E.G.O [${s.name}] 발현: 정신력 -${s.ego.sanityCost}, 침식도 +${s.ego.erosionGain}. 발현 후에는 바꿀 수 없습니다.`)) return; choose(s.id); }}
        className={`flex min-w-36 flex-col items-start gap-0.5 border px-2 py-1 text-left text-xs disabled:opacity-50 ${sel ? "border-accent bg-accent/10" : s.ego ? "border-gold/70 bg-gold/5 hover:border-gold" : "border-border hover:border-fg/40"}`}>
        <span className="flex items-center gap-1">
          {s.ego ? <span className="stamp">E.G.O</span> : null}
          {s.kind === "defense" ? <DefenseIcon kind={s.defenseKind ?? "guard"} size={14} /> : <DamageIcon type={s.damageType} size={14} />}
          <SinIcon sin={s.sin} size={14} /><b>{s.name}</b>
        </span>
        <span className="text-muted">{s.basePower} {s.coinPower >= 0 ? "+" : ""}{s.coinPower} <span className="inline-flex gap-0.5 align-middle">{Array.from({ length: s.coinCount }).map((_, j) => <CoinIcon key={j} heads size={11} />)}</span></span>
        {s.ego ? <span className="text-[10px] text-muted">정신력 -{s.ego.sanityCost} · 침식도 +{s.ego.erosionGain} · {used}/{s.ego.usesPerCombat}회</span> : null}
        {s.effects?.length ? <span className="text-[10px] text-ok">자동 효과 {s.effects.length}</span> : null}
      </button>
    );
  };
  return (
    <div className="border border-border p-2">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
        <b>{unit.name}</b> <span className="stamp">속도 {speed}</span>
        <label className="flex items-center gap-1">대상
          <select value={targetId} onChange={(e) => { setTargetId(e.target.value); setTargetSlot(""); if (current) onPick({ ...current, targetId: e.target.value, targetSlot: undefined }); }} className="border border-border bg-elev px-1 py-0.5">
            {enemies.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        {interceptable.length ? (
          <label className="flex items-center gap-1">가로채기
            <select value={targetSlot} onChange={(e) => { const v = e.target.value === "" ? "" : Number(e.target.value); setTargetSlot(v); if (current) onPick({ ...current, targetSlot: v === "" ? undefined : v }); }} className="border border-border bg-elev px-1 py-0.5">
              <option value="">안 함</option>
              {interceptable.map((s) => <option key={s.slot} value={s.slot}>속도 {s.speed} → {names[state.picks[slotKey(s.combatantId, s.slot)]!.targetId]} 노리는 공격</option>)}
            </select>
          </label>
        ) : null}
        {corroded ? <span className="text-danger">침식 상태: 자동 조종</span> : null}
        {current?.locked ? <span className="text-gold">확정됨</span> : null}
        {current && !current.locked ? <button type="button" onClick={() => onPick(null)} className="ml-auto text-muted hover:text-fg">선택 취소</button> : null}
        {!corroded && !current?.locked && unit.light > 0 ? <button type="button" onClick={() => { if (confirm(`빛 1을 써서 손패를 교체할까요? (남은 빛 ${unit.light})`)) onRedraw(); }} className="text-gold hover:underline">빛 1: 손패 교체</button> : null}
      </div>
      <div className="flex flex-wrap gap-1">
        {handSkills.map(card)}
        {defense.map((s) => card(s, 99))}
        {egos.map((s, i) => card(s, 200 + i))}
      </div>
    </div>
  );
}
