-- 스프라이트 공방을 플레이어도 쓰게: 캐릭터 연결 + 본인 작업만 보기 (GM은 캠페인 전체)
alter table public.sprite_jobs add column if not exists character_id uuid references public.characters(id) on delete set null;

drop policy if exists "sprite_jobs gm" on public.sprite_jobs;
-- 읽기: 내가 만든 것, 또는 GM이면 캠페인 전체
create policy "sprite_jobs read" on public.sprite_jobs for select to authenticated
  using (created_by = auth.uid() or public.is_gm(campaign_id));
-- 만들기: 캠페인 멤버가 자기 이름으로
create policy "sprite_jobs insert" on public.sprite_jobs for insert to authenticated
  with check (created_by = auth.uid() and public.is_member(campaign_id));
-- 수정·삭제: 본인 또는 GM
create policy "sprite_jobs update" on public.sprite_jobs for update to authenticated
  using (created_by = auth.uid() or public.is_gm(campaign_id));
create policy "sprite_jobs delete" on public.sprite_jobs for delete to authenticated
  using (created_by = auth.uid() or public.is_gm(campaign_id));
