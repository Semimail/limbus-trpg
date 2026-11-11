import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { CharacterData } from "@limbus/rules";
import { newCharacterData } from "@limbus/rules";
import { createClient, getUser } from "@/lib/supabase/server";
import { CharacterWizard } from "@/components/sheet/wizard";

export default async function EditCharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getUser();
  const { data: c } = await supabase.from("characters").select("*").eq("id", id).single();
  if (!c || !user) notFound();
  let isGm = false;
  if (c.campaign_id) {
    const { data: m } = await supabase.from("campaign_members").select("role").eq("campaign_id", c.campaign_id).eq("user_id", user.id).maybeSingle();
    isGm = m?.role === "gm" || m?.role === "temp_gm";
  }
  const canEdit = isGm || (c.owner_id === user.id && !c.locked);
  if (!canEdit) redirect(`/characters/${id}`);
  const data = { ...newCharacterData(), ...(c.data as unknown as Partial<CharacterData>) } as CharacterData;
  return (
    <div>
      <div className="mb-4 flex items-center gap-3"><Link href={`/characters/${id}`} className="text-sm text-muted hover:text-fg">← 시트</Link><h1 className="text-2xl font-bold">{c.name} 편집</h1></div>
      <CharacterWizard id={id} campaignId={c.campaign_id} initialName={c.name} initialPortrait={c.portrait_url} initial={data} />
    </div>
  );
}
