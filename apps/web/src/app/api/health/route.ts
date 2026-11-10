import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const bootedAt = Date.now();
let served = 0;

/** 공개 진단: 지역, 콜드 스타트 여부, DB/인증 서버 왕복 시간. 비밀값 없음. */
export async function GET() {
  served += 1;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const t = async (label: string, fn: () => Promise<Response>) => {
    const s = performance.now();
    try { const r = await fn(); return { label, ms: Math.round(performance.now() - s), status: r.status }; }
    catch (e) { return { label, ms: Math.round(performance.now() - s), error: (e as Error).message }; }
  };
  const probes = await Promise.all([
    t("rest", () => fetch(`${url}/rest/v1/campaigns?select=id&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" })),
    t("auth", () => fetch(`${url}/auth/v1/.well-known/jwks.json`, { headers: { apikey: key }, cache: "no-store" })),
  ]);
  return NextResponse.json({
    region: process.env.VERCEL_REGION ?? null,
    env: process.env.VERCEL_ENV ?? null,
    coldStart: served === 1,
    instanceAgeSec: Math.round((Date.now() - bootedAt) / 1000),
    probes,
    now: new Date().toISOString(),
  });
}
