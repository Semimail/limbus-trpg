# limbus-trpg — 작업 지침 (Claude용)

림버스 컴퍼니 세계관 기반 오리지널 TRPG 룰 + 자동화 VTT. 사용자(GM 1명, 친구들과 비공개 플레이)와 한국어로 대화한다.
**새 세션은 먼저 `docs/STATUS.md`(현재 상태·결정·미결)를 읽고 이어서 작업한다.**

## 구조
- `packages/rules` 룰 엔진 (순수 TS). 코인/합/흐트러짐/상태이상/효과 실행기/한국어 효과 파서/전투 오케스트레이터/성장 공식/키워드 사전. `pnpm --filter @limbus/rules test` (vitest).
- `apps/web` Next.js 16 (App Router, Turbopack, Tailwind 4) + Supabase(SSR 클라이언트, Realtime, Storage). 배포: Vercel, 루트 디렉터리 `apps/web`, 리전 icn1.
- `supabase/migrations/*.sql` 스키마. 적용은 `scripts/db-push.sh` (Supabase 관리 API, 토큰 필요).
- `docs/rulebook.md` 룰북(사이트 `/rulebook`가 그대로 렌더). `apps/web/public/rulebook.md`는 빌드 시 복사본(gitignore).

## 규칙
- 한국어로 답한다. 커밋 메시지도 한국어. 작업 단위마다 커밋·푸시(main). 사용자는 Vercel 자동 배포로 확인한다.
- 비밀값을 채팅/커밋에 쓰지 않는다. Supabase 관리 토큰은 `request_credential`(host api.supabase.com)로 받거나 사용자가 환경 비밀로 넣는다.
- 변경 후 `pnpm typecheck`, `pnpm lint`, `pnpm build`(apps/web)를 돌리고, 가능하면 Playwright로 화면을 찍어 확인한다.
- 룰 수치는 `DEFAULT_RULES`/`DEFAULT_PROGRESSION` 기본값 + 캠페인 설정 오버라이드(`campaigns.rules`). 하드코딩하지 않는다.
- 원작 이미지(`apps/web/public/assets/limbus`)는 비공개 팬 프로젝트 전제로만 사용. 공개 홍보 금지.

## 로컬 개발·테스트 (클라우드 샌드박스)
- 서버 fetch가 프록시를 못 타므로 `DEV_FETCH_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt PORT=3100 pnpm dev` 로 띄운다 (`src/lib/dev-fetch.ts`, `instrumentation.ts`).
- 브라우저 테스트: Playwright, 로그인은 QA 계정(`qa-tester@example.test`)으로 비밀번호 로그인해 받은 세션을 `sb-<ref>-auth-token` 쿠키(`base64-` + base64url(JSON))로 주입. 토큰은 1시간이면 만료되니 매번 새로 로그인한다. 실시간(Realtime) 확인은 브라우저도 프록시로 띄운다(`proxy: {server: HTTPS_PROXY, bypass: 'localhost'}`).
- QA 데이터: "QA 캠페인"(id 24edcfa0-…), 세션 "QA 세션", 캐릭터 "테스트 해결사"/"위자드 테스트", 적 "뒷골목 청소부".

## 외부 자원
- Supabase 프로젝트 ref `zbfznstcqejwtssfzttf` (서울, Pro, Micro). Discord OAuth 공급자 설정됨. 인증은 ES256 → `getClaims()` 로컬 검증.
- pg_cron `limbus-keep-warm` 이 1분마다 `/api/health` 호출(Vercel 콜드 스타트 완화).
- 원작 에셋 드라이브: https://drive.google.com/drive/folders/1aqElN5E1Uy8yHHsB-RM-KVgA75PSAlxP (폴더별 gid 목록은 STATUS 참고). 다운로드는 `uc?export=download&id=`.
- 참고 룰/시트: City of Black(구글 문서), "림버스 컴퍼니 프로젝트" 구글 시트(포스터형 캐릭터 시트의 모델).
