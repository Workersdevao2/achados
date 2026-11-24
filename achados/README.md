# Achados AO

Plataforma angolana de perdidos e achados (documentos e bens).

**Phase 1** – Static site + Cloudflare Worker + D1 + partner confirmation flow.

## Quick start (after Cloudflare resources exist)

1. Update `worker/wrangler.toml` with your D1 and KV IDs.
2. `cd worker && wrangler d1 execute achados-db --file=./schema.sql`
3. `wrangler deploy`
4. Put the Worker URL into `js/public.js` and `js/partner.js` (`API_BASE`).
5. Deploy the static files to Cloudflare Pages (or any static host).

See **HANDOFF.md** for the complete continuation guide, demo tokens, architecture rules and Phase 2 roadmap.

## Demo partner tokens

- `demo-token-talatona-2026`
- `demo-token-maianga-2026`
- `demo-token-viana-2026`

## Privacy

Public views never expose document numbers, full names, contacts or legible ID photos.
