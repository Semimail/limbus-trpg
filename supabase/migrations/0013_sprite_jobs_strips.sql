-- 프레임 띠(스프라이트 시트) 생성: 모션당 1회 호출로 N칸 띠를 받고, 브라우저에서 잘라 프레임 URL 목록을 기록한다
alter table public.sprite_jobs add column if not exists kind text not null default 'still';   -- still | strip
alter table public.sprite_jobs add column if not exists frames integer;                        -- 띠의 칸 수
alter table public.sprite_jobs add column if not exists frame_urls text[];                      -- 잘라 올린 프레임 PNG (왼쪽부터)
