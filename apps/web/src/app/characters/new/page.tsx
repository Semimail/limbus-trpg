import { newCharacterData } from "@limbus/rules";
import { createClient } from "@/lib/supabase/server";
import { CharacterForm } from "@/components/sheet/character-form";

export default async function NewCharacterPage({ searchParams }: { searchParams: Promise<{ campaign?: string }> }) {
  const { campaign } = await searchParams;
  const supabase = await createClient();
  let campaignId: string | null = null;
  if (campaign) {
    const { data } = await supabase.from("campaigns").select("id").eq("id", campaign).single();
    campaignId = data?.id ?? null;
  }
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">새 캐릭터</h1>
      <CharacterForm campaignId={campaignId} initialName="" initialPortrait={null} initial={newCharacterData()} readOnly={false} />
    </div>
  );
}
