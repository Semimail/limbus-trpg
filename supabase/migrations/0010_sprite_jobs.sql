-- SD 스프라이트 생성 작업 로그 (업로드 이미지/프롬프트 → AI 정지 이미지 1장)
create type public.sprite_job_status as enum ('queued', 'running', 'done', 'failed');

create table if not exists public.sprite_jobs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  enemy_id uuid references public.enemies(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  status public.sprite_job_status not null default 'queued',
  provider text not null,
  model text not null,
  label text not null default '',
  prompt text not null,
  source_url text,
  result_url text,
  error text,
  usage jsonb,
  cost_usd numeric(10, 4),
  duration_ms integer,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists sprite_jobs_campaign_idx on public.sprite_jobs (campaign_id, created_at desc);

alter table public.sprite_jobs enable row level security;
create policy "sprite_jobs gm" on public.sprite_jobs for all to authenticated
  using (public.is_gm(campaign_id)) with check (public.is_gm(campaign_id));

-- 결과 PNG 버킷 (공개 읽기, 본인 폴더만 쓰기)
insert into storage.buckets (id, name, public) values ('sprites', 'sprites', true) on conflict do nothing;
create policy "sprites read public" on storage.objects for select to public using (bucket_id = 'sprites');
create policy "sprites upload auth" on storage.objects for insert to authenticated
  with check (bucket_id = 'sprites' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "sprites update own" on storage.objects for update to authenticated
  using (bucket_id = 'sprites' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "sprites delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'sprites' and (storage.foldername(name))[1] = auth.uid()::text);
