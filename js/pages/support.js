// ============================================================
// MÓDULO SUPORTE — Tickets e Atendimento ao Cliente
// ============================================================
import { db } from '../supabase.js';
import { formatDate, timeAgo, showToast, showConfirm, renderSpinner, renderEmptyState } from '../utils.js';

let allTickets = [];
let allClients = [];
let allTeam = [];
let currentTicket = null;
let currentFilter = { status: 'all', priority: 'all', client: '', search: '' };

const TICKET_STATUS = {
  open:            { label: 'Aberto',          color: '#3b82f6', bg: '#eff6ff', icon: '🔵' },
  in_progress:     { label: 'Em Atendimento',  color: '#f59e0b', bg: '#fffbeb', icon: '🟡' },
  waiting_client:  { label: 'Aguardando Cliente', color: '#8b5cf6', bg: '#f5f3ff', icon: '🟣' },
  resolved:        { label: 'Resolvido',        color: '#10b981', bg: '#f0fdf4', icon: '🟢' },
  closed:          { label: 'Encerrado',        color: '#6b7280', bg: '#f9fafb', icon: '⚫' }
};

const TICKET_PRIORITY = {
  low:    { label: 'Baixa',   color: '#6b7280', bg: '#f9fafb' },
  medium: { label: 'Média',   color: '#f59e0b', bg: '#fffbeb' },
  high:   { label: 'Alta',    color: '#f97316', bg: '#fff7ed' },
  urgent: { label: 'Urgente', color: '#ef4444', bg: '#fef2f2' }
};

const TICKET_CATEGORY = {
  content_approval: { label: 'Aprovação de Conteúdo', icon: '✔️' },
  revision:         { label: 'Revisão',               icon: '✏️' },
  billing:          { label: 'Financeiro',             icon: '💰' },
  access:           { label: 'Acesso / Login',         icon: '🔑' },
  strategy:         { label: 'Estratégia',             icon: '🎯' },
  complaint:        { label: 'Reclamação',             icon: '⚠️' },
  other:            { label: 'Outro',                  icon: '📋' }
};

export async function renderSupport(container, user) {
  container.innerHTML = renderSpinner('Carregando suporte...');
  try {
    const [ticketsRes, clientsRes, teamRes] = await Promise.all([
      db.from('support_tickets')
        .select('*, client:clients(id,name), assigned:profiles!assigned_to(id,full_name)')
        .order('created_at', { ascending: false }),
      db.from('clients').select('id, name').order('name'),
      db.from('profiles').select('id, full_name, role').order('full_name')
    ]);
    allTickets = ticketsRes.data || [];
    allClients = clientsRes.data || [];
    allTeam    = teamRes.data || [];
    renderSupportView(container, user);
  } catch(e) {
    container.innerHTML = `<div class="empty-state"><p>Erro ao carregar suporte: ${e.message}</p></div>`;
  }
}

function renderSupportView(container, user) {
  const filtered = getFiltered();
  const stats = getStats();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Suporte</h1>
        <p class="page-subtitle">Gerencie chamados e solicitações dos clientes</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-primary" onclick="window._support.openNewTicket()">
          + Novo Ticket
        </button>
      </div>
    </div>

    <!-- KPIs -->
    <div class="kpi-grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:24px">
      ${[
        { label: 'Total de Tickets', value: stats.total, icon: '🎫', color: '#3b82f6' },
        { label: 'Abertos', value: stats.open, icon: '🔵', color: '#3b82f6' },
        { label: 'Em Atendimento', value: stats.in_progress, icon: '🟡', color: '#f59e0b' },
        { label: 'Aguardando Cliente', value: stats.waiting, icon: '🟣', color: '#8b5cf6' },
        { label: 'Resolvidos (mês)', value: stats.resolved_month, icon: '🟢', color: '#10b981' }
      ].map(k => `
        <div class="kpi-card">
          <div class="kpi-icon" style="background:${k.color}20;color:${k.color}">${k.icon}</div>
          <div class="kpi-value">${k.value}</div>
          <div class="kpi-label">${k.label}</div>
        </div>
      `).join('')}
    </div>

    <!-- FILTROS -->
    <div class="card" style="padding:16px;margin-bottom:20px">
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
        <input type="text" placeholder="🔍 Buscar ticket..." style="flex:1;min-width:200px;padding:8px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px"
          id="support-search" value="${currentFilter.search}" oninput="window._support.applyFilter()">
        <select style="padding:8px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px" id="filter-status" onchange="window._support.applyFilter()">
          <option value="all" ${currentFilter.status==='all'?'selected':''}>Todos os status</option>
          ${Object.entries(TICKET_STATUS).map(([v,s]) => `<option value="${v}" ${currentFilter.status===v?'selected':''}>${s.icon} ${s.label}</option>`).join('')}
        </select>
        <select style="padding:8px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px" id="filter-priority" onchange="window._support.applyFilter()">
          <option value="all" ${currentFilter.priority==='all'?'selected':''}>Todas as prioridades</option>
          ${Object.entries(TICKET_PRIORITY).map(([v,p]) => `<option value="${v}" ${currentFilter.priority===v?'selected':''}>${p.label}</option>`).join('')}
        </select>
        <select style="padding:8px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px" id="filter-client" onchange="window._support.applyFilter()">
          <option value="">Todos os clientes</option>
          ${allClients.map(c => `<option value="${c.id}" ${currentFilter.client===c.id?'selected':''}>${c.name}</option>`).join('')}
        </select>
      </div>
    </div>

    <!-- LISTA DE TICKETS -->
    <div id="tickets-list">
      ${filtered.length === 0
        ? renderEmptyState('Nenhum ticket encontrado', 'Crie um novo ticket ou ajuste os filtros', '🎫')
        : filtered.map(t => renderTicketRow(t)).join('')
      }
    </div>

    <!-- MODAL TICKET -->
    <div id="ticket-modal" class="modal-overlay" style="display:none" onclick="window._support.closeModal(event)">
      <div class="modal-content" style="max-width:680px;max-height:90vh;overflow:hidden;display:flex;flex-direction:column" onclick="event.stopPropagation()">
        <div id="ticket-modal-body"></div>
      </div>
    </div>

    <!-- MODAL NOVO TICKET -->
    <div id="new-ticket-modal" class="modal-overlay" style="display:none" onclick="window._support.closeNewModal(event)">
      <div class="modal-content" style="max-width:600px" onclick="event.stopPropagation()">
        ${renderNewTicketForm(user)}
      </div>
    </div>
  `;

  window._support = {
    openTicket: (id) => openTicket(id, user),
    openNewTicket: () => openNewTicketModal(),
    closeModal: (e) => { if (e.target.id === 'ticket-modal') document.getElementById('ticket-modal').style.display = 'none'; },
    closeNewModal: (e) => { if (e.target.id === 'new-ticket-modal') document.getElementById('new-ticket-modal').style.display = 'none'; },
    applyFilter: () => applyFilter(container, user),
    submitTicket: () => submitTicket(container, user),
    sendMessage: (id) => sendMessage(id, user, container),
    updateStatus: (id, status) => updateTicketStatus(id, status, container, user),
    assignTicket: (id, uid) => assignTicket(id, uid, container, user)
  };
}

function renderTicketRow(ticket) {
  const st = TICKET_STATUS[ticket.status] || TICKET_STATUS.open;
  const pr = TICKET_PRIORITY[ticket.priority] || TICKET_PRIORITY.medium;
  const cat = TICKET_CATEGORY[ticket.category] || TICKET_CATEGORY.other;
  return `
    <div class="card ticket-row" style="padding:16px 20px;margin-bottom:8px;cursor:pointer;border-left:4px solid ${st.color};transition:all 0.2s"
      onclick="window._support.openTicket('${ticket.id}')"
      onmouseenter="this.style.transform='translateX(4px)'" onmouseleave="this.style.transform=''">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
            <span style="font-size:11px;font-weight:700;color:#64748b">#${String(ticket.ticket_number||'').padStart(4,'0')}</span>
            <span style="font-size:11px;padding:2px 8px;border-radius:20px;background:${st.bg};color:${st.color};font-weight:600">${st.icon} ${st.label}</span>
            <span style="font-size:11px;padding:2px 8px;border-radius:20px;background:${pr.bg};color:${pr.color};font-weight:600">${pr.label}</span>
            <span style="font-size:11px;padding:2px 8px;border-radius:20px;background:#f1f5f9;color:#64748b">${cat.icon} ${cat.label}</span>
          </div>
          <div style="font-size:14px;font-weight:600;color:#1e293b;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${ticket.title}</div>
          <div style="font-size:13px;color:#64748b;display:flex;gap:12px;flex-wrap:wrap">
            ${ticket.client?.name ? `<span>👤 ${ticket.client.name}</span>` : ''}
            ${ticket.assigned?.full_name ? `<span>👷 ${ticket.assigned.full_name}</span>` : '<span style="color:#ef4444">⚠️ Não atribuído</span>'}
            <span>🕐 ${timeAgo(ticket.created_at)}</span>
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          ${ticket.due_date ? `<div style="font-size:11px;color:${new Date(ticket.due_date)<new Date()?'#ef4444':'#64748b'}">📅 ${formatDate(ticket.due_date)}</div>` : ''}
        </div>
      </div>
    </div>
  `;
}

function renderNewTicketForm(user) {
  return `
    <div class="modal-header">
      <h2 class="modal-title">Novo Ticket</h2>
      <button class="modal-close" onclick="document.getElementById('new-ticket-modal').style.display='none'">×</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Cliente</label>
        <select id="nt_client" style="width:100%;padding:10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px">
          <option value="">Selecione o cliente (opcional)</option>
          ${allClients.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Título do chamado *</label>
        <input type="text" id="nt_title" placeholder="Descreva brevemente o problema ou solicitação" style="width:100%;padding:10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="form-group">
          <label>Categoria</label>
          <select id="nt_category" style="width:100%;padding:10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px">
            ${Object.entries(TICKET_CATEGORY).map(([v,c]) => `<option value="${v}">${c.icon} ${c.label}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Prioridade</label>
          <select id="nt_priority" style="width:100%;padding:10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px">
            ${Object.entries(TICKET_PRIORITY).map(([v,p]) => `<option value="${v}" ${v==='medium'?'selected':''}>${p.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="form-group">
          <label>Atribuir para</label>
          <select id="nt_assigned" style="width:100%;padding:10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px">
            <option value="">Não atribuído</option>
            ${allTeam.map(m => `<option value="${m.id}">${m.full_name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Prazo (opcional)</label>
          <input type="date" id="nt_due_date" style="width:100%;padding:10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px">
        </div>
      </div>
      <div class="form-group">
        <label>Descrição</label>
        <textarea id="nt_description" placeholder="Descreva detalhadamente o chamado..." style="width:100%;padding:10px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px;min-height:100px;resize:vertical"></textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="document.getElementById('new-ticket-modal').style.display='none'">Cancelar</button>
      <button class="btn btn-primary" onclick="window._support.submitTicket()">Criar Ticket</button>
    </div>
  `;
}

async function openTicket(id, user) {
  currentTicket = allTickets.find(t => t.id === id);
  if (!currentTicket) return;

  const modal = document.getElementById('ticket-modal');
  const body  = document.getElementById('ticket-modal-body');
  modal.style.display = 'flex';

  body.innerHTML = renderSpinner('Carregando ticket...');

  try {
    const { data: msgs } = await db.from('support_messages')
      .select('*, sender:profiles(id,full_name,role)')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true });

    const messages = msgs || [];
    const st  = TICKET_STATUS[currentTicket.status] || TICKET_STATUS.open;
    const pr  = TICKET_PRIORITY[currentTicket.priority] || TICKET_PRIORITY.medium;
    const cat = TICKET_CATEGORY[currentTicket.category] || TICKET_CATEGORY.other;

    body.innerHTML = `
      <div class="modal-header" style="flex-shrink:0">
        <div style="flex:1;min-width:0">
          <div style="display:flex;gap:8px;margin-bottom:6px;flex-wrap:wrap">
            <span style="font-size:11px;font-weight:700;color:#64748b">#${String(currentTicket.ticket_number||'').padStart(4,'0')}</span>
            <span style="font-size:12px;padding:2px 10px;border-radius:20px;background:${st.bg};color:${st.color};font-weight:600">${st.icon} ${st.label}</span>
            <span style="font-size:12px;padding:2px 10px;border-radius:20px;background:${pr.bg};color:${pr.color};font-weight:600">${pr.label}</span>
            <span style="font-size:12px;padding:2px 10px;border-radius:20px;background:#f1f5f9;color:#64748b">${cat.icon} ${cat.label}</span>
          </div>
          <h2 style="font-size:16px;font-weight:700;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${currentTicket.title}</h2>
        </div>
        <button class="modal-close" onclick="document.getElementById('ticket-modal').style.display='none'">×</button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 260px;gap:0;flex:1;overflow:hidden;min-height:0">
        <!-- Mensagens -->
        <div style="display:flex;flex-direction:column;border-right:1px solid #e2e8f0;overflow:hidden">
          <div id="messages-list" style="flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:12px">
            ${currentTicket.description ? `
              <div style="background:#f8faff;border:1px solid #e2e8f0;border-radius:10px;padding:14px">
                <div style="font-size:12px;color:#64748b;margin-bottom:6px;font-weight:600">📋 Descrição do chamado</div>
                <div style="font-size:14px;color:#1e293b;line-height:1.6">${currentTicket.description}</div>
              </div>
            ` : ''}
            ${messages.length === 0 && !currentTicket.description
              ? `<div style="text-align:center;color:#94a3b8;padding:40px 0;font-size:14px">Nenhuma mensagem ainda</div>`
              : messages.map(m => renderMessage(m, user)).join('')
            }
          </div>
          <!-- Input resposta -->
          <div style="padding:16px;border-top:1px solid #e2e8f0;flex-shrink:0">
            <div style="display:flex;gap:10px;align-items:flex-end">
              <textarea id="msg-input" placeholder="Digite sua resposta..." style="flex:1;padding:10px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:13px;min-height:60px;resize:none;font-family:inherit" onkeydown="if(event.ctrlKey&&event.key==='Enter')window._support.sendMessage('${id}')"></textarea>
              <div style="display:flex;flex-direction:column;gap:6px">
                <button class="btn btn-primary" style="padding:8px 16px;font-size:13px;white-space:nowrap" onclick="window._support.sendMessage('${id}')">Enviar</button>
                <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:#64748b;cursor:pointer">
                  <input type="checkbox" id="is-internal"> Nota interna
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- Painel lateral -->
        <div style="overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:16px">
          <div>
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;margin-bottom:10px">Alterar Status</div>
            <div style="display:flex;flex-direction:column;gap:6px">
              ${Object.entries(TICKET_STATUS).map(([v,s]) => `
                <button onclick="window._support.updateStatus('${id}','${v}')"
                  style="padding:8px 12px;border-radius:6px;border:1.5px solid ${currentTicket.status===v?s.color:s.bg};background:${currentTicket.status===v?s.bg:'white'};color:${s.color};font-size:12px;font-weight:600;cursor:pointer;text-align:left;transition:all 0.15s">
                  ${s.icon} ${s.label}
                </button>
              `).join('')}
            </div>
          </div>

          <div>
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;margin-bottom:8px">Atribuir para</div>
            <select onchange="window._support.assignTicket('${id}',this.value)" style="width:100%;padding:8px;border:1.5px solid #e2e8f0;border-radius:6px;font-size:13px">
              <option value="">Não atribuído</option>
              ${allTeam.map(m => `<option value="${m.id}" ${currentTicket.assigned_to===m.id?'selected':''}>${m.full_name}</option>`).join('')}
            </select>
          </div>

          <div style="background:#f8faff;border:1px solid #e2e8f0;border-radius:8px;padding:14px">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;margin-bottom:10px">Informações</div>
            ${currentTicket.client?.name ? `<div style="font-size:13px;margin-bottom:8px"><strong>👤 Cliente:</strong><br>${currentTicket.client.name}</div>` : ''}
            <div style="font-size:13px;margin-bottom:8px"><strong>📅 Criado:</strong><br>${formatDate(currentTicket.created_at)}</div>
            ${currentTicket.due_date ? `<div style="font-size:13px;margin-bottom:8px"><strong>⏰ Prazo:</strong><br>${formatDate(currentTicket.due_date)}</div>` : ''}
            ${currentTicket.resolved_at ? `<div style="font-size:13px;"><strong>✅ Resolvido:</strong><br>${formatDate(currentTicket.resolved_at)}</div>` : ''}
          </div>
        </div>
      </div>
    `;

    // Scroll to bottom
    const msgList = document.getElementById('messages-list');
    if (msgList) msgList.scrollTop = msgList.scrollHeight;

  } catch(e) {
    body.innerHTML = `<div class="modal-body"><p>Erro ao carregar ticket.</p></div>`;
  }
}

function renderMessage(msg, user) {
  const isMe = msg.sender_id === user?.id;
  const initials = (msg.sender?.full_name || 'U').split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase();
  return `
    <div style="display:flex;gap:10px;${isMe?'flex-direction:row-reverse':''}">
      <div style="width:34px;height:34px;border-radius:50%;background:${isMe?'#1a2744':'#e2e8f0'};color:${isMe?'white':'#64748b'};display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">${initials}</div>
      <div style="max-width:75%">
        <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;${isMe?'text-align:right':''}">
          ${msg.sender?.full_name || 'Usuário'} · ${timeAgo(msg.created_at)}
          ${msg.is_internal ? '<span style="background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:4px;margin-left:4px;font-size:10px">INTERNA</span>' : ''}
        </div>
        <div style="background:${msg.is_internal?'#fffbeb':isMe?'#1a2744':'#f1f5f9'};color:${msg.is_internal?'#92400e':isMe?'white':'#1e293b'};padding:10px 14px;border-radius:${isMe?'12px 4px 12px 12px':'4px 12px 12px 12px'};font-size:13px;line-height:1.6;border:${msg.is_internal?'1px solid #f59e0b':'none'}">
          ${msg.content}
        </div>
      </div>
    </div>
  `;
}

async function sendMessage(ticketId, user, container) {
  const input = document.getElementById('msg-input');
  const isInternal = document.getElementById('is-internal')?.checked || false;
  const content = input?.value?.trim();
  if (!content) return;

  try {
    await db.from('support_messages').insert({
      ticket_id: ticketId,
      sender_id: user.id,
      content,
      is_internal: isInternal
    });

    // Update ticket timestamp + first response
    const updates = { updated_at: new Date().toISOString() };
    if (!currentTicket.first_response_at) updates.first_response_at = new Date().toISOString();
    await db.from('support_tickets').update(updates).eq('id', ticketId);

    if (input) input.value = '';
    showToast('Mensagem enviada', 'success');
    await openTicket(ticketId, user);
  } catch(e) {
    showToast('Erro ao enviar mensagem', 'error');
  }
}

async function updateTicketStatus(ticketId, status, container, user) {
  const updates = { status, updated_at: new Date().toISOString() };
  if (status === 'resolved' || status === 'closed') updates.resolved_at = new Date().toISOString();

  try {
    await db.from('support_tickets').update(updates).eq('id', ticketId);
    const idx = allTickets.findIndex(t => t.id === ticketId);
    if (idx !== -1) { allTickets[idx] = { ...allTickets[idx], ...updates }; currentTicket = allTickets[idx]; }
    showToast('Status atualizado', 'success');
    await openTicket(ticketId, user);
    renderTicketsList();
  } catch(e) {
    showToast('Erro ao atualizar status', 'error');
  }
}

async function assignTicket(ticketId, userId, container, user) {
  try {
    await db.from('support_tickets').update({ assigned_to: userId || null, updated_at: new Date().toISOString() }).eq('id', ticketId);
    const member = allTeam.find(m => m.id === userId);
    const idx = allTickets.findIndex(t => t.id === ticketId);
    if (idx !== -1) {
      allTickets[idx] = { ...allTickets[idx], assigned_to: userId, assigned: member ? { id: member.id, full_name: member.full_name } : null };
      currentTicket = allTickets[idx];
    }
    showToast('Ticket atribuído', 'success');
    renderTicketsList();
  } catch(e) {
    showToast('Erro ao atribuir', 'error');
  }
}

function openNewTicketModal() {
  document.getElementById('new-ticket-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('nt_title')?.focus(), 100);
}

async function submitTicket(container, user) {
  const title = document.getElementById('nt_title')?.value?.trim();
  if (!title) { showToast('Título obrigatório', 'error'); return; }

  const clientId   = document.getElementById('nt_client')?.value || null;
  const category   = document.getElementById('nt_category')?.value || 'other';
  const priority   = document.getElementById('nt_priority')?.value || 'medium';
  const assignedTo = document.getElementById('nt_assigned')?.value || null;
  const dueDate    = document.getElementById('nt_due_date')?.value || null;
  const description = document.getElementById('nt_description')?.value?.trim() || null;

  try {
    const { data, error } = await db.from('support_tickets').insert({
      title, category, priority,
      client_id: clientId || null,
      assigned_to: assignedTo || null,
      due_date: dueDate || null,
      description,
      created_by: user.id,
      status: 'open'
    }).select('*, client:clients(id,name), assigned:profiles!assigned_to(id,full_name)').single();

    if (error) throw error;

    allTickets.unshift(data);
    document.getElementById('new-ticket-modal').style.display = 'none';
    showToast('Ticket criado com sucesso!', 'success');
    renderTicketsList();
  } catch(e) {
    showToast('Erro ao criar ticket: ' + e.message, 'error');
  }
}

function renderTicketsList() {
  const list = document.getElementById('tickets-list');
  if (!list) return;
  const filtered = getFiltered();
  list.innerHTML = filtered.length === 0
    ? renderEmptyState('Nenhum ticket encontrado', 'Crie um novo ticket ou ajuste os filtros', '🎫')
    : filtered.map(t => renderTicketRow(t)).join('');
}

function applyFilter(container, user) {
  currentFilter.search   = document.getElementById('support-search')?.value || '';
  currentFilter.status   = document.getElementById('filter-status')?.value || 'all';
  currentFilter.priority = document.getElementById('filter-priority')?.value || 'all';
  currentFilter.client   = document.getElementById('filter-client')?.value || '';
  renderTicketsList();
}

function getFiltered() {
  return allTickets.filter(t => {
    if (currentFilter.status !== 'all' && t.status !== currentFilter.status) return false;
    if (currentFilter.priority !== 'all' && t.priority !== currentFilter.priority) return false;
    if (currentFilter.client && t.client_id !== currentFilter.client) return false;
    if (currentFilter.search) {
      const q = currentFilter.search.toLowerCase();
      if (!t.title?.toLowerCase().includes(q) && !t.description?.toLowerCase().includes(q) && !t.client?.name?.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

function getStats() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    total: allTickets.length,
    open: allTickets.filter(t => t.status === 'open').length,
    in_progress: allTickets.filter(t => t.status === 'in_progress').length,
    waiting: allTickets.filter(t => t.status === 'waiting_client').length,
    resolved_month: allTickets.filter(t => (t.status === 'resolved' || t.status === 'closed') && new Date(t.updated_at) >= monthStart).length
  };
}
