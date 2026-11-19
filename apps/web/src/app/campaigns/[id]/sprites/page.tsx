import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { PageTitle } from "@/components/ui";
import { SpriteStudio } from "@/components/sprite/sprite-studio";
import type { CharacterData, EnemyData } from "@limbus/rules";

/** 이미지 생성이 수십 초 걸리므로 서버 액션 시간 제한을 늘린다 */
export const maxDuration = 120;

export default async function SpritesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ enemy?: string; character?: string }> }) {
  const { id } = await params;
  const { enemy, character } = await searchParams;
  const supabase = await createClient();
  const user = await getUser();
  if (!user) notFound();
  const { data: me } = await supabase.from("campaign_members").select("role").eq("campaign_id", id).eq("user_id", user.id).maybeSingle();
  if (!me) notFound();
  const isGm = me.role === "gm" || me.role === "temp_gm";
  // 적 도감은 GM 만, 캐릭터는 본인 것(GM 은 캠페인 전체). 로그는 RLS 가 본인/GM 으로 거른다
  const charQuery = supabase.from("characters").select("id, name, owner_id, data").eq("campaign_id", id).order("name");
  const [{ data: enemies }, { data: chars }, { data: jobs }] = await Promise.all([
    isGm ? supabase.from("enemies").select("id, name, data").eq("campaign_id", id).order("name") : Promise.resolve({ data: [] as { id: string; name: string; data: unknown }[] }),
    isGm ? charQuery : charQuery.eq("owner_id", user.id),
    supabase.from("sprite_jobs").select("*").eq("campaign_id", id).order("created_at", { ascending: false }).limit(200),
  ]);
  const providerName = (process.env.SPRITE_PROVIDER || "openai").toLowerCase();
  const configured = providerName === "mock" || !!process.env.OPENAI_API_KEY;
  const model = providerName === "mock" ? "mock" : process.env.SPRITE_IMAGE_MODEL || "gpt-image-1";
  const initialTarget = enemy && isGm ? { kind: "enemy" as const, id: enemy } : character ? { kind: "character" as const, id: character } : null;
  return (
    <div>
      <div className="mb-2 flex gap-3"><Link href={`/campaigns/${id}`} className="text-sm text-muted hover:text-fg">← 사무소</Link>{isGm ? <Link href={`/campaigns/${id}/enemies`} className="text-sm text-muted hover:text-fg">적 도감</Link> : null}</div>
      <PageTitle>SD 스프라이트 공방</PageTitle>
      <SpriteStudio campaignId={id} isGm={isGm} initialTarget={initialTarget}
        enemies={(enemies ?? []).map((e) => ({ id: e.id, name: e.name, spriteUrl: (e.data as unknown as Partial<EnemyData>)?.spriteUrl ?? null }))}
        characters={(chars ?? []).map((c) => ({ id: c.id, name: c.name, mine: c.owner_id === user.id, spriteUrl: (c.data as unknown as Partial<CharacterData>)?.spriteUrl ?? null }))}
        jobs={jobs ?? []} provider={{ name: providerName, model, configured }} />
    </div>
  );
}
