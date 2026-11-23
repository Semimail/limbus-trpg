import Link from "next/link";
import { getUser } from "@/lib/supabase/server";

/** 상단 바 (사이트 틀 v2): 원작 붉은 질감 플레이트 + Bebas 로고 + 청동 버튼 메뉴. 테마 전환은 없앰(항상 림버스 어두운 팔레트) */
export async function Header() {
  const user = await getUser();
  if (!user) return null;
  const meta = user.user_metadata as { custom_claims?: { global_name?: string }; full_name?: string };
  const name = meta.custom_claims?.global_name ?? meta.full_name ?? "";
  return (
    <header className="site-header">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/campaigns" className="logo flex items-center gap-2">
          <span>LIMBUS <b>TRPG</b></span>
          <span className="font-title hidden text-xs tracking-normal text-[#f1e4cf]/80 sm:inline">림버스 TRPG</span>
        </Link>
        <nav className="flex items-center gap-1.5">
          <Link href="/campaigns" className="nav-link hidden sm:inline-flex">캠페인</Link>
          <Link href="/characters" className="nav-link">내 캐릭터</Link>
          <Link href="/rulebook" className="nav-link hidden sm:inline-flex">룰북</Link>
          <Link href="/databook" className="nav-link">데이터북</Link>
          <span className="ml-2 hidden text-xs text-[#f1e4cf]/80 sm:inline" style={{ textShadow: "0 1px 1px #000" }}>{name}</span>
          <form action="/auth/signout" method="post">
            <button className="nav-link">로그아웃</button>
          </form>
        </nav>
      </div>
    </header>
  );
}
