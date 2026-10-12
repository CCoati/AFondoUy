-- Run in the trusted Supabase SQL editor AFTER creating and verifying the intended Auth user.
-- Replace BOTH placeholders. Never run this in browser code or expose service_role.
-- The procedure fails if an active owner already exists, the UUID/email do not match,
-- or the email has not been verified. It does not create a password or user account.
select public.bootstrap_first_owner(
  'REPLACE_WITH_VERIFIED_AUTH_USER_UUID'::uuid,
  'REPLACE_WITH_THE_SAME_VERIFIED_EMAIL'
);
