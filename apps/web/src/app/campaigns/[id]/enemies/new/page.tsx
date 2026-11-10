import Link from "next/link";
import { newEnemyData } from "@limbus/rules";
import { EnemyForm } from "@/components/enemy/enemy-form";

export default async function NewEnemyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div>
      <div className="mb-2"><Link href={`/campaigns/${id}/enemies`} className="text-sm text-muted hover:text-fg">← 적 도감</Link></div>
      <h1 className="mb-4 text-2xl font-bold">적 등록</h1>
      <EnemyForm campaignId={id} initialName="" initialPortrait={null} initial={newEnemyData()} />
    </div>
  );
}
