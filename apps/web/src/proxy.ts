import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getDevFetch } from "@/lib/dev-fetch";

/** 요청마다 세션 쿠키를 갱신하고, 보호 경로는 로그인으로 보낸다. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const devFetch = await getDevFetch();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: devFetch ? { fetch: devFetch } : undefined,
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  // 로컬 JWT 검증 (만료 시에만 갱신 요청이 나간다)
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? data.claims : null;
  const path = request.nextUrl.pathname;
  const isPublic = path === "/" || path.startsWith("/auth") || path.startsWith("/join") || path.startsWith("/replay");
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
