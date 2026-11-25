# Achados AO

Plataforma angolana de perdidos e achados (documentos e bens).

**Phase 1** – Static site + Cloudflare Worker + D1 + partner confirmation flow.  
**Phase 2 (partial)** – Platform admin panel (`admin.html`) with password secret.

## Quick start (after Cloudflare resources exist)

1. Update `worker/wrangler.toml` with your D1 and KV IDs.
2. `cd worker && npx wrangler d1 execute achados-db --remote --file=./schema.sql`
3. `npx wrangler secret put ADMIN_PASSWORD`  ← required for admin panel
4. `npx wrangler deploy`
5. Put the Worker URL into `js/public.js`, `js/partner.js` and `js/admin.js` (`API_BASE`).
6. Deploy the static files to Cloudflare Pages (or any static host).

See **HANDOFF.md** for architecture rules, demo tokens, admin usage and Phase 2 roadmap.

## Demo partner tokens

- `demo-token-talatona-2026`
- `demo-token-maianga-2026`
- `demo-token-viana-2026`

## Admin

- URL: `/admin.html` (or `/admin` if your host rewrites)
- Password: the value you set with `wrangler secret put ADMIN_PASSWORD`
- Session lasts 8 hours (KV)

## Privacy

Public views never expose document numbers, full names, contacts or legible ID photos.
