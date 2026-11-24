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

      const payload = {
        type: 'found',
        category: form.category.value,
        description_public: form.description_public.value.trim(),
        zone: form.zone.value.trim(),
        municipio: form.municipio.value.trim(),
        provincia: form.provincia.value.trim() || 'Luanda',
        found_date_approx: form.found_date_approx.value,
        partner_id: form.partner_id.value,
        finder_contact: form.finder_contact.value.trim()
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

      area.innerHTML = `
        <p style="margin-bottom:0.75rem;color:var(--color-gray-500);font-size:0.9rem;">${items.length} resultado(s)</p>
        <div class="card-grid">
          ${items.map(it => `
            <div class="item-card">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;">
                <h3>${escapeHtml(it.description_public || it.category)}</h3>
                ${statusBadge(it.status)}
              </div>
              <div class="meta">
                <span>📍 ${escapeHtml(it.zone || '')}${it.municipio ? ', ' + escapeHtml(it.municipio) : ''}</span>
                <span>📅 ${escapeHtml(it.found_date_approx || '')}</span>
                ${it.partner_name ? `<span>🏛️ ${escapeHtml(it.partner_name)}</span>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
        <div class="alert alert-warning" style="margin-top:1.25rem;">
          Encontrar uma correspondência provável <strong>não confirma</strong> a propriedade. Será sempre necessário validar a identidade ou a posse do bem junto do posto.
        </div>
      `;
    } catch (err) {
      console.error(err);
      area.innerHTML = `<div class="state-box"><p>Erro ao pesquisar. Verifique a ligação e tente novamente.</p></div>`;
    }
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
