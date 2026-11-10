/**
 * 개발 샌드박스 전용: 서버 fetch가 HTTPS 프록시를 거치도록 한다.
 * DEV_FETCH_PROXY=1 이고 HTTPS_PROXY가 설정된 경우에만 동작한다. 배포 환경에서는 아무것도 하지 않는다.
 * 전역 디스패처를 바꾸므로 Next가 fetch를 다시 감싸도 유지된다.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DEV_FETCH_PROXY !== "1" || !process.env.HTTPS_PROXY) return;
  const { setGlobalDispatcher, EnvHttpProxyAgent } = await import("undici");
  setGlobalDispatcher(new EnvHttpProxyAgent({ noProxy: "localhost,127.0.0.1" }));
}
