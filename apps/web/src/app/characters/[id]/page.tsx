import { notFound } from "next/navigation";
import type { CharacterData } from "@limbus/rules";
import { newCharacterData } from "@limbus/rules";
import { createClient, getUser } from "@/lib/supabase/server";
import { SheetView } from "@/components/sheet/sheet-view";
import { deleteCharacter } from "../actions";

export default async function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getUser();
  const { data: c } = await supabase.from("characters").select("*, profiles(username), campaigns(name)").eq("id", id).single();
  if (!c || !user) notFound();

  let isGm = false;
  if (c.campaign_id) {
    const { data: m } = await supabase.from("campaign_members").select("role").eq("campaign_id", c.campaign_id).eq("user_id", user.id).maybeSingle();
    isGm = m?.role === "gm" || m?.role === "temp_gm";
  }
  const isOwner = c.owner_id === user.id;
  const canEdit = isGm || (isOwner && !c.locked);
  const data = { ...newCharacterData(), ...(c.data as unknown as Partial<CharacterData>) } as CharacterData;
  const prof = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles;
  const camp = Array.isArray(c.campaigns) ? c.campaigns[0] : c.campaigns;
  const onDelete = deleteCharacter.bind(null, id);

  return (
    <SheetView id={id} name={c.name} portraitUrl={c.portrait_url} data={data} approved={c.approved} locked={c.locked}
      ownerName={prof?.username ?? ""} campaignName={camp?.name ?? null} campaignId={c.campaign_id}
      canEdit={canEdit} isOwner={isOwner} isGm={isGm} onDelete={onDelete} />
  );
}
