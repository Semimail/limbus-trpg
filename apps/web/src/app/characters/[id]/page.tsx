import Link from "next/link";
import { notFound } from "next/navigation";
import type { CharacterData } from "@limbus/rules";
import { newCharacterData } from "@limbus/rules";
import { createClient, getUser } from "@/lib/supabase/server";
import { CharacterForm } from "@/components/sheet/character-form";
import { GmPanel } from "@/components/sheet/gm-panel";
import { deleteCharacter } from "../actions";
import { Button } from "@/components/ui";

export default async function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getUser();
  const { data: c } = await supabase.from("characters").select("*").eq("id", id).single();
  if (!c || !user) notFound();

  let isGm = false;
  if (c.campaign_id) {
    const { data: m } = await supabase.from("campaign_members").select("role").eq("campaign_id", c.campaign_id).eq("user_id", user.id).single();
    isGm = m?.role === "gm" || m?.role === "temp_gm";
  }
  const isOwner = c.owner_id === user.id;
  const canEdit = isGm || (isOwner && !c.locked);
  const data = { ...newCharacterData(), ...(c.data as unknown as Partial<CharacterData>) } as CharacterData;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {c.campaign_id ? <Link href={`/campaigns/${c.campaign_id}`} className="text-sm text-muted hover:text-fg">← 사무소</Link> : null}
          <h1 className="text-2xl font-bold">{c.name}</h1>
          <span className="text-xs text-muted">{c.approved ? "승인됨" : "승인 대기"}{c.locked ? " · 전투 중 잠금" : ""}</span>
        </div>
        {isOwner ? (
          <form action={deleteCharacter.bind(null, id)}><Button variant="danger" className="px-2 py-1 text-xs">삭제</Button></form>
        ) : null}
      </div>
      {isGm ? <GmPanel characterId={id} data={data} approved={c.approved} /> : null}
      <CharacterForm id={id} campaignId={c.campaign_id} initialName={c.name} initialPortrait={c.portrait_url} initial={data} readOnly={!canEdit} />
    </div>
  );
}
