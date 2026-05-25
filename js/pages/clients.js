// ============================================================
// MÓDULO CLIENTES — Cadastro, Ficha de Identificação, Portal
// ============================================================
import { supabase as db } from '../supabase.js';
import { formatDate, timeAgo, showToast, showConfirm, renderSpinner, renderEmptyState, formatPhone, formatCNPJ } from '../utils.js';
import { CLIENT_STATUS_LABELS, SERVICES } from '../config.js';

let allClients = [];
let allTeam = [];
let currentClient = null;
let currentTab = 'dados';
let searchQuery = '';
let statusFilter = 'all';

// ─── Health Score ────────────────────────────────────────────
function calculateHealthScore(client) {
  let score = 100;
  // Pagamentos em atraso penalizam
  if (client.payment_status === 'overdue') score -= 30;
  else if (client.payment_status === 'pending') score -= 10;
  // Status do cliente
  if (client.status === 'at_risk') score -= 20;
  else if (client.status === 'paused') score -= 15;
  else if (client.status === 'churned') score = 0;
  // Health score explícito do banco tem prioridade se existir
  if (client.health_score != null) return client.health_score;
  return Math.max(0, Math.min(100, score));
}

function renderHealthBar(score) {
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
  const label = score >= 70 ? 'Saudável' : score >= 40 ? 'Atenção' : 'Crítico';
  return `
    <div style="margin-top:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">
        <span style="font-size:10px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.3px;">Health Score</span>
        <span style="font-size:11px;font-weight:700;color:${color};">${score}% ${label}</span>
      </div>
      <div style="height:5px;background:#f3f4f6;border-radius:10px;overflow:hidden;">
        <div style="height:100%;width:${score}%;background:${color};border-radius:10px;transition:width .6s ease;"></div>
      </div>
    </div>
  `;
}

export async function renderClients(container, user) {
  container.innerHTML = renderSpinner('Carregando clientes...');
  try {
    const [clientsRes, teamRes] = await Promise.all([
      db.from('clients').select('*').order('name'),
      db.from('profiles').select('id, full_name, role').order('full_name')
    ]);
    allClients = clientsRes.data || [];
    allTeam    = teamRes.data || [];
    renderClientsView(container, user);
  } catch(e) {
    container.innerHTML = `<div class="empty-state"><p>Erro: ${e.message}</p></div>`;
  }
}

function renderClientsView(container, user) {
  const filtered = getFiltered();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Clientes</h1>
        <p class="page-subtitle">Cadastros, fichas e informações completas</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-outline" onclick="window._clients.exportCSV()">↓ Exportar</button>
        <button class="btn btn-primary" onclick="window._clients.openNew()">+ Novo Cliente</button>
      </div>
    </div>

    <!-- FILTROS -->
    <div class="card" style="padding:14px 16px;margin-bottom:20px">
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
        <input type="text" id="client-search" placeholder="🔍 Buscar por nome, e-mail, cidade..." value="${searchQuery}"
          oninput="window._clients.search()"
          style="flex:1;min-width:220px;padding:8px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px">
        <select id="status-filter" onchange="window._clients.filterStatus()"
          style="padding:8px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px">
          <option value="all">Todos os status</option>
          ${Object.entries(CLIENT_STATUS_LABELS).map(([v,s]) => `<option value="${v}" ${statusFilter===v?'selected':''}>${s.icon} ${s.label}</option>`).join('')}
        </select>
        <span style="font-size:13px;color:#64748b;white-space:nowrap">${filtered.length} cliente${filtered.length!==1?'s':''}</span>
      </div>
    </div>

    <!-- GRID DE CLIENTES -->
    <div id="clients-grid">
      ${renderGrid(filtered)}
    </div>

    <!-- MODAL CLIENTE -->
    <div id="client-modal" class="modal-overlay" style="display:none" onclick="window._clients.closeModal(event)">
      <div class="modal-content" style="max-width:800px;max-height:92vh;overflow:hidden;display:flex;flex-direction:column" onclick="event.stopPropagation()">
        <div id="client-modal-body" style="overflow:hidden;display:flex;flex-direction:column;flex:1"></div>
      </div>
    </div>

    <!-- MODAL NOVO CLIENTE -->
    <div id="new-client-modal" class="modal-overlay" style="display:none" onclick="window._clients.closeNewModal(event)">
      <div class="modal-content" style="max-width:560px" onclick="event.stopPropagation()">
        ${renderNewClientForm()}
      </div>
    </div>
  `;

  window._clients = {
    openClient: (id) => openClient(id, user),
    openNew: () => { document.getElementById('new-client-modal').style.display = 'flex'; },
    closeModal: (e) => { if (e.target.id === 'client-modal') document.getElementById('client-modal').style.display = 'none'; },
    closeNewModal: (e) => { if (e.target.id === 'new-client-modal') document.getElementById('new-client-modal').style.display = 'none'; },
    submitNew: () => submitNewClient(container, user),
    search: () => { searchQuery = document.getElementById('client-search')?.value || ''; refreshGrid(); },
    filterStatus: () => { statusFilter = document.getElementById('status-filter')?.value || 'all'; refreshGrid(); },
    switchTab: (tab) => switchClientTab(tab, user),
    generateToken: (id) => generatePortalToken(id, user),
    saveIdentification: (id) => saveIdentificationForm(id, user),
    exportCSV: () => exportCSV()
  };
}

function renderGrid(clients) {
  if (clients.length === 0) return renderEmptyState('Nenhum cliente encontrado', 'Adicione o primeiro cliente ou ajuste os filtros', '👤');
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px">
    ${clients.map(c => renderClientCard(c)).join('')}
  </div>`;
}

function renderClientCard(c) {
  const st = CLIENT_STATUS_LABELS[c.status] || CLIENT_STATUS_LABELS.active;
  const initial = (c.name||'?')[0].toUpperCase();
  const colors = ['#1a2744','#2d4a8a','#c9a84c','#10b981','#8b5cf6','#f97316'];
  const color  = colors[(c.name||'').charCodeAt(0) % colors.length];

  const services = Array.isArray(c.services) ? c.services : [];
  return `
    <div class="card client-card" style="padding:0;overflow:hidden;cursor:pointer;transition:all 0.2s;border:1.5px solid #e2e8f0"
      onclick="window._clients.openClient('${c.id}')"
      onmouseenter="this.style.borderColor='#1a2744';this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,0.08)'"
      onmouseleave="this.style.borderColor='#e2e8f0';this.style.transform='';this.style.boxShadow=''">
      <!-- Header colorido -->
      <div style="background:${color};padding:20px 20px 16px;position:relative">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="width:46px;height:46px;border-radius:12px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:white;flex-shrink:0">
            ${c.logo_url ? `<img src="${c.logo_url}" style="width:100%;height:100%;object-fit:cover;border-radius:12px">` : initial}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;color:white;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.name}</div>
            ${c.city ? `<div style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:2px">📍 ${c.city}</div>` : ''}
          </div>
        </div>
        <div style="position:absolute;top:16px;right:16px;background:${st.bg};color:${st.color};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600">
          ${st.icon} ${st.label}
        </div>
      </div>
      <!-- Body -->
      <div style="padding:16px 20px">
        ${c.responsible_name ? `<div style="font-size:13px;color:#64748b;margin-bottom:6px">👤 ${c.responsible_name}</div>` : ''}
        ${c.email ? `<div style="font-size:13px;color:#64748b;margin-bottom:6px">📧 ${c.email}</div>` : ''}
        ${c.monthly_value ? `<div style="font-size:13px;color:#1e293b;font-weight:600;margin-bottom:6px">💰 R$ ${Number(c.monthly_value).toLocaleString('pt-BR')}/mês</div>` : ''}
        ${services.length > 0 ? `
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:8px">
            ${services.slice(0,3).map(s => {
              const svc = SERVICES[s] || { label: s, icon: '📦', color: '#6b7280' };
              return `<span style="font-size:10px;padding:2px 7px;border-radius:20px;background:${svc.color}15;color:${svc.color};font-weight:600">${svc.icon} ${svc.label}</span>`;
            }).join('')}
            ${services.length > 3 ? `<span style="font-size:10px;padding:2px 7px;border-radius:20px;background:#f1f5f9;color:#64748b">+${services.length-3}</span>` : ''}
          </div>
        ` : ''}
        ${renderHealthBar(calculateHealthScore(c))}
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:12px;border-top:1px solid #f1f5f9">
          <span style="font-size:11px;color:#94a3b8">Cliente desde ${formatDate(c.created_at)}</span>
          <span style="font-size:11px;color:#3b82f6;font-weight:600">Ver detalhes →</span>
        </div>
      </div>
    </div>
  `;
}

// ─── Modal do cliente ───────────────────────────────────────
async function openClient(id, user) {
  currentClient = allClients.find(c => c.id === id);
  if (!currentClient) return;

  const modal = document.getElementById('client-modal');
  const body  = document.getElementById('client-modal-body');
  modal.style.display = 'flex';
  body.innerHTML = renderSpinner('Carregando...');

  // Buscar dados extras
  try {
    const [formRes, tokensRes] = await Promise.all([
      db.from('client_identification_forms').select('*').eq('client_id', id).order('created_at', { ascending: false }).limit(1),
      db.from('client_form_tokens').select('*').eq('client_id', id).order('created_at', { ascending: false }).limit(5)
    ]);
    currentClient._form   = formRes.data?.[0] || null;
    currentClient._tokens = tokensRes.data || [];
  } catch(e) {}

  renderClientModal(body, user);
}

function renderClientModal(body, user) {
  const c  = currentClient;
  const st = CLIENT_STATUS_LABELS[c.status] || CLIENT_STATUS_LABELS.active;
  const color = ['#1a2744','#2d4a8a','#c9a84c','#10b981','#8b5cf6','#f97316'][(c.name||'').charCodeAt(0) % 6];

  const tabs = [
    { id: 'dados',          label: '📋 Dados',          icon: '📋' },
    { id: 'ficha',          label: '📝 Ficha',          icon: '📝' },
    { id: 'portal',         label: '🔗 Portal',         icon: '🔗' },
    { id: 'servicos',       label: '🛠️ Serviços',       icon: '🛠️' },
    { id: 'historico',      label: '📊 Histórico',      icon: '📊' },
    { id: 'aprovacoes',     label: '✅ Aprovações',     icon: '✅' },
    { id: 'nps',            label: '⭐ NPS',            icon: '⭐' }
  ];

  body.innerHTML = `
    <div style="background:${color};padding:20px 24px;flex-shrink:0">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="width:52px;height:52px;border-radius:12px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:white">
          ${(c.name||'?')[0].toUpperCase()}
        </div>
        <div style="flex:1">
          <h2 style="color:white;font-size:18px;font-weight:700">${c.name}</h2>
          <div style="display:flex;gap:8px;align-items:center;margin-top:4px">
            <span style="background:${st.bg};color:${st.color};padding:2px 10px;border-radius:20px;font-size:12px;font-weight:600">${st.icon} ${st.label}</span>
            ${c.monthly_value ? `<span style="color:rgba(255,255,255,0.85);font-size:13px">💰 R$ ${Number(c.monthly_value).toLocaleString('pt-BR')}/mês</span>` : ''}
          </div>
          <div style="margin-top:8px;max-width:320px;">
            ${(() => { const hs = calculateHealthScore(c); const hc = hs >= 70 ? '#10b981' : hs >= 40 ? '#f59e0b' : '#ef4444'; const hl = hs >= 70 ? 'Saudável' : hs >= 40 ? 'Atenção' : 'Crítico'; return `<div style="display:flex;align-items:center;gap:8px;"><span style="font-size:11px;color:rgba(255,255,255,0.65);font-weight:600;text-transform:uppercase;letter-spacing:.3px;">Health Score</span><span style="font-size:12px;font-weight:700;background:rgba(0,0,0,0.25);color:${hc};padding:2px 8px;border-radius:20px;">${hs}% ${hl}</span></div><div style="height:4px;background:rgba(255,255,255,0.15);border-radius:10px;overflow:hidden;margin-top:4px;"><div style="height:100%;width:${hs}%;background:${hc};border-radius:10px;transition:width .6s ease;"></div></div>`; })()}
          </div>
        </div>
        <button onclick="document.getElementById('client-modal').style.display='none'" style="color:rgba(255,255,255,0.7);background:none;border:none;font-size:24px;cursor:pointer;line-height:1">×</button>
      </div>
      <!-- Tabs -->
      <div style="display:flex;gap:4px;margin-top:16px;overflow-x:auto">
        ${tabs.map(t => `
          <button onclick="window._clients.switchTab('${t.id}')"
            style="padding:6px 14px;border-radius:6px;border:none;cursor:pointer;font-size:13px;font-weight:500;transition:all 0.15s;white-space:nowrap;background:${currentTab===t.id?'rgba(255,255,255,0.25)':'rgba(255,255,255,0.08)'};color:${currentTab===t.id?'white':'rgba(255,255,255,0.65)'}"
            id="tab-btn-${t.id}">
            ${t.label}
          </button>
        `).join('')}
      </div>
    </div>
    <div id="client-tab-content" style="flex:1;overflow-y:auto;padding:24px">
      ${renderClientTab(currentTab, user)}
    </div>
  `;
}

function switchClientTab(tab, user) {
  currentTab = tab;
  // Update tab buttons
  document.querySelectorAll('[id^="tab-btn-"]').forEach(btn => {
    const isActive = btn.id === `tab-btn-${tab}`;
    btn.style.background = isActive ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)';
    btn.style.color = isActive ? 'white' : 'rgba(255,255,255,0.65)';
  });
  const content = document.getElementById('client-tab-content');
  if (content) content.innerHTML = renderClientTab(tab, user);
}

function renderClientTab(tab, user) {
  const c = currentClient;
  switch(tab) {
    case 'dados': return renderTabDados(c);
    case 'ficha': return renderTabFicha(c, user);
    case 'portal': return renderTabPortal(c, user);
    case 'servicos': return renderTabServicos(c);
    case 'historico':   return renderTabHistorico(c);
    case 'aprovacoes':  return renderTabAprovacoes(c, user);
    case 'nps':         return renderTabNps(c, user);
    default: return '';
  }
}

function renderTabDados(c) {
  const field = (label, value, icon='') => value ? `
    <div style="display:flex;flex-direction:column;gap:3px">
      <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8">${label}</span>
      <span style="font-size:14px;color:#1e293b">${icon} ${value}</span>
    </div>
  ` : '';

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div>
        <h4 style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #f1f5f9">Dados do Responsável</h4>
        <div style="display:flex;flex-direction:column;gap:14px">
          ${field('Nome do responsável', c.responsible_name, '👤')}
          ${field('E-mail', c.email, '📧')}
          ${field('WhatsApp', c.whatsapp, '📱')}
          ${field('Telefone', c.phone, '📞')}
          ${field('Cargo', c.responsible_role, '🏷️')}
        </div>
      </div>
      <div>
        <h4 style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #f1f5f9">Dados da Empresa</h4>
        <div style="display:flex;flex-direction:column;gap:14px">
          ${field('CNPJ', c.cnpj, '📄')}
          ${field('Cidade', c.city, '📍')}
          ${field('Site', c.website ? `<a href="${c.website}" target="_blank" style="color:#3b82f6">${c.website}</a>` : '', '🌐')}
          ${field('Instagram', c.instagram ? `<a href="https://instagram.com/${c.instagram.replace('@','')}" target="_blank" style="color:#e1306c">${c.instagram}</a>` : '', '📸')}
          ${field('Contrato desde', formatDate(c.contract_start_date), '📅')}
        </div>
      </div>
    </div>
    ${c.notes ? `
      <div style="margin-top:20px;padding-top:20px;border-top:1px solid #f1f5f9">
        <h4 style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;margin-bottom:8px">Observações</h4>
        <p style="font-size:14px;color:#64748b;line-height:1.6">${c.notes}</p>
      </div>
    ` : ''}
    <div style="margin-top:20px">
      <h4 style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;margin-bottom:12px;padding-top:16px;border-top:1px solid #f1f5f9">Alterar Status</h4>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${Object.entries(CLIENT_STATUS_LABELS).map(([v,s]) => `
          <button onclick="window._clients.updateStatus('${c.id}','${v}')"
            style="padding:6px 14px;border-radius:20px;border:1.5px solid ${c.status===v?s.color:'#e2e8f0'};background:${c.status===v?s.bg:'white'};color:${c.status===v?s.color:'#64748b'};font-size:12px;font-weight:600;cursor:pointer">
            ${s.icon} ${s.label}
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function renderTabFicha(c, user) {
  const f = c._form;

  if (!f) return `
    <div style="text-align:center;padding:40px 20px">
      <div style="font-size:48px;margin-bottom:16px">📝</div>
      <h3 style="font-size:18px;font-weight:700;margin-bottom:8px">Ficha não preenchida</h3>
      <p style="color:#64748b;font-size:14px;margin-bottom:20px">O cliente ainda não preencheu a Ficha de Identificação.<br>Envie o link pelo portal ou preencha internamente.</p>
      <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="window._clients.switchTab('portal')">🔗 Ir para Portal</button>
        <button class="btn btn-outline" onclick="window._clients.openInternalForm('${c.id}')">✏️ Preencher Agora</button>
      </div>
    </div>
  `;

  const section = (title, fields) => {
    const items = fields.filter(([,v]) => v && (Array.isArray(v) ? v.length > 0 : true));
    if (items.length === 0) return '';
    return `
      <div style="margin-bottom:20px">
        <h4 style="font-size:13px;font-weight:700;color:#1a2744;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #e2e8f0">${title}</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          ${items.map(([label, value]) => `
            <div style="${typeof value === 'string' && value.length > 60 ? 'grid-column:1/-1' : ''}">
              <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;color:#94a3b8;margin-bottom:4px">${label}</div>
              <div style="font-size:13px;color:#1e293b;line-height:1.5">${Array.isArray(value) ? value.join(', ') : value}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  };

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div>
        <span style="font-size:12px;color:#64748b">Preenchida por: <strong>${f.filled_by === 'client' ? '👤 Cliente' : '🏢 Agência'}</strong></span>
        <span style="font-size:12px;color:#64748b;margin-left:12px">Última atualização: ${formatDate(f.updated_at)}</span>
      </div>
      <button class="btn btn-outline" style="font-size:12px;padding:6px 12px" onclick="window._clients.openInternalForm('${c.id}')">✏️ Editar</button>
    </div>
    ${section('1. Informações da Empresa', [
      ['Nome', f.company_name],['CNPJ', f.cnpj],['Responsável', f.responsible_name],
      ['Cargo', f.responsible_role],['WhatsApp', f.whatsapp],['E-mail', f.email],
      ['Cidade/Estado', f.city_state],['Site', f.website],['Instagram', f.instagram]
    ])}
    ${section('2. Sobre o Negócio', [
      ['Tempo de empresa', f.company_age],['O que faz', f.business_description],
      ['Diferencial', f.main_differential],['Personalidade da marca', f.brand_personality],
      ['O que resolve', f.client_solution]
    ])}
    ${section('3. Objetivos com Redes Sociais', [
      ['Objetivos', f.social_goals],['Meta 6 meses', f.six_month_goals]
    ])}
    ${section('4. Público-Alvo', [
      ['Cliente ideal', f.ideal_client],['Faixa etária', f.age_range],
      ['Gênero', f.predominant_gender],['Região', f.region],
      ['Renda', f.audience_income],['Valores do público', f.audience_values],
      ['Dores e desejos', f.audience_pain_points]
    ])}
    ${section('5. Concorrência', [
      ['Concorrentes', f.main_competitors],['O que admira', f.competitor_admiration],
      ['Referências', f.profile_references],['O que não quer', f.what_not_to_do]
    ])}
    ${section('6. Posicionamento', [
      ['Percepção desejada', f.brand_perception],['Palavras da marca', f.brand_words],
      ['Restrições', f.communication_restrictions]
    ])}
    ${section('7. Conteúdo', [
      ['Disponibilidade', f.content_availability],['Tipos de conteúdo', f.content_types],
      ['Temas', f.content_topics],['Nunca postar', f.content_never]
    ])}
    ${section('8. Estrutura', [
      ['Equipe comercial', f.has_sales_team],['Captação atual', f.current_acquisition],
      ['Banco de imagens', f.has_image_bank],['Identidade visual', f.has_visual_identity],['Logotipo', f.has_logo]
    ])}
    ${section('9. Processo', [
      ['Melhor horário gravação', f.best_recording_time],['Frequência posts', f.posting_frequency],
      ['Responsável aprovação', f.approval_responsible],['Prazo aprovação', f.approval_time]
    ])}
    ${section('10. Produtos', [
      ['Produtos/Serviços', f.main_products],['Ticket médio', f.average_ticket],
      ['Mais lucrativos', f.most_profitable_services],['Divulgar mais', f.services_to_promote]
    ])}
    ${section('11. Resultados', [
      ['Definição de sucesso', f.success_definition],['Prioridade curto prazo', f.short_term_priority]
    ])}
    ${section('12. Considerações', [['Informações adicionais', f.additional_info]])}
  `;
}

function renderTabPortal(c, user) {
  const tokens = c._tokens || [];
  const activeTokens = tokens.filter(t => !t.used_at && new Date(t.expires_at) > new Date());
  const origin = window.location.origin;

  return `
    <div>
      <div style="background:linear-gradient(135deg,#1a2744,#2d4a8a);border-radius:12px;padding:24px;margin-bottom:24px;color:white">
        <div style="font-size:32px;margin-bottom:12px">🔗</div>
        <h3 style="font-size:16px;font-weight:700;margin-bottom:6px">Portal do Cliente</h3>
        <p style="font-size:13px;color:rgba(255,255,255,0.75);line-height:1.6">
          Gere um link único para <strong>${c.name}</strong> preencher a Ficha de Identificação ou atualizar seus dados. O link expira em 30 dias.
        </p>
        <button class="btn" style="margin-top:16px;background:#c9a84c;color:#1a2744;font-weight:700;padding:10px 20px"
          onclick="window._clients.generateToken('${c.id}')">
          ✨ Gerar Novo Link
        </button>
      </div>

      ${activeTokens.length > 0 ? `
        <h4 style="font-size:13px;font-weight:700;color:#64748b;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px">Links Ativos</h4>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${activeTokens.map(t => {
            const link = `${origin}/portal.html?token=${t.token}`;
            return `
              <div style="background:#f8faff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
                  <div style="flex:1;min-width:0">
                    <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#94a3b8;margin-bottom:4px">Link de acesso</div>
                    <div style="font-size:12px;color:#3b82f6;word-break:break-all;margin-bottom:8px;font-family:monospace">${link}</div>
                    <div style="font-size:11px;color:#64748b">Expira em: ${formatDate(t.expires_at)} · Tipo: ${t.type === 'identification_form' ? 'Ficha de Identificação' : 'Atualização Cadastral'}</div>
                  </div>
                  <div style="display:flex;gap:6px;flex-shrink:0">
                    <button onclick="navigator.clipboard.writeText('${link}').then(()=>window._clients.showCopied(this))"
                      style="padding:6px 12px;border-radius:6px;border:1.5px solid #e2e8f0;background:white;font-size:12px;cursor:pointer;font-weight:600">
                      📋 Copiar
                    </button>
                    <a href="https://wa.me/${(c.whatsapp||'').replace(/\D/g,'')}?text=${encodeURIComponent('Olá '+c.name+'! Segue o link para preencher sua Ficha de Identificação: '+link)}"
                      target="_blank"
                      style="padding:6px 12px;border-radius:6px;background:#25D366;color:white;font-size:12px;cursor:pointer;font-weight:600;text-decoration:none;display:flex;align-items:center">
                      📱 WhatsApp
                    </a>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : '<p style="color:#94a3b8;font-size:13px;text-align:center;padding:20px 0">Nenhum link ativo. Gere um novo link acima.</p>'}

      ${tokens.filter(t => t.used_at).length > 0 ? `
        <div style="margin-top:20px">
          <h4 style="font-size:12px;font-weight:700;color:#94a3b8;margin-bottom:10px;text-transform:uppercase;letter-spacing:0.5px">Links Utilizados</h4>
          ${tokens.filter(t => t.used_at).map(t => `
            <div style="font-size:12px;color:#94a3b8;padding:6px 0;border-bottom:1px solid #f1f5f9">
              ✅ Usado em ${formatDate(t.used_at)} — ${t.type === 'identification_form' ? 'Ficha de Identificação' : 'Atualização'}
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderTabServicos(c) {
  const services = Array.isArray(c.services) ? c.services : [];
  return `
    <div>
      <div style="margin-bottom:20px">
        <h4 style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;margin-bottom:12px">Serviços Contratados</h4>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${Object.entries(SERVICES).map(([v,s]) => `
            <div style="padding:10px 16px;border-radius:10px;border:1.5px solid ${services.includes(v)?s.color:' #e2e8f0'};background:${services.includes(v)?s.color+'15':'white'};display:flex;align-items:center;gap:8px">
              <span>${s.icon}</span>
              <span style="font-size:13px;font-weight:${services.includes(v)?'700':'400'};color:${services.includes(v)?s.color:'#94a3b8'}">${s.label}</span>
              ${services.includes(v) ? '<span style="font-size:10px;color:inherit">✓</span>' : ''}
            </div>
          `).join('')}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;padding-top:16px;border-top:1px solid #f1f5f9">
        <div style="background:#f8faff;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center">
          <div style="font-size:24px;font-weight:800;color:#1a2744">R$ ${c.monthly_value ? Number(c.monthly_value).toLocaleString('pt-BR') : '—'}</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px">Valor mensal</div>
        </div>
        <div style="background:#f8faff;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center">
          <div style="font-size:24px;font-weight:800;color:#1a2744">${c.contract_start_date ? Math.floor((new Date()-new Date(c.contract_start_date))/(1000*60*60*24*30)) : '—'}</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px">Meses como cliente</div>
        </div>
      </div>
    </div>
  `;
}

function renderTabHistorico(c) {
  return `
    <div style="text-align:center;padding:40px 20px;color:#94a3b8">
      <div style="font-size:40px;margin-bottom:12px">📊</div>
      <p style="font-size:14px">Histórico de atividades em breve</p>
    </div>
  `;
}

// ─── Gerar token portal ────────────────────────────────────
async function generatePortalToken(clientId, user) {
  try {
    const { data, error } = await db.from('client_form_tokens').insert({
      client_id: clientId,
      type: 'identification_form',
      created_by: user.id
    }).select().single();

    if (error) throw error;

    currentClient._tokens = [data, ...(currentClient._tokens || [])];
    showToast('Link gerado com sucesso!', 'success');
    switchClientTab('portal', user);
  } catch(e) {
    showToast('Erro ao gerar link: ' + e.message, 'error');
  }
}

window._clients = window._clients || {};
window._clients.showCopied = (btn) => {
  const orig = btn.textContent;
  btn.textContent = '✓ Copiado!';
  btn.style.background = '#f0fdf4';
  btn.style.borderColor = '#10b981';
  setTimeout(() => { btn.textContent = orig; btn.style.background = 'white'; btn.style.borderColor = '#e2e8f0'; }, 2000);
};
window._clients.updateStatus = async (id, status) => {
  try {
    await db.from('clients').update({ status }).eq('id', id);
    currentClient.status = status;
    const idx = allClients.findIndex(c => c.id === id);
    if (idx !== -1) allClients[idx].status = status;
    showToast('Status atualizado', 'success');
    renderClientModal(document.getElementById('client-modal-body'), null);
  } catch(e) { showToast('Erro', 'error'); }
};
window._clients.openInternalForm = (id) => {
  showToast('Em breve: formulário interno', 'info');
};

// ─── Novo cliente ───────────────────────────────────────────
function renderNewClientForm() {
  return `
    <div class="modal-header">
      <h2 class="modal-title">Novo Cliente</h2>
      <button class="modal-close" onclick="document.getElementById('new-client-modal').style.display='none'">×</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Nome da empresa *</label>
        <input type="text" id="nc_name" placeholder="Nome da empresa" style="width:100%;padding:10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div class="form-group">
          <label>Nome do responsável</label>
          <input type="text" id="nc_responsible" placeholder="Nome completo" style="width:100%;padding:10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px">
        </div>
        <div class="form-group">
          <label>Status</label>
          <select id="nc_status" style="width:100%;padding:10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px">
            ${Object.entries(CLIENT_STATUS_LABELS).map(([v,s]) => `<option value="${v}">${s.icon} ${s.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div class="form-group">
          <label>WhatsApp</label>
          <input type="tel" id="nc_whatsapp" placeholder="(00) 00000-0000" style="width:100%;padding:10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px">
        </div>
        <div class="form-group">
          <label>E-mail</label>
          <input type="email" id="nc_email" placeholder="email@empresa.com" style="width:100%;padding:10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px">
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div class="form-group">
          <label>Valor mensal (R$)</label>
          <input type="number" id="nc_monthly_value" placeholder="0.00" style="width:100%;padding:10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px">
        </div>
        <div class="form-group">
          <label>Início do contrato</label>
          <input type="date" id="nc_contract_start" style="width:100%;padding:10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px">
        </div>
      </div>
      <div class="form-group">
        <label>Serviços contratados</label>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${Object.entries(SERVICES).map(([v,s]) => `
            <label style="display:flex;align-items:center;gap:6px;padding:6px 12px;border:1.5px solid #e2e8f0;border-radius:20px;cursor:pointer;font-size:13px;transition:all 0.15s"
              onclick="this.style.borderColor=this.querySelector('input').checked?'#e2e8f0':'${s.color}';this.style.background=this.querySelector('input').checked?'white':'${s.color}15';this.style.color=this.querySelector('input').checked?'#64748b':'${s.color}'">
              <input type="checkbox" value="${v}" class="nc-service" style="display:none"> ${s.icon} ${s.label}
            </label>
          `).join('')}
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="document.getElementById('new-client-modal').style.display='none'">Cancelar</button>
      <button class="btn btn-primary" onclick="window._clients.submitNew()">Criar Cliente</button>
    </div>
  `;
}

async function submitNewClient(container, user) {
  const name = document.getElementById('nc_name')?.value?.trim();
  if (!name) { showToast('Nome obrigatório', 'error'); return; }

  const services = [...document.querySelectorAll('.nc-service:checked')].map(c => c.value);

  try {
    const { data, error } = await db.from('clients').insert({
      name,
      responsible_name: document.getElementById('nc_responsible')?.value?.trim() || null,
      status: document.getElementById('nc_status')?.value || 'lead',
      whatsapp: document.getElementById('nc_whatsapp')?.value?.trim() || null,
      email: document.getElementById('nc_email')?.value?.trim() || null,
      monthly_value: parseFloat(document.getElementById('nc_monthly_value')?.value) || null,
      contract_start_date: document.getElementById('nc_contract_start')?.value || null,
      services,
      created_by: user.id
    }).select().single();

    if (error) throw error;

    allClients.unshift(data);
    document.getElementById('new-client-modal').style.display = 'none';
    showToast('Cliente criado! Gere o link da ficha na aba Portal.', 'success');
    refreshGrid();
  } catch(e) {
    showToast('Erro: ' + e.message, 'error');
  }
}

// ─── Helpers ────────────────────────────────────────────────
function refreshGrid() {
  const grid = document.getElementById('clients-grid');
  if (grid) grid.innerHTML = renderGrid(getFiltered());
}

function getFiltered() {
  return allClients.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!c.name?.toLowerCase().includes(q) && !c.email?.toLowerCase().includes(q) && !c.city?.toLowerCase().includes(q) && !c.responsible_name?.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

function exportCSV() {
  const rows = [['Nome','Responsável','E-mail','WhatsApp','Status','Valor Mensal','Cidade']];
  allClients.forEach(c => rows.push([c.name,c.responsible_name,c.email,c.whatsapp,c.status,c.monthly_value,c.city]));
  const csv = rows.map(r => r.map(v => `"${(v||'').toString().replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,﻿' + encodeURIComponent(csv);
  a.download = `clientes_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
}

// ─── Aba Aprovações ────────────────────────────────────────
function renderTabAprovacoes(c, user) {
  const containerId = 'tab-aprovacoes-content';
  setTimeout(async () => {
    const el = document.getElementById(containerId);
    if (!el) return;
    try {
      const { data, error } = await db
        .from('content_approval_batches')
        .select('*, items:content_approval_items(id,status)')
        .eq('client_id', c.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      const batches = data || [];

      const statusBadge = (status) => {
        const map = {
          pending:            { bg: '#eff6ff', color: '#2563eb', label: 'Pendente' },
          partial:            { bg: '#fffbeb', color: '#d97706', label: 'Parcial' },
          approved:           { bg: '#f0fdf4', color: '#16a34a', label: 'Aprovado' },
          revision_requested: { bg: '#fff7ed', color: '#ea580c', label: 'Revisão' }
        };
        const s = map[status] || { bg: '#f1f5f9', color: '#64748b', label: status };
        return `<span style="background:${s.bg};color:${s.color};padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600">${s.label}</span>`;
      };

      if (batches.length === 0) {
        el.innerHTML = `
          <div style="text-align:center;padding:48px 20px;color:#94a3b8">
            <div style="font-size:40px;margin-bottom:12px">✅</div>
            <p style="font-size:14px">Nenhum lote de aprovação enviado ainda</p>
          </div>`;
        return;
      }

      const rows = batches.map(b => {
        const items = b.items || [];
        const total = items.length;
        const approved = items.filter(i => i.status === 'approved').length;
        const link = `${location.origin}/approval.html?token=${b.token}`;
        const date = b.created_at ? new Date(b.created_at).toLocaleDateString('pt-BR') : '—';
        const monthYear = b.reference_month
          ? new Date(b.reference_month + '-02').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
          : '';

        const phone = (c.whatsapp || c.phone || '').replace(/\D/g, '');
        const waMsg = encodeURIComponent('Olá ' + c.name + '! Segue o link para aprovação dos conteúdos: ' + link);

        return `
          <div style="background:#f8faff;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
              <div style="flex:1;min-width:0">
                <div style="font-weight:600;font-size:14px;color:#1e293b;margin-bottom:4px">${b.title || 'Lote sem título'}</div>
                ${monthYear ? `<div style="font-size:12px;color:#64748b;margin-bottom:4px">📅 ${monthYear}</div>` : ''}
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:6px">
                  ${statusBadge(b.status)}
                  <span style="font-size:12px;color:#64748b">${approved}/${total} itens aprovados</span>
                  <span style="font-size:11px;color:#94a3b8">Criado em ${date}</span>
                </div>
              </div>
              <div style="display:flex;gap:6px;flex-shrink:0;align-items:center">
                <button onclick="navigator.clipboard.writeText('${link}').then(()=>window._clients.showCopied(this))"
                  style="padding:6px 12px;border-radius:6px;border:1.5px solid #e2e8f0;background:white;font-size:12px;cursor:pointer;font-weight:600">
                  🔗 Reenviar Link
                </button>
                ${phone ? `
                  <a href="https://wa.me/${phone}?text=${waMsg}" target="_blank"
                    style="padding:6px 12px;border-radius:6px;background:#25D366;color:white;font-size:12px;cursor:pointer;font-weight:600;text-decoration:none;display:flex;align-items:center">
                    📱 WhatsApp
                  </a>` : ''}
              </div>
            </div>
          </div>`;
      }).join('');

      el.innerHTML = rows;
    } catch(e) {
      el.innerHTML = `<div style="text-align:center;padding:40px;color:#ef4444;font-size:13px">Erro ao carregar aprovações: ${e.message}</div>`;
    }
  }, 0);
  return `<div id="${containerId}"><div style="text-align:center;padding:40px;color:var(--text-secondary,#94a3b8);">⏳ Carregando...</div></div>`;
}

// ─── Aba NPS ──────────────────────────────────────────────
function renderTabNps(c, user) {
  const containerId = 'tab-nps-content';
  setTimeout(async () => {
    const el = document.getElementById(containerId);
    if (!el) return;
    try {
      const { data, error } = await db
        .from('client_nps')
        .select('*')
        .eq('client_id', c.id)
        .order('year', { ascending: false })
        .order('month', { ascending: false })
        .limit(12);
      if (error) throw error;
      const records = data || [];

      if (records.length === 0) {
        el.innerHTML = `
          <div style="text-align:center;padding:48px 20px;color:#94a3b8">
            <div style="font-size:40px;margin-bottom:12px">⭐</div>
            <p style="font-size:14px;line-height:1.6">Nenhuma avaliação de NPS registrada ainda.<br>Convide o cliente a avaliar via portal.</p>
          </div>`;
        return;
      }

      const npsColor = (score) => score >= 9 ? '#16a34a' : score >= 7 ? '#d97706' : '#dc2626';
      const npsBg    = (score) => score >= 9 ? '#f0fdf4' : score >= 7 ? '#fffbeb' : '#fef2f2';
      const npsLabel = (score) => score >= 9 ? 'Promotor' : score >= 7 ? 'Neutro' : 'Detrator';

      const latest = records[0];
      const avg = (records.reduce((s, r) => s + (r.score || 0), 0) / records.length).toFixed(1);
      const avgNum = parseFloat(avg);
      const latestDate = latest.year && latest.month
        ? new Date(latest.year, latest.month - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
        : '—';

      const historyCards = records.map(r => {
        const label = r.year && r.month
          ? new Date(r.year, r.month - 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
          : '—';
        return `
          <div style="background:${npsBg(r.score)};border:1px solid ${npsColor(r.score)}30;border-radius:8px;padding:10px 14px;text-align:center">
            <div style="font-size:20px;font-weight:800;color:${npsColor(r.score)}">${r.score ?? '—'}</div>
            <div style="font-size:10px;color:#64748b;margin-top:2px">${label}</div>
          </div>`;
      }).join('');

      el.innerHTML = `
        <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:24px">
          <div style="flex:0 0 auto;background:${npsBg(avgNum)};border:2px solid ${npsColor(avgNum)}30;border-radius:14px;padding:24px 32px;text-align:center">
            <div style="font-size:48px;font-weight:900;color:${npsColor(avgNum)};line-height:1">${avg}</div>
            <div style="font-size:12px;font-weight:700;color:${npsColor(avgNum)};margin-top:4px;text-transform:uppercase;letter-spacing:.5px">${npsLabel(avgNum)}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:4px">Média (${records.length} avaliações)</div>
          </div>
          <div style="flex:1;min-width:160px">
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin-bottom:6px">Última Avaliação</div>
            <div style="font-size:28px;font-weight:800;color:${npsColor(latest.score)}">${latest.score ?? '—'}</div>
            <div style="font-size:13px;color:#64748b;margin-top:2px">${latestDate}</div>
            ${latest.comment ? `<p style="font-size:13px;color:#475569;margin-top:8px;line-height:1.5;font-style:italic">"${latest.comment}"</p>` : ''}
          </div>
        </div>
        <div>
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#64748b;margin-bottom:12px">Histórico</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:8px">
            ${historyCards}
          </div>
        </div>
      `;
    } catch(e) {
      el.innerHTML = `<div style="text-align:center;padding:40px;color:#ef4444;font-size:13px">Erro ao carregar NPS: ${e.message}</div>`;
    }
  }, 0);
  return `<div id="${containerId}"><div style="text-align:center;padding:40px;color:var(--text-secondary,#94a3b8);">⏳ Carregando...</div></div>`;
}
