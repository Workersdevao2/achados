/**
 * Achados AO – Partner portal (Phase 1)
 * Token stays only in sessionStorage. Never in localStorage or URL.
 */

const API_BASE = window.ACHADOS_API_BASE || 'https://achados-api.YOUR_SUBDOMAIN.workers.dev';

const PartnerApp = {
  token: null,
  partner: null,

  init() {
    this.token = sessionStorage.getItem('achados_partner_token');
    if (this.token) {
      this.showDashboard();
      this.loadItems();
    } else {
      this.showLogin();
    }

    document.getElementById('partnerLoginForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.login();
    });

    document.getElementById('logoutBtn')?.addEventListener('click', () => this.logout());
  },

  showLogin() {
    document.getElementById('loginView').style.display = 'block';
    document.getElementById('dashboardView').style.display = 'none';
  },

  showDashboard() {
    document.getElementById('loginView').style.display = 'none';
    document.getElementById('dashboardView').style.display = 'block';
  },

  async login() {
    const tokenInput = document.getElementById('token');
    const msg = document.getElementById('loginMessage');
    const btn = document.getElementById('loginBtn');
    const token = tokenInput.value.trim();

    if (!token) {
      msg.innerHTML = `<div class="alert alert-danger">Introduza o token.</div>`;
      return;
    }

    btn.disabled = true;
    btn.textContent = 'A entrar...';
    msg.innerHTML = '';

    try {
      const res = await fetch(`${API_BASE}/partner/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action: 'auth' })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Token inválido');
      }

      this.token = token;
      this.partner = data.partner;
      sessionStorage.setItem('achados_partner_token', token);
      if (data.partner) {
        sessionStorage.setItem('achados_partner_name', data.partner.name || '');
      }

      this.showDashboard();
      document.getElementById('partnerName').textContent = data.partner?.name || 'Posto parceiro';
      document.getElementById('partnerMeta').textContent = data.partner?.municipio || '';
      this.loadItems();
    } catch (err) {
      msg.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  },

  logout() {
    sessionStorage.removeItem('achados_partner_token');
    sessionStorage.removeItem('achados_partner_name');
    this.token = null;
    this.partner = null;
    this.showLogin();
    document.getElementById('token').value = '';
  },

  async loadItems() {
    const list = document.getElementById('itemsList');
    list.innerHTML = `<div class="state-box"><div class="spinner"></div><p>A carregar...</p></div>`;

    try {
      const res = await fetch(`${API_BASE}/partner/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: this.token, action: 'list_items' })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Erro ao carregar');

      const items = data.items || [];
      if (items.length === 0) {
        list.innerHTML = `
          <div class="state-box">
            <div class="icon">📭</div>
            <p>Nenhum objecto pendente neste posto de momento.</p>
          </div>`;
        return;
      }

      list.innerHTML = items.map(it => `
        <div class="partner-item" data-id="${it.id}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;flex-wrap:wrap;">
            <div>
              <strong>${escapeHtml(it.description_public || it.category)}</strong>
              <div style="font-size:0.85rem;color:var(--color-gray-500);margin-top:0.25rem;">
                Código: <code>${escapeHtml(it.public_code)}</code> · ${escapeHtml(it.zone || '')}, ${escapeHtml(it.municipio || '')}
              </div>
            </div>
            <span class="badge ${it.status === 'Entrega pendente' ? 'badge-pendente' : 'badge-recebido'}">${escapeHtml(it.status)}</span>
          </div>
          ${it.status === 'Entrega pendente' ? `
            <div class="actions">
              <button class="btn btn-success" onclick="PartnerApp.confirmReceipt('${it.id}')">
                Confirmar recepção física
              </button>
            </div>
          ` : `
            <p style="font-size:0.85rem;color:var(--color-success);margin-top:0.5rem;">
              Recebido em ${it.received_at ? new Date(it.received_at).toLocaleString('pt-AO') : '—'}
            </p>
          `}
        </div>
      `).join('');
    } catch (err) {
      list.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
    }
  },

  async confirmReceipt(itemId) {
    if (!confirm('Confirma que recebeu fisicamente este objecto no posto?')) return;

    try {
      const res = await fetch(`${API_BASE}/partner/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: this.token,
          action: 'confirm_receipt',
          data: { item_id: itemId }
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Falha ao confirmar');
      this.loadItems();
    } catch (err) {
      alert(err.message);
    }
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

document.addEventListener('DOMContentLoaded', () => PartnerApp.init());
window.PartnerApp = PartnerApp;
