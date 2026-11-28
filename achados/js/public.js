/**
 * Achados AO – Public site logic (Phase 1)
 * Talks only to the Worker. No secrets here.
 */

const API_BASE = window.ACHADOS_API_BASE || 'https://achados-api.dioboss15.workers.dev';

// Fallback demo catalog when Worker is not yet deployed
const DEMO_CATALOG = {
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
  partners: [
    { id: 'p1', name: 'Esquadra da Polícia – Talatona', type: 'esquadra', municipio: 'Belas', address: 'Talatona' },
    { id: 'p2', name: 'Bombeiros – Maianga', type: 'bombeiros', municipio: 'Luanda', address: 'Maianga' },
    { id: 'p3', name: 'Administração Municipal – Viana', type: 'admin', municipio: 'Viana', address: 'Viana' }
  ]
};

async function fetchCatalog() {
  try {
    const res = await fetch(`${API_BASE}/catalog`, { credentials: 'omit' });
    if (!res.ok) throw new Error('Catalog fetch failed');
    return await res.json();
  } catch (e) {
    console.warn('Using demo catalog (Worker not reachable)', e);
    return DEMO_CATALOG;
  }
}

function statusBadge(status) {
  const map = {
    'Entrega pendente': 'badge-pendente',
    'Recebido no posto': 'badge-recebido',
    'Em validação': 'badge-validacao',
    'Devolvido': 'badge-devolvido',
    'Encerrado': 'badge-encerrado'
  };
  const cls = map[status] || 'badge-pendente';
  return `<span class="badge ${cls}">${status}</span>`;
}

const AchadosPublic = {
  async renderHomeCategories() {
    const grid = document.getElementById('categoryGrid');
    if (!grid) return;
    const catalog = await fetchCatalog();
    grid.innerHTML = catalog.categories.map(c => `
      <a href="pesquisar.html?category=${encodeURIComponent(c.id)}" class="card-category">
        <span class="icon">${c.icon || '📦'}</span>
        <span>${c.name}</span>
      </a>
    `).join('');
  },

  async initFoundForm() {
    const catalog = await fetchCatalog();
    const catSelect = document.getElementById('category');
    const partnerSelect = document.getElementById('partner_id');

    catalog.categories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      catSelect.appendChild(opt);
    });

    catalog.partners.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.name} (${p.municipio})`;
      partnerSelect.appendChild(opt);
    });

    // Default date = today
    const dateInput = document.getElementById('found_date_approx');
    if (dateInput) dateInput.valueAsDate = new Date();

    const form = document.getElementById('foundForm');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('submitBtn');
      const msg = document.getElementById('formMessage');
      btn.disabled = true;
      btn.textContent = 'A registar...';
      msg.innerHTML = '';

      const validation_questions = [1, 2, 3]
        .map((n) => (document.getElementById('vq' + n)?.value || '').trim())
        .filter(Boolean)
        .slice(0, 3);

      const payload = {
        type: 'found',
        category: form.category.value,
        description_public: form.description_public.value.trim(),
        zone: form.zone.value.trim(),
        municipio: form.municipio.value.trim(),
        provincia: form.provincia.value.trim() || 'Luanda',
        found_date_approx: form.found_date_approx.value,
        partner_id: form.partner_id.value,
        finder_contact: form.finder_contact.value.trim(),
        validation_questions
      };

      // Basic client validation
      if (!payload.category || !payload.description_public || !payload.zone || !payload.municipio || !payload.partner_id || !payload.finder_contact) {
        msg.innerHTML = `<div class="alert alert-danger">Preencha todos os campos obrigatórios.</div>`;
        btn.disabled = false;
        btn.textContent = 'Registar achado';
        return;
      }

      try {
        // Optional photo via Cloudinary unsigned preset
        let photo_urls = [];
        const fileInput = document.getElementById('photo');
        if (fileInput.files && fileInput.files[0]) {
          const file = fileInput.files[0];
          if (file.size > 5 * 1024 * 1024) {
            throw new Error('A fotografia deve ter menos de 5 MB.');
          }
          const fd = new FormData();
          fd.append('file', file);
          fd.append('upload_preset', 'achados_unsigned');
          const upRes = await fetch('https://api.cloudinary.com/v1_1/cbr4gsjm/image/upload', {
            method: 'POST',
            body: fd
          });
          if (!upRes.ok) throw new Error('Falha no upload da fotografia');
          const upData = await upRes.json();
          photo_urls = [upData.secure_url];
        }

        payload.photo_urls = photo_urls;

        const res = await fetch(`${API_BASE}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Erro ao registar');
        }

        // Success UI
        document.getElementById('formContainer').style.display = 'none';
        document.getElementById('successContainer').style.display = 'block';
        document.getElementById('publicCode').textContent = data.public_code;
      } catch (err) {
        console.error(err);
        msg.innerHTML = `<div class="alert alert-danger">${err.message || 'Erro de rede. Tente novamente.'}</div>`;
        btn.disabled = false;
        btn.textContent = 'Registar achado';
      }
    });
  },

  async initSearchPage() {
    const catalog = await fetchCatalog();
    const catSelect = document.getElementById('category');
    catalog.categories.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      catSelect.appendChild(opt);
    });

    // Pre-fill from URL
    const params = new URLSearchParams(window.location.search);
    if (params.get('q')) document.getElementById('q').value = params.get('q');
    if (params.get('category')) document.getElementById('category').value = params.get('category');
    if (params.get('municipio')) document.getElementById('municipio').value = params.get('municipio');

    const form = document.getElementById('searchForm');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.doSearch();
    });

    // Auto-search if any param present
    if (params.get('q') || params.get('category') || params.get('municipio')) {
      this.doSearch();
    }
  },

  async doSearch() {
    const area = document.getElementById('resultsArea');
    area.innerHTML = `<div class="state-box"><div class="spinner"></div><p>A pesquisar...</p></div>`;

    const q = document.getElementById('q').value.trim();
    const category = document.getElementById('category').value;
    const municipio = document.getElementById('municipio').value.trim();

    try {
      const url = new URL(`${API_BASE}/submit`);
      // We use a GET-style search via query on a dedicated path later; for Phase 1 we POST a search action or use /catalog + client filter.
      // Better: call a search endpoint. For now the Worker will expose GET /items/public
      const res = await fetch(`${API_BASE}/items/public?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}&municipio=${encodeURIComponent(municipio)}`);
      let items = [];
      if (res.ok) {
        const data = await res.json();
        items = data.items || [];
      } else {
        // Demo fallback
        items = [];
      }

      if (items.length === 0) {
        area.innerHTML = `
          <div class="state-box">
            <div class="icon">📭</div>
            <p>Nenhum resultado encontrado com estes filtros.</p>
            <p style="font-size:0.85rem;margin-top:0.5rem;">Tente alargar a pesquisa ou registe um objecto encontrado.</p>
          </div>`;
        return;
      }

      this._lastSearchItems = items;
      area.innerHTML = `
        <p style="margin-bottom:0.75rem;color:var(--color-gray-500);font-size:0.9rem;">${items.length} resultado(s)</p>
        <div class="card-grid">
          ${items.map((it, idx) => `
            <div class="item-card">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;">
                <h3>${escapeHtml(it.description_public || it.category)}</h3>
                ${statusBadge(it.status)}
              </div>
              <div class="meta">
                <span>📍 ${escapeHtml(it.zone || '')}${it.municipio ? ', ' + escapeHtml(it.municipio) : ''}</span>
                <span>📅 ${escapeHtml(it.found_date_approx || '')}</span>
                ${it.partner_name ? `<span>🏛️ ${escapeHtml(it.partner_name)}</span>` : ''}
                <span>🔖 <code>${escapeHtml(it.public_code || '')}</code></span>
              </div>
              ${it.claimable ? `
                <div style="margin-top:0.75rem;">
                  <button type="button" class="btn btn-primary" style="padding:0.45rem 1rem;font-size:0.85rem;"
                    onclick="AchadosPublic.openClaimForm(${idx})">Este é meu</button>
                </div>
              ` : `
                <p style="font-size:0.8rem;color:var(--color-gray-500);margin-top:0.5rem;">
                  Disponível para reclamação após confirmação de recepção no posto.
                </p>
              `}
            </div>
          `).join('')}
        </div>
        <div class="alert alert-warning" style="margin-top:1.25rem;">
          Encontrar uma correspondência provável <strong>não confirma</strong> a propriedade. Será sempre necessário validar a identidade ou a posse do bem junto do posto.
        </div>
        <div id="claimPanel" style="display:none;margin-top:1.25rem;"></div>
      `;
    } catch (err) {
      console.error(err);
      area.innerHTML = `<div class="state-box"><p>Erro ao pesquisar. Verifique a ligação e tente novamente.</p></div>`;
    }
  },

  openClaimForm(idx) {
    const it = (this._lastSearchItems || [])[idx];
    const panel = document.getElementById('claimPanel');
    if (!it || !panel) return;

    const questions = Array.isArray(it.validation_questions) ? it.validation_questions : [];
    const qFields = questions.length
      ? questions.map((q, i) => `
          <div class="form-group">
            <label for="claim_a${i}">${escapeHtml(q)}</label>
            <input type="text" id="claim_a${i}" class="form-control" required maxlength="200" />
          </div>
        `).join('')
      : `<p class="hint" style="margin-bottom:0.75rem;">Não há perguntas específicas. Indique o seu contacto para o posto o contactar.</p>`;

    panel.style.display = 'block';
    panel.innerHTML = `
      <div class="form-card">
        <h2 style="font-size:1.1rem;font-weight:800;margin-bottom:0.35rem;">Reclamar: ${escapeHtml(it.public_code)}</h2>
        <p style="font-size:0.9rem;color:var(--color-gray-500);margin-bottom:1rem;">
          ${escapeHtml(it.description_public || '')}
        </p>
        <form id="claimForm">
          ${qFields}
          <div class="form-group">
            <label for="claim_contact">O seu contacto (telefone / WhatsApp / e-mail) *</label>
            <input type="text" id="claim_contact" class="form-control" required maxlength="120"
              placeholder="Só o posto / admin verá este contacto" />
          </div>
          <div id="claimMessage"></div>
          <div class="form-actions" style="display:flex;gap:0.5rem;flex-wrap:wrap;">
            <button type="submit" class="btn btn-primary" id="claimSubmitBtn">Enviar reclamação</button>
            <button type="button" class="btn btn-secondary" id="claimCancelBtn">Cancelar</button>
          </div>
        </form>
      </div>
    `;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

    document.getElementById('claimCancelBtn')?.addEventListener('click', () => {
      panel.style.display = 'none';
      panel.innerHTML = '';
    });

    document.getElementById('claimForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('claimSubmitBtn');
      const msg = document.getElementById('claimMessage');
      const contact = (document.getElementById('claim_contact')?.value || '').trim();
      const answers = questions.map((_, i) => (document.getElementById('claim_a' + i)?.value || '').trim());

      if (!contact) {
        msg.innerHTML = `<div class="alert alert-danger">Indique um contacto.</div>`;
        return;
      }
      if (questions.length && answers.some((a) => !a)) {
        msg.innerHTML = `<div class="alert alert-danger">Responda a todas as perguntas.</div>`;
        return;
      }

      btn.disabled = true;
      btn.textContent = 'A enviar...';
      msg.innerHTML = '';

      try {
        const res = await fetch(`${API_BASE}/claim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            public_code: it.public_code,
            claimant_contact: contact,
            answers
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || 'Falha ao registar reclamação');

        panel.innerHTML = `
          <div class="form-card" style="text-align:center;">
            <div style="font-size:2rem;margin-bottom:0.5rem;">✅</div>
            <h2 style="font-size:1.15rem;margin-bottom:0.5rem;">Reclamação enviada</h2>
            <p style="color:var(--color-gray-500);font-size:0.95rem;">${escapeHtml(data.message || 'O posto irá analisar.')}</p>
          </div>
        `;
      } catch (err) {
        msg.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
        btn.disabled = false;
        btn.textContent = 'Enviar reclamação';
      }
    });
  },

  async renderPartnersList() {
    const el = document.getElementById('partnersList');
    const catalog = await fetchCatalog();
    if (!catalog.partners || catalog.partners.length === 0) {
      el.innerHTML = `<div class="state-box"><p>Ainda não há postos parceiros públicos.</p></div>`;
      return;
    }
    el.innerHTML = `
      <div class="card-grid">
        ${catalog.partners.map(p => `
          <div class="card">
            <strong>${escapeHtml(p.name)}</strong>
            <p style="font-size:0.9rem;color:var(--color-gray-700);margin-top:0.35rem;">
              ${escapeHtml(p.address || '')}<br />
              ${escapeHtml(p.municipio || '')}${p.provincia ? ', ' + escapeHtml(p.provincia) : ''}
            </p>
            <p style="font-size:0.8rem;color:var(--color-gray-500);margin-top:0.4rem;text-transform:capitalize;">
              ${escapeHtml(p.type || 'parceiro')}
            </p>
          </div>
        `).join('')}
      </div>
    `;
  }
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

window.AchadosPublic = AchadosPublic;
