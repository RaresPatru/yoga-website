-- ============================================================================
-- Enforce upload limits on the storage bucket itself
-- ============================================================================
--
-- Uploads are moving from "browser -> our API route -> Supabase" to
-- "browser -> Supabase directly", using a short-lived signed URL that our API
-- route issues after checking the admin is who they say they are.
--
-- WHY THE CHANGE
--
-- Vercel caps a serverless function's request body at 4.5 MB. The upload route
-- advertised 50 MB and the media library repeated that in its help text, so
-- anything larger — which is most video, and plenty of photos straight off a
-- phone — failed with an opaque error. Sending the file straight to Supabase
-- sidesteps the cap entirely, and stops us paying to funnel bytes through a
-- function that only forwards them.
--
-- WHY THE LIMITS BELONG HERE
--
-- With a signed URL the browser talks to Supabase without passing back through
-- our code, so a check written in the API route is only a suggestion — nothing
-- would stop a modified client uploading a 2 GB file, or an .svg (which is XML
-- and can carry script) to a public bucket.
--
-- Setting the constraints on the bucket makes Supabase reject those uploads
-- itself. The API route still validates before issuing a token, so honest
-- clients get a clear error early; this is the backstop that holds when the
-- client is not honest.
-- ============================================================================

update storage.buckets
set
  file_size_limit = 52428800, -- 50 MB, matching what the admin UI promises
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    -- image/svg+xml is deliberately absent: an SVG is XML and can contain
    -- <script>, so serving one from a public bucket is a stored-XSS vector.
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/opus',
    'audio/webm',
    'audio/mp4',
    'audio/x-m4a',
    'audio/flac',
    'audio/aac',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-msvideo'
  ]
where id = 'media';
