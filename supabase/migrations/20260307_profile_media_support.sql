begin;

alter table public.profiles
  add column if not exists car_image_url text;

insert into storage.buckets (id, name, public)
values ('profile-media', 'profile-media', true)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "profile_media_public_read" on storage.objects;
create policy "profile_media_public_read"
on storage.objects
for select
using (bucket_id = 'profile-media');

drop policy if exists "profile_media_insert_own" on storage.objects;
create policy "profile_media_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-media'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "profile_media_update_own" on storage.objects;
create policy "profile_media_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-media'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'profile-media'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "profile_media_delete_own" on storage.objects;
create policy "profile_media_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-media'
  and split_part(name, '/', 1) = auth.uid()::text
);

commit;
