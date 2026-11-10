import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { DiscordLogin } from "@/components/discord-login";

export default async function Home({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const user = await getUser();
  if (user) redirect(next && next.startsWith("/") ? next : "/campaigns");
  return (
    <div className="landing fixed inset-0 overflow-hidden">
      <div className="landing-art absolute inset-0" aria-hidden />
      <div className="landing-noise absolute inset-0" aria-hidden />
      <div className="relative z-10 flex h-full flex-col justify-between px-6 py-8 sm:px-12 sm:py-12">
        <div>
          <h1 className="text-5xl font-black tracking-tight text-[#ece6dc] sm:text-7xl">
            <span className="text-[#d2242b]">림버스</span> TRPG
          </h1>
          <div className="mt-4 h-px w-64 bg-gradient-to-r from-[#d9b35b] to-transparent" />
          <p className="mt-4 text-sm text-[#bdb3a7] sm:text-base">코인을 던지고, 합을 겨루고, 도시에서 살아남으세요.</p>
          <div className="mt-8 inline-block border-l-2 border-[#d2242b] bg-black/50 px-5 py-4 backdrop-blur-sm">
            <DiscordLogin next={next ?? "/campaigns"} />
            <p className="mt-2 text-xs text-[#9a918a]">함께 플레이하려면 먼저 로그인하세요</p>
            {error ? <p className="mt-2 text-xs text-[#e04b52]">로그인 실패: {error}</p> : null}
          </div>
        </div>
        <p className="text-xs text-[#6f665f]">림버스 컴퍼니 세계관의 2차 창작 TRPG · 원작 에셋을 사용하지 않습니다</p>
      </div>
    </div>
  );
}
