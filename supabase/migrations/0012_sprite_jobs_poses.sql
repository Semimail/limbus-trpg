-- 포즈 이미지 생성: 대기(idle) 결과를 참고로 공격·피격·회피·전투불능·승리 포즈를 추가로 뽑는다
alter table public.sprite_jobs add column if not exists pose text not null default 'idle';
alter table public.sprite_jobs add column if not exists parent_job_id uuid references public.sprite_jobs(id) on delete set null;
create index if not exists sprite_jobs_parent_idx on public.sprite_jobs (parent_job_id);
