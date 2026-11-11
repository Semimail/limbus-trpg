import { newCharacterData } from "@limbus/rules";
import { createClient } from "@/lib/supabase/server";
import { CharacterWizard } from "@/components/sheet/wizard";

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
      <div className="mb-4"><div className="stamp">새 해결사</div><h1 className="mt-1 text-2xl font-bold">캐릭터 만들기</h1></div>
      <CharacterWizard campaignId={campaignId} initialName="" initialPortrait={null} initial={newCharacterData()} />
    </div>
  );
}
