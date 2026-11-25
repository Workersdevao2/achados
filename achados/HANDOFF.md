# Achados AO – Handoff Document

**Date:** 2026-11-25  
**Status:** Phase 1 complete + Phase 2 admin panel  
**Author context:** Built under strict static + Cloudflare Pages + single Worker architecture.

---

## What exists right now

```
achados/
├── index.html              # Public home
├── encontrei.html          # Register found item
├── pesquisar.html          # Public search (safe fields only)
├── pontos.html             # Public partner list
├── partner.html            # Partner portal (token login + confirm receipt)
├── admin.html              # Platform admin (password + session)
├── css/styles.css          # Mobile-first, logo-derived palette + modal + admin tabs
├── js/public.js            # Public logic
├── js/partner.js           # Partner logic (token in sessionStorage only)
├── js/admin.js             # Admin logic (session in sessionStorage only)
├── assets/
│   ├── logo.jpeg
│   └── character.jpeg
├── worker/
│   ├── src/index.js        # Single Worker
│   ├── schema.sql          # D1 schema + 3 demo partners
│   └── wrangler.toml
├── README.md
└── HANDOFF.md              # This file
```

### Working features
- Mobile-first public site
- “Encontrei” form → creates item with status `Entrega pendente` + unique `public_code`
- Optional photo upload via Cloudinary **unsigned** preset `achados_unsigned` (cloud name `cbr4gsjm`)
- Public search returns **only safe fields**
- Partner portal: login with token → list items assigned to that post → confirm physical receipt → status becomes `Recebido no posto`
- Branded confirm modal (no native `confirm()` / `alert()` on partner flow)
- **Admin panel** (`admin.html`):
  - Password via Worker secret `ADMIN_PASSWORD`
  - Session token in KV (`admin_sess:*`, 8h TTL)
  - List partners (with token hint only)
  - List items + filter by status
  - Change item status within the canonical machine
- Privacy guard on description (rejects obvious document numbers)
- Demo partners seeded with tokens:
  - `demo-token-talatona-2026`
  - `demo-token-maianga-2026`
  - `demo-token-viana-2026`

### Not yet implemented (remaining Phase 2+)
- Full claims / validation questions flow
- Citizen accounts
- Points system
- Soft-delete + 30-day purge
- Audit log
- Signed Cloudinary uploads (Worker-generated)
- Force-logout / auth_epoch
- Production-grade partner token hashing (currently plain token match)

---

## Cloudinary (already configured by owner)

- Cloud name: `cbr4gsjm`
- Unsigned preset: `achados_unsigned` (use this from the browser)
- API Key / Secret exist but **must never be put in client code or git**.  
  If you need signed uploads later, put the secret only as a Worker secret:
  ```bash
  npx wrangler secret put CLOUDINARY_API_SECRET
  ```

---

## How to deploy

### 1. Cloudflare resources (once)
```bash
cd worker
npx wrangler d1 create achados-db          # copy database_id → wrangler.toml
npx wrangler kv:namespace create CATALOG   # copy id → wrangler.toml
npx wrangler d1 execute achados-db --remote --file=./schema.sql
npx wrangler secret put ADMIN_PASSWORD     # strong password for admin.html
```

### 2. Deploy Worker
```bash
npx wrangler deploy
# note the workers.dev URL, e.g. https://achados-api.dioboss15.workers.dev
```

### 3. Point the front-end to the Worker
In `js/public.js`, `js/partner.js` and `js/admin.js`:
```js
const API_BASE = window.ACHADOS_API_BASE || 'https://achados-api.YOUR_SUBDOMAIN.workers.dev';
```

### 4. Deploy static site to Cloudflare Pages
- Build command: none
- Output directory: `/` (root of the static folder)
- Or drag-and-drop for a quick test

### 5. Smoke test
1. `encontrei.html` → submit item → note `public_code`
2. `pesquisar.html` → item appears (safe fields only)
3. `partner.html` → login with `demo-token-talatona-2026` → confirm receipt
4. `admin.html` → login with `ADMIN_PASSWORD` → see partners + items → change status

---

## Worker routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/catalog` | — | Categories + public partners |
| POST | `/submit` | — | Register found item |
| GET | `/items/public` | — | Public search (safe columns) |
| POST | `/partner/data` | partner token | auth / list_items / confirm_receipt |
| POST | `/admin/data` | ADMIN_PASSWORD → session | auth / list_partners / list_items / set_status / logout |

---

## Architecture rules (do not break)

1. **Static only** – pure HTML/CSS/JS, no framework, no build step.
2. **Single Worker** – all dynamic logic goes through it.
3. **Data split**
   - KV → catalog cache + admin sessions
   - D1 → items, partners, (later claims, audit, users…)
   - Cloudinary → media only
4. **Secrets** never in client bundles or git (`ADMIN_PASSWORD`, future Cloudinary secret).
5. **Privacy** – public endpoints must strip private columns in the Worker.
6. **Partner scope** – partner can only see/update items where `partner_id` matches.
7. Status machine (canonical):  
   `Entrega pendente → Recebido no posto → Em validação → Devolvido → Encerrado`

---

## Suggested remaining Phase 2 order

1. Claims table + validation questions (private).
2. Points ledger (award only on confirmed receipt).
3. Soft-delete (`deleted_at`) + cron purge.
4. Proper partner token hashing (Web Crypto).
5. Signed Cloudinary uploads via Worker.
6. Audit log.

---

## Demo partner tokens (Phase 1 only – change in production)

| Partner                        | Token                        |
|--------------------------------|------------------------------|
| Esquadra – Talatona            | `demo-token-talatona-2026`   |
| Bombeiros – Maianga            | `demo-token-maianga-2026`    |
| Administração – Viana          | `demo-token-viana-2026`      |

---

## Least confident / known gaps

- Admin session relies on KV; if CATALOG binding is missing, admin auth fails closed (503).
- Partner tokens still plain-text match (demo only).
- No rate limiting on `/submit` or `/admin/data` yet.
- Photo upload relies on the unsigned preset remaining open.
- No automated tests yet.
- `timingSafeEqual` path for admin password is best-effort on length mismatch.

---

**When continuing:** read this file first, then extend only the minimal surface needed for the next feature.
