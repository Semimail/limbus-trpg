import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getDevFetch } from "@/lib/dev-fetch";
import type { Database } from "./database.types";

/** 서버 컴포넌트, 서버 액션, 라우트 핸들러용 클라이언트 (요청당 1개 재사용) */
export const createClient = cache(async () => {
  const cookieStore = await cookies();
  const devFetch = await getDevFetch();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: devFetch ? { fetch: devFetch } : undefined,
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
          } catch {
            // 서버 컴포넌트에서 호출된 경우 무시 (proxy가 세션을 갱신한다)
          }
        },
      },
    },
  );
});

export interface AuthUser {
  id: string;
  user_metadata: Record<string, unknown>;
}

/**
 * 현재 사용자. JWT를 서버에서 직접 검증(ES256, JWKS 캐시)하므로 인증 서버 왕복이 없다.
 * 요청당 1회만 계산되어 헤더와 페이지가 공유한다.
 */
export const getUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  const c = data.claims as { sub: string; user_metadata?: Record<string, unknown> };
  return { id: c.sub, user_metadata: c.user_metadata ?? {} };
});
