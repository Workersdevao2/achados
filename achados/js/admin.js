/**
 * Achados AO – Platform admin (Phase 2)
 * Session token in sessionStorage only. Password never stored.
 */

const API_BASE = window.ACHADOS_API_BASE || 'https://achados-api.dioboss15.workers.dev';

const STATUS_OPTIONS = [
  'Entrega pendente',
  'Recebido no posto',
  'Em validação',
  'Devolvido',
  'Encerrado'
];

const badgeClass = {
  'Entrega pendente': 'badge-pendente',
  'Recebido no posto': 'badge-recebido',
  'Em validação': 'badge-validacao',
  'Devolvido': 'badge-devolvido',
  'Encerrado': 'badge-encerrado'
};

const AdminApp = {
  session: null,
  _modalResolver: null,

  init() {
    this.session = sessionStorage.getItem('achados_admin_session');
    if (this.session) {
      this.showDashboard();
      this.loadItems();
    } else {
      this.showLogin();
    }

    document.getElementById('adminLoginForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.login();
    });
    document.getElementById('logoutBtn')?.addEventListener('click', () => this.logout());
    document.getElementById('statusFilter')?.addEventListener('change', () => this.loadItems());

    document.querySelectorAll('.admin-tab').forEach((btn) => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });

    document.getElementById('modalCancel')?.addEventListener('click', () => this._closeModal(false));
    document.getElementById('modalConfirm')?.addEventListener('click', () => this._closeModal(true));
    document.getElementById('appModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'appModal') this._closeModal(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._modalResolver) this._closeModal(false);
    });
  },

  showLogin() {
    document.getElementById('loginView').style.display = 'block';
    document.getElementById('dashboardView').style.display = 'none';
  },

  showDashboard() {
    document.getElementById('loginView').style.display = 'none';
    document.getElementById('dashboardView').style.display = 'block';
  },

  switchTab(tab) {
    document.querySelectorAll('.admin-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('tabItems').style.display = tab === 'items' ? 'block' : 'none';
    document.getElementById('tabPartners').style.display = tab === 'partners' ? 'block' : 'none';
    if (tab === 'partners') this.loadPartners();
    if (tab === 'items') this.loadItems();
  },

  async api(payload) {
    const res = await fetch(`${API_BASE}/admin/data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      if (res.status === 401) {
        sessionStorage.removeItem('achados_admin_session');
        this.session = null;
        this.showLogin();
      }
      throw new Error(data.error || 'Erro na API');
    }
    return data;
  },

  async login() {
    const input = document.getElementById('password');
    const msg = document.getElementById('loginMessage');
    const btn = document.getElementById('loginBtn');
    const password = input.value;

    if (!password) {
      msg.innerHTML = `<div class="alert alert-danger">Introduza a password.</div>`;
      return;
    }

    btn.disabled = true;
    btn.textContent = 'A entrar...';
    msg.innerHTML = '';

    try {
      const data = await this.api({ action: 'auth', password });
      this.session = data.session;
      sessionStorage.setItem('achados_admin_session', data.session);
      input.value = '';
      this.showDashboard();
      this.loadItems();
    } catch (err) {
      msg.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  },

  async logout() {
    try {
      if (this.session) await this.api({ action: 'logout', session: this.session });
    } catch (_) {}
    sessionStorage.removeItem('achados_admin_session');
    this.session = null;
    this.showLogin();
  },

  async loadItems() {
    const list = document.getElementById('itemsList');
    list.innerHTML = `<div class="state-box"><div class="spinner"></div><p>A carregar...</p></div>`;
    const status = document.getElementById('statusFilter')?.value || '';

    try {
      const data = await this.api({
        action: 'list_items',
        session: this.session,
        data: { status }
      });
      const items = data.items || [];
      if (items.length === 0) {
        list.innerHTML = `<div class="state-box"><div class="icon">📭</div><p>Nenhum item encontrado.</p></div>`;
        return;
      }

      list.innerHTML = items.map((it) => {
        const opts = STATUS_OPTIONS.map(
          (s) => `<option value="${escapeHtml(s)}" ${s === it.status ? 'selected' : ''}>${escapeHtml(s)}</option>`
        ).join('');
        return `
          <div class="partner-item" data-id="${escapeHtml(it.id)}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;flex-wrap:wrap;">
              <div>
                <strong>${escapeHtml(it.description_public || it.category)}</strong>
                <div style="font-size:0.85rem;color:var(--color-gray-500);margin-top:0.25rem;">
                  <code>${escapeHtml(it.public_code)}</code>
                  · ${escapeHtml(it.zone || '')}, ${escapeHtml(it.municipio || '')}
                  · ${escapeHtml(it.partner_name || '—')}
                </div>
                <div style="font-size:0.8rem;color:var(--color-gray-500);margin-top:0.2rem;">
                  Criado: ${it.created_at ? new Date(it.created_at + 'Z').toLocaleString('pt-AO') : '—'}
                </div>
              </div>
              <span class="badge ${badgeClass[it.status] || ''}">${escapeHtml(it.status)}</span>
            </div>
            <div class="actions" style="align-items:center;">
              <select class="form-control" style="max-width:200px;" data-status-for="${escapeHtml(it.id)}">
                ${opts}
              </select>
              <button class="btn btn-secondary" type="button" onclick="AdminApp.changeStatus('${escapeHtml(it.id)}')">
                Actualizar estado
              </button>
            </div>
          </div>`;
      }).join('');
    } catch (err) {
      list.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
    }
  },

  async loadPartners() {
    const list = document.getElementById('partnersList');
    list.innerHTML = `<div class="state-box"><div class="spinner"></div><p>A carregar...</p></div>`;

    try {
      const data = await this.api({ action: 'list_partners', session: this.session });
      const partners = data.partners || [];
      if (partners.length === 0) {
        list.innerHTML = `<div class="state-box"><p>Nenhum parceiro.</p></div>`;
        return;
      }

      list.innerHTML = partners.map((p) => `
        <div class="partner-item">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;flex-wrap:wrap;">
            <div>
              <strong>${escapeHtml(p.name)}</strong>
              <div style="font-size:0.85rem;color:var(--color-gray-500);margin-top:0.25rem;">
                ${escapeHtml(p.type || '')} · ${escapeHtml(p.municipio || '')}, ${escapeHtml(p.provincia || '')}
              </div>
              <div style="font-size:0.8rem;color:var(--color-gray-500);margin-top:0.2rem;">
                Token: <code>${escapeHtml(p.token_hint || '—')}</code>
              </div>
            </div>
            <span class="badge ${p.status === 'active' ? 'badge-recebido' : 'badge-encerrado'}">${escapeHtml(p.status)}</span>
          </div>
        </div>
      `).join('');
    } catch (err) {
      list.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
    }
  },

  async changeStatus(itemId) {
    const select = document.querySelector(`select[data-status-for="${itemId}"]`);
    const newStatus = select?.value;
    if (!newStatus) return;

    const confirmed = await this.showModal({
      title: 'Actualizar estado',
      body: `Alterar o estado deste item para “${newStatus}”?`,
      confirmLabel: 'Actualizar',
      cancelLabel: 'Cancelar'
    });
    if (!confirmed) return;

    try {
      await this.api({
        action: 'set_status',
        session: this.session,
        data: { item_id: itemId, status: newStatus }
      });
      this.loadItems();
    } catch (err) {
      await this.showModal({
        title: 'Erro',
        body: err.message,
        confirmLabel: 'OK',
        showCancel: false
      });
    }
  },

  showModal({ title, body, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', showCancel = true }) {
    return new Promise((resolve) => {
      this._modalResolver = resolve;
      const overlay = document.getElementById('appModal');
      document.getElementById('modalTitle').textContent = title;
      document.getElementById('modalBody').textContent = body;
      const confirmBtn = document.getElementById('modalConfirm');
      const cancelBtn = document.getElementById('modalCancel');
      confirmBtn.textContent = confirmLabel;
      cancelBtn.textContent = cancelLabel;
      cancelBtn.style.display = showCancel ? '' : 'none';
      overlay.hidden = false;
      overlay.setAttribute('aria-hidden', 'false');
      confirmBtn.focus();
    });
  },

  _closeModal(confirmed) {
    const overlay = document.getElementById('appModal');
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    const resolver = this._modalResolver;
    this._modalResolver = null;
    if (resolver) resolver(confirmed);
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

document.addEventListener('DOMContentLoaded', () => AdminApp.init());
window.AdminApp = AdminApp;
