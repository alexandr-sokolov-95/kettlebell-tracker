# Bell Log

A mobile-first kettlebell workout tracker with React, TypeScript, Vite, and Supabase Auth/Postgres. Drafts, levels, skill overrides, and immutable workout history are stored per account.

## Setup

1. Apply the migrations in `supabase/migrations/` to a Supabase project. Configure email/password Auth and set the Auth Site URL and redirect allowlist to your Pages URL. Configure SMTP if you need email delivery outside your Supabase organization.
2. Copy `.env.example` to `.env.local` and fill in the project URL and publishable key. Run `npm ci`, then `npm run dev`.
3. Set the same two GitHub Actions repository variables and select **GitHub Actions** as the Pages source. Push to `main` to test and deploy.

Run `npm test` for progression and Postgres/RLS checks, and `npm run build` for type checking and the production bundle. An owner-specific starter state can be loaded from `bell_onboarding` at first sign-in. Private seed rows are managed in Supabase.

## Catalog

Adapted from [dznz’s Wildman Skill Trees, `src/kb`](https://github.com/dznz/wildman-skill-trees/tree/67f44fa37ec9fabdcf67632b784fcc81698db77a/src/kb), based on Mark Wildman’s teaching. © 2023, [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). See [catalog license](CATALOG-LICENSE.txt).

Normalized labels and numbered IDs using the CSV graph identifiers, including KB-63 for Double Rockit. KB-46 is absent in the source. Prerequisites follow the full diagram. Repeated placeholder video URLs point to the source playlist, and skills outside the kettlebell catalog appear only as prerequisite labels.
