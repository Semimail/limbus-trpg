-- 원작 참고 스프라이트 세트: GM 이 클라이언트에서 추출한 SD(대기 렌더·자세 스프라이트)를 올려 두면
-- 공방이 생성 요청에 참고 이미지로 함께 보낸다 (스타일 = 대기 그림, 동작 = 같은 종류 모션의 예시 띠).
create table if not exists public.sprite_refs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  set_name text not null,                 -- 원작 프리팹 이름 등 세트 묶음 이름
  role text not null,                     -- idle | attack | hit | evade | guard | down
  frames integer not null default 1,      -- 띠의 칸 수 (정지 1장이면 1)
  url text not null,                      -- sprites 버킷 공개 URL
  created_at timestamptz not null default now(),
  unique (campaign_id, set_name, role)
);
create index if not exists sprite_refs_campaign_idx on public.sprite_refs (campaign_id, set_name);
alter table public.sprite_refs enable row level security;
create policy "sprite_refs gm" on public.sprite_refs for all to authenticated
  using (public.is_gm(campaign_id)) with check (public.is_gm(campaign_id));

-- 작업 로그에 어떤 참고 이미지를 보냈는지, 어떤 세트 설정이었는지 남긴다
alter table public.sprite_jobs add column if not exists ref_urls text[];     -- 보낸 참고 이미지 URL (스타일 → 동작 순)
alter table public.sprite_jobs add column if not exists ref_set text;        -- 'auto' | 'off' | <set_name>  (null = auto)
