import Link from "next/link";
import { createClient, getUser } from "@/lib/supabase/server";
import { PageTitle } from "@/components/ui";
import type { EnemyData } from "@limbus/rules";

export default async function EnemiesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getUser();
  const { data: me } = await supabase.from("campaign_members").select("role").eq("campaign_id", id).eq("user_id", user!.id).maybeSingle();
  const isGm = me?.role === "gm" || me?.role === "temp_gm";
  const { data: enemies } = await supabase.from("enemies").select("id, name, portrait_url, data").eq("campaign_id", id).order("created_at");
  return (
    <div>
      <div className="mb-2"><Link href={`/campaigns/${id}`} className="text-sm text-muted hover:text-fg">← 사무소</Link></div>
      <PageTitle right={isGm ? <Link href={`/campaigns/${id}/enemies/new`} className="text-sm text-accent">+ 적 등록</Link> : null}>적 도감</PageTitle>
      {(enemies ?? []).length === 0 ? <p className="text-sm text-muted">{isGm ? "등록된 적이 없습니다." : "아직 마주친 적이 없습니다."}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(enemies ?? []).map((e) => {
          const d = e.data as unknown as EnemyData;
          return (
            <Link key={e.id} href={`/campaigns/${id}/enemies/${e.id}`} className="panel flex gap-3 p-3 hover:border-accent">
              <div className="h-16 w-16 shrink-0 overflow-hidden bg-fg/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {e.portrait_url ? <img src={e.portrait_url} alt="" className="h-full w-full object-cover" /> : null}
              </div>
              <div className="min-w-0">
                <div className="truncate font-medium">{e.name}</div>
                <div className="text-xs text-muted">{d.threat}{isGm ? ` · 체력 ${d.maxHp} · 스킬 ${d.skills.length}` : ""}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
