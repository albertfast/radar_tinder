create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.setup_radar_ingest_osm_schedule(
  p_function_url text,
  p_ingest_secret text,
  p_cron text default '*/10 * * * *',
  p_country_code text default 'US',
  p_job_name text default 'radar-ingest-osm-us'
)
returns jsonb
language plpgsql
security definer
set search_path = public, cron, net, vault, extensions
as $$
declare
  v_job_id bigint;
  v_existing_job_id bigint;
  v_url_secret_name text := p_job_name || '_url';
  v_ingest_secret_name text := p_job_name || '_ingest_secret';
  v_body jsonb := jsonb_build_object(
    'mode', 'schedule',
    'source', 'osm',
    'country_code', upper(coalesce(nullif(trim(p_country_code), ''), 'US'))
  );
  v_command text;
begin
  if coalesce(nullif(trim(p_function_url), ''), '') = '' then
    raise exception 'Function URL is required';
  end if;

  if coalesce(nullif(trim(p_ingest_secret), ''), '') = '' then
    raise exception 'Ingest secret is required';
  end if;

  delete from vault.secrets
  where name in (v_url_secret_name, v_ingest_secret_name);

  perform vault.create_secret(
    trim(p_function_url),
    v_url_secret_name,
    'Radar ingest function URL for ' || p_job_name
  );

  perform vault.create_secret(
    trim(p_ingest_secret),
    v_ingest_secret_name,
    'Radar ingest secret for ' || p_job_name
  );

  select jobid
  into v_existing_job_id
  from cron.job
  where jobname = p_job_name
  limit 1;

  if v_existing_job_id is not null then
    perform cron.unschedule(v_existing_job_id);
  end if;

  v_command := format(
    $cmd$
    select
      net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = %L),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-ingest-secret', (select decrypted_secret from vault.decrypted_secrets where name = %L)
        ),
        body := %L::jsonb
      ) as request_id;
    $cmd$,
    v_url_secret_name,
    v_ingest_secret_name,
    v_body::text
  );

  select cron.schedule(
    p_job_name,
    p_cron,
    v_command
  )
  into v_job_id;

  return jsonb_build_object(
    'job_id', v_job_id,
    'job_name', p_job_name,
    'cron', p_cron,
    'country_code', upper(coalesce(nullif(trim(p_country_code), ''), 'US')),
    'function_url_secret', v_url_secret_name,
    'ingest_secret_name', v_ingest_secret_name
  );
end;
$$;

grant execute on function public.setup_radar_ingest_osm_schedule(text, text, text, text, text)
  to service_role;
