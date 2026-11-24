# Achados AO – Handoff Document (Phase 1)

**Date:** 2026-11-24  
**Status:** Phase 1 implemented (static site + Worker + D1 schema + partner confirm flow)  
**Author context:** Built under strict static + Cloudflare Pages + single Worker architecture.

---

## What exists right now

```
achados-ao/
├── index.html              # Public home
├── encontrei.html          # Register found item
├── pesquisar.html          # Public search (safe fields only)
├── pontos.html             # Public partner list
├── partner.html            # Partner portal (token login + confirm receipt)
├── css/styles.css          # Mobile-first, logo-derived palette
├── js/public.js            # Public logic
├── js/partner.js           # Partner logic (token in sessionStorage only)
├── assets/
│   ├── logo.jpeg
│   └── character.jpeg
├── worker/
│   ├── src/index.js        # Single Worker
│   ├── schema.sql          # D1 schema + 3 demo partners
│   └── wrangler.toml
├── README.md               # Deploy instructions
└── HANDOFF.md              # This file
```

### Working features
- Mobile-first public site
- “Encontrei” form → creates item with status `Entrega pendente` + unique `public_code`
- Optional photo upload via Cloudinary **unsigned** preset `achados_unsigned` (cloud name `cbr4gsjm`)
- Public search returns **only safe fields**
- Partner portal: login with token → list items assigned to that post → confirm physical receipt → status becomes `Recebido no posto`
- Privacy guard on description (rejects obvious document numbers)
- Demo partners seeded with tokens:
  - `demo-token-talatona-2026`
  - `demo-token-maianga-2026`
  - `demo-token-viana-2026`

### Not yet implemented (Phase 2+)
- Full claims / validation questions flow
- Citizen accounts
- Points system
- Platform admin panel
- Soft-delete + 30-day purge
- Audit log
- Signed Cloudinary uploads (Worker-generated)
- Force-logout / auth_epoch
- Production-grade token hashing (currently plain token match for speed)

---

## Cloudinary (already configured by owner)

- Cloud name: `cbr4gsjm`
- Unsigned preset: `achados_unsigned` (use this from the browser)
- API Key / Secret exist but **must never be put in client code or git**.  
  If you need signed uploads later, put the secret only as a Worker secret:
  ```bash
  wrangler secret put CLOUDINARY_API_SECRET
  ```

---

## How to deploy (next AI / human)

### 1. Create Cloudflare resources
```bash
cd worker
wrangler d1 create achados-db
# copy the database_id into wrangler.toml

wrangler kv:namespace create CATALOG
# copy the id into wrangler.toml

wrangler d1 execute achados-db --file=./schema.sql
```

### 2. Deploy Worker
```bash
wrangler deploy
# note the workers.dev URL, e.g. https://achados-api.xxx.workers.dev
```

### 3. Point the front-end to the Worker
In both `js/public.js` and `js/partner.js` change:
```js
const API_BASE = 'https://achados-api.YOUR_SUBDOMAIN.workers.dev';
```
(or set `window.ACHADOS_API_BASE` before the scripts).

### 4. Deploy static site to Cloudflare Pages
- Connect the GitHub repo
- Build command: none (or empty)
- Output directory: `/` (root of the repo)
- Or drag-and-drop the `achados-ao` folder for a quick test.

### 5. Test the happy path
1. Open `encontrei.html` → fill form → submit → note the `public_code`
2. Open `pesquisar.html` → search → item appears with only safe data
3. Open `partner.html` → login with `demo-token-talatona-2026` (or matching partner)
4. Confirm receipt → status changes to `Recebido no posto`

---

## Architecture rules (do not break)

1. **Static only** – pure HTML/CSS/JS, no framework, no build step.
2. **Single Worker** – all dynamic logic goes through it.
3. **Data split**
   - KV → catalog (categories + public partner list)
   - D1 → items, partners, (later claims, audit, users…)
   - Cloudinary → media only
4. **Secrets** never in client bundles or git.
5. **Privacy** – public endpoints must strip private columns in the Worker.
6. **Partner scope** – partner can only see/update items where `partner_id` matches.
7. Status machine (canonical):  
   `Entrega pendente → Recebido no posto → Em validação → Devolvido → Encerrado`

---

## Suggested Phase 2 order

1. Add `GET /items/public` already exists – extend filters if needed.
2. Claims table + validation questions (private).
3. Platform admin (`admin.html` + `/admin/data` with password secret).
4. Points ledger (award only on confirmed receipt).
5. Soft-delete (`deleted_at`) + cron purge.
6. Proper password/token hashing (Web Crypto).
7. Signed Cloudinary uploads via Worker.

---

## Demo partner tokens (Phase 1 only – change in production)

| Partner                        | Token                        |
|--------------------------------|------------------------------|
| Esquadra – Talatona            | `demo-token-talatona-2026`   |
| Bombeiros – Maianga            | `demo-token-maianga-2026`    |
| Administração – Viana          | `demo-token-viana-2026`      |

---

## Least confident / known gaps

- Front-end still points to placeholder `YOUR_SUBDOMAIN` – must be updated after first `wrangler deploy`.
- Token storage is plain-text match (fine for demo, not for production).
- No rate limiting on `/submit` yet.
- Photo upload relies on the unsigned preset remaining open; tighten folder + format + size limits in Cloudinary console.
- No automated tests yet.

---

**When continuing:** read this file first, then the architecture overview that was originally supplied by the product owner, then extend only the minimal surface needed for the next feature.
