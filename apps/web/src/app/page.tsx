import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { DiscordLogin } from "@/components/discord-login";

export default async function Home({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const user = await getUser();
  if (user) redirect(next && next.startsWith("/") ? next : "/campaigns");
  return (
    <div className="mx-auto mt-16 max-w-md text-center">
      <h1 className="text-3xl font-bold tracking-tight">
        <span className="text-accent">림버스</span> TRPG
      </h1>
      <p className="mt-3 text-muted">코인을 던지고, 합을 겨루고, 도시에서 살아남으세요.</p>
      {error ? <p className="mt-4 text-sm text-danger">로그인에 실패했습니다. 다시 시도해 주세요.</p> : null}
      <div className="mt-8">
        <DiscordLogin next={next ?? "/campaigns"} />
      </div>
    </div>
  );
}
