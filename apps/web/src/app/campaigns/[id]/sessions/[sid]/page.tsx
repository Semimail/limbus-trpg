import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Panel } from "@/components/office/panel";

export default async function SessionPage({ params }: { params: Promise<{ id: string; sid: string }> }) {
  const { id, sid } = await params;
  const supabase = await createClient();
  const { data: s } = await supabase.from("sessions").select("id, title, status, started_at").eq("id", sid).single();
  if (!s) notFound();
  return (
    <div className="space-y-4">
      <Link href={`/campaigns/${id}`} className="text-sm text-muted hover:text-fg">← 사무소</Link>
      <h1 className="text-2xl font-bold">{s.title}</h1>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="장면" className="lg:col-span-2"><p className="text-sm text-muted">보드와 전투 화면이 여기에 들어갑니다.</p></Panel>
        <Panel title="채팅"><p className="text-sm text-muted">채팅과 굴림 로그가 여기에 들어갑니다.</p></Panel>
      </div>
    </div>
  );
}
