/**
 * Achados AO – Cloudflare Worker (Phase 1 + Claims)
 * Routes: /catalog, /submit, /items/public, /claim, /partner/data, /admin/data
 *
 * Secrets (set via wrangler secret put):
 *   - ADMIN_PASSWORD (required for admin)
 *   Later: CLOUDINARY_API_SECRET
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

const ALLOWED_STATUSES = [
  'Entrega pendente',
  'Recebido no posto',
  'Em validação',
  'Devolvido',
  'Encerrado'
];

const CLAIM_STATUSES = ['pendente', 'em_analise', 'aceite', 'rejeitado'];
const CLAIMABLE_ITEM_STATUSES = ['Recebido no posto', 'Em validação'];
const MAX_ACTIVE_CLAIMS = 3;
const MAX_QUESTIONS = 3;

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

function normalizeQuestions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((q) => String(q || '').trim())
    .filter(Boolean)
    .slice(0, MAX_QUESTIONS);
}

function parseJsonArray(str) {
  try {
    const v = JSON.parse(str || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// ---------- Catalog (KV or fallback) ----------
async function getCatalog(env) {
  try {
    if (env.CATALOG) {
      const raw = await env.CATALOG.get('catalog');
      if (raw) return JSON.parse(raw);
    }
  } catch (_) {}

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
    photo_urls = [],
    validation_questions = []
  } = body;

  if (!category || !description_public || !zone || !municipio || !partner_id || !finder_contact) {
    return error('Campos obrigatórios em falta');
  }

  const sensitive = /\b\d{6,}\b|BI\s*\d|passaporte\s*\d/i;
  if (sensitive.test(description_public)) {
    return error('A descrição pública não pode conter números de documentos. Use apenas descrição genérica.');
  }

  const questions = normalizeQuestions(validation_questions);

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
      found_date_approx, photo_urls_json, status, partner_id, finder_contact,
      validation_questions_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Entrega pendente', ?, ?, ?)
  `).bind(
    id, public_code, category, description_public.trim(), zone.trim(), municipio.trim(),
    provincia.trim(), found_date_approx || null, JSON.stringify(photo_urls),
    partner_id, finder_contact.trim(), JSON.stringify(questions)
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
           i.validation_questions_json,
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

  // Public: expose only whether questions exist + count (not the text) for claim UI.
  // Actual questions are returned only when opening claim form via a dedicated safe path
  // or embedded as "has_questions". We return questions only for claimable items
  // because claimants need them — still private from search list presentation.
  const items = (results || []).map((row) => {
    const questions = parseJsonArray(row.validation_questions_json);
    const claimable = CLAIMABLE_ITEM_STATUSES.includes(row.status);
    return {
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
      photo_urls: parseJsonArray(row.photo_urls_json),
      // Questions are needed to claim; only for claimable statuses
      validation_questions: claimable ? questions : [],
      claimable
    };
  });

  return json({ ok: true, items });
}

// ---------- Public claim ----------
async function handleClaim(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return error('JSON inválido');
  }

  const public_code = String(body.public_code || '').trim().toUpperCase();
  const claimant_contact = String(body.claimant_contact || '').trim();
  const answers = Array.isArray(body.answers) ? body.answers.map((a) => String(a || '').trim()) : [];

  if (!public_code || !claimant_contact) {
    return error('Código público e contacto são obrigatórios');
  }
  if (claimant_contact.length < 5) {
    return error('Contacto inválido');
  }

  const item = await env.DB.prepare(
    `SELECT id, public_code, status, partner_id, validation_questions_json
     FROM items WHERE public_code = ?`
  ).bind(public_code).first();

  if (!item) return error('Código não encontrado', 404);
  if (!CLAIMABLE_ITEM_STATUSES.includes(item.status)) {
    return error('Este item ainda não está disponível para reclamação (só após recepção no posto).');
  }

  const questions = parseJsonArray(item.validation_questions_json);
  if (questions.length > 0 && answers.length !== questions.length) {
    return error('Responda a todas as perguntas de validação');
  }

  const active = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM claims
     WHERE item_id = ? AND status IN ('pendente', 'em_analise')`
  ).bind(item.id).first();

  if ((active?.c || 0) >= MAX_ACTIVE_CLAIMS) {
    return error('Este item já tem o máximo de reclamações em aberto. Contacte o posto.', 409);
  }

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO claims (id, item_id, public_code, claimant_contact, answers_json, status)
    VALUES (?, ?, ?, ?, ?, 'pendente')
  `).bind(id, item.id, item.public_code, claimant_contact, JSON.stringify(answers)).run();

  return json({
    ok: true,
    message: 'Reclamação registada. O posto irá analisar e poderá contactá-lo.'
  });
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
             found_date_approx, status, received_at, created_at, validation_questions_json
      FROM items
      WHERE partner_id = ? AND status IN ('Entrega pendente', 'Recebido no posto', 'Em validação')
      ORDER BY created_at DESC
      LIMIT 100
    `).bind(partner.id).all();

    const items = (results || []).map((row) => ({
      ...row,
      validation_questions: parseJsonArray(row.validation_questions_json)
    }));
    return json({ ok: true, items });
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

    const questions = normalizeQuestions(data?.validation_questions);
    if (questions.length) {
      await env.DB.prepare(`
        UPDATE items
        SET status = 'Recebido no posto',
            received_at = datetime('now'),
            updated_at = datetime('now'),
            validation_questions_json = ?
        WHERE id = ?
      `).bind(JSON.stringify(questions), itemId).run();
    } else {
      await env.DB.prepare(`
        UPDATE items
        SET status = 'Recebido no posto', received_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).bind(itemId).run();
    }

    return json({ ok: true, status: 'Recebido no posto' });
  }

  if (action === 'set_questions') {
    const itemId = data?.item_id;
    if (!itemId) return error('item_id em falta');
    const item = await env.DB.prepare(
      `SELECT id, partner_id, status FROM items WHERE id = ?`
    ).bind(itemId).first();
    if (!item) return error('Item não encontrado', 404);
    if (item.partner_id !== partner.id) return error('Este item não pertence a este posto', 403);

    const questions = normalizeQuestions(data?.validation_questions);
    await env.DB.prepare(`
      UPDATE items SET validation_questions_json = ?, updated_at = datetime('now') WHERE id = ?
    `).bind(JSON.stringify(questions), itemId).run();
    return json({ ok: true, validation_questions: questions });
  }

  if (action === 'list_claims') {
    const { results } = await env.DB.prepare(`
      SELECT c.id, c.item_id, c.public_code, c.claimant_contact, c.answers_json, c.status,
             c.partner_note, c.created_at,
             i.description_public, i.category, i.status AS item_status,
             i.validation_questions_json
      FROM claims c
      JOIN items i ON i.id = c.item_id
      WHERE i.partner_id = ?
      ORDER BY c.created_at DESC
      LIMIT 100
    `).bind(partner.id).all();

    const claims = (results || []).map((row) => ({
      id: row.id,
      item_id: row.item_id,
      public_code: row.public_code,
      claimant_contact: row.claimant_contact,
      answers: parseJsonArray(row.answers_json),
      validation_questions: parseJsonArray(row.validation_questions_json),
      status: row.status,
      partner_note: row.partner_note,
      created_at: row.created_at,
      description_public: row.description_public,
      category: row.category,
      item_status: row.item_status
    }));
    return json({ ok: true, claims });
  }

  if (action === 'respond_claim') {
    const claimId = data?.claim_id;
    const newStatus = data?.status;
    const note = data?.partner_note != null ? String(data.partner_note).trim() : null;

    if (!claimId || !newStatus) return error('claim_id e status obrigatórios');
    if (!CLAIM_STATUSES.includes(newStatus)) return error('Estado de reclamação inválido');

    const claim = await env.DB.prepare(`
      SELECT c.id, c.item_id, c.status, i.partner_id, i.status AS item_status
      FROM claims c
      JOIN items i ON i.id = c.item_id
      WHERE c.id = ?
    `).bind(claimId).first();

    if (!claim) return error('Reclamação não encontrada', 404);
    if (claim.partner_id !== partner.id) return error('Esta reclamação não pertence a este posto', 403);

    await env.DB.prepare(`
      UPDATE claims SET status = ?, partner_note = COALESCE(?, partner_note), updated_at = datetime('now')
      WHERE id = ?
    `).bind(newStatus, note, claimId).run();

    if (newStatus === 'aceite' && claim.item_status !== 'Devolvido' && claim.item_status !== 'Encerrado') {
      await env.DB.prepare(`
        UPDATE items SET status = 'Em validação', updated_at = datetime('now') WHERE id = ?
      `).bind(claim.item_id).run();
    }

    return json({ ok: true, status: newStatus });
  }

  return error('Acção desconhecida');
}

// ---------- Admin endpoints ----------
async function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  if (bufA.byteLength !== bufB.byteLength) {
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

  if (action === 'auth') {
    if (!password) return error('Password em falta', 401);
    const ok = await timingSafeEqual(password, env.ADMIN_PASSWORD);
    if (!ok) return error('Password incorrecta', 401);

    const sessionId = crypto.randomUUID();
    if (env.CATALOG) {
      await env.CATALOG.put(`admin_sess:${sessionId}`, '1', { expirationTtl: 28800 });
    }
    return json({ ok: true, session: sessionId });
  }

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

  if (action === 'list_claims') {
    const statusFilter = data?.status || '';
    let sql = `
      SELECT c.id, c.item_id, c.public_code, c.claimant_contact, c.answers_json, c.status,
             c.partner_note, c.created_at,
             i.description_public, i.category, i.status AS item_status,
             i.validation_questions_json, p.name AS partner_name
      FROM claims c
      JOIN items i ON i.id = c.item_id
      LEFT JOIN partners p ON p.id = i.partner_id
    `;
    const params = [];
    if (statusFilter && CLAIM_STATUSES.includes(statusFilter)) {
      sql += ` WHERE c.status = ?`;
      params.push(statusFilter);
    }
    sql += ` ORDER BY c.created_at DESC LIMIT 100`;
    const stmt = env.DB.prepare(sql);
    const { results } = params.length ? await stmt.bind(...params).all() : await stmt.all();

    const claims = (results || []).map((row) => ({
      id: row.id,
      item_id: row.item_id,
      public_code: row.public_code,
      claimant_contact: row.claimant_contact,
      answers: parseJsonArray(row.answers_json),
      validation_questions: parseJsonArray(row.validation_questions_json),
      status: row.status,
      partner_note: row.partner_note,
      created_at: row.created_at,
      description_public: row.description_public,
      category: row.category,
      item_status: row.item_status,
      partner_name: row.partner_name
    }));
    return json({ ok: true, claims });
  }

  if (action === 'respond_claim') {
    const claimId = data?.claim_id;
    const newStatus = data?.status;
    const note = data?.partner_note != null ? String(data.partner_note).trim() : null;

    if (!claimId || !newStatus) return error('claim_id e status obrigatórios');
    if (!CLAIM_STATUSES.includes(newStatus)) return error('Estado de reclamação inválido');

    const claim = await env.DB.prepare(`
      SELECT c.id, c.item_id, i.status AS item_status
      FROM claims c
      JOIN items i ON i.id = c.item_id
      WHERE c.id = ?
    `).bind(claimId).first();

    if (!claim) return error('Reclamação não encontrada', 404);

    await env.DB.prepare(`
      UPDATE claims SET status = ?, partner_note = COALESCE(?, partner_note), updated_at = datetime('now')
      WHERE id = ?
    `).bind(newStatus, note, claimId).run();

    if (newStatus === 'aceite' && claim.item_status !== 'Devolvido' && claim.item_status !== 'Encerrado') {
      await env.DB.prepare(`
        UPDATE items SET status = 'Em validação', updated_at = datetime('now') WHERE id = ?
      `).bind(claim.item_id).run();
    }

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

      if (path === '/claim' && request.method === 'POST') {
        return await handleClaim(request, env);
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
      return error(err.message || 'Erro interno do servidor', 500);
    }
  }
};
