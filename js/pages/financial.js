// ============================================================
// FINANCIAL PAGE
// ============================================================

import { financialDB, clientsDB, configDB, currentUser } from '../supabase.js';
import { PAYMENT_STATUS_LABELS, MONTHS, SERVICES } from '../config.js';
import {
  formatCurrency, formatDate, formatDateTime, showToast, showConfirm,
  renderEmptyState, sanitize, generateId, daysUntil, formatDaysRelative, isOverdue
} from '../utils.js';

let allPayments = [];
let allClients = [];
let allContracts = [];
let chartInstances = {};
let filterMonth = new Date().getMonth() + 1;
let filterYear = new Date().getFullYear();
let filterStatus = '';
let filterSearch = '';
let activeTab = 'payments';

// ============================================================
// MAIN ENTRY POINT
// ============================================================
export async function renderFinancial(container, profile) {
  container.innerHTML = `
    <div id="financial-root">
      <div class="page-header">
        <div>
          <h1 class="page-title">Financeiro</h1>
          <p style="font-size:13px;color:var(--text-secondary);margin-top:2px;">MRR, cobranças e contratos da agência</p>
        </div>
        <div class="page-actions">
          ${['master','admin'].includes(profile?.role) ? `
            <button class="btn-secondary btn-sm" id="btn-gen-payments">⚡ Gerar Cobranças</button>
            <button class="btn-primary" id="btn-new-contract">+ Novo Contrato</button>
          ` : ''}
        </div>
      </div>

      <!-- KPI row placeholder -->
      <div id="kpi-row" class="kpi-grid" style="margin-bottom:24px;">
        ${[...Array(4)].map(() => `<div class="kpi-card" style="background:#f9fafb;border:1px solid var(--border);">
          <div style="height:32px;background:#e5e7eb;border-radius:6px;margin-bottom:8px;"></div>
          <div style="height:14px;background:#e5e7eb;border-radius:4px;width:60%;"></div>
        </div>`).join('')}
      </div>

      <!-- MRR chart -->
      <div class="card" style="padding:20px;margin-bottom:24px;">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:16px;">📈 MRR — Últimos 12 meses</h3>
        <div style="height:220px;position:relative;">
          <canvas id="mrr-chart"></canvas>
        </div>
      </div>

      <!-- Tabs -->
      <div class="tabs" style="margin-bottom:20px;">
        <button class="tab active" data-tab="payments">💳 Cobranças</button>
        <button class="tab" data-tab="overdue">🔴 Inadimplentes</button>
        <button class="tab" data-tab="contracts">📄 Contratos</button>
        <button class="tab" data-tab="ltv">📊 LTV</button>
        <button class="tab" data-tab="asaas">🔗 Asaas</button>
      </div>

      <div id="financial-tab-content">
        <div style="text-align:center;padding:40px;">⏳ Carregando...</div>
      </div>
    </div>
  `;

  // Load data
  try {
    [allPayments, allClients, allContracts] = await Promise.all([
      financialDB.getPayments({ month: filterMonth, year: filterYear }),
      clientsDB.getAll(),
      loadAllContracts()
    ]);
  } catch (err) {
    showToast('Erro ao carregar financeiro: ' + err.message, 'error');
    allPayments = []; allClients = []; allContracts = [];
  }

  renderKPIs();
  renderMRRChart();
  renderActiveTab();

  // Tab switching
  document.querySelectorAll('[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-tab]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.dataset.tab;
      renderActiveTab();
    });
  });

  document.getElementById('btn-gen-payments')?.addEventListener('click', () => openGeneratePaymentsModal());
  document.getElementById('btn-new-contract')?.addEventListener('click', () => openContractModal(null));
}

async function loadAllContracts() {
  const contracts = [];
  const { supabase } = await import('../supabase.js');
  const { data } = await supabase
    .from('financial_contracts')
    .select('*, client:clients(id, name, whatsapp, phone)')
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  return data || [];
}

// ============================================================
// KPI CARDS
// ============================================================
function renderKPIs() {
  const now = new Date();
  const thisMonthPayments = allPayments.filter(p => p.month === filterMonth && p.year === filterYear);
  const paid = thisMonthPayments.filter(p => p.status === 'paid').reduce((s,p) => s+(p.amount||0), 0);
  const pending = thisMonthPayments.filter(p => p.status === 'pending').reduce((s,p) => s+(p.amount||0), 0);
  const overdue = thisMonthPayments.filter(p => p.status === 'overdue').reduce((s,p) => s+(p.amount||0), 0);

  // MRR = total active contracts
  const mrr = allContracts
    .filter(c => c.is_active)
    .reduce((s, c) => s + (c.total_value || 0), 0);

  const kpiEl = document.getElementById('kpi-row');
  if (!kpiEl) return;
  kpiEl.innerHTML = `
    <div class="kpi-card">
      <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">MRR</div>
      <div style="font-size:26px;font-weight:800;color:#6366f1;">${formatCurrency(mrr)}</div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">Receita Recorrente Mensal</div>
    </div>
    <div class="kpi-card">
      <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Recebido — ${MONTHS[filterMonth-1]}</div>
      <div style="font-size:26px;font-weight:800;color:#10b981;">${formatCurrency(paid)}</div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">${thisMonthPayments.filter(p=>p.status==='paid').length} pagamentos</div>
    </div>
    <div class="kpi-card">
      <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Pendente</div>
      <div style="font-size:26px;font-weight:800;color:#f59e0b;">${formatCurrency(pending)}</div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">${thisMonthPayments.filter(p=>p.status==='pending').length} pendentes</div>
    </div>
    <div class="kpi-card">
      <div style="font-size:11px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Inadimplente</div>
      <div style="font-size:26px;font-weight:800;color:#ef4444;">${formatCurrency(overdue)}</div>
      <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">${thisMonthPayments.filter(p=>p.status==='overdue').length} em atraso</div>
    </div>
  `;
}

// ============================================================
// MRR CHART
// ============================================================
async function renderMRRChart() {
  const canvas = document.getElementById('mrr-chart');
  if (!canvas || !window.Chart) return;
  if (chartInstances.mrr) { chartInstances.mrr.destroy(); chartInstances.mrr = null; }

  let history = [];
  try { history = await financialDB.getMRRHistory(12); } catch { history = []; }

  const labels = history.map(h => `${MONTHS[h.month-1].slice(0,3)}/${h.year}`);
  const data = history.map(h => h.total);

  chartInstances.mrr = new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Recebido (R$)',
        data,
        backgroundColor: data.map((_, i) => i === data.length - 1 ? '#6366f1' : 'rgba(99,102,241,.4)'),
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,.05)' },
          ticks: { callback: v => `R$ ${(v/1000).toFixed(0)}k`, font: { size: 11 } }
        },
        x: { grid: { display: false }, ticks: { font: { size: 11 } } }
      }
    }
  });
}

// ============================================================
// ACTIVE TAB ROUTER
// ============================================================
function renderActiveTab() {
  const content = document.getElementById('financial-tab-content');
  if (!content) return;
  switch (activeTab) {
    case 'payments': renderPaymentsTab(content); break;
    case 'overdue': renderOverdueTab(content); break;
    case 'contracts': renderContractsTab(content); break;
    case 'ltv': renderLTVTab(content); break;
    case 'asaas': renderAsaasTab(content); break;
  }
}

// ============================================================
// PAYMENTS TAB
// ============================================================
function renderPaymentsTab(container) {
  const filtered = allPayments.filter(p => {
    if (filterStatus && p.status !== filterStatus) return false;
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      if (!(p.client?.name || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  container.innerHTML = `
    <div>
      <!-- Filters -->
      <div class="filters-bar" style="margin-bottom:16px;">
        <input type="text" class="filter-search" id="pay-search" placeholder="🔍 Buscar cliente..." value="${sanitize(filterSearch)}">
        <select id="pay-month-filter" style="padding:8px 12px;border-radius:8px;border:1px solid var(--border);font-size:13px;background:white;">
          ${MONTHS.map((m,i) => `<option value="${i+1}" ${i+1===filterMonth?'selected':''}>${m}</option>`).join('')}
        </select>
        <input type="number" id="pay-year-filter" value="${filterYear}" min="2020" max="2035"
          style="width:80px;padding:8px;border-radius:8px;border:1px solid var(--border);font-size:13px;">
        ${Object.entries(PAYMENT_STATUS_LABELS).map(([k,v]) => `
          <button class="filter-chip ${filterStatus === k ? 'active' : ''}" data-status="${k}"
            style="${filterStatus === k ? `background:${v.bg};color:${v.color};border-color:${v.color};` : ''}">${v.icon} ${v.label}</button>
        `).join('')}
      </div>

      ${filtered.length === 0
        ? renderEmptyState('💳', 'Nenhuma cobrança', 'Gere as cobranças mensais ou ajuste os filtros.')
        : `
          <div class="table-wrapper">
            <table class="data-table">
              <thead><tr>
                <th>Cliente</th>
                <th>Mês/Ano</th>
                <th>Valor</th>
                <th>Vencimento</th>
                <th>Status</th>
                <th>Ações</th>
              </tr></thead>
              <tbody>
                ${filtered.map(p => {
                  const sl = PAYMENT_STATUS_LABELS[p.status] || {};
                  const overdueFlag = p.status === 'pending' && p.due_date && isOverdue(p.due_date);
                  return `
                    <tr>
                      <td style="font-weight:600;">${sanitize(p.client?.name || '—')}</td>
                      <td>${MONTHS[(p.month||1)-1]}/${p.year}</td>
                      <td style="font-weight:700;color:${p.status === 'paid' ? '#10b981' : 'var(--text-primary)'};">${formatCurrency(p.amount)}</td>
                      <td style="color:${overdueFlag ? '#ef4444' : 'var(--text-primary)'};">
                        ${p.due_date ? formatDate(p.due_date) : '—'}
                        ${overdueFlag ? ' 🔴' : ''}
                      </td>
                      <td><span class="badge" style="background:${sl.bg};color:${sl.color};">${sl.icon} ${sl.label}</span></td>
                      <td>
                        <div style="display:flex;gap:4px;flex-wrap:wrap;">
                          ${p.status !== 'paid' ? `<button class="btn-primary btn-sm mark-paid-btn" data-pay-id="${p.id}">✅ Pago</button>` : ''}
                          ${(p.client?.whatsapp || p.client?.phone) ? `<button class="btn-secondary btn-sm send-wa-btn" data-pay-id="${p.id}">📱 WhatsApp</button>` : ''}
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `}
    </div>
  `;

  // Filter events
  let searchTimer;
  container.querySelector('#pay-search')?.addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { filterSearch = e.target.value; renderPaymentsTab(container); }, 300);
  });
  container.querySelector('#pay-month-filter')?.addEventListener('change', async e => {
    filterMonth = parseInt(e.target.value);
    await reloadPayments();
    renderPaymentsTab(container);
  });
  container.querySelector('#pay-year-filter')?.addEventListener('change', async e => {
    filterYear = parseInt(e.target.value);
    await reloadPayments();
    renderPaymentsTab(container);
  });
  container.querySelectorAll('[data-status]').forEach(btn => {
    btn.addEventListener('click', () => {
      filterStatus = filterStatus === btn.dataset.status ? '' : btn.dataset.status;
      renderPaymentsTab(container);
    });
  });

  // Mark paid buttons
  container.querySelectorAll('.mark-paid-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const payment = allPayments.find(p => p.id === btn.dataset.payId);
      if (payment) openMarkPaidModal(payment, container);
    });
  });

  // WhatsApp buttons
  container.querySelectorAll('.send-wa-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const payment = allPayments.find(p => p.id === btn.dataset.payId);
      if (payment) await sendWhatsAppReminder(payment);
    });
  });
}

async function reloadPayments() {
  try {
    allPayments = await financialDB.getPayments({ month: filterMonth, year: filterYear });
  } catch (err) {
    showToast('Erro ao carregar: ' + err.message, 'error');
  }
  renderKPIs();
}

// ---- Mark Paid Modal ----
function openMarkPaidModal(payment, container) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal-sm">
      <div class="modal-header">
        <h2 class="modal-title">✅ Marcar como Pago</h2>
        <button class="modal-close" id="close-paid-modal">✕</button>
      </div>
      <div class="modal-body">
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">
          Registrar pagamento de <strong>${sanitize(payment.client?.name || '—')}</strong> — ${formatCurrency(payment.amount)}
        </p>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Data do Pagamento *</label>
            <input type="date" class="form-input" id="paid-date" value="${new Date().toISOString().split('T')[0]}">
          </div>
          <div class="form-group">
            <label class="form-label">Método</label>
            <select class="form-select" id="paid-method">
              <option value="pix">PIX</option>
              <option value="boleto">Boleto</option>
              <option value="cartao">Cartão</option>
              <option value="transferencia">Transferência</option>
              <option value="dinheiro">Dinheiro</option>
            </select>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="cancel-paid-modal">Cancelar</button>
        <button class="btn-primary" id="confirm-paid-modal">✅ Confirmar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('close-paid-modal').addEventListener('click', () => overlay.remove());
  document.getElementById('cancel-paid-modal').addEventListener('click', () => overlay.remove());
  document.getElementById('confirm-paid-modal').addEventListener('click', async () => {
    const paidDate = document.getElementById('paid-date').value;
    const method = document.getElementById('paid-method').value;
    if (!paidDate) { showToast('Informe a data', 'warning'); return; }
    const btn = document.getElementById('confirm-paid-modal');
    btn.textContent = 'Salvando...'; btn.disabled = true;
    try {
      await financialDB.markPaid(payment.id, paidDate, method);
      payment.status = 'paid';
      payment.paid_date = paidDate;
      payment.payment_method = method;
      showToast('Pagamento registrado!', 'success');
      overlay.remove();
      renderKPIs();
      renderPaymentsTab(container);
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
      btn.textContent = '✅ Confirmar'; btn.disabled = false;
    }
  });
}

// ============================================================
// OVERDUE TAB
// ============================================================
function renderOverdueTab(container) {
  const today = new Date().toISOString().split('T')[0];
  const overduePayments = allPayments.filter(p =>
    (p.status === 'overdue' || (p.status === 'pending' && p.due_date && p.due_date < today))
  );

  // Group by client
  const byClient = {};
  overduePayments.forEach(p => {
    const cId = p.client_id;
    if (!byClient[cId]) byClient[cId] = { client: p.client, payments: [], total: 0 };
    byClient[cId].payments.push(p);
    byClient[cId].total += p.amount || 0;
  });

  container.innerHTML = `
    <div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <h3 style="font-size:15px;font-weight:700;">Clientes Inadimplentes (${Object.keys(byClient).length})</h3>
        <div style="font-size:13px;font-weight:700;color:#ef4444;">
          Total: ${formatCurrency(Object.values(byClient).reduce((s,g) => s+g.total, 0))}
        </div>
      </div>

      ${Object.keys(byClient).length === 0
        ? `<div style="text-align:center;padding:60px;color:#10b981;"><div style="font-size:48px;margin-bottom:12px;">🎉</div><div style="font-size:15px;font-weight:700;">Sem inadimplentes!</div><div style="font-size:13px;color:var(--text-secondary);">Todos os clientes estão em dia.</div></div>`
        : Object.values(byClient).map(g => `
            <div class="card" style="padding:16px;margin-bottom:12px;border-left:4px solid #ef4444;">
              <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
                <div>
                  <div style="font-size:14px;font-weight:700;">${sanitize(g.client?.name || '—')}</div>
                  <div style="font-size:12px;color:var(--text-secondary);">${g.payments.length} cobrança${g.payments.length>1?'s':''} em aberto</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:18px;font-weight:800;color:#ef4444;">${formatCurrency(g.total)}</div>
                  ${g.payments[0]?.due_date ? `<div style="font-size:11px;color:var(--text-secondary);">Venc. mais antigo: ${formatDate(g.payments.reduce((oldest, p) => (!oldest || p.due_date < oldest) ? p.due_date : oldest, null))}</div>` : ''}
                </div>
                <div style="display:flex;gap:6px;">
                  ${(g.client?.whatsapp || g.client?.phone) ? `
                    <button class="btn-secondary btn-sm overdue-wa-btn" data-pay-id="${g.payments[0]?.id}">📱 Enviar Lembrete</button>
                  ` : ''}
                </div>
              </div>
              <div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:6px;">
                ${g.payments.map(p => {
                  const days = p.due_date ? Math.abs(daysUntil(p.due_date)) : 0;
                  return `<span class="badge" style="background:#fef2f2;color:#ef4444;">${MONTHS[(p.month||1)-1]}/${p.year} — ${formatCurrency(p.amount)} (${days}d atraso)</span>`;
                }).join('')}
              </div>
            </div>
          `).join('')}
    </div>
  `;

  container.querySelectorAll('.overdue-wa-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const payment = allPayments.find(p => p.id === btn.dataset.payId);
      if (payment) await sendWhatsAppReminder(payment);
    });
  });
}

// ============================================================
// CONTRACTS TAB
// ============================================================
function renderContractsTab(container) {
  container.innerHTML = `
    <div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <h3 style="font-size:15px;font-weight:700;">Contratos Ativos (${allContracts.length})</h3>
      </div>

      ${allContracts.length === 0
        ? renderEmptyState('📄', 'Nenhum contrato', 'Crie contratos para os clientes para gerar cobranças mensais.')
        : `
          <div style="display:flex;flex-direction:column;gap:12px;">
            ${allContracts.map(c => {
              const services = Array.isArray(c.services) ? c.services : [];
              return `
                <div class="card" style="padding:16px;">
                  <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px;">
                    <div>
                      <div style="font-size:14px;font-weight:700;margin-bottom:4px;">${sanitize(c.client?.name || '—')}</div>
                      <div style="font-size:12px;color:var(--text-secondary);">
                        Vence dia <strong>${c.billing_day}</strong> •
                        Início: ${c.start_date ? formatDate(c.start_date) : '—'} •
                        ${sanitize(c.payment_method || 'pix').toUpperCase()}
                      </div>
                    </div>
                    <div style="text-align:right;">
                      <div style="font-size:20px;font-weight:800;color:#6366f1;">${formatCurrency(c.total_value)}<span style="font-size:12px;font-weight:400;color:var(--text-secondary);">/mês</span></div>
                    </div>
                    <button class="btn-secondary btn-sm edit-contract-btn" data-contract-id="${c.id}">✏️ Editar</button>
                  </div>
                  ${services.length > 0 ? `
                    <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">
                      <div style="display:flex;flex-wrap:wrap;gap:6px;">
                        ${services.map(s => `
                          <div style="display:flex;align-items:center;gap:6px;background:#f9fafb;border-radius:6px;padding:4px 10px;font-size:12px;">
                            <span>${sanitize(s.name)}</span>
                            <span style="font-weight:700;color:#6366f1;">${formatCurrency(s.value)}</span>
                          </div>
                        `).join('')}
                      </div>
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        `}

      <!-- Reajuste Alerts -->
      ${renderReajusteAlerts()}
    </div>
  `;

  container.querySelectorAll('.edit-contract-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const contract = allContracts.find(c => c.id === btn.dataset.contractId);
      if (contract) openContractModal(contract);
    });
  });
}

function renderReajusteAlerts() {
  const now = new Date();
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  const stale = allContracts.filter(c => {
    if (!c.last_price_update) return true;
    return new Date(c.last_price_update) < oneYearAgo;
  });

  if (!stale.length) return '';

  return `
    <div style="margin-top:24px;">
      <div class="alert" style="background:#fffbeb;border:1px solid #fef3c7;border-radius:10px;padding:16px;">
        <div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:10px;">⚠️ Reajuste Recomendado (${stale.length} contrato${stale.length>1?'s':''})</div>
        <div style="font-size:12px;color:#78350f;">Os contratos abaixo não foram reajustados há mais de 12 meses:</div>
        <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;">
          ${stale.map(c => `
            <div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 10px;background:rgba(0,0,0,.04);border-radius:6px;">
              <span>${sanitize(c.client?.name || '—')}</span>
              <span style="color:#92400e;font-weight:600;">${c.last_price_update ? formatDate(c.last_price_update) : 'Nunca reajustado'}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// LTV TAB
// ============================================================
async function renderLTVTab(container) {
  container.innerHTML = `<div style="text-align:center;padding:40px;">⏳ Calculando LTV...</div>`;

  let allPaidPayments = [];
  try {
    const { supabase } = await import('../supabase.js');
    const { data } = await supabase
      .from('financial_payments')
      .select('*, client:clients(id, name, status, created_at, monthly_value)')
      .eq('status', 'paid');
    allPaidPayments = data || [];
  } catch {}

  const ltvByClient = {};
  allPaidPayments.forEach(p => {
    const cId = p.client_id;
    if (!ltvByClient[cId]) {
      ltvByClient[cId] = {
        client: p.client,
        total: 0,
        payments: [],
        lastStatus: null,
        lastPayment: null
      };
    }
    ltvByClient[cId].total += p.amount || 0;
    ltvByClient[cId].payments.push(p);
    if (!ltvByClient[cId].lastPayment || p.paid_date > ltvByClient[cId].lastPayment) {
      ltvByClient[cId].lastPayment = p.paid_date;
      ltvByClient[cId].lastStatus = p.status;
    }
  });

  const rows = Object.values(ltvByClient).sort((a, b) => b.total - a.total);

  container.innerHTML = `
    <div>
      <h3 style="font-size:15px;font-weight:700;margin-bottom:16px;">📊 Lifetime Value por Cliente</h3>
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>Cliente</th>
            <th>Tempo como Cliente</th>
            <th>Total Pago (LTV)</th>
            <th>Valor Mensal</th>
            <th>Último Pagamento</th>
          </tr></thead>
          <tbody>
            ${rows.map(r => {
              const createdAt = r.client?.created_at ? new Date(r.client.created_at) : null;
              const months = createdAt
                ? Math.max(0, Math.round((new Date() - createdAt) / (1000*60*60*24*30)))
                : r.payments.length;
              return `
                <tr>
                  <td style="font-weight:600;">${sanitize(r.client?.name || '—')}</td>
                  <td>${months} mês${months !== 1 ? 'es' : ''}</td>
                  <td style="font-weight:800;color:#6366f1;">${formatCurrency(r.total)}</td>
                  <td>${r.client?.monthly_value ? formatCurrency(r.client.monthly_value) : '—'}</td>
                  <td>${r.lastPayment ? formatDate(r.lastPayment) : '—'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ============================================================
// ASAAS WEBHOOK TAB
// ============================================================
function renderAsaasTab(container) {
  const appUrl = window.location.origin;
  const webhookUrl = `${appUrl}/api/asaas/webhook`;

  container.innerHTML = `
    <div class="card" style="padding:24px;max-width:640px;">
      <h3 style="font-size:15px;font-weight:700;margin-bottom:8px;">🔗 Integração Asaas</h3>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:20px;">
        Configure o webhook do Asaas para sincronizar automaticamente o status dos pagamentos.
      </p>

      <div style="margin-bottom:20px;">
        <label class="form-label">URL do Webhook para configurar no Asaas:</label>
        <div style="display:flex;gap:8px;margin-top:6px;">
          <input type="text" class="form-input" value="${webhookUrl}" readonly id="webhook-url-input" style="flex:1;font-family:monospace;font-size:12px;">
          <button class="btn-secondary btn-sm" id="copy-webhook-url">📋 Copiar</button>
        </div>
      </div>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin-bottom:20px;">
        <div style="font-size:13px;font-weight:700;color:#166534;margin-bottom:10px;">📋 Como configurar no Asaas:</div>
        <ol style="font-size:13px;color:#15803d;line-height:1.9;padding-left:18px;">
          <li>Acesse o painel Asaas → <strong>Integrações → Webhooks</strong></li>
          <li>Clique em <strong>"Novo Webhook"</strong></li>
          <li>Cole a URL acima no campo de URL</li>
          <li>Selecione os eventos: <strong>PAYMENT_RECEIVED, PAYMENT_OVERDUE, PAYMENT_CONFIRMED</strong></li>
          <li>Salve e teste o webhook</li>
        </ol>
      </div>

      <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:16px;">
        <div style="font-size:13px;font-weight:700;color:#0369a1;margin-bottom:8px;">ℹ️ Eventos suportados:</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${['PAYMENT_RECEIVED','PAYMENT_CONFIRMED','PAYMENT_OVERDUE','PAYMENT_DELETED','PAYMENT_RESTORED','PAYMENT_UPDATED'].map(e =>
            `<span class="badge" style="background:#e0f2fe;color:#0369a1;font-family:monospace;font-size:11px;">${e}</span>`
          ).join('')}
        </div>
      </div>
    </div>
  `;

  document.getElementById('copy-webhook-url')?.addEventListener('click', () => {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      showToast('URL copiada!', 'success');
    }).catch(() => {
      document.getElementById('webhook-url-input').select();
      document.execCommand('copy');
      showToast('URL copiada!', 'success');
    });
  });
}

// ============================================================
// CONTRACT MODAL
// ============================================================
function openContractModal(contract = null) {
  const isEdit = !!contract;
  const services = Array.isArray(contract?.services) ? contract.services : [{ name: '', value: 0 }];
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  overlay.innerHTML = `
    <div class="modal modal-lg">
      <div class="modal-header">
        <h2 class="modal-title">${isEdit ? '✏️ Editar Contrato' : '📄 Novo Contrato'}</h2>
        <button class="modal-close" id="close-contract-modal">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="form-group" style="grid-column:1/-1;">
            <label class="form-label">Cliente *</label>
            <select class="form-select" id="contract-client">
              <option value="">Selecionar cliente...</option>
              ${allClients.map(c => `<option value="${c.id}" ${contract?.client_id === c.id ? 'selected' : ''}>${sanitize(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Dia de Vencimento *</label>
            <input type="number" class="form-input" id="contract-billing-day" min="1" max="28" value="${contract?.billing_day || 10}">
          </div>
          <div class="form-group">
            <label class="form-label">Data de Início</label>
            <input type="date" class="form-input" id="contract-start" value="${contract?.start_date || new Date().toISOString().split('T')[0]}">
          </div>
          <div class="form-group">
            <label class="form-label">Método de Pagamento</label>
            <select class="form-select" id="contract-method">
              <option value="pix" ${contract?.payment_method === 'pix' ? 'selected' : ''}>PIX</option>
              <option value="boleto" ${contract?.payment_method === 'boleto' ? 'selected' : ''}>Boleto</option>
              <option value="cartao" ${contract?.payment_method === 'cartao' ? 'selected' : ''}>Cartão</option>
              <option value="transferencia" ${contract?.payment_method === 'transferencia' ? 'selected' : ''}>Transferência</option>
            </select>
          </div>
        </div>

        <!-- Services -->
        <div style="margin-top:20px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <label class="form-label" style="margin:0;">Serviços Contratados</label>
            <button class="btn-secondary btn-sm" id="add-service-row" type="button">+ Adicionar Serviço</button>
          </div>
          <div id="services-list">
            ${services.map((s, i) => renderServiceRow(s, i)).join('')}
          </div>
          <div style="display:flex;justify-content:flex-end;padding:10px 0;border-top:1px solid var(--border);margin-top:8px;">
            <span style="font-size:14px;font-weight:700;">Total: <span id="services-total">${formatCurrency(services.reduce((s,r) => s+(r.value||0), 0))}</span></span>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="cancel-contract-modal">Cancelar</button>
        <button class="btn-primary" id="save-contract-modal">${isEdit ? '💾 Salvar' : '+ Criar Contrato'}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.getElementById('close-contract-modal').addEventListener('click', () => overlay.remove());
  document.getElementById('cancel-contract-modal').addEventListener('click', () => overlay.remove());

  // Update total on input
  const updateTotal = () => {
    const rows = document.querySelectorAll('.service-value-input');
    const total = [...rows].reduce((s, inp) => s + (parseFloat(inp.value) || 0), 0);
    document.getElementById('services-total').textContent = formatCurrency(total);
  };
  overlay.addEventListener('input', e => {
    if (e.target.classList.contains('service-value-input')) updateTotal();
  });

  document.getElementById('add-service-row').addEventListener('click', () => {
    const list = document.getElementById('services-list');
    const idx = list.querySelectorAll('.service-row').length;
    const div = document.createElement('div');
    div.innerHTML = renderServiceRow({ name: '', value: 0 }, idx);
    list.appendChild(div.firstElementChild);
  });

  overlay.addEventListener('click', e => {
    if (e.target.classList.contains('remove-service-row')) {
      e.target.closest('.service-row')?.remove();
      updateTotal();
    }
  });

  document.getElementById('save-contract-modal').addEventListener('click', async () => {
    const clientId = document.getElementById('contract-client').value;
    const billingDay = parseInt(document.getElementById('contract-billing-day').value);
    if (!clientId) { showToast('Selecione um cliente', 'warning'); return; }
    if (!billingDay || billingDay < 1 || billingDay > 28) { showToast('Dia de vencimento inválido (1-28)', 'warning'); return; }

    const serviceRows = document.querySelectorAll('.service-row');
    const servicesData = [...serviceRows].map(row => ({
      name: row.querySelector('.service-name-input').value.trim(),
      value: parseFloat(row.querySelector('.service-value-input').value) || 0
    })).filter(s => s.name);

    if (!servicesData.length) { showToast('Adicione ao menos um serviço', 'warning'); return; }

    const totalValue = servicesData.reduce((s, r) => s + r.value, 0);
    const data = {
      client_id: clientId,
      billing_day: billingDay,
      start_date: document.getElementById('contract-start').value || null,
      payment_method: document.getElementById('contract-method').value,
      services: servicesData,
      total_value: totalValue,
      is_active: true
    };

    const btn = document.getElementById('save-contract-modal');
    btn.textContent = 'Salvando...'; btn.disabled = true;
    try {
      if (isEdit) {
        const { supabase } = await import('../supabase.js');
        await supabase.from('financial_contracts').update({ ...data, last_price_update: new Date().toISOString() }).eq('id', contract.id);
        const idx = allContracts.findIndex(c => c.id === contract.id);
        if (idx !== -1) allContracts[idx] = { ...allContracts[idx], ...data };
      } else {
        const newContract = await financialDB.createContract(data);
        const client = allClients.find(c => c.id === clientId);
        allContracts.push({ ...newContract, client: client ? { id: client.id, name: client.name } : null });
      }
      showToast(isEdit ? 'Contrato atualizado!' : 'Contrato criado!', 'success');
      overlay.remove();
      renderKPIs();
      renderActiveTab();
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
      btn.textContent = isEdit ? '💾 Salvar' : '+ Criar Contrato';
      btn.disabled = false;
    }
  });
}

function renderServiceRow(service, idx) {
  return `
    <div class="service-row" style="display:flex;gap:8px;margin-bottom:8px;align-items:center;">
      <input type="text" class="form-input service-name-input" style="flex:2;" value="${sanitize(service.name || '')}" placeholder="Nome do serviço (ex: Social Media)">
      <input type="number" class="form-input service-value-input" style="width:140px;" value="${service.value || ''}" step="0.01" placeholder="R$ 0,00">
      <button class="btn-danger btn-sm remove-service-row" type="button">✕</button>
    </div>
  `;
}

// ============================================================
// GENERATE PAYMENTS MODAL
// ============================================================
function openGeneratePaymentsModal() {
  const now = new Date();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal-sm">
      <div class="modal-header">
        <h2 class="modal-title">⚡ Gerar Cobranças Mensais</h2>
        <button class="modal-close" id="close-gen-pay-modal">✕</button>
      </div>
      <div class="modal-body">
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">
          Gera automaticamente as cobranças de todos os contratos ativos para o mês selecionado. Cobranças já existentes não serão duplicadas.
        </p>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Mês</label>
            <select class="form-select" id="gen-pay-month">
              ${MONTHS.map((m,i) => `<option value="${i+1}" ${i+1===now.getMonth()+1?'selected':''}>${m}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Ano</label>
            <input type="number" class="form-input" id="gen-pay-year" value="${now.getFullYear()}" min="2020" max="2035">
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="cancel-gen-pay-modal">Cancelar</button>
        <button class="btn-primary" id="confirm-gen-pay-modal">⚡ Gerar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('close-gen-pay-modal').addEventListener('click', () => overlay.remove());
  document.getElementById('cancel-gen-pay-modal').addEventListener('click', () => overlay.remove());
  document.getElementById('confirm-gen-pay-modal').addEventListener('click', async () => {
    const month = parseInt(document.getElementById('gen-pay-month').value);
    const year = parseInt(document.getElementById('gen-pay-year').value);
    const btn = document.getElementById('confirm-gen-pay-modal');
    btn.textContent = 'Gerando...'; btn.disabled = true;
    try {
      const count = await financialDB.generateMonthlyPayments(month, year);
      showToast(`${count} cobranças geradas para ${MONTHS[month-1]}/${year}!`, 'success');
      filterMonth = month; filterYear = year;
      await reloadPayments();
      overlay.remove();
      document.querySelector('[data-tab="payments"]')?.click();
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
      btn.textContent = '⚡ Gerar'; btn.disabled = false;
    }
  });
}

// ============================================================
// WHATSAPP INTEGRATION
// ============================================================
export async function sendWhatsAppReminder(payment) {
  let config = {};
  try {
    config = await configDB.get('evolution_api') || {};
  } catch {}

  const { base_url, api_key, instance } = config;
  if (!base_url || !api_key || !instance) {
    showToast('Configure a Evolution API em Configurações → Integrações antes de enviar.', 'warning');
    return;
  }

  const client = payment.client;
  const phone = (client?.whatsapp || client?.phone || '').replace(/\D/g, '');
  if (!phone) {
    showToast('Cliente sem número de WhatsApp cadastrado.', 'warning');
    return;
  }

  // Format phone to international format (Brazil)
  const fullPhone = phone.startsWith('55') ? phone : `55${phone}`;

  const message = `Olá, ${sanitize(client?.name || 'cliente')}! 😊\n\n` +
    `Passando para informar sobre ${payment.status === 'overdue' ? 'a fatura em atraso' : 'sua fatura'}:\n\n` +
    `💰 Valor: *${formatCurrency(payment.amount)}*\n` +
    `📅 Vencimento: *${payment.due_date ? formatDate(payment.due_date) : '—'}*\n` +
    `📋 Referência: *${MONTHS[(payment.month||1)-1]}/${payment.year}*\n\n` +
    `Em caso de dúvidas, entre em contato conosco. Obrigado! 🙏`;

  try {
    const response = await fetch(`${base_url}/message/sendText/${instance}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': api_key
      },
      body: JSON.stringify({
        number: fullPhone,
        text: message
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.message || `HTTP ${response.status}`);
    }

    showToast(`Mensagem enviada para ${sanitize(client?.name)}!`, 'success');
  } catch (err) {
    console.error('WhatsApp send error:', err);
    showToast(`Erro ao enviar WhatsApp: ${err.message}`, 'error');
  }
}
