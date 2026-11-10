import Link from "next/link";
import { createClient, getUser } from "@/lib/supabase/server";
import { Card, PageTitle } from "@/components/ui";

export default async function CharactersPage() {
  const supabase = await createClient();
  const user = await getUser();
  const { data: chars } = await supabase.from("characters").select("id, name, approved, campaigns(name)").eq("owner_id", user!.id).order("created_at");
  return (
    <div>
      <PageTitle right={<Link href="/characters/new" className="text-sm text-accent">+ 새 캐릭터</Link>}>내 캐릭터</PageTitle>
      <div className="grid gap-4 sm:grid-cols-2">
        {(chars ?? []).map((c) => {
          const camp = Array.isArray(c.campaigns) ? c.campaigns[0] : c.campaigns;
          return (
            <Link key={c.id} href={`/characters/${c.id}`}>
              <Card className="hover:border-accent">
                <div className="font-medium">{c.name}</div>
                <div className="mt-1 text-xs text-muted">{camp?.name ?? "캠페인 미참가"} · {c.approved ? "승인됨" : "승인 대기"}</div>
              </Card>
            </Link>
          );
        })}
        {(chars ?? []).length === 0 ? <p className="text-sm text-muted">캐릭터가 없습니다.</p> : null}
      </div>
    </div>
  );
}
