import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { PageTitle } from "@/components/ui";
import { SpriteStudio } from "@/components/sprite/sprite-studio";
import type { EnemyData } from "@limbus/rules";

/** 이미지 생성이 수십 초 걸리므로 서버 액션 시간 제한을 늘린다 */
export const maxDuration = 120;

export default async function SpritesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ enemy?: string }> }) {
  const { id } = await params;
  const { enemy } = await searchParams;
  const supabase = await createClient();
  const user = await getUser();
  if (!user) notFound();
  const { data: me } = await supabase.from("campaign_members").select("role").eq("campaign_id", id).eq("user_id", user.id).maybeSingle();
  if (!me || (me.role !== "gm" && me.role !== "temp_gm")) notFound();
  const [{ data: enemies }, { data: jobs }] = await Promise.all([
    supabase.from("enemies").select("id, name, data").eq("campaign_id", id).order("name"),
    supabase.from("sprite_jobs").select("*").eq("campaign_id", id).order("created_at", { ascending: false }).limit(200),
  ]);
  const providerName = (process.env.SPRITE_PROVIDER || "openai").toLowerCase();
  const configured = providerName === "mock" || !!process.env.OPENAI_API_KEY;
  const model = providerName === "mock" ? "mock" : process.env.SPRITE_IMAGE_MODEL || "gpt-image-1";
  return (
    <div>
      <div className="mb-2 flex gap-3"><Link href={`/campaigns/${id}`} className="text-sm text-muted hover:text-fg">← 사무소</Link><Link href={`/campaigns/${id}/enemies`} className="text-sm text-muted hover:text-fg">적 도감</Link></div>
      <PageTitle>SD 스프라이트 공방</PageTitle>
      <SpriteStudio campaignId={id} initialEnemyId={enemy ?? null}
        enemies={(enemies ?? []).map((e) => ({ id: e.id, name: e.name, spriteUrl: (e.data as unknown as Partial<EnemyData>)?.spriteUrl ?? null }))}
        jobs={jobs ?? []} provider={{ name: providerName, model, configured }} />
    </div>
  );
}
