-- enemies ↔ enemy_reveals 정책 상호 참조로 인한 무한 재귀 수정.
-- security definer 함수로 상대 테이블을 읽어 RLS 재귀를 끊는다.
create or replace function public.is_enemy_gm(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select public.is_gm(e.campaign_id) from public.enemies e where e.id = eid), false);
$$;

create or replace function public.owns_character(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.characters c where c.id = cid and c.owner_id = auth.uid());
$$;

create or replace function public.has_met_enemy(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.enemy_reveals r join public.characters c on c.id = r.character_id
    where r.enemy_id = eid and c.owner_id = auth.uid());
$$;

drop policy if exists "enemies player read" on public.enemies;
create policy "enemies player read" on public.enemies for select to authenticated using (public.has_met_enemy(id));

drop policy if exists "reveals gm" on public.enemy_reveals;
create policy "reveals gm" on public.enemy_reveals for all to authenticated
  using (public.is_enemy_gm(enemy_id)) with check (public.is_enemy_gm(enemy_id));

drop policy if exists "reveals player read" on public.enemy_reveals;
create policy "reveals player read" on public.enemy_reveals for select to authenticated using (public.owns_character(character_id));
