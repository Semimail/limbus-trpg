import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** 디스코드 OAuth 콜백: code를 세션으로 교환. 실패 시 사유를 첫 화면에 넘긴다. */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/campaigns";
  const providerError = searchParams.get("error_description") ?? searchParams.get("error");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/campaigns"}`);
    return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(error.message)}`);
  }
  return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(providerError ?? "code 없음")}`);
}
