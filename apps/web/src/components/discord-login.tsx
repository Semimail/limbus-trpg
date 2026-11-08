"use client";
import { createClient } from "@/lib/supabase/client";
import { Button } from "./ui";

export function DiscordLogin({ next = "/campaigns" }: { next?: string }) {
  const signIn = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "discord",
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
  };
  return <Button onClick={signIn} className="bg-[#5865F2] text-white hover:opacity-90">디스코드로 로그인</Button>;
}
