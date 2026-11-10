-- 캠페인 생성 직후 RETURNING이 읽기 정책에 걸리지 않도록 소유자도 읽기 허용
drop policy if exists "campaigns read" on public.campaigns;
create policy "campaigns read" on public.campaigns for select to authenticated
  using (owner_id = auth.uid() or public.is_member(id));
