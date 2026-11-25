/**
 * Achados AO – Cloudflare Worker (Phase 1)
 * Routes: /catalog, /submit, /items/public, /partner/data
 *
 * Secrets (set via wrangler secret put):
 *   - None required for basic Phase 1 (unsigned Cloudinary + simple partner tokens)
 *   Later: ADMIN_PASSWORD, CLOUDINARY_API_SECRET
 *
 * Bindings (wrangler.toml):
 *   - DB          → D1 database
 *   - CATALOG     → KV namespace
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}

function error(msg, status = 400) {
  return json({ ok: false, error: msg }, status);
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'AO-';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function generateId() {
  return crypto.randomUUID();
}

// ---------- Catalog (KV or fallback) ----------
async function getCatalog(env) {
  try {
    if (env.CATALOG) {
      const raw = await env.CATALOG.get('catalog');
      if (raw) return JSON.parse(raw);
    }
  } catch (_) {}

  // Fallback built-in catalog + partners from D1
  let partners = [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, name, type, address, municipio, provincia FROM partners WHERE status = 'active'`
    ).all();
    partners = results || [];
  } catch (_) {}

  return {
    categories: [
      { id: 'bi', name: 'Bilhete de Identidade e documentos pessoais', icon: '🪪' },
      { id: 'passaporte', name: 'Passaporte', icon: '🛂' },
      { id: 'carta', name: 'Carta de condução', icon: '🚗' },
      { id: 'cartoes', name: 'Cartões bancários e carteiras', icon: '💳' },
      { id: 'telemoveis', name: 'Telemóveis e electrónicos', icon: '📱' },
      { id: 'chaves', name: 'Chaves', icon: '🔑' },
      { id: 'malas', name: 'Malas e mochilas', icon: '🎒' },
      { id: 'docs', name: 'Documentos académicos / profissionais', icon: '📄' },
      { id: 'outros', name: 'Bens diversos e outros', icon: '📦' }
    ],
    partners
  };
}

// ---------- Public submit (found item) ----------
async function handleSubmit(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return error('JSON inválido');
  }

  if (body.type !== 'found') {
    return error('Tipo de submissão não suportado nesta fase');
  }

  const {
    category,
    description_public,
    zone,
    municipio,
    provincia = 'Luanda',
    found_date_approx,
    partner_id,
    finder_contact,
    photo_urls = []
  } = body;

  if (!category || !description_public || !zone || !municipio || !partner_id || !finder_contact) {
    return error('Campos obrigatórios em falta');
  }

  // Privacy guard: reject obvious sensitive patterns (very basic)
  const sensitive = /\b\d{6,}\b|BI\s*\d|passaporte\s*\d/i;
  if (sensitive.test(description_public)) {
    return error('A descrição pública não pode conter números de documentos. Use apenas descrição genérica.');
  }

  const id = generateId();
  let public_code = generateCode();
  let attempts = 0;
  while (attempts < 5) {
    const exists = await env.DB.prepare('SELECT 1 FROM items WHERE public_code = ?').bind(public_code).first();
    if (!exists) break;
    public_code = generateCode();
    attempts++;
  }

  await env.DB.prepare(`
    INSERT INTO items (
      id, public_code, category, description_public, zone, municipio, provincia,
      found_date_approx, photo_urls_json, status, partner_id, finder_contact
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Entrega pendente', ?, ?)
  `).bind(
    id, public_code, category, description_public.trim(), zone.trim(), municipio.trim(),
    provincia.trim(), found_date_approx || null, JSON.stringify(photo_urls),
    partner_id, finder_contact.trim()
  ).run();

  return json({
    ok: true,
    public_code,
    status: 'Entrega pendente',
    message: 'Registo criado. Entregue o objecto físico no posto escolhido.'
  });
}

// ---------- Public search (safe fields only) ----------
async function handlePublicItems(url, env) {
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const category = url.searchParams.get('category') || '';
  const municipio = (url.searchParams.get('municipio') || '').trim().toLowerCase();

  let sql = `
    SELECT i.id, i.public_code, i.category, i.description_public, i.zone, i.municipio,
           i.provincia, i.found_date_approx, i.status, i.photo_urls_json,
           p.name AS partner_name
    FROM items i
    LEFT JOIN partners p ON p.id = i.partner_id
    WHERE i.status IN ('Entrega pendente', 'Recebido no posto', 'Em validação')
  `;
  const params = [];

  if (category) {
    sql += ` AND i.category = ?`;
    params.push(category);
  }
  if (municipio) {
    sql += ` AND lower(i.municipio) LIKE ?`;
    params.push(`%${municipio}%`);
  }
  if (q) {
    sql += ` AND (lower(i.description_public) LIKE ? OR lower(i.zone) LIKE ?)`;
    params.push(`%${q}%`, `%${q}%`);
  }

  sql += ` ORDER BY i.created_at DESC LIMIT 50`;

  const stmt = env.DB.prepare(sql);
  const { results } = params.length ? await stmt.bind(...params).all() : await stmt.all();

  // Strip anything private (already selected only safe columns)
  const items = (results || []).map(row => ({
    id: row.id,
    public_code: row.public_code,
    category: row.category,
    description_public: row.description_public,
    zone: row.zone,
    municipio: row.municipio,
    provincia: row.provincia,
    found_date_approx: row.found_date_approx,
    status: row.status,
    partner_name: row.partner_name,
    photo_urls: (() => { try { return JSON.parse(row.photo_urls_json || '[]'); } catch { return []; } })()
  }));

  return json({ ok: true, items });
}

// ---------- Partner endpoints ----------
async function handlePartner(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return error('JSON inválido');
  }

  const { token, action, data } = body;
  if (!token) return error('Token em falta', 401);

  // Phase 1: simple token match (upgrade to hashed later)
  const partner = await env.DB.prepare(
    `SELECT id, name, type, municipio, address, status FROM partners WHERE api_token_hash = ? AND status = 'active'`
  ).bind(token).first();

  if (!partner) return error('Token inválido ou posto inactivo', 401);

  if (action === 'auth') {
    return json({ ok: true, partner });
  }

  if (action === 'list_items') {
    const { results } = await env.DB.prepare(`
      SELECT id, public_code, category, description_public, zone, municipio,
             found_date_approx, status, received_at, created_at
      FROM items
      WHERE partner_id = ? AND status IN ('Entrega pendente', 'Recebido no posto')
      ORDER BY created_at DESC
      LIMIT 100
    `).bind(partner.id).all();

    return json({ ok: true, items: results || [] });
  }

  if (action === 'confirm_receipt') {
    const itemId = data?.item_id;
    if (!itemId) return error('item_id em falta');

    const item = await env.DB.prepare(
      `SELECT id, status, partner_id FROM items WHERE id = ?`
    ).bind(itemId).first();

    if (!item) return error('Item não encontrado', 404);
    if (item.partner_id !== partner.id) return error('Este item não pertence a este posto', 403);
    if (item.status !== 'Entrega pendente') return error('Item já não está pendente de entrega');

    await env.DB.prepare(`
      UPDATE items
      SET status = 'Recebido no posto', received_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).bind(itemId).run();

    return json({ ok: true, status: 'Recebido no posto' });
  }

  return error('Acção desconhecida');
}

// ---------- Admin endpoints ----------
const ALLOWED_STATUSES = [
  'Entrega pendente',
  'Recebido no posto',
  'Em validação',
  'Devolvido',
  'Encerrado'
];

async function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  if (bufA.byteLength !== bufB.byteLength) {
    // still compare to avoid length leak timing somewhat
    await crypto.subtle.digest('SHA-256', bufA);
    return false;
  }
  return crypto.subtle.timingSafeEqual(bufA, bufB);
}

async function handleAdmin(request, env) {
  if (!env.ADMIN_PASSWORD) {
    return error('Admin não configurado. Defina o secret ADMIN_PASSWORD.', 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return error('JSON inválido');
  }

  const { action, password, session, data } = body;

  // Auth: exchange password for a short-lived session token in KV
  if (action === 'auth') {
    if (!password) return error('Password em falta', 401);
    const ok = await timingSafeEqual(password, env.ADMIN_PASSWORD);
    if (!ok) return error('Password incorrecta', 401);

    const sessionId = crypto.randomUUID();
    if (env.CATALOG) {
      await env.CATALOG.put(`admin_sess:${sessionId}`, '1', { expirationTtl: 28800 }); // 8h
    }
    return json({ ok: true, session: sessionId });
  }

  // All other actions require a valid session
  if (!session) return error('Sessão em falta', 401);
  if (env.CATALOG) {
    const valid = await env.CATALOG.get(`admin_sess:${session}`);
    if (!valid) return error('Sessão inválida ou expirada', 401);
  } else {
    return error('KV CATALOG em falta para sessões admin', 503);
  }

  if (action === 'list_partners') {
    const { results } = await env.DB.prepare(`
      SELECT id, name, type, address, municipio, provincia, status,
             substr(api_token_hash, 1, 12) || '…' AS token_hint, created_at
      FROM partners
      ORDER BY name
    `).all();
    return json({ ok: true, partners: results || [] });
  }

  if (action === 'list_items') {
    const statusFilter = data?.status || '';
    let sql = `
      SELECT i.id, i.public_code, i.category, i.description_public, i.zone, i.municipio,
             i.status, i.created_at, i.received_at, i.partner_id,
             p.name AS partner_name
      FROM items i
      LEFT JOIN partners p ON p.id = i.partner_id
    `;
    const params = [];
    if (statusFilter && ALLOWED_STATUSES.includes(statusFilter)) {
      sql += ` WHERE i.status = ?`;
      params.push(statusFilter);
    }
    sql += ` ORDER BY i.created_at DESC LIMIT 100`;
    const stmt = env.DB.prepare(sql);
    const { results } = params.length ? await stmt.bind(...params).all() : await stmt.all();
    return json({ ok: true, items: results || [] });
  }

  if (action === 'set_status') {
    const itemId = data?.item_id;
    const newStatus = data?.status;
    if (!itemId || !newStatus) return error('item_id e status obrigatórios');
    if (!ALLOWED_STATUSES.includes(newStatus)) return error('Estado inválido');

    const item = await env.DB.prepare(`SELECT id, status FROM items WHERE id = ?`).bind(itemId).first();
    if (!item) return error('Item não encontrado', 404);

    const extra =
      newStatus === 'Recebido no posto' && item.status === 'Entrega pendente'
        ? `, received_at = datetime('now')`
        : '';

    await env.DB.prepare(`
      UPDATE items SET status = ?, updated_at = datetime('now')${extra} WHERE id = ?
    `).bind(newStatus, itemId).run();

    return json({ ok: true, status: newStatus });
  }

  if (action === 'logout') {
    if (env.CATALOG && session) {
      await env.CATALOG.delete(`admin_sess:${session}`);
    }
    return json({ ok: true });
  }

  return error('Acção desconhecida');
}

// ---------- Main ----------
export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';

    try {
      if (path === '/catalog' && request.method === 'GET') {
        const catalog = await getCatalog(env);
        return json(catalog);
      }

      if (path === '/submit' && request.method === 'POST') {
        return await handleSubmit(request, env);
      }

      if (path === '/items/public' && request.method === 'GET') {
        return await handlePublicItems(url, env);
      }

      if (path === '/partner/data' && request.method === 'POST') {
        return await handlePartner(request, env);
      }

      if (path === '/admin/data' && request.method === 'POST') {
        return await handleAdmin(request, env);
      }

      return error('Not found', 404);
    } catch (err) {
      console.error(err);
      // Temporary: return the real error so we can debug (remove later)
      return error(err.message || 'Erro interno do servidor', 500);
    }
  }
};
