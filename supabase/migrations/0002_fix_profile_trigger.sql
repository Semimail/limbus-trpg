-- 가입 트리거 수정: custom_claims는 json 객체이므로 -> 로 꺼낸 뒤 ->> 로 읽어야 한다.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, discord_id, username, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'provider_id',
    coalesce(
      new.raw_user_meta_data->'custom_claims'->>'global_name',
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      ''
    ),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    username = excluded.username,
    avatar_url = excluded.avatar_url;
  return new;
exception when others then
  -- 프로필 생성이 실패해도 로그인 자체는 막지 않는다.
  raise warning 'handle_new_user failed: %', sqlerrm;
  return new;
end $$;
