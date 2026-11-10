-- 사무소 허브용: 캠페인 공지(의뢰 게시판 자리), 세션 생성 헬퍼
alter table public.campaigns add column if not exists notice text not null default '';
alter table public.campaigns add column if not exists next_session_note text not null default '';
