/**
 * 개발 샌드박스 전용 fetch. DEV_FETCH_PROXY=1 일 때만 HTTPS 프록시를 거치는 fetch를 돌려주고,
 * 그 외에는 undefined (기본 fetch 사용). proxy.ts는 별도 샌드박스에서 돌아 전역 디스패처가 적용되지 않아 필요하다.
 */
let cached: typeof fetch | undefined;
export async function getDevFetch(): Promise<typeof fetch | undefined> {
  if (process.env.DEV_FETCH_PROXY !== "1" || !process.env.HTTPS_PROXY) return undefined;
  if (cached) return cached;
  const { fetch: ufetch, ProxyAgent } = await import("undici");
  const dispatcher = new ProxyAgent(process.env.HTTPS_PROXY);
  cached = ((input: RequestInfo | URL, init?: RequestInit) =>
    ufetch(input as never, { ...(init as object), dispatcher } as never) as unknown as Promise<Response>) as typeof fetch;
  return cached;
}
