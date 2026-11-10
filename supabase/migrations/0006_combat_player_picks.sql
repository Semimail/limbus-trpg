-- 플레이어가 자기 스킬 선택을 저장할 수 있도록 캠페인 멤버에게 전투 상태 갱신 허용.
-- 검증은 서버 액션(엔진 setPick)에서 한다. 참가자는 모두 초대받은 사람이라는 전제.
create policy "combats member update" on public.combats for update to authenticated
  using (public.is_member(public.session_campaign(session_id)))
  with check (public.is_member(public.session_campaign(session_id)));
alter table public.combats replica identity full;
alter table public.enemy_reveals replica identity full;
