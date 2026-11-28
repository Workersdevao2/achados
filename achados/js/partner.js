/**
 * Achados AO – Partner portal (Phase 1)
 * Token stays only in sessionStorage. Never in localStorage or URL.
 */

const API_BASE = window.ACHADOS_API_BASE || 'https://achados-api.dioboss15.workers.dev';

const PartnerApp = {
  token: null,
  partner: null,
  _modalResolver: null,

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

    document.querySelectorAll('#partnerTabs .admin-tab').forEach((btn) => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });

    // Modal wiring (once)
    document.getElementById('modalCancel')?.addEventListener('click', () => this._closeModal(false));
    document.getElementById('modalConfirm')?.addEventListener('click', () => this._closeModal(true));
    document.getElementById('appModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'appModal') this._closeModal(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._modalResolver) this._closeModal(false);
    });
  },

  switchTab(tab) {
    document.querySelectorAll('#partnerTabs .admin-tab').forEach((b) =>
      b.classList.toggle('active', b.dataset.tab === tab)
    );
    document.getElementById('tabItems').style.display = tab === 'items' ? 'block' : 'none';
    document.getElementById('tabClaims').style.display = tab === 'claims' ? 'block' : 'none';
    if (tab === 'claims') this.loadClaims();
    if (tab === 'items') this.loadItems();
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

      list.innerHTML = items.map(it => {
        const qs = (it.validation_questions || []).join(' · ') || '—';
        const badgeCls =
          it.status === 'Entrega pendente' ? 'badge-pendente' :
          it.status === 'Em validação' ? 'badge-validacao' : 'badge-recebido';
        return `
        <div class="partner-item" data-id="${escapeHtml(it.id)}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;flex-wrap:wrap;">
            <div>
              <strong>${escapeHtml(it.description_public || it.category)}</strong>
              <div style="font-size:0.85rem;color:var(--color-gray-500);margin-top:0.25rem;">
                Código: <code>${escapeHtml(it.public_code)}</code> · ${escapeHtml(it.zone || '')}, ${escapeHtml(it.municipio || '')}
              </div>
              <div style="font-size:0.8rem;color:var(--color-gray-500);margin-top:0.2rem;">
                Perguntas: ${escapeHtml(qs)}
              </div>
            </div>
            <span class="badge ${badgeCls}">${escapeHtml(it.status)}</span>
          </div>
          ${it.status === 'Entrega pendente' ? `
            <div class="actions">
              <button class="btn btn-success" onclick="PartnerApp.confirmReceipt('${escapeHtml(it.id)}')">
                Confirmar recepção física
              </button>
            </div>
          ` : `
            <p style="font-size:0.85rem;color:var(--color-success);margin-top:0.5rem;">
              Recebido em ${it.received_at ? new Date(it.received_at + (String(it.received_at).endsWith('Z') ? '' : 'Z')).toLocaleString('pt-AO') : '—'}
            </p>
            <div class="actions">
              <button class="btn btn-secondary" style="padding:0.4rem 0.9rem;font-size:0.85rem;"
                onclick="PartnerApp.editQuestions('${escapeHtml(it.id)}')">
                Editar perguntas
              </button>
            </div>
          `}
        </div>`;
      }).join('');
    } catch (err) {
      list.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
    }
  },

  async loadClaims() {
    const list = document.getElementById('claimsList');
    list.innerHTML = `<div class="state-box"><div class="spinner"></div><p>A carregar...</p></div>`;

    try {
      const res = await fetch(`${API_BASE}/partner/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: this.token, action: 'list_claims' })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Erro ao carregar');

      const claims = data.claims || [];
      if (claims.length === 0) {
        list.innerHTML = `<div class="state-box"><div class="icon">📭</div><p>Nenhuma reclamação neste posto.</p></div>`;
        return;
      }

      list.innerHTML = claims.map((c) => {
        const pairs = (c.validation_questions || []).map((q, i) =>
          `<div style="font-size:0.85rem;margin-top:0.25rem;"><strong>${escapeHtml(q)}</strong> → ${escapeHtml((c.answers || [])[i] || '—')}</div>`
        ).join('');
        const canAct = c.status === 'pendente' || c.status === 'em_analise';
        return `
          <div class="partner-item">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;flex-wrap:wrap;">
              <div>
                <strong>${escapeHtml(c.description_public || c.category)}</strong>
                <div style="font-size:0.85rem;color:var(--color-gray-500);margin-top:0.25rem;">
                  <code>${escapeHtml(c.public_code)}</code> · Contacto: ${escapeHtml(c.claimant_contact)}
                </div>
                ${pairs || '<div style="font-size:0.85rem;margin-top:0.25rem;color:var(--color-gray-500);">Sem perguntas</div>'}
                ${c.partner_note ? `<div style="font-size:0.8rem;margin-top:0.35rem;">Nota: ${escapeHtml(c.partner_note)}</div>` : ''}
              </div>
              <span class="badge ${c.status === 'aceite' ? 'badge-recebido' : c.status === 'rejeitado' ? 'badge-encerrado' : 'badge-validacao'}">${escapeHtml(c.status)}</span>
            </div>
            ${canAct ? `
              <div class="actions" style="flex-wrap:wrap;">
                <button class="btn btn-success" style="padding:0.4rem 0.9rem;font-size:0.85rem;"
                  onclick="PartnerApp.respondClaim('${escapeHtml(c.id)}','aceite')">Aceitar</button>
                <button class="btn btn-secondary" style="padding:0.4rem 0.9rem;font-size:0.85rem;"
                  onclick="PartnerApp.respondClaim('${escapeHtml(c.id)}','em_analise')">Em análise</button>
                <button class="btn btn-secondary" style="padding:0.4rem 0.9rem;font-size:0.85rem;"
                  onclick="PartnerApp.respondClaim('${escapeHtml(c.id)}','rejeitado')">Rejeitar</button>
              </div>
            ` : ''}
          </div>`;
      }).join('');
    } catch (err) {
      list.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
    }
  },

  async respondClaim(claimId, status) {
    const labels = { aceite: 'Aceitar', rejeitado: 'Rejeitar', em_analise: 'Marcar em análise' };
    const confirmed = await this.showModal({
      title: labels[status] || 'Actualizar',
      body: status === 'aceite'
        ? 'Aceitar esta reclamação? O item passará a “Em validação”.'
        : `Confirmar: ${labels[status]}?`,
      confirmLabel: labels[status] || 'Confirmar',
      cancelLabel: 'Cancelar'
    });
    if (!confirmed) return;

    try {
      const res = await fetch(`${API_BASE}/partner/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: this.token,
          action: 'respond_claim',
          data: { claim_id: claimId, status }
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Falha');
      this.loadClaims();
    } catch (err) {
      await this.showModal({
        title: 'Erro',
        body: err.message,
        confirmLabel: 'OK',
        showCancel: false
      });
    }
  },

  async editQuestions(itemId) {
    const q1 = window.prompt('Pergunta 1 (deixe vazio para remover todas):', '');
    if (q1 === null) return;
    const questions = [];
    if (q1.trim()) {
      questions.push(q1.trim());
      const q2 = window.prompt('Pergunta 2 (opcional):', '');
      if (q2 === null) return;
      if (q2.trim()) questions.push(q2.trim());
      const q3 = window.prompt('Pergunta 3 (opcional):', '');
      if (q3 === null) return;
      if (q3.trim()) questions.push(q3.trim());
    }

    try {
      const res = await fetch(`${API_BASE}/partner/data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: this.token,
          action: 'set_questions',
          data: { item_id: itemId, validation_questions: questions }
        })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Falha');
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

  /**
   * Promise-based branded modal.
   * @param {{ title: string, body: string, confirmLabel?: string, cancelLabel?: string, showCancel?: boolean }} opts
   * @returns {Promise<boolean>} true if confirmed
   */
  showModal({ title, body, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', showCancel = true }) {
    return new Promise((resolve) => {
      this._modalResolver = resolve;
      const overlay = document.getElementById('appModal');
      const errEl = document.getElementById('modalError');
      document.getElementById('modalTitle').textContent = title;
      document.getElementById('modalBody').textContent = body;
      errEl.hidden = true;
      errEl.textContent = '';
      const confirmBtn = document.getElementById('modalConfirm');
      const cancelBtn = document.getElementById('modalCancel');
      confirmBtn.textContent = confirmLabel;
      confirmBtn.disabled = false;
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
  },

  _showModalError(message) {
    const errEl = document.getElementById('modalError');
    errEl.textContent = message;
    errEl.hidden = false;
  },

  async confirmReceipt(itemId) {
    const confirmed = await this.showModal({
      title: 'Confirmar recepção',
      body: 'Confirma que recebeu fisicamente este objecto no posto? (Pode editar as perguntas de validação a seguir na lista.)',
      confirmLabel: 'Confirmar',
      cancelLabel: 'Cancelar'
    });
    if (!confirmed) return;

    const list = document.getElementById('itemsList');
    const prevHtml = list.innerHTML;
    list.innerHTML = `<div class="state-box"><div class="spinner"></div><p>A confirmar recepção...</p></div>`;

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

      const pts = Number(data.points_awarded) || 0;
      if (pts > 0) {
        await this.showModal({
          title: 'Recepção confirmada',
          body: `Objecto registado como recebido. +${pts} pontos atribuídos ao encontrador.`,
          confirmLabel: 'OK',
          showCancel: false
        });
      }

      this.loadItems();
    } catch (err) {
      list.innerHTML = prevHtml;
      await this.showModal({
        title: 'Não foi possível confirmar',
        body: err.message || 'Ocorreu um erro. Tente novamente.',
        confirmLabel: 'OK',
        showCancel: false
      });
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
