# DriveMate admin PIN setup

The admin page now has a PIN-only sign-in screen, but this feature remains unavailable until its server-side configuration is completed.

## Security model

- The PIN is checked in the Supabase Edge Function `admin-pin-login`; it is never included in `app.js` or any public repository file.
- A correct PIN unlocks only the admin account configured on the server.
- The function signs in that account, calls `my_status`, and returns a session only when the database reports `role: "admin"`.
- Failed attempts are stored in `public.admin_pin_attempts` and throttled to five attempts per IP hash in 15 minutes.
- Keep the existing database role checks and RLS policies. A frontend PIN screen is not a replacement for database authorization.

## Setup steps

1. Apply `supabase/migrations/202610110001_admin_pin_attempts.sql` to the linked Supabase project.
2. In Supabase Dashboard → Authentication → Users, identify the existing admin account. Confirm its `my_status` RPC response has `role: "admin"`.
3. Configure these Edge Function secrets for `admin-pin-login` using Supabase Dashboard → Edge Functions → Secrets:
   - `ADMIN_PIN`: use a long, random PIN/passphrase (prefer 12+ characters; avoid a short 4-digit PIN).
   - `ADMIN_EMAIL`: email for the existing admin account.
   - `ADMIN_PASSWORD`: password for that account.
4. Deploy `supabase/functions/admin-pin-login/index.ts` as the Edge Function named `admin-pin-login`. Configure gateway JWT verification off only for this login endpoint because it performs its own PIN verification; do not disable authorization checks in the database.
5. Test correct PIN, incorrect PIN, throttling, non-admin configured account, and sign-out. Do not merge/deploy the frontend until the function and migration are configured and verified.

Never commit real secrets or paste them into public JavaScript. Rotate the admin account password if it is exposed. PIN-only access is weaker than individual MFA; use a strong secret and keep the PIN private.
