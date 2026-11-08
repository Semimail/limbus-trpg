import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { ThemeToggle } from "./theme-toggle";

export async function Header() {
  const user = await getUser();
  const name = (user?.user_metadata?.custom_claims?.global_name as string | undefined)
    ?? (user?.user_metadata?.full_name as string | undefined) ?? "";
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4">
        <Link href={user ? "/campaigns" : "/"} className="font-semibold tracking-tight">
          <span className="text-accent">림버스</span> TRPG
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <Link href="/characters" className="text-muted hover:text-fg">내 캐릭터</Link>
              <span className="hidden text-muted sm:inline">{name}</span>
              <form action="/auth/signout" method="post">
                <button className="text-muted hover:text-fg">로그아웃</button>
              </form>
            </>
          ) : null}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
