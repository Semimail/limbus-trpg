/**
 * 개발 샌드박스 전용: 서버 fetch가 HTTPS 프록시를 거치도록 한다.
 * DEV_FETCH_PROXY=1 이고 HTTPS_PROXY가 설정된 경우에만 동작한다. 배포 환경에서는 아무것도 하지 않는다.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DEV_FETCH_PROXY !== "1" || !process.env.HTTPS_PROXY) return;
  const { fetch: proxiedFetch, ProxyAgent } = await import("undici");
  const dispatcher = new ProxyAgent(process.env.HTTPS_PROXY);
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) return original(input, init);
    return proxiedFetch(url, { ...(init as object), dispatcher } as never) as unknown as Promise<Response>;
  }) as typeof fetch;
}
