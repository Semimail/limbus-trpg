# limbus-trpg

림버스 컴퍼니 세계관 기반 오리지널 TRPG 룰과 자동화 VTT(Virtual Tabletop).

## 구성
- `packages/rules` 룰 엔진 (순수 TypeScript, UI/DB 의존 없음, 시드 RNG로 재생 가능)
- `apps/web` 웹 앱 (Next.js 16 + Supabase: 디스코드 로그인, 사무소 허브, 캐릭터 시트, 적 도감, 세션 채팅·보드·전투, 내보내기/리플레이, 룰 설정)
- `supabase/migrations` 데이터베이스 스키마 (RLS 포함)
- `scripts/db-push.sh` 관리 API로 마이그레이션 적용
- `docs/rulebook.md` 룰북 초안

## 개발
```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # Supabase URL과 publishable key 입력
pnpm dev          # http://localhost:3000
pnpm test         # 룰 엔진 테스트
pnpm typecheck
```

## 배포
Vercel에 저장소를 연결하고 Root Directory를 `apps/web`으로 지정한다.
환경 변수는 `apps/web/.env.example` 참고.

| 변수 | 용도 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase (공개 값) |
| `OPENAI_API_KEY` | SD 스프라이트 공방(`/campaigns/[id]/sprites`) 이미지 생성 |
| `SPRITE_PROVIDER` | `openai`(기본) 또는 `mock`(키 없이 파이프라인 시험) |
| `SPRITE_IMAGE_MODEL`, `SPRITE_IMAGE_QUALITY`, `SPRITE_IMAGE_SIZE` | 기본 `gpt-image-2.5-flare`(투명 배경 지원; 더 정교하게는 `gpt-image-2.5-sunburst`), `medium`, `1024x1536` |
| `SPRITE_COST_PER_IMAGE_USD` | 생성 로그에 적을 추정 단가 (선택) |
