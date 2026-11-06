# limbus-trpg

림버스 컴퍼니 세계관 기반 오리지널 TRPG 룰과 자동화 VTT(Virtual Tabletop).

## 구성
- `packages/rules` 룰 엔진 (순수 TypeScript, UI/DB 의존 없음, 시드 RNG로 재생 가능)
- `apps/web` 웹 앱 (Next.js + Supabase, 예정)
- `docs/rulebook.md` 룰북 초안

## 개발
```bash
pnpm install
pnpm test
pnpm typecheck
```
