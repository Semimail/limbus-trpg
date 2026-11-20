import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { ThemeToggle } from "./theme-toggle";

export async function Header() {
  const user = await getUser();
  if (!user) return null;
  const meta = user.user_metadata as { custom_claims?: { global_name?: string }; full_name?: string };
  const name = meta.custom_claims?.global_name ?? meta.full_name ?? "";
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-4">
        <Link href="/campaigns" className="font-semibold tracking-tight">
          <span className="text-accent">림버스</span> TRPG
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/characters" className="text-muted hover:text-fg">내 캐릭터</Link>
          <Link href="/rulebook" className="hidden text-muted hover:text-fg sm:inline">룰북</Link>
          <Link href="/databook" className="text-muted hover:text-fg">데이터북</Link>
          <span className="hidden text-muted sm:inline">{name}</span>
          <form action="/auth/signout" method="post">
            <button className="text-muted hover:text-fg">로그아웃</button>
          </form>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
