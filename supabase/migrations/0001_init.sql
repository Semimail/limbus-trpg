-- 림버스 TRPG 초기 스키마
-- 적용: scripts/db-push.sh (Supabase 관리 API의 database/query 사용)

create extension if not exists pgcrypto;

-- ---------- 프로필 ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  discord_id text,
  username text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, discord_id, username, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'provider_id',
    coalesce(new.raw_user_meta_data->>'custom_claims'->>'global_name', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    username = excluded.username,
    avatar_url = excluded.avatar_url;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 캠페인 ----------
create type public.member_role as enum ('gm', 'temp_gm', 'player');

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  rules jsonb not null default '{}'::jsonb,   -- RuleConfig 오버라이드
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_members (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'player',
  joined_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create table if not exists public.campaign_invites (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references public.profiles(id),
  expires_at timestamptz,
  max_uses int,
  uses int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- 캐릭터 (계정 종속, 캠페인에 참가) ----------
create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  name text not null,
  portrait_url text,
  data jsonb not null default '{}'::jsonb,   -- 능력치, 스킬, 특기, 체력, 정신력, 레벨, 등급, 동기화, 빛, 침식도, 인벤토리
  approved boolean not null default false,   -- GM 승인
  locked boolean not null default false,     -- 전투 중 잠금
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- 적 도감 ----------
create table if not exists public.enemies (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  portrait_url text,
  data jsonb not null default '{}'::jsonb,   -- 체력, 스킬, 기믹, 저항, 속도
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 캐릭터별 공개 상태: 마주침 + 공개된 스킬/기믹 ID 목록
create table if not exists public.enemy_reveals (
  enemy_id uuid not null references public.enemies(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  revealed_skills text[] not null default '{}',
  revealed_gimmicks text[] not null default '{}',
  met_at timestamptz not null default now(),
  primary key (enemy_id, character_id)
);

-- ---------- 세션 / 장면 ----------
create type public.session_status as enum ('open', 'closed');
create type public.scene_kind as enum ('drama', 'explore', 'combat');

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null,
  status public.session_status not null default 'open',
  seed text not null default encode(gen_random_bytes(8), 'hex'),
  created_by uuid not null references public.profiles(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.scenes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  title text not null,
  kind public.scene_kind not null default 'drama',
  order_index int not null default 0,
  board jsonb not null default '{}'::jsonb,  -- 배경 이미지, 토큰 위치 등
  created_at timestamptz not null default now()
);

-- ---------- 채팅 ----------
create type public.message_kind as enum ('ic', 'ooc', 'gm', 'system', 'whisper');

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  scene_id uuid references public.scenes(id) on delete set null,
  author_id uuid references public.profiles(id) on delete set null,
  character_id uuid references public.characters(id) on delete set null,
  kind public.message_kind not null default 'ooc',
  to_user_id uuid references public.profiles(id) on delete set null,  -- 귓속말 대상
  content text not null default '',
  payload jsonb,                                -- 굴림 결과, 이미지 URL 등
  created_at timestamptz not null default now()
);
create index if not exists messages_session_idx on public.messages (session_id, id);

-- ---------- 전투 ----------
create table if not exists public.combats (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  scene_id uuid references public.scenes(id) on delete set null,
  round int not null default 0,
  phase text not null default 'setup',          -- setup | select | resolve | ended
  state jsonb not null default '{}'::jsonb,     -- 참가자 스냅샷 (엔진 Combatant[])
  rng_state bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 재생용 이벤트 로그
create table if not exists public.combat_events (
  id bigint generated always as identity primary key,
  combat_id uuid not null references public.combats(id) on delete cascade,
  seq int not null,
  event jsonb not null,
  created_at timestamptz not null default now(),
  unique (combat_id, seq)
);

-- ---------- 권한 헬퍼 ----------
create or replace function public.is_member(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.campaign_members m where m.campaign_id = cid and m.user_id = auth.uid());
$$;

create or replace function public.is_gm(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.campaign_members m
                 where m.campaign_id = cid and m.user_id = auth.uid() and m.role in ('gm', 'temp_gm'));
$$;

create or replace function public.is_owner_gm(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.campaign_members m
                 where m.campaign_id = cid and m.user_id = auth.uid() and m.role = 'gm');
$$;

create or replace function public.session_campaign(sid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select campaign_id from public.sessions where id = sid;
$$;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.campaign_invites enable row level security;
alter table public.characters enable row level security;
alter table public.enemies enable row level security;
alter table public.enemy_reveals enable row level security;
alter table public.sessions enable row level security;
alter table public.scenes enable row level security;
alter table public.messages enable row level security;
alter table public.combats enable row level security;
alter table public.combat_events enable row level security;

-- 프로필: 로그인한 누구나 읽기, 본인만 수정
create policy "profiles read" on public.profiles for select to authenticated using (true);
create policy "profiles update own" on public.profiles for update to authenticated using (id = auth.uid());

-- 캠페인: 멤버 읽기, 로그인 유저 생성, 소유자 수정/삭제
create policy "campaigns read" on public.campaigns for select to authenticated using (public.is_member(id));
create policy "campaigns insert" on public.campaigns for insert to authenticated with check (owner_id = auth.uid());
create policy "campaigns update" on public.campaigns for update to authenticated using (owner_id = auth.uid());
create policy "campaigns delete" on public.campaigns for delete to authenticated using (owner_id = auth.uid());

-- 멤버십: 멤버 읽기, 본 GM만 역할 변경/추방. 가입은 초대 함수로만.
create policy "members read" on public.campaign_members for select to authenticated using (public.is_member(campaign_id));
create policy "members update" on public.campaign_members for update to authenticated using (public.is_owner_gm(campaign_id));
create policy "members delete" on public.campaign_members for delete to authenticated
  using (public.is_owner_gm(campaign_id) or user_id = auth.uid());

-- 초대: GM만
create policy "invites gm" on public.campaign_invites for all to authenticated
  using (public.is_gm(campaign_id)) with check (public.is_gm(campaign_id));

-- 캐릭터: 본인 것 전부, 같은 캠페인 멤버 읽기, GM 수정. 잠금 중 본인 수정 불가.
create policy "characters read" on public.characters for select to authenticated
  using (owner_id = auth.uid() or (campaign_id is not null and public.is_member(campaign_id)));
create policy "characters insert" on public.characters for insert to authenticated with check (owner_id = auth.uid());
create policy "characters update" on public.characters for update to authenticated
  using ((owner_id = auth.uid() and not locked) or (campaign_id is not null and public.is_gm(campaign_id)));
create policy "characters delete" on public.characters for delete to authenticated using (owner_id = auth.uid());

-- 적 도감: GM 전체. 플레이어는 자기 캐릭터가 마주친 적만 (내용 필터링은 뷰에서)
create policy "enemies gm" on public.enemies for all to authenticated
  using (public.is_gm(campaign_id)) with check (public.is_gm(campaign_id));
create policy "enemies player read" on public.enemies for select to authenticated
  using (exists (select 1 from public.enemy_reveals r join public.characters c on c.id = r.character_id
                 where r.enemy_id = enemies.id and c.owner_id = auth.uid()));
create policy "reveals gm" on public.enemy_reveals for all to authenticated
  using (exists (select 1 from public.enemies e where e.id = enemy_id and public.is_gm(e.campaign_id)));
create policy "reveals player read" on public.enemy_reveals for select to authenticated
  using (exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid()));

-- 세션/장면: 멤버 읽기, GM 쓰기
create policy "sessions read" on public.sessions for select to authenticated using (public.is_member(campaign_id));
create policy "sessions write" on public.sessions for all to authenticated
  using (public.is_gm(campaign_id)) with check (public.is_gm(campaign_id));
create policy "scenes read" on public.scenes for select to authenticated using (public.is_member(public.session_campaign(session_id)));
create policy "scenes write" on public.scenes for all to authenticated
  using (public.is_gm(public.session_campaign(session_id))) with check (public.is_gm(public.session_campaign(session_id)));

-- 채팅: 멤버 읽기 (귓속말은 당사자와 GM만), 멤버 쓰기 (본인 명의)
create policy "messages read" on public.messages for select to authenticated
  using (
    public.is_member(public.session_campaign(session_id))
    and (kind <> 'whisper' or author_id = auth.uid() or to_user_id = auth.uid() or public.is_gm(public.session_campaign(session_id)))
  );
create policy "messages insert" on public.messages for insert to authenticated
  with check (public.is_member(public.session_campaign(session_id)) and (author_id = auth.uid() or author_id is null));
create policy "messages delete gm" on public.messages for delete to authenticated
  using (public.is_gm(public.session_campaign(session_id)));

-- 전투: 멤버 읽기, GM 쓰기 (플레이어 스킬 선택은 서버 함수로)
create policy "combats read" on public.combats for select to authenticated using (public.is_member(public.session_campaign(session_id)));
create policy "combats write" on public.combats for all to authenticated
  using (public.is_gm(public.session_campaign(session_id))) with check (public.is_gm(public.session_campaign(session_id)));
create policy "combat_events read" on public.combat_events for select to authenticated
  using (exists (select 1 from public.combats c where c.id = combat_id and public.is_member(public.session_campaign(c.session_id))));
create policy "combat_events write" on public.combat_events for insert to authenticated
  with check (exists (select 1 from public.combats c where c.id = combat_id and public.is_gm(public.session_campaign(c.session_id))));

-- ---------- 초대 코드로 가입 ----------
create or replace function public.join_campaign(invite_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare inv public.campaign_invites%rowtype;
begin
  select * into inv from public.campaign_invites where code = invite_code for update;
  if not found then raise exception '초대 코드가 올바르지 않습니다'; end if;
  if inv.expires_at is not null and inv.expires_at < now() then raise exception '만료된 초대입니다'; end if;
  if inv.max_uses is not null and inv.uses >= inv.max_uses then raise exception '사용 횟수를 초과한 초대입니다'; end if;
  insert into public.campaign_members (campaign_id, user_id, role) values (inv.campaign_id, auth.uid(), 'player')
    on conflict do nothing;
  update public.campaign_invites set uses = uses + 1 where id = inv.id;
  return inv.campaign_id;
end $$;

-- 캠페인 생성 시 소유자를 GM 멤버로 자동 등록
create or replace function public.handle_new_campaign() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.campaign_members (campaign_id, user_id, role) values (new.id, new.owner_id, 'gm');
  return new;
end $$;
drop trigger if exists on_campaign_created on public.campaigns;
create trigger on_campaign_created after insert on public.campaigns
  for each row execute function public.handle_new_campaign();

-- updated_at 자동 갱신
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger characters_touch before update on public.characters for each row execute function public.touch_updated_at();
create trigger enemies_touch before update on public.enemies for each row execute function public.touch_updated_at();
create trigger combats_touch before update on public.combats for each row execute function public.touch_updated_at();

-- ---------- 실시간 ----------
alter publication supabase_realtime add table public.messages, public.combats, public.combat_events, public.scenes, public.sessions, public.characters;

-- ---------- 스토리지 버킷 ----------
insert into storage.buckets (id, name, public) values ('portraits', 'portraits', true) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('uploads', 'uploads', true) on conflict do nothing;

create policy "storage read public" on storage.objects for select to public using (bucket_id in ('portraits', 'uploads'));
create policy "storage upload auth" on storage.objects for insert to authenticated
  with check (bucket_id in ('portraits', 'uploads') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "storage update own" on storage.objects for update to authenticated
  using (bucket_id in ('portraits', 'uploads') and (storage.foldername(name))[1] = auth.uid()::text);
create policy "storage delete own" on storage.objects for delete to authenticated
  using (bucket_id in ('portraits', 'uploads') and (storage.foldername(name))[1] = auth.uid()::text);
