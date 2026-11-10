-- 세션의 현재 장면 포인터
alter table public.sessions add column if not exists current_scene_id uuid references public.scenes(id) on delete set null;
-- 메시지 실시간 전달을 위해 REPLICA IDENTITY FULL (RLS 필터용)
alter table public.messages replica identity full;
alter table public.scenes replica identity full;
alter table public.sessions replica identity full;
