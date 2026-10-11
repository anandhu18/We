# DriveMate OTP setup and troubleshooting

This guide covers the phone OTP flow used by `app.js`. Do not put Supabase service-role keys, SMS-provider API secrets, or database passwords in this repository.

## 1. Confirm the Supabase Phone provider

1. Open the Supabase project used by DriveMate.
2. Go to **Authentication → Sign In / Providers** (the label may vary slightly).
3. Open **Phone** and enable phone authentication.
4. Check the configured SMS provider and its credentials. Real phone OTP delivery requires a supported SMS provider; do not assume the Supabase test setup sends production SMS.
5. Check the OTP expiry, rate limits, and provider delivery logs.

## 2. If the error says DLT / sender / template is not registered

For Indian SMS delivery, this usually indicates a telecom/SMS-provider registration or template mismatch, not a visual website bug.

1. In the SMS provider's India/DLT setup, ensure the Principal Entity, sender ID/header, and OTP content template are approved as required by that provider and applicable telecom rules.
2. Ensure the exact approved template and sender/header are selected in the SMS provider integration.
3. Check that variables and punctuation in the generated OTP message match the approved template.
4. Review provider delivery logs for the rejection reason.
5. Retry with a real mobile number only after the provider reports the configuration is active.

The precise registration steps depend on the SMS provider. Website code cannot register a sender or approve a telecom template.

## 3. If the error says the phone number is not registered

The client now explicitly requests `shouldCreateUser: true` when requesting an OTP. If Supabase still reports that the user is not registered:

1. Check whether new-user sign-up is disabled in the project's authentication settings.
2. Confirm Phone authentication is enabled and the phone number is in E.164 format, for example `+919876543210`.
3. Check whether a user already exists with a different phone number or identity.
4. Inspect the exact Supabase Auth error and logs. Do not manually insert a user into `auth.users`.

## 4. Test safely before launch

- Use a test Supabase project and a phone number you control.
- Test sending, receiving, resending, invalid codes, expired codes, and rate limiting.
- Test both new-user registration and existing-user sign-in.
- Verify the customer, driver, and admin routes after authentication.
- Keep the service-role key and SMS-provider secrets only in trusted server-side configuration; never in `config.js` or browser JavaScript.

## 5. DriveMate routes

- Customer booking: `/#/book`
- Driver dashboard/application: `/#/drive`
- Admin panel: `/#/admin`

The routes require authentication. The admin panel additionally checks the authenticated user's server-side role.
