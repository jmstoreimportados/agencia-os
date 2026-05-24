// ============================================================
// CRM PAGE — Client list, funnel, detail tabs
// ============================================================

import { clientsDB, tasksDB, logDB, supabase } from '../supabase.js';
import { CLIENT_STATUS_LABELS, SERVICES, MONTHS } from '../config.js';
import {
  formatCurrency, formatDate, formatDateTime, renderAvatar,
  getHealthColor, showToast, showConfirm, renderEmptyState,
  sanitize, formatPhone, formatCNPJ, truncate
} from '../utils.js';

// ============================================================
// STATE
// ============================================================
let crmState = {
  clients: [],
  filteredClients: [],
  currentFilter: 'all',
  searchQuery: '',
  currentView: 'list', // 'list' | 'funnel'
  selectedClient: null,
  selectedTab: 'geral'
};

// ============================================================
// MAIN ENTRY POINT
// ============================================================
export async function renderCRM(container, profile) {
  crmState = {
    clients: [],
    filteredClients: [],
    currentFilter: 'all',
    searchQuery: '',
    currentView: 'list',
    selectedClient: null,
    selectedTab: 'geral'
  };

  container.innerHTML = `<div id="crm-root"></div>`;
  await loadCRMList(profile);
}

// ============================================================
// CLIENT LIST VIEW
// ============================================================
async function loadCRMList(profile) {
  const root = document.getElementById('crm-root');
  if (!root) return;

  root.innerHTML = renderCRMSkeleton();

  try {
    crmState.clients = await clientsDB.getAll();
    applyFilters();
    renderCRMPage(root, profile);
  } catch (err) {
    console.error('CRM load error:', err);
    root.innerHTML = `
      <div class="card" style="text-align:center;padding:48px;">
        <div style="font-size:40px;margin-bottom:12px;">⚠️</div>
        <div style="font-size:15px;font-weight:600;margin-bottom:6px;">Erro ao carregar clientes</div>
        <div style="font-size:13px;color:var(--text-secondary);">${sanitize(err.message)}</div>
        <button class="btn-primary" style="margin:20px auto 0;" id="crm-retry-btn">Tentar novamente</button>
      </div>
    `;
    document.getElementById('crm-retry-btn')?.addEventListener('click', () => loadCRMList(profile));
  }
}

function applyFilters() {
  let list = [...crmState.clients];
  if (crmState.currentFilter !== 'all') {
    list = list.filter(c => c.status === crmState.currentFilter);
  }
  if (crmState.searchQuery) {
    const q = crmState.searchQuery.toLowerCase();
    list = list.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.cnpj?.includes(q) ||
      c.segment?.toLowerCase().includes(q)
    );
  }
  crmState.filteredClients = list;
}

function renderCRMPage(root, profile) {
  const canEdit = ['master', 'admin'].includes(profile?.role);

  const filterCounts = {};
  Object.keys(CLIENT_STATUS_LABELS).forEach(s => {
    filterCounts[s] = crmState.clients.filter(c => c.status === s).length;
  });

  root.innerHTML = `
    <!-- Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
      <div>
        <h1 style="font-size:22px;font-weight:800;color:var(--text-primary);">CRM</h1>
        <p style="font-size:13px;color:var(--text-secondary);margin-top:2px;">
          ${crmState.clients.length} cliente${crmState.clients.length !== 1 ? 's' : ''} cadastrado${crmState.clients.length !== 1 ? 's' : ''}
        </p>
      </div>
      <div style="display:flex;gap:10px;">
        ${canEdit ? `<button class="btn-primary" id="crm-new-client-btn">➕ Novo Cliente</button>` : ''}
        <button id="crm-refresh-btn" style="padding:8px 14px;border-radius:8px;border:1px solid var(--border);background:var(--surface);font-size:13px;cursor:pointer;">🔄 Atualizar</button>
      </div>
    </div>

    <!-- View Tabs (List / Funnel) -->
    <div style="display:flex;gap:4px;margin-bottom:20px;background:var(--surface-2);border-radius:10px;padding:4px;width:fit-content;border:1px solid var(--border);">
      <button class="crm-view-tab ${crmState.currentView === 'list' ? 'active' : ''}" data-view="list"
        style="padding:6px 16px;border-radius:7px;font-size:13px;font-weight:500;border:none;cursor:pointer;
          background:${crmState.currentView === 'list' ? 'white' : 'transparent'};
          color:${crmState.currentView === 'list' ? 'var(--primary)' : 'var(--text-secondary)'};
          box-shadow:${crmState.currentView === 'list' ? 'var(--shadow-sm)' : 'none'};
          transition:all .15s ease;">
        📋 Lista
      </button>
      <button class="crm-view-tab ${crmState.currentView === 'funnel' ? 'active' : ''}" data-view="funnel"
        style="padding:6px 16px;border-radius:7px;font-size:13px;font-weight:500;border:none;cursor:pointer;
          background:${crmState.currentView === 'funnel' ? 'white' : 'transparent'};
          color:${crmState.currentView === 'funnel' ? 'var(--primary)' : 'var(--text-secondary)'};
          box-shadow:${crmState.currentView === 'funnel' ? 'var(--shadow-sm)' : 'none'};
          transition:all .15s ease;">
        🏆 Funil
      </button>
    </div>

    <!-- Filter Bar -->
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;flex-wrap:wrap;">
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="crm-filter-btn ${crmState.currentFilter === 'all' ? 'active' : ''}" data-filter="all"
          style="${filterBtnStyle(crmState.currentFilter === 'all')}">
          Todos (${crmState.clients.length})
        </button>
        ${Object.entries(CLIENT_STATUS_LABELS).map(([key, s]) => `
          <button class="crm-filter-btn ${crmState.currentFilter === key ? 'active' : ''}" data-filter="${key}"
            style="${filterBtnStyle(crmState.currentFilter === key, s.color, s.bg)}">
            ${s.icon} ${s.label} (${filterCounts[key] || 0})
          </button>
        `).join('')}
      </div>

      <!-- Search -->
      <div style="margin-left:auto;display:flex;align-items:center;gap:8px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:7px 12px;width:240px;">
        <span style="font-size:14px;color:var(--text-muted);">🔍</span>
        <input id="crm-search" type="text" placeholder="Buscar cliente..."
          value="${sanitize(crmState.searchQuery)}"
          style="border:none;outline:none;font-size:13px;width:100%;background:transparent;color:var(--text-primary);">
      </div>
    </div>

    <!-- Content Area -->
    <div id="crm-content">
      ${crmState.currentView === 'list' ? renderClientTable(crmState.filteredClients, canEdit) : renderFunnelView(crmState.clients)}
    </div>
  `;

  // Bind events
  document.getElementById('crm-refresh-btn')?.addEventListener('click', () => loadCRMList(profile));
  document.getElementById('crm-new-client-btn')?.addEventListener('click', () => openNewClientModal(profile));

  document.querySelectorAll('.crm-view-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      crmState.currentView = btn.dataset.view;
      renderCRMPage(root, profile);
    });
  });

  document.querySelectorAll('.crm-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      crmState.currentFilter = btn.dataset.filter;
      applyFilters();
      const content = document.getElementById('crm-content');
      if (content) content.innerHTML = renderClientTable(crmState.filteredClients, canEdit);
      // Re-bind table rows
      bindTableEvents(root, profile);
      // Update filter buttons
      document.querySelectorAll('.crm-filter-btn').forEach(b => {
        const isActive = b.dataset.filter === crmState.currentFilter;
        const s = CLIENT_STATUS_LABELS[b.dataset.filter];
        b.setAttribute('style', filterBtnStyle(isActive, s?.color, s?.bg));
      });
    });
  });

  const searchInput = document.getElementById('crm-search');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        crmState.searchQuery = searchInput.value.trim();
        applyFilters();
        const content = document.getElementById('crm-content');
        if (content && crmState.currentView === 'list') {
          content.innerHTML = renderClientTable(crmState.filteredClients, canEdit);
          bindTableEvents(root, profile);
        }
      }, 300);
    });
  }

  bindTableEvents(root, profile);
}

function filterBtnStyle(active, color, bg) {
  if (active) {
    return `padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;border:none;
      background:${color || 'var(--primary)'};color:white;transition:all .15s;`;
  }
  return `padding:6px 12px;border-radius:20px;font-size:12px;font-weight:500;cursor:pointer;
    background:${bg || 'var(--surface-2)'};color:var(--text-secondary);border:1px solid var(--border);transition:all .15s;`;
}

function renderClientTable(clients, canEdit) {
  if (!clients.length) {
    return `<div class="card">${renderEmptyState('🔍', 'Nenhum cliente encontrado', 'Tente ajustar os filtros ou adicione um novo cliente')}</div>`;
  }

  return `
    <div class="card" style="overflow:hidden;padding:0;">
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:var(--surface-2);border-bottom:1px solid var(--border);">
              <th style="text-align:left;padding:12px 16px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Cliente</th>
              <th style="text-align:left;padding:12px 16px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Status</th>
              <th style="text-align:left;padding:12px 16px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Gerente</th>
              <th style="text-align:left;padding:12px 16px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Serviços</th>
              <th style="text-align:left;padding:12px 16px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;min-width:120px;">Health</th>
              <th style="text-align:right;padding:12px 16px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Valor/Mês</th>
              <th style="text-align:center;padding:12px 16px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${clients.map(c => renderClientRow(c, canEdit)).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderClientRow(client, canEdit) {
  const status = CLIENT_STATUS_LABELS[client.status] || { label: client.status, color: '#6b7280', bg: '#f9fafb', icon: '📌' };
  const health = getHealthColor(client.health_score || 0);
  const services = (client.services || []).slice(0, 3);
  const mgr = client.assigned_manager;

  return `
    <tr class="crm-client-row" data-client-id="${client.id}"
      style="border-bottom:1px solid var(--border);cursor:pointer;transition:background .1s;">
      <td style="padding:14px 16px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:38px;height:38px;border-radius:10px;background:${status.bg};
            display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">
            ${status.icon}
          </div>
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--text-primary);">${sanitize(client.name)}</div>
            <div style="font-size:11px;color:var(--text-muted);">${client.segment ? sanitize(client.segment) : (client.email ? sanitize(client.email) : '—')}</div>
          </div>
        </div>
      </td>
      <td style="padding:14px 16px;">
        <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;
          font-size:11px;font-weight:600;background:${status.bg};color:${status.color};">
          ${status.label}
        </span>
      </td>
      <td style="padding:14px 16px;">
        ${mgr ? `
          <div style="display:flex;align-items:center;gap:8px;">
            ${renderAvatar(mgr, 28)}
            <span style="font-size:12px;color:var(--text-secondary);">${sanitize(truncate(mgr.full_name, 20))}</span>
          </div>
        ` : '<span style="font-size:12px;color:var(--text-muted);">—</span>'}
      </td>
      <td style="padding:14px 16px;">
        <div style="display:flex;gap:4px;flex-wrap:wrap;">
          ${services.length ? services.map(s => {
            const svc = SERVICES[s];
            return svc ? `<span style="padding:2px 8px;border-radius:20px;font-size:10px;font-weight:600;
              background:${svc.color}22;color:${svc.color};">${svc.label}</span>` : '';
          }).join('') : '<span style="font-size:11px;color:var(--text-muted);">—</span>'}
          ${(client.services || []).length > 3 ? `<span style="padding:2px 8px;border-radius:20px;font-size:10px;color:var(--text-muted);background:var(--surface-2);">+${(client.services || []).length - 3}</span>` : ''}
        </div>
      </td>
      <td style="padding:14px 16px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="flex:1;height:6px;background:var(--surface-3);border-radius:4px;overflow:hidden;min-width:60px;">
            <div style="height:100%;width:${client.health_score || 0}%;background:${health.color};border-radius:4px;"></div>
          </div>
          <span style="font-size:12px;font-weight:700;color:${health.color};min-width:28px;">${client.health_score || 0}</span>
        </div>
      </td>
      <td style="padding:14px 16px;text-align:right;">
        <span style="font-size:13px;font-weight:600;color:var(--text-primary);">
          ${client.monthly_value ? formatCurrency(client.monthly_value) : '—'}
        </span>
      </td>
      <td style="padding:14px 16px;text-align:center;">
        <div style="display:flex;gap:6px;justify-content:center;" onclick="event.stopPropagation()">
          <button class="crm-view-btn" data-client-id="${client.id}"
            style="padding:5px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface);
              font-size:11px;cursor:pointer;transition:all .15s;" title="Ver detalhes">
            👁 Ver
          </button>
          ${canEdit ? `
            <button class="crm-edit-btn" data-client-id="${client.id}"
              style="padding:5px 10px;border-radius:6px;border:1px solid var(--primary-border);background:var(--primary-light);
                color:var(--primary);font-size:11px;cursor:pointer;transition:all .15s;" title="Editar">
              ✏️ Editar
            </button>
          ` : ''}
        </div>
      </td>
    </tr>
  `;
}

function bindTableEvents(root, profile) {
  document.querySelectorAll('.crm-client-row').forEach(row => {
    row.addEventListener('mouseenter', () => { row.style.background = 'var(--surface-2)'; });
    row.addEventListener('mouseleave', () => { row.style.background = ''; });
    row.addEventListener('click', () => {
      openClientDetail(row.dataset.clientId, profile, 'geral');
    });
  });

  document.querySelectorAll('.crm-view-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openClientDetail(btn.dataset.clientId, profile, 'geral');
    });
  });

  document.querySelectorAll('.crm-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openClientDetail(btn.dataset.clientId, profile, 'geral', true);
    });
  });
}

// ============================================================
// FUNNEL VIEW
// ============================================================
function renderFunnelView(clients) {
  const stages = ['lead', 'proposal', 'onboarding', 'active', 'at_risk', 'churned'];

  return `
    <div style="display:grid;grid-template-columns:repeat(${stages.length},1fr);gap:12px;align-items:start;">
      ${stages.map(stage => {
        const s = CLIENT_STATUS_LABELS[stage];
        const stageClients = clients.filter(c => c.status === stage);
        const totalValue = stageClients.reduce((sum, c) => sum + (c.monthly_value || 0), 0);

        return `
          <div style="background:var(--surface);border-radius:12px;border:1px solid var(--border);overflow:hidden;">
            <!-- Stage header -->
            <div style="padding:12px 14px;background:${s.bg};border-bottom:2px solid ${s.color};">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                <span style="font-size:16px;">${s.icon}</span>
                <span style="font-size:13px;font-weight:700;color:${s.color};">${s.label}</span>
              </div>
              <div style="font-size:11px;color:var(--text-muted);">
                ${stageClients.length} cliente${stageClients.length !== 1 ? 's' : ''}
                ${totalValue ? ` · ${formatCurrency(totalValue)}` : ''}
              </div>
            </div>

            <!-- Stage clients -->
            <div style="padding:10px;display:flex;flex-direction:column;gap:6px;min-height:100px;max-height:420px;overflow-y:auto;">
              ${stageClients.length === 0
                ? `<div style="text-align:center;padding:20px;font-size:12px;color:var(--text-muted);">Nenhum cliente</div>`
                : stageClients.map(c => {
                    const health = getHealthColor(c.health_score || 0);
                    return `
                      <div class="funnel-client-card crm-client-row" data-client-id="${c.id}"
                        style="padding:10px;border-radius:8px;border:1px solid var(--border);background:var(--surface-2);
                          cursor:pointer;transition:all .15s;">
                        <div style="font-size:12px;font-weight:600;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                          ${sanitize(c.name)}
                        </div>
                        ${c.monthly_value ? `<div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px;">${formatCurrency(c.monthly_value)}/mês</div>` : ''}
                        <div style="display:flex;align-items:center;gap:4px;">
                          <div style="flex:1;height:3px;background:var(--surface-3);border-radius:4px;overflow:hidden;">
                            <div style="height:100%;width:${c.health_score || 0}%;background:${health.color};"></div>
                          </div>
                          <span style="font-size:10px;color:${health.color};font-weight:700;">${c.health_score || 0}</span>
                        </div>
                      </div>
                    `;
                  }).join('')
              }
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ============================================================
// CLIENT DETAIL VIEW
// ============================================================
async function openClientDetail(clientId, profile, tab = 'geral', editMode = false) {
  const root = document.getElementById('crm-root');
  if (!root) return;

  root.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;">
      <button id="crm-back-btn" style="padding:7px 14px;border-radius:8px;border:1px solid var(--border);background:var(--surface);font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;">
        ← Voltar ao CRM
      </button>
    </div>
    <div id="client-detail-content" style="animation:fadeIn .2s ease;">
      ${renderDetailSkeleton()}
    </div>
  `;

  document.getElementById('crm-back-btn').addEventListener('click', () => {
    loadCRMList(profile);
  });

  try {
    const client = await clientsDB.getById(clientId);
    crmState.selectedClient = client;
    crmState.selectedTab = tab;
    renderClientDetail(client, profile, editMode);
  } catch (err) {
    console.error('Client detail error:', err);
    document.getElementById('client-detail-content').innerHTML = `
      <div class="card" style="text-align:center;padding:48px;">
        <div style="font-size:40px;margin-bottom:12px;">⚠️</div>
        <div style="font-size:15px;font-weight:600;">Erro ao carregar cliente</div>
        <div style="font-size:13px;color:var(--text-secondary);margin-top:6px;">${sanitize(err.message)}</div>
      </div>
    `;
  }
}

function renderClientDetail(client, profile, editMode = false) {
  const content = document.getElementById('client-detail-content');
  if (!content) return;

  const canEdit = ['master', 'admin'].includes(profile?.role);
  const status = CLIENT_STATUS_LABELS[client.status] || { label: client.status, color: '#6b7280', bg: '#f9fafb', icon: '📌' };
  const health = getHealthColor(client.health_score || 0);

  const tabs = [
    { key: 'geral', icon: '📋', label: 'Geral' },
    { key: 'onboarding', icon: '🚀', label: 'Onboarding' },
    { key: 'credenciais', icon: '🔑', label: 'Credenciais' },
    { key: 'reunioes', icon: '📅', label: 'Reuniões' },
    { key: 'nps', icon: '⭐', label: 'NPS' },
    { key: 'tarefas', icon: '✅', label: 'Tarefas' }
  ];

  content.innerHTML = `
    <!-- Client Header Card -->
    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap;">
        <div style="width:56px;height:56px;border-radius:14px;background:${status.bg};
          display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">
          ${status.icon}
        </div>
        <div style="flex:1;min-width:200px;">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <h1 style="font-size:20px;font-weight:800;">${sanitize(client.name)}</h1>
            <span style="padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;
              background:${status.bg};color:${status.color};">${status.label}</span>
          </div>
          <div style="display:flex;align-items:center;gap:16px;margin-top:6px;flex-wrap:wrap;">
            ${client.segment ? `<span style="font-size:12px;color:var(--text-muted);">🏢 ${sanitize(client.segment)}</span>` : ''}
            ${client.email ? `<span style="font-size:12px;color:var(--text-muted);">📧 ${sanitize(client.email)}</span>` : ''}
            ${client.phone || client.whatsapp ? `<span style="font-size:12px;color:var(--text-muted);">📞 ${formatPhone(client.phone || client.whatsapp)}</span>` : ''}
            ${client.monthly_value ? `<span style="font-size:13px;font-weight:700;color:var(--success);">${formatCurrency(client.monthly_value)}/mês</span>` : ''}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
          <!-- Health Score -->
          <div style="text-align:center;padding:10px 16px;border-radius:10px;background:${health.bg};border:1px solid ${health.color}33;">
            <div style="font-size:24px;font-weight:800;color:${health.color};">${client.health_score || 0}</div>
            <div style="font-size:10px;color:${health.color};font-weight:600;">Health Score</div>
          </div>
          ${canEdit ? `<button id="edit-status-btn" class="btn-primary" style="font-size:12px;padding:6px 14px;">Alterar Status</button>` : ''}
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div style="display:flex;gap:4px;margin-bottom:16px;border-bottom:2px solid var(--border);padding-bottom:0;">
      ${tabs.map(t => `
        <button class="detail-tab ${crmState.selectedTab === t.key ? 'active' : ''}" data-tab="${t.key}"
          style="padding:8px 14px;border:none;background:transparent;cursor:pointer;font-size:13px;font-weight:500;
            color:${crmState.selectedTab === t.key ? 'var(--primary)' : 'var(--text-secondary)'};
            border-bottom:2px solid ${crmState.selectedTab === t.key ? 'var(--primary)' : 'transparent'};
            margin-bottom:-2px;transition:all .15s;display:flex;align-items:center;gap:6px;">
          ${t.icon} ${t.label}
        </button>
      `).join('')}
    </div>

    <!-- Tab Content -->
    <div id="tab-content" style="animation:fadeIn .2s ease;"></div>
  `;

  // Bind tab clicks
  document.querySelectorAll('.detail-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      crmState.selectedTab = btn.dataset.tab;
      document.querySelectorAll('.detail-tab').forEach(b => {
        const active = b.dataset.tab === crmState.selectedTab;
        b.style.color = active ? 'var(--primary)' : 'var(--text-secondary)';
        b.style.borderBottomColor = active ? 'var(--primary)' : 'transparent';
      });
      loadTabContent(client, profile, crmState.selectedTab);
    });
  });

  document.getElementById('edit-status-btn')?.addEventListener('click', () => {
    openStatusModal(client, profile);
  });

  loadTabContent(client, profile, crmState.selectedTab, editMode);
}

async function loadTabContent(client, profile, tab, editMode = false) {
  const tabContent = document.getElementById('tab-content');
  if (!tabContent) return;

  tabContent.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-muted);">Carregando...</div>`;

  try {
    switch (tab) {
      case 'geral':
        tabContent.innerHTML = renderTabGeral(client, profile, editMode);
        bindGeralEvents(client, profile);
        break;
      case 'onboarding':
        tabContent.innerHTML = renderTabOnboarding(client.onboarding_items || []);
        bindOnboardingEvents(client, profile);
        break;
      case 'credenciais': {
        const creds = await clientsDB.getCredentials(client.id);
        tabContent.innerHTML = renderTabCredenciais(creds, profile);
        bindCredenciaisEvents(client, profile, creds);
        break;
      }
      case 'reunioes': {
        const meetings = await clientsDB.getMeetings(client.id);
        tabContent.innerHTML = renderTabReunioes(meetings, profile);
        bindReunioesEvents(client, profile);
        break;
      }
      case 'nps': {
        const nps = await clientsDB.getNPS(client.id);
        tabContent.innerHTML = renderTabNPS(nps, profile);
        bindNPSEvents(client, profile);
        break;
      }
      case 'tarefas': {
        const tasks = await tasksDB.getAll({ client_id: client.id });
        tabContent.innerHTML = renderTabTarefas(tasks, profile);
        bindTarefasEvents(tasks);
        break;
      }
      default:
        tabContent.innerHTML = `<div style="padding:24px;color:var(--text-muted);">Aba não encontrada.</div>`;
    }
  } catch (err) {
    console.error(`Tab ${tab} error:`, err);
    tabContent.innerHTML = `
      <div style="padding:24px;text-align:center;">
        <div style="font-size:32px;margin-bottom:8px;">⚠️</div>
        <div style="font-size:13px;color:var(--text-secondary);">Erro ao carregar: ${sanitize(err.message)}</div>
        <button onclick="this.closest('#tab-content')" class="btn-primary" style="margin:12px auto 0;font-size:12px;">
          Tentar novamente
        </button>
      </div>
    `;
  }
}

// ============================================================
// TAB: GERAL
// ============================================================
function renderTabGeral(client, profile, editMode = false) {
  const canEdit = ['master', 'admin'].includes(profile?.role);
  const services = client.services || [];

  return `
    <div style="display:grid;grid-template-columns:1fr 320px;gap:16px;">
      <!-- Main Info -->
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <h3 style="font-size:14px;font-weight:700;">Informações do Cliente</h3>
          ${canEdit ? `<button id="toggle-edit-btn" class="btn-primary" style="font-size:12px;padding:6px 14px;">
            ${editMode ? '💾 Salvar' : '✏️ Editar'}
          </button>` : ''}
        </div>
        <form id="client-form">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            ${renderFormField('Nome *', 'name', client.name, 'text', !editMode || !canEdit)}
            ${renderFormField('Segmento', 'segment', client.segment, 'text', !editMode || !canEdit)}
            ${renderFormField('E-mail', 'email', client.email, 'email', !editMode || !canEdit)}
            ${renderFormField('Telefone', 'phone', client.phone, 'text', !editMode || !canEdit)}
            ${renderFormField('WhatsApp', 'whatsapp', client.whatsapp, 'text', !editMode || !canEdit)}
            ${renderFormField('CNPJ', 'cnpj', client.cnpj ? formatCNPJ(client.cnpj) : '', 'text', !editMode || !canEdit)}
            ${renderFormField('Cidade', 'city', client.city, 'text', !editMode || !canEdit)}
            ${renderFormField('Valor Mensal (R$)', 'monthly_value', client.monthly_value, 'number', !editMode || !canEdit)}
            ${renderFormField('Data de Início', 'start_date', client.start_date, 'date', !editMode || !canEdit)}
            ${renderFormField('Contato Principal', 'contact_name', client.contact_name, 'text', !editMode || !canEdit)}
          </div>

          <div style="margin-top:12px;">
            <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px;">Observações</label>
            <textarea name="notes" rows="3"
              style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;font-size:13px;resize:vertical;background:var(--surface);"
              ${!editMode || !canEdit ? 'disabled' : ''}>${sanitize(client.notes || '')}</textarea>
          </div>
        </form>
      </div>

      <!-- Sidebar: Services + Health -->
      <div style="display:flex;flex-direction:column;gap:12px;">
        <!-- Services -->
        <div class="card">
          <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;">Serviços Contratados</h3>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${Object.entries(SERVICES).map(([key, svc]) => {
              const active = services.includes(key);
              return `
                <div class="service-tag ${active ? 'active' : ''}" data-service="${key}"
                  style="padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600;cursor:${canEdit && editMode ? 'pointer' : 'default'};
                    background:${active ? svc.color + '22' : 'var(--surface-2)'};
                    color:${active ? svc.color : 'var(--text-muted)'};
                    border:1px solid ${active ? svc.color + '44' : 'var(--border)'};
                    transition:all .15s;">
                  ${svc.icon} ${svc.label}
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Health Score Display -->
        <div class="card">
          <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;">Health Score</h3>
          ${renderHealthScoreCard(client.health_score || 0)}
        </div>

        <!-- Quick Info -->
        <div class="card">
          <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;">Informações Rápidas</h3>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${[
              ['Cliente desde', client.start_date ? formatDate(client.start_date) : '—'],
              ['Última atualização', client.updated_at ? timeAgoLocal(client.updated_at) : '—'],
              ['Gerente', client.assigned_manager?.full_name || '—'],
              ['Plataformas', (client.platforms || []).join(', ') || '—']
            ].map(([label, value]) => `
              <div style="display:flex;justify-content:space-between;font-size:12px;">
                <span style="color:var(--text-muted);">${label}</span>
                <span style="font-weight:500;color:var(--text-primary);">${sanitize(String(value))}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderFormField(label, name, value, type = 'text', disabled = true) {
  return `
    <div>
      <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">${label}</label>
      <input type="${type}" name="${name}" value="${sanitize(value != null ? String(value) : '')}"
        class="form-input" ${disabled ? 'disabled' : ''}
        style="width:100%;${disabled ? 'background:var(--surface-2);color:var(--text-secondary);' : ''}">
    </div>
  `;
}

function renderHealthScoreCard(score) {
  const health = getHealthColor(score);
  const segments = [
    { min: 0, max: 49, label: 'Em Risco', color: '#ef4444' },
    { min: 50, max: 79, label: 'Atenção', color: '#f59e0b' },
    { min: 80, max: 100, label: 'Saudável', color: '#10b981' }
  ];

  return `
    <div style="text-align:center;margin-bottom:16px;">
      <div style="font-size:40px;font-weight:800;color:${health.color};">${score}</div>
      <div style="font-size:13px;font-weight:600;color:${health.color};">${health.label}</div>
    </div>
    <div style="height:10px;background:linear-gradient(to right,#ef4444,#f59e0b,#10b981);border-radius:10px;position:relative;margin-bottom:8px;">
      <div style="position:absolute;top:-4px;left:${score}%;transform:translateX(-50%);
        width:18px;height:18px;border-radius:50%;background:${health.color};border:3px solid white;
        box-shadow:0 2px 6px rgba(0,0,0,.2);transition:left .3s;">
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted);">
      <span>0</span><span>50</span><span>80</span><span>100</span>
    </div>
  `;
}

function bindGeralEvents(client, profile) {
  const canEdit = ['master', 'admin'].includes(profile?.role);
  if (!canEdit) return;

  let currentlyEditing = false;
  const form = document.getElementById('client-form');
  const toggleBtn = document.getElementById('toggle-edit-btn');

  if (!toggleBtn) return;

  toggleBtn.addEventListener('click', async () => {
    if (!currentlyEditing) {
      // Enter edit mode
      currentlyEditing = true;
      toggleBtn.textContent = '💾 Salvar';
      form?.querySelectorAll('input, textarea, select').forEach(el => {
        el.disabled = false;
        el.style.background = '';
        el.style.color = '';
      });
      // Enable service tags
      document.querySelectorAll('.service-tag').forEach(tag => {
        tag.style.cursor = 'pointer';
      });
    } else {
      // Save
      await saveClientForm(client, profile);
      currentlyEditing = false;
      toggleBtn.textContent = '✏️ Editar';
    }
  });

  // Service tag toggles (only active in edit mode after clicking Edit)
  let selectedServices = [...(client.services || [])];
  document.querySelectorAll('.service-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      if (!currentlyEditing) return;
      const key = tag.dataset.service;
      const svc = SERVICES[key];
      if (!svc) return;
      const idx = selectedServices.indexOf(key);
      if (idx === -1) {
        selectedServices.push(key);
        tag.classList.add('active');
        tag.style.background = svc.color + '22';
        tag.style.color = svc.color;
        tag.style.borderColor = svc.color + '44';
      } else {
        selectedServices.splice(idx, 1);
        tag.classList.remove('active');
        tag.style.background = 'var(--surface-2)';
        tag.style.color = 'var(--text-muted)';
        tag.style.borderColor = 'var(--border)';
      }
      form._selectedServices = selectedServices;
    });
  });
}

async function saveClientForm(client, profile) {
  const form = document.getElementById('client-form');
  if (!form) return;

  const fd = new FormData(form);
  const updates = {};
  for (const [key, value] of fd.entries()) {
    updates[key] = value || null;
  }
  if (form._selectedServices) {
    updates.services = form._selectedServices;
  }
  if (updates.monthly_value) updates.monthly_value = parseFloat(updates.monthly_value) || null;

  try {
    const updated = await clientsDB.update(client.id, updates);
    crmState.selectedClient = { ...crmState.selectedClient, ...updated };
    // Update in list
    const idx = crmState.clients.findIndex(c => c.id === client.id);
    if (idx !== -1) crmState.clients[idx] = { ...crmState.clients[idx], ...updated };
    showToast('Cliente atualizado com sucesso!', 'success');
    await logDB.log('update', 'client', client.id, client.name);

    // Re-render with updated client
    renderClientDetail(crmState.selectedClient, profile, false);
  } catch (err) {
    console.error('Save client error:', err);
    showToast('Erro ao salvar: ' + err.message, 'error');
  }
}

// ============================================================
// TAB: ONBOARDING
// ============================================================
function renderTabOnboarding(items) {
  const done = items.filter(i => i.is_done).length;

  return `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div>
          <h3 style="font-size:14px;font-weight:700;">Checklist de Onboarding</h3>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${done} / ${items.length} concluídos</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <!-- Progress Bar -->
          <div style="width:100px;height:6px;background:var(--surface-3);border-radius:4px;overflow:hidden;">
            <div style="height:100%;width:${items.length ? Math.round((done/items.length)*100) : 0}%;background:var(--success);border-radius:4px;transition:width .3s;"></div>
          </div>
          <span style="font-size:12px;font-weight:600;color:var(--success);">${items.length ? Math.round((done/items.length)*100) : 0}%</span>
        </div>
      </div>

      ${items.length === 0
        ? renderEmptyState('🚀', 'Checklist vazio', 'Nenhum item de onboarding configurado')
        : `
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${items.sort((a, b) => (a.order_index || 0) - (b.order_index || 0)).map(item => `
              <label style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:8px;
                background:${item.is_done ? 'var(--success-light)' : 'var(--surface-2)'};
                border:1px solid ${item.is_done ? '#10b98133' : 'var(--border)'};
                cursor:pointer;transition:all .15s;" class="onboarding-item" data-item-id="${item.id}">
                <div style="width:20px;height:20px;border-radius:6px;flex-shrink:0;
                  background:${item.is_done ? 'var(--success)' : 'var(--surface)'};
                  border:2px solid ${item.is_done ? 'var(--success)' : 'var(--border)'};
                  display:flex;align-items:center;justify-content:center;font-size:12px;color:white;transition:all .15s;">
                  ${item.is_done ? '✓' : ''}
                </div>
                <div style="flex:1;">
                  <div style="font-size:13px;font-weight:500;color:var(--text-primary);
                    text-decoration:${item.is_done ? 'line-through' : 'none'};
                    color:${item.is_done ? 'var(--text-muted)' : 'var(--text-primary)'};">
                    ${sanitize(item.item)}
                  </div>
                  ${item.completed_at ? `<div style="font-size:11px;color:var(--success);">Concluído em ${formatDate(item.completed_at)}</div>` : ''}
                </div>
              </label>
            `).join('')}
          </div>
        `
      }
    </div>
  `;
}

function bindOnboardingEvents(client, profile) {
  document.querySelectorAll('.onboarding-item').forEach(el => {
    el.addEventListener('click', async () => {
      const itemId = el.dataset.itemId;
      const item = (crmState.selectedClient?.onboarding_items || []).find(i => String(i.id) === String(itemId));
      if (!item) return;

      try {
        const newDone = !item.is_done;
        await supabase
          .from('onboarding_items')
          .update({
            is_done: newDone,
            completed_at: newDone ? new Date().toISOString() : null
          })
          .eq('id', itemId);

        // Update local state
        item.is_done = newDone;
        item.completed_at = newDone ? new Date().toISOString() : null;

        // Re-render tab
        const tabContent = document.getElementById('tab-content');
        if (tabContent) {
          tabContent.innerHTML = renderTabOnboarding(crmState.selectedClient.onboarding_items || []);
          bindOnboardingEvents(client, profile);
        }
        showToast(newDone ? 'Item concluído!' : 'Item reaberto.', 'success');
      } catch (err) {
        showToast('Erro ao atualizar item: ' + err.message, 'error');
      }
    });
  });
}

// ============================================================
// TAB: CREDENCIAIS
// ============================================================
function renderTabCredenciais(creds, profile) {
  const canEdit = ['master', 'admin', 'manager'].includes(profile?.role);

  return `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <h3 style="font-size:14px;font-weight:700;">Cofre de Credenciais</h3>
        ${canEdit ? `<button id="add-credential-btn" class="btn-primary" style="font-size:12px;padding:6px 14px;">➕ Adicionar</button>` : ''}
      </div>
      ${creds.length === 0
        ? renderEmptyState('🔑', 'Nenhuma credencial', 'Adicione senhas e acessos de plataformas')
        : `
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${creds.map(cred => `
              <div style="padding:14px 16px;border-radius:10px;border:1px solid var(--border);background:var(--surface-2);">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
                  <div style="flex:1;">
                    <div style="font-size:13px;font-weight:600;margin-bottom:6px;">${sanitize(cred.platform || cred.label || '—')}</div>
                    <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:12px;">
                      ${cred.username ? `
                        <span style="color:var(--text-muted);">Usuário:</span>
                        <span style="font-family:monospace;">${sanitize(cred.username)}</span>
                      ` : ''}
                      ${cred.password ? `
                        <span style="color:var(--text-muted);">Senha:</span>
                        <span style="display:flex;align-items:center;gap:8px;">
                          <code id="pwd-${cred.id}" style="font-family:monospace;background:var(--surface-3);padding:2px 8px;border-radius:4px;letter-spacing:2px;">••••••••</code>
                          <button class="toggle-pwd-btn" data-cred-id="${cred.id}" data-pwd="${sanitize(decryptLocal(cred.password))}"
                            style="border:none;background:none;cursor:pointer;font-size:14px;color:var(--text-muted);">👁</button>
                        </span>
                      ` : ''}
                      ${cred.url ? `
                        <span style="color:var(--text-muted);">URL:</span>
                        <a href="${sanitize(cred.url)}" target="_blank" style="color:var(--primary);font-size:12px;">${sanitize(truncate(cred.url, 40))}</a>
                      ` : ''}
                    </div>
                  </div>
                  ${canEdit ? `
                    <button class="delete-cred-btn" data-cred-id="${cred.id}"
                      style="padding:4px 8px;border:none;background:transparent;cursor:pointer;font-size:14px;color:var(--text-muted);">🗑️</button>
                  ` : ''}
                </div>
                ${cred.notes ? `<div style="margin-top:8px;font-size:11px;color:var(--text-muted);border-top:1px solid var(--border);padding-top:8px;">${sanitize(cred.notes)}</div>` : ''}
              </div>
            `).join('')}
          </div>
        `
      }
    </div>
  `;
}

function decryptLocal(encoded) {
  if (!encoded) return '';
  try { return decodeURIComponent(escape(atob(encoded))); } catch { return encoded; }
}

function encryptLocal(text) {
  if (!text) return '';
  return btoa(unescape(encodeURIComponent(text)));
}

function bindCredenciaisEvents(client, profile, creds) {
  const canEdit = ['master', 'admin', 'manager'].includes(profile?.role);

  document.querySelectorAll('.toggle-pwd-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const credId = btn.dataset.credId;
      const pwd = btn.dataset.pwd;
      const codeEl = document.getElementById(`pwd-${credId}`);
      if (!codeEl) return;
      if (codeEl.textContent === '••••••••') {
        codeEl.textContent = pwd || '—';
        codeEl.style.letterSpacing = 'normal';
        btn.textContent = '🙈';
      } else {
        codeEl.textContent = '••••••••';
        codeEl.style.letterSpacing = '2px';
        btn.textContent = '👁';
      }
    });
  });

  if (canEdit) {
    document.getElementById('add-credential-btn')?.addEventListener('click', () => {
      openCredentialModal(client, profile, null, () => loadTabContent(client, profile, 'credenciais'));
    });

    document.querySelectorAll('.delete-cred-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = await showConfirm('Excluir esta credencial permanentemente?', 'Excluir Credencial');
        if (!ok) return;
        try {
          await supabase.from('client_credentials').delete().eq('id', btn.dataset.credId);
          showToast('Credencial removida.', 'success');
          loadTabContent(client, profile, 'credenciais');
        } catch (err) {
          showToast('Erro: ' + err.message, 'error');
        }
      });
    });
  }
}

function openCredentialModal(client, profile, existing = null, onSave) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:white;border-radius:16px;padding:28px;width:480px;max-width:95vw;box-shadow:0 20px 60px rgba(0,0,0,.2);">
      <h3 style="font-size:16px;font-weight:700;margin-bottom:20px;">🔑 ${existing ? 'Editar' : 'Nova'} Credencial</h3>
      <form id="cred-form" style="display:flex;flex-direction:column;gap:12px;">
        ${renderFormField('Plataforma / Label *', 'platform', existing?.platform || '', 'text', false)}
        ${renderFormField('Usuário / Login', 'username', existing?.username || '', 'text', false)}
        <div>
          <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Senha</label>
          <div style="position:relative;">
            <input type="password" name="password" value="${existing ? decryptLocal(existing.password) : ''}"
              class="form-input" style="width:100%;padding-right:40px;">
            <button type="button" id="modal-toggle-pwd"
              style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;font-size:16px;cursor:pointer;color:#9ca3af;">👁</button>
          </div>
        </div>
        ${renderFormField('URL de acesso', 'url', existing?.url || '', 'url', false)}
        <div>
          <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Observações</label>
          <textarea name="notes" rows="2" class="form-input" style="width:100%;resize:vertical;">${sanitize(existing?.notes || '')}</textarea>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
          <button type="button" id="cred-cancel-btn" style="padding:10px 20px;border-radius:8px;border:1px solid var(--border);background:white;font-size:13px;cursor:pointer;">Cancelar</button>
          <button type="submit" class="btn-primary">💾 Salvar</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#modal-toggle-pwd').addEventListener('click', () => {
    const input = overlay.querySelector('input[name="password"]');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  overlay.querySelector('#cred-cancel-btn').addEventListener('click', () => overlay.remove());

  overlay.querySelector('#cred-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const platform = fd.get('platform')?.trim();
    if (!platform) { showToast('Informe a plataforma.', 'warning'); return; }

    const payload = {
      ...(existing ? { id: existing.id } : {}),
      client_id: client.id,
      platform,
      username: fd.get('username') || null,
      password: fd.get('password') ? encryptLocal(fd.get('password')) : null,
      url: fd.get('url') || null,
      notes: fd.get('notes') || null
    };

    try {
      await clientsDB.saveCredential(payload);
      overlay.remove();
      showToast('Credencial salva!', 'success');
      if (onSave) onSave();
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
    }
  });
}

// ============================================================
// TAB: REUNIOES
// ============================================================
function renderTabReunioes(meetings, profile) {
  const canEdit = ['master', 'admin', 'manager'].includes(profile?.role);

  return `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <h3 style="font-size:14px;font-weight:700;">Reuniões</h3>
        ${canEdit ? `<button id="add-meeting-btn" class="btn-primary" style="font-size:12px;padding:6px 14px;">➕ Nova Reunião</button>` : ''}
      </div>
      ${meetings.length === 0
        ? renderEmptyState('📅', 'Nenhuma reunião', 'Registre reuniões e atas com este cliente')
        : `
          <div style="display:flex;flex-direction:column;gap:10px;">
            ${meetings.map(m => `
              <div style="padding:14px 16px;border-radius:10px;border:1px solid var(--border);background:var(--surface-2);">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                  <div style="display:flex;align-items:center;gap:10px;">
                    <span style="font-size:18px;">📅</span>
                    <div>
                      <div style="font-size:13px;font-weight:600;">${sanitize(m.title || 'Reunião')}</div>
                      <div style="font-size:11px;color:var(--text-muted);">${formatDateTime(m.meeting_date)}</div>
                    </div>
                  </div>
                  <span style="font-size:11px;color:var(--text-muted);">
                    por ${sanitize(m.created_by_profile?.full_name || '—')}
                  </span>
                </div>
                ${m.summary ? `<div style="font-size:12px;color:var(--text-secondary);line-height:1.6;white-space:pre-wrap;">${sanitize(m.summary)}</div>` : ''}
                ${m.next_steps ? `
                  <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">
                    <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Próximos Passos</div>
                    <div style="font-size:12px;color:var(--text-primary);">${sanitize(m.next_steps)}</div>
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        `
      }
    </div>
  `;
}

function bindReunioesEvents(client, profile) {
  const canEdit = ['master', 'admin', 'manager'].includes(profile?.role);
  if (!canEdit) return;

  document.getElementById('add-meeting-btn')?.addEventListener('click', () => {
    openMeetingModal(client, profile, () => loadTabContent(client, profile, 'reunioes'));
  });
}

function openMeetingModal(client, profile, onSave) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:white;border-radius:16px;padding:28px;width:540px;max-width:95vw;box-shadow:0 20px 60px rgba(0,0,0,.2);">
      <h3 style="font-size:16px;font-weight:700;margin-bottom:20px;">📅 Nova Reunião</h3>
      <form id="meeting-form" style="display:flex;flex-direction:column;gap:12px;">
        ${renderFormField('Título *', 'title', '', 'text', false)}
        ${renderFormField('Data e Hora *', 'meeting_date', new Date().toISOString().slice(0,16), 'datetime-local', false)}
        <div>
          <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Resumo / Ata</label>
          <textarea name="summary" rows="4" class="form-input" style="width:100%;resize:vertical;" placeholder="O que foi discutido..."></textarea>
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Próximos Passos</label>
          <textarea name="next_steps" rows="2" class="form-input" style="width:100%;resize:vertical;" placeholder="Ações a serem tomadas..."></textarea>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
          <button type="button" id="meeting-cancel-btn" style="padding:10px 20px;border-radius:8px;border:1px solid var(--border);background:white;font-size:13px;cursor:pointer;">Cancelar</button>
          <button type="submit" class="btn-primary">💾 Salvar</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#meeting-cancel-btn').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#meeting-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const title = fd.get('title')?.trim();
    if (!title) { showToast('Informe o título.', 'warning'); return; }

    try {
      await clientsDB.createMeeting({
        client_id: client.id,
        title,
        meeting_date: fd.get('meeting_date'),
        summary: fd.get('summary') || null,
        next_steps: fd.get('next_steps') || null,
        created_by: profile?.id
      });
      overlay.remove();
      showToast('Reunião registrada!', 'success');
      if (onSave) onSave();
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
    }
  });
}

// ============================================================
// TAB: NPS
// ============================================================
function renderTabNPS(npsData, profile) {
  const canEdit = ['master', 'admin', 'manager'].includes(profile?.role);

  function npsColor(score) {
    if (score >= 9) return { color: '#10b981', bg: '#f0fdf4', label: 'Promotor' };
    if (score >= 7) return { color: '#f59e0b', bg: '#fffbeb', label: 'Neutro' };
    return { color: '#ef4444', bg: '#fef2f2', label: 'Detrator' };
  }

  return `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <h3 style="font-size:14px;font-weight:700;">Satisfação NPS</h3>
        ${canEdit ? `<button id="add-nps-btn" class="btn-primary" style="font-size:12px;padding:6px 14px;">➕ Registrar NPS</button>` : ''}
      </div>
      ${npsData.length === 0
        ? renderEmptyState('⭐', 'Nenhum NPS registrado', 'Acompanhe a satisfação mensal deste cliente')
        : `
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;">
            ${npsData.map(n => {
              const c = npsColor(n.score);
              return `
                <div style="padding:16px;border-radius:10px;background:${c.bg};border:1px solid ${c.color}33;text-align:center;">
                  <div style="font-size:28px;font-weight:800;color:${c.color};">${n.score}</div>
                  <div style="font-size:11px;font-weight:600;color:${c.color};margin:2px 0;">${c.label}</div>
                  <div style="font-size:11px;color:var(--text-muted);">${MONTHS[n.month - 1]?.substring(0, 3)}/${n.year}</div>
                  ${n.comment ? `<div style="font-size:10px;color:var(--text-secondary);margin-top:6px;line-height:1.4;">"${sanitize(truncate(n.comment, 50))}"</div>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        `
      }
    </div>
  `;
}

function bindNPSEvents(client, profile) {
  const canEdit = ['master', 'admin', 'manager'].includes(profile?.role);
  if (!canEdit) return;

  document.getElementById('add-nps-btn')?.addEventListener('click', () => {
    openNPSModal(client, profile, () => loadTabContent(client, profile, 'nps'));
  });
}

function openNPSModal(client, profile, onSave) {
  const now = new Date();
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:white;border-radius:16px;padding:28px;width:440px;max-width:95vw;box-shadow:0 20px 60px rgba(0,0,0,.2);">
      <h3 style="font-size:16px;font-weight:700;margin-bottom:20px;">⭐ Registrar NPS</h3>
      <form id="nps-form" style="display:flex;flex-direction:column;gap:12px;">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div>
            <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Mês *</label>
            <select name="month" class="form-input">
              ${MONTHS.map((m, i) => `<option value="${i+1}" ${i+1 === now.getMonth()+1 ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Ano *</label>
            <input type="number" name="year" value="${now.getFullYear()}" class="form-input" min="2020" max="2030">
          </div>
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:8px;">Nota (0–10) *</label>
          <div id="nps-score-btns" style="display:flex;gap:4px;flex-wrap:wrap;">
            ${Array.from({length:11},(_,i) => {
              const color = i >= 9 ? '#10b981' : i >= 7 ? '#f59e0b' : '#ef4444';
              return `<button type="button" class="nps-score-btn" data-score="${i}"
                style="width:36px;height:36px;border-radius:8px;border:2px solid ${color}33;background:${color}11;
                  color:${color};font-size:13px;font-weight:700;cursor:pointer;transition:all .15s;">${i}</button>`;
            }).join('')}
          </div>
          <input type="hidden" name="score" id="nps-score-val" required>
        </div>
        <div>
          <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Comentário</label>
          <textarea name="comment" rows="2" class="form-input" style="width:100%;resize:vertical;"></textarea>
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
          <button type="button" id="nps-cancel-btn" style="padding:10px 20px;border-radius:8px;border:1px solid var(--border);background:white;font-size:13px;cursor:pointer;">Cancelar</button>
          <button type="submit" class="btn-primary">💾 Salvar</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#nps-cancel-btn').addEventListener('click', () => overlay.remove());

  // Score button selection
  overlay.querySelectorAll('.nps-score-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('.nps-score-btn').forEach(b => {
        b.style.transform = '';
        b.style.boxShadow = '';
      });
      btn.style.transform = 'scale(1.15)';
      btn.style.boxShadow = '0 2px 8px rgba(0,0,0,.15)';
      overlay.querySelector('#nps-score-val').value = btn.dataset.score;
    });
  });

  overlay.querySelector('#nps-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const score = fd.get('score');
    if (score === '' || score === null) { showToast('Selecione uma nota.', 'warning'); return; }

    try {
      await clientsDB.saveNPS({
        client_id: client.id,
        month: parseInt(fd.get('month')),
        year: parseInt(fd.get('year')),
        score: parseInt(score),
        comment: fd.get('comment') || null
      });
      overlay.remove();
      showToast('NPS registrado!', 'success');
      if (onSave) onSave();
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
    }
  });
}

// ============================================================
// TAB: TAREFAS
// ============================================================
function renderTabTarefas(tasks, profile) {
  const TASK_STATUS_LABELS = {
    briefing: { label: 'Briefing', color: '#6366f1', bg: '#eef2ff' },
    production: { label: 'Produção', color: '#f59e0b', bg: '#fffbeb' },
    review: { label: 'Revisão', color: '#8b5cf6', bg: '#f5f3ff' },
    approval: { label: 'Aprovação', color: '#0ea5e9', bg: '#f0f9ff' },
    done: { label: 'Concluído', color: '#10b981', bg: '#f0fdf4' },
    cancelled: { label: 'Cancelado', color: '#6b7280', bg: '#f9fafb' }
  };

  const today = new Date().toISOString().split('T')[0];

  return `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <h3 style="font-size:14px;font-weight:700;">Tarefas do Cliente</h3>
        <span style="font-size:12px;color:var(--text-muted);">${tasks.length} tarefa${tasks.length !== 1 ? 's' : ''}</span>
      </div>
      ${tasks.length === 0
        ? renderEmptyState('✅', 'Nenhuma tarefa', 'Nenhuma tarefa criada para este cliente')
        : `
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${tasks.map(t => {
              const st = TASK_STATUS_LABELS[t.status] || { label: t.status, color: '#6b7280', bg: '#f9fafb' };
              const isOverdue = t.status !== 'done' && t.due_date && t.due_date < today;
              return `
                <div class="task-row-crm" data-task-id="${t.id}"
                  style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:8px;
                    border:1px solid ${isOverdue ? 'var(--danger-light)' : 'var(--border)'};
                    background:${isOverdue ? 'var(--danger-light)' : 'var(--surface-2)'};
                    cursor:pointer;transition:all .15s;">
                  <div style="flex:1;min-width:0;">
                    <div style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                      ${sanitize(t.title)}
                    </div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
                      ${t.due_date ? (isOverdue
                        ? `<span style="color:var(--danger);font-weight:600;">Venceu em ${formatDate(t.due_date)}</span>`
                        : `Vence ${formatDate(t.due_date)}`) : ''}
                      ${t.assigned_to?.length ? ` · ${t.assigned_to.length} responsável(is)` : ''}
                    </div>
                  </div>
                  <span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;flex-shrink:0;
                    background:${st.bg};color:${st.color};">${st.label}</span>
                </div>
              `;
            }).join('')}
          </div>
        `
      }
    </div>
  `;
}

function bindTarefasEvents(tasks) {
  document.querySelectorAll('.task-row-crm').forEach(el => {
    el.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('navigate', { detail: { route: 'tasks', taskId: el.dataset.taskId } }));
    });
    el.addEventListener('mouseenter', () => {
      el.style.borderColor = 'var(--primary)';
    });
    el.addEventListener('mouseleave', () => {
      const isOverdue = el.style.background.includes('danger');
      el.style.borderColor = isOverdue ? 'var(--danger-light)' : 'var(--border)';
    });
  });
}

// ============================================================
// STATUS CHANGE MODAL
// ============================================================
function openStatusModal(client, profile) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
    <div style="background:white;border-radius:16px;padding:28px;width:400px;max-width:95vw;box-shadow:0 20px 60px rgba(0,0,0,.2);">
      <h3 style="font-size:16px;font-weight:700;margin-bottom:20px;">Alterar Status do Cliente</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px;">
        ${Object.entries(CLIENT_STATUS_LABELS).map(([key, s]) => `
          <button class="status-opt-btn" data-status="${key}"
            style="padding:10px 12px;border-radius:10px;border:2px solid ${client.status === key ? s.color : '#e5e7eb'};
              background:${client.status === key ? s.bg : 'white'};cursor:pointer;text-align:left;
              transition:all .15s;display:flex;align-items:center;gap:8px;">
            <span style="font-size:18px;">${s.icon}</span>
            <span style="font-size:12px;font-weight:600;color:${s.color};">${s.label}</span>
          </button>
        `).join('')}
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button id="status-cancel-btn" style="padding:10px 20px;border-radius:8px;border:1px solid var(--border);background:white;font-size:13px;cursor:pointer;">Cancelar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('#status-cancel-btn').addEventListener('click', () => overlay.remove());

  overlay.querySelectorAll('.status-opt-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newStatus = btn.dataset.status;
      if (newStatus === client.status) { overlay.remove(); return; }
      try {
        await clientsDB.update(client.id, { status: newStatus });
        crmState.selectedClient = { ...crmState.selectedClient, status: newStatus };
        const idx = crmState.clients.findIndex(c => c.id === client.id);
        if (idx !== -1) crmState.clients[idx].status = newStatus;
        overlay.remove();
        showToast('Status atualizado!', 'success');
        await logDB.log('status_change', 'client', client.id, client.name, { from: client.status, to: newStatus });
        // Re-render detail with updated client
        renderClientDetail(crmState.selectedClient, profile);
      } catch (err) {
        showToast('Erro: ' + err.message, 'error');
      }
    });
  });
}

// ============================================================
// NEW CLIENT MODAL
// ============================================================
function openNewClientModal(profile) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;overflow-y:auto;';
  overlay.innerHTML = `
    <div style="background:white;border-radius:16px;padding:28px;width:640px;max-width:95vw;
      box-shadow:0 20px 60px rgba(0,0,0,.2);margin:20px auto;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
        <h3 style="font-size:18px;font-weight:800;">➕ Novo Cliente</h3>
        <button id="new-client-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-muted);">✕</button>
      </div>
      <form id="new-client-form">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
          <div style="grid-column:1/-1;">
            ${renderFormField('Nome do Cliente *', 'name', '', 'text', false)}
          </div>
          ${renderFormField('Segmento', 'segment', '', 'text', false)}
          ${renderFormField('CNPJ', 'cnpj', '', 'text', false)}
          ${renderFormField('E-mail', 'email', '', 'email', false)}
          ${renderFormField('Telefone', 'phone', '', 'text', false)}
          ${renderFormField('WhatsApp', 'whatsapp', '', 'text', false)}
          ${renderFormField('Cidade', 'city', '', 'text', false)}
          ${renderFormField('Contato Principal', 'contact_name', '', 'text', false)}
          ${renderFormField('Valor Mensal (R$)', 'monthly_value', '', 'number', false)}
          ${renderFormField('Data de Início', 'start_date', new Date().toISOString().split('T')[0], 'date', false)}
        </div>

        <div style="margin-bottom:12px;">
          <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px;">Status Inicial *</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap;" id="new-status-select">
            ${Object.entries(CLIENT_STATUS_LABELS).map(([key, s]) => `
              <button type="button" class="new-status-btn" data-status="${key}"
                style="padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;
                  background:${key === 'lead' ? s.bg : 'var(--surface-2)'};
                  color:${key === 'lead' ? s.color : 'var(--text-muted)'};
                  border:2px solid ${key === 'lead' ? s.color : 'var(--border)'};
                  transition:all .15s;">
                ${s.icon} ${s.label}
              </button>
            `).join('')}
          </div>
          <input type="hidden" name="status" id="new-status-val" value="lead">
        </div>

        <div style="margin-bottom:16px;">
          <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:6px;">Serviços Contratados</label>
          <div style="display:flex;flex-wrap:wrap;gap:6px;" id="new-services-select">
            ${Object.entries(SERVICES).map(([key, svc]) => `
              <button type="button" class="new-service-btn" data-service="${key}"
                style="padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;
                  background:var(--surface-2);color:var(--text-muted);border:1px solid var(--border);transition:all .15s;">
                ${svc.icon} ${svc.label}
              </button>
            `).join('')}
          </div>
        </div>

        <div style="margin-bottom:16px;">
          <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px;">Observações</label>
          <textarea name="notes" rows="2" class="form-input" style="width:100%;resize:vertical;"></textarea>
        </div>

        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button type="button" id="new-client-cancel-btn" style="padding:10px 20px;border-radius:8px;border:1px solid var(--border);background:white;font-size:13px;cursor:pointer;">Cancelar</button>
          <button type="submit" class="btn-primary" id="new-client-submit-btn">➕ Criar Cliente</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  const closeModal = () => overlay.remove();
  overlay.querySelector('#new-client-close').addEventListener('click', closeModal);
  overlay.querySelector('#new-client-cancel-btn').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  // Status buttons
  let selectedStatus = 'lead';
  overlay.querySelectorAll('.new-status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedStatus = btn.dataset.status;
      overlay.querySelector('#new-status-val').value = selectedStatus;
      overlay.querySelectorAll('.new-status-btn').forEach(b => {
        const s = CLIENT_STATUS_LABELS[b.dataset.status];
        const active = b.dataset.status === selectedStatus;
        b.style.background = active ? s.bg : 'var(--surface-2)';
        b.style.color = active ? s.color : 'var(--text-muted)';
        b.style.borderColor = active ? s.color : 'var(--border)';
      });
    });
  });

  // Service buttons
  let selectedServices = [];
  overlay.querySelectorAll('.new-service-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.service;
      const svc = SERVICES[key];
      const idx = selectedServices.indexOf(key);
      if (idx === -1) {
        selectedServices.push(key);
        btn.style.background = svc.color + '22';
        btn.style.color = svc.color;
        btn.style.borderColor = svc.color + '44';
      } else {
        selectedServices.splice(idx, 1);
        btn.style.background = 'var(--surface-2)';
        btn.style.color = 'var(--text-muted)';
        btn.style.borderColor = 'var(--border)';
      }
    });
  });

  overlay.querySelector('#new-client-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const name = fd.get('name')?.trim();
    if (!name) { showToast('Informe o nome do cliente.', 'warning'); return; }

    const submitBtn = document.getElementById('new-client-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Salvando...';

    const payload = {
      name,
      segment: fd.get('segment') || null,
      cnpj: fd.get('cnpj') ? fd.get('cnpj').replace(/\D/g, '') : null,
      email: fd.get('email') || null,
      phone: fd.get('phone') || null,
      whatsapp: fd.get('whatsapp') || null,
      city: fd.get('city') || null,
      contact_name: fd.get('contact_name') || null,
      monthly_value: fd.get('monthly_value') ? parseFloat(fd.get('monthly_value')) : null,
      start_date: fd.get('start_date') || null,
      notes: fd.get('notes') || null,
      status: selectedStatus,
      services: selectedServices,
      health_score: 50,
      is_active: true
    };

    try {
      const newClient = await clientsDB.create(payload);
      crmState.clients.unshift({ ...newClient, assigned_manager: null });
      applyFilters();
      overlay.remove();
      showToast(`Cliente "${name}" criado com sucesso!`, 'success');
      await logDB.log('create', 'client', newClient.id, newClient.name);
      // Reload CRM to show updated list
      const root = document.getElementById('crm-root');
      if (root) renderCRMPage(root, profile);
    } catch (err) {
      showToast('Erro ao criar cliente: ' + err.message, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = '➕ Criar Cliente';
    }
  });
}

// ============================================================
// HELPERS
// ============================================================
function timeAgoLocal(date) {
  if (!date) return '—';
  const now = new Date();
  const d = new Date(date);
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'agora';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `há ${Math.floor(diff / 86400)} dias`;
  return formatDate(date);
}

function renderCRMSkeleton() {
  const skeletonBar = (w = '100%', h = 16) =>
    `<div style="width:${w};height:${h}px;border-radius:6px;background:#f3f4f6;animation:pulse 1.5s ease infinite;"></div>`;

  return `
    <div style="margin-bottom:24px;display:flex;justify-content:space-between;align-items:center;">
      ${skeletonBar('200px', 28)}
      ${skeletonBar('120px', 36)}
    </div>
    <div class="card" style="padding:20px;">
      <div style="display:flex;flex-direction:column;gap:14px;">
        ${Array.from({length:6}).map(() => `
          <div style="display:flex;align-items:center;gap:12px;">
            ${skeletonBar('38px', 38)}
            <div style="flex:1;display:flex;flex-direction:column;gap:6px;">
              ${skeletonBar('60%', 14)}
              ${skeletonBar('40%', 11)}
            </div>
            ${skeletonBar('80px', 24)}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderDetailSkeleton() {
  const bar = (w = '100%', h = 16) =>
    `<div style="width:${w};height:${h}px;border-radius:6px;background:#f3f4f6;animation:pulse 1.5s ease infinite;"></div>`;
  return `
    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex;gap:16px;align-items:center;">
        ${bar('56px', 56)}
        <div style="flex:1;display:flex;flex-direction:column;gap:8px;">
          ${bar('40%', 22)}
          ${bar('60%', 14)}
        </div>
      </div>
    </div>
    <div style="display:flex;gap:16px;margin-bottom:16px;">
      ${[1,2,3,4,5,6].map(() => bar('80px', 36)).join('')}
    </div>
    <div class="card">
      ${bar('100%', 200)}
    </div>
  `;
}
