import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { newEnemyData, type EnemyData } from "@limbus/rules";
import { EnemyForm } from "@/components/enemy/enemy-form";
import { Panel } from "@/components/office/panel";
import { Button } from "@/components/ui";
import { SinIcon, DamageIcon, DefenseIcon, CoinIcon } from "@/components/icons";
import { deleteEnemy, revealToAll } from "../actions";

export default async function EnemyPage({ params }: { params: Promise<{ id: string; eid: string }> }) {
  const { id, eid } = await params;
  const supabase = await createClient();
  const user = await getUser();
  const { data: e } = await supabase.from("enemies").select("*").eq("id", eid).single();
  if (!e || !user) notFound();
  const { data: me } = await supabase.from("campaign_members").select("role").eq("campaign_id", id).eq("user_id", user.id).maybeSingle();
  const isGm = me?.role === "gm" || me?.role === "temp_gm";
  const d = { ...newEnemyData(), ...(e.data as unknown as Partial<EnemyData>) } as EnemyData;

  if (isGm) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3"><Link href={`/campaigns/${id}/enemies`} className="text-sm text-muted hover:text-fg">← 적 도감</Link><h1 className="text-2xl font-bold">{e.name}</h1></div>
          <div className="flex gap-2">
            <form action={revealToAll.bind(null, id, eid, d.skills.map((s) => s.id), d.gimmicks.map((g) => g.id))}><Button variant="ghost" className="px-2 py-1 text-xs">전부 공개</Button></form>
            <form action={deleteEnemy.bind(null, id, eid)}><Button variant="danger" className="px-2 py-1 text-xs">삭제</Button></form>
          </div>
        </div>
        {d.gimmicks.length ? (
          <Panel title="기믹 공개 (플레이어에게)">
            <div className="flex flex-wrap gap-2">
              {d.gimmicks.map((g) => (
                <form key={g.id} action={revealToAll.bind(null, id, eid, [], [g.id])}>
                  <Button variant="ghost" className="px-2 py-1 text-xs">{g.name || "(이름 없음)"} 공개</Button>
                </form>
              ))}
            </div>
          </Panel>
        ) : null}
        <EnemyForm campaignId={id} id={eid} initialName={e.name} initialPortrait={e.portrait_url} initial={d} />
      </div>
    );
  }

  // 플레이어: 내 캐릭터들이 공개받은 항목만
  const { data: mine } = await supabase.from("characters").select("id").eq("owner_id", user.id);
  const { data: reveals } = await supabase.from("enemy_reveals").select("revealed_skills, revealed_gimmicks").eq("enemy_id", eid).in("character_id", (mine ?? []).map((c) => c.id));
  const skillsSeen = new Set((reveals ?? []).flatMap((r) => r.revealed_skills));
  const gimmicksSeen = new Set((reveals ?? []).flatMap((r) => r.revealed_gimmicks));
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3"><Link href={`/campaigns/${id}/enemies`} className="text-sm text-muted hover:text-fg">← 적 도감</Link><h1 className="text-2xl font-bold">{e.name}</h1><span className="stamp">{d.threat}</span></div>
      <Panel title="관측 정보">
        <div className="flex gap-4">
          <div className="h-28 w-28 shrink-0 overflow-hidden bg-fg/10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {e.portrait_url ? <img src={e.portrait_url} alt="" className="h-full w-full object-cover" /> : null}
          </div>
          <div className="text-sm text-muted">
            <p>속도 {d.speed.min}~{d.speed.max} × {d.speed.dice}</p>
            <p>체력과 저항은 전투 중 게이지로만 확인할 수 있습니다.</p>
          </div>
        </div>
      </Panel>
      <Panel title="스킬">
        <ul className="space-y-2">
          {d.skills.map((s) => skillsSeen.has(s.id) ? (
            <li key={s.id} className="flex flex-wrap items-center gap-2 border border-border p-2 text-sm">
              {s.kind === "defense" ? <DefenseIcon kind={s.defenseKind ?? "guard"} size={18} /> : <DamageIcon type={s.damageType} size={18} />}
              <SinIcon sin={s.sin} size={18} />
              <span className="font-medium">{s.name}</span>
              <span className="text-muted">{s.basePower} {s.coinPower >= 0 ? "+" : ""}{s.coinPower}</span>
              <span className="inline-flex gap-0.5">{Array.from({ length: s.coinCount }).map((_, i) => <CoinIcon key={i} heads size={14} />)}</span>
              {s.effectText ? <span className="w-full text-xs text-muted">{s.effectText}</span> : null}
            </li>
          ) : <li key={s.id} className="border border-dashed border-border p-2 text-sm text-muted">???</li>)}
        </ul>
      </Panel>
      <Panel title="기믹">
        {d.gimmicks.length === 0 ? <p className="text-sm text-muted">알려진 기믹 없음</p> : null}
        <ul className="space-y-1 text-sm">
          {d.gimmicks.map((g) => gimmicksSeen.has(g.id) ? <li key={g.id}><b>{g.name}</b> <span className="text-muted">{g.text}</span></li> : <li key={g.id} className="text-muted">???</li>)}
        </ul>
      </Panel>
    </div>
  );
}
