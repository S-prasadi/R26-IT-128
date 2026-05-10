-- Add file_path column to cvs to store the permanent Supabase storage path.
-- file_url continues to hold a short-lived signed URL (for display); file_path
-- is the stable path used to regenerate a fresh URL on every getCV call.
alter table public.cvs
  add column if not exists file_path text;

-- Backfill: CVs whose file_url looks like a storage path (no "http") move it into file_path
update public.cvs
  set file_path = file_url, file_url = null
  where file_url is not null and file_url not like 'http%';
