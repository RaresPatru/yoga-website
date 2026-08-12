-- Allow public listing of media files in the media bucket
create policy "Anyone can view media files"
  on storage.objects for select
  using (bucket_id = 'media');
