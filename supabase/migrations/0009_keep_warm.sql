-- Vercel 콜드 스타트 완화: 1분마다 /api/health 호출로 서버 인스턴스를 깨워 둔다.
create extension if not exists pg_cron;
create extension if not exists pg_net;
do $$
begin
  if exists (select 1 from cron.job where jobname = 'limbus-keep-warm') then
    perform cron.unschedule('limbus-keep-warm');
  end if;
end $$;
select cron.schedule(
  'limbus-keep-warm',
  '* * * * *',
  $$ select net.http_get(url := 'https://limbus-trpg.vercel.app/api/health', timeout_milliseconds := 8000); $$
);
