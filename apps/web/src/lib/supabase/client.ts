"use client";
import type { Database } from "./database.types";
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const c = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
  // 개발 중 디버그용 (브라우저 콘솔에서 __sb로 접근)
  if (process.env.NODE_ENV === "development" && typeof window !== "undefined") (window as unknown as { __sb?: unknown }).__sb = c;
  return c;
}

/**
 * Realtime 구독 전에 사용자 토큰을 Realtime 소켓에 실어 둔다.
 * 마운트 직후 구독하면 INITIAL_SESSION 이벤트보다 먼저 join 돼 anon 권한으로 붙고,
 * postgres_changes는 join 시점 권한으로 RLS를 평가하므로 이벤트를 영영 못 받는다.
 */
export async function realtimeReady(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) await supabase.realtime.setAuth(data.session.access_token);
}
