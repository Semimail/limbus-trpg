import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** 디스코드 OAuth 콜백: code를 세션으로 교환 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/campaigns";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/campaigns"}`);
  }
  return NextResponse.redirect(`${origin}/?error=auth`);
}
