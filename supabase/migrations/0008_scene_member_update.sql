-- 장면 보드: 멤버도 토큰 이동 가능 (검증은 서버 액션에서: 자기 캐릭터 토큰만)
create policy "scenes member update" on public.scenes for update to authenticated
  using (public.is_member(public.session_campaign(session_id)))
  with check (public.is_member(public.session_campaign(session_id)));
