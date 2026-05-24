// ============================================================
// INBOX — Omnichannel Messaging
// ============================================================

import { messagingDB, clientsDB, configDB, currentUser, currentProfile, realtime } from '../supabase.js';
import { showToast, renderAvatar, sanitize, timeAgo, formatDateTime, generateId, truncate } from '../utils.js';

let allConversations = [];
let allClients = [];
let selectedConvId = null;
let channelFilter = 'all';
let realtimeSub = null;
let messagePollingInterval = null;

const CHANNEL_ICONS = {
  whatsapp: '📱',
  instagram: '📸',
  facebook: '📘',
  email: '📧',
  internal: '💬'
};

const CHANNEL_COLORS = {
  whatsapp: '#25d366',
  instagram: '#e1306c',
  facebook: '#1877f2',
  email: '#6366f1',
  internal: '#6b7280'
};

// ============================================================
// MAIN ENTRY POINT
// ============================================================
export async function renderInbox(container, profile) {
  container.innerHTML = `
    <div id="inbox-root" style="display:flex;flex-direction:column;height:calc(100vh - 120px);">
      <!-- Header -->
      <div class="page-header" style="flex-shrink:0;">
        <div>
          <h1 class="page-title">Caixa de Entrada</h1>
          <p style="font-size:13px;color:var(--text-secondary);margin-top:2px;">Mensagens de todos os canais</p>
        </div>
      </div>

      <!-- Main layout -->
      <div class="inbox-layout" style="flex:1;overflow:hidden;">
        <!-- Sidebar -->
        <div class="inbox-sidebar" style="display:flex;flex-direction:column;">
          <!-- Channel filter tabs -->
          <div style="padding:12px 12px 0;flex-shrink:0;">
            <div style="display:flex;gap:4px;overflow-x:auto;padding-bottom:8px;">
              ${['all','whatsapp','instagram','facebook'].map(ch => `
                <button class="filter-chip ${channelFilter === ch ? 'active' : ''}" data-channel="${ch}"
                  style="white-space:nowrap;${channelFilter === ch ? '' : ''}">
                  ${ch === 'all' ? '🌐 Todos' : CHANNEL_ICONS[ch] + ' ' + ch.charAt(0).toUpperCase() + ch.slice(1)}
                </button>
              `).join('')}
            </div>
            <input type="text" id="conv-search" class="filter-search" style="width:100%;margin-bottom:8px;" placeholder="🔍 Buscar conversa...">
          </div>

          <!-- Conversation list -->
          <div id="conversation-list" style="flex:1;overflow-y:auto;">
            <div style="text-align:center;padding:30px;color:var(--text-secondary);">⏳ Carregando...</div>
          </div>
        </div>

        <!-- Main area -->
        <div class="inbox-main" id="inbox-main-area">
          ${renderAIPanelDefault()}
        </div>
      </div>
    </div>
  `;

  // Load data
  try {
    [allConversations, allClients] = await Promise.all([
      messagingDB.getConversations(),
      clientsDB.getAll()
    ]);
  } catch (err) {
    showToast('Erro ao carregar mensagens: ' + err.message, 'error');
    allConversations = []; allClients = [];
  }

  renderConversationList();

  // Channel filter
  document.querySelectorAll('[data-channel]').forEach(btn => {
    btn.addEventListener('click', () => {
      channelFilter = btn.dataset.channel;
      document.querySelectorAll('[data-channel]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderConversationList();
    });
  });

  // Search
  let searchTimer;
  document.getElementById('conv-search')?.addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderConversationList(e.target.value), 250);
  });

  // Real-time subscription
  setupRealtime();
}

// ============================================================
// CONVERSATION LIST
// ============================================================
function renderConversationList(search = '') {
  const list = document.getElementById('conversation-list');
  if (!list) return;

  let filtered = allConversations.filter(c => {
    if (channelFilter !== 'all' && c.channel !== channelFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(c.contact_name || '').toLowerCase().includes(q) &&
          !(c.client?.name || '').toLowerCase().includes(q) &&
          !(c.last_message || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    list.innerHTML = `<div style="text-align:center;padding:30px;font-size:12px;color:var(--text-secondary);">Nenhuma conversa encontrada</div>`;
    return;
  }

  list.innerHTML = filtered.map(conv => {
    const icon = CHANNEL_ICONS[conv.channel] || '💬';
    const color = CHANNEL_COLORS[conv.channel] || '#6b7280';
    const unread = conv.unread_count || 0;
    const isSelected = conv.id === selectedConvId;
    const lastMsg = conv.latest_message?.[0] || conv.last_message;
    const lastContent = typeof lastMsg === 'object' ? lastMsg?.content : lastMsg;

    return `
      <div class="conversation-item ${isSelected ? 'active' : ''}" data-conv-id="${conv.id}"
        style="cursor:pointer;padding:12px 16px;border-bottom:1px solid var(--border);transition:background .15s;
          background:${isSelected ? 'var(--primary-light)' : 'white'};"
        onmouseover="if('${conv.id}'!=='${selectedConvId}')this.style.background='#f9fafb'"
        onmouseout="if('${conv.id}'!=='${selectedConvId}')this.style.background=''">
        <div style="display:flex;align-items:flex-start;gap:10px;">
          <div style="position:relative;flex-shrink:0;">
            ${renderAvatar({ full_name: conv.contact_name || 'Contato', avatar_url: conv.contact_avatar }, 40)}
            <span style="position:absolute;bottom:-2px;right:-2px;font-size:13px;">${icon}</span>
          </div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;">
              <span style="font-size:13px;font-weight:${unread > 0 ? '700' : '600'};color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                ${sanitize(conv.contact_name || 'Contato')}
              </span>
              <span style="font-size:10px;color:var(--text-secondary);flex-shrink:0;">${conv.last_message_at ? timeAgo(conv.last_message_at) : ''}</span>
            </div>
            ${conv.client?.name ? `<div style="font-size:10px;color:#6366f1;font-weight:600;margin-bottom:1px;">🏢 ${sanitize(conv.client.name)}</div>` : ''}
            <div style="display:flex;align-items:center;justify-content:space-between;gap:4px;">
              <span style="font-size:12px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">
                ${sanitize(truncate(lastContent || 'Nenhuma mensagem', 45))}
              </span>
              ${unread > 0 ? `<span style="background:#6366f1;color:white;border-radius:10px;padding:1px 6px;font-size:10px;font-weight:700;flex-shrink:0;">${unread}</span>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.conversation-item').forEach(item => {
    item.addEventListener('click', () => {
      selectedConvId = item.dataset.convId;
      const conv = allConversations.find(c => c.id === selectedConvId);
      if (conv) {
        renderConversationList(search);
        openConversation(conv);
      }
    });
  });
}

// ============================================================
// OPEN CONVERSATION
// ============================================================
async function openConversation(conv) {
  const main = document.getElementById('inbox-main-area');
  if (!main) return;

  // Mark as read
  try { await messagingDB.markRead(conv.id); } catch {}
  if (conv.unread_count) conv.unread_count = 0;

  main.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;">
      <!-- Conversation Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 20px;border-bottom:1px solid var(--border);flex-shrink:0;background:white;">
        <div style="display:flex;align-items:center;gap:10px;">
          ${renderAvatar({ full_name: conv.contact_name || 'Contato', avatar_url: conv.contact_avatar }, 38)}
          <div>
            <div style="font-size:14px;font-weight:700;">${sanitize(conv.contact_name || 'Contato')}</div>
            <div style="font-size:11px;color:var(--text-secondary);">
              ${CHANNEL_ICONS[conv.channel] || ''} ${(conv.channel || '').charAt(0).toUpperCase() + (conv.channel || '').slice(1)}
              ${conv.client?.name ? ` • 🏢 ${sanitize(conv.client.name)}` : ''}
              ${conv.ai_handled ? ' • <span style="color:#10b981;">🤖 IA ativa</span>' : ''}
            </div>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${!conv.client_id ? `<button class="btn-secondary btn-sm" id="btn-link-client">🔗 Vincular a Cliente</button>` : ''}
          <button class="btn-secondary btn-sm" id="btn-convert-lead">⭐ Converter em Lead</button>
          ${conv.ai_handled ? `<button class="btn-secondary btn-sm" id="btn-transfer-human" style="color:#f59e0b;border-color:#f59e0b;">👤 Transferir para Humano</button>` : ''}
        </div>
      </div>

      <!-- Messages -->
      <div id="chat-messages" class="chat-messages" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:8px;">
        <div style="text-align:center;padding:20px;color:var(--text-secondary);">⏳ Carregando mensagens...</div>
      </div>

      <!-- Input -->
      <div class="chat-input-area" style="padding:12px 16px;border-top:1px solid var(--border);background:white;flex-shrink:0;">
        <div style="display:flex;gap:8px;align-items:flex-end;">
          <textarea id="msg-input" class="chat-input" rows="2" placeholder="Digite sua mensagem..."
            style="flex:1;resize:none;border-radius:12px;"></textarea>
          <button class="btn-primary" id="send-msg-btn" style="align-self:flex-end;padding:10px 18px;">Enviar ↗</button>
        </div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">
          Enter para nova linha • Ctrl+Enter para enviar
        </div>
      </div>
    </div>
  `;

  // Load messages
  loadMessages(conv);

  // Keyboard shortcut
  document.getElementById('msg-input')?.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      sendMessage(conv);
    }
  });

  document.getElementById('send-msg-btn')?.addEventListener('click', () => sendMessage(conv));

  document.getElementById('btn-link-client')?.addEventListener('click', () => openLinkClientModal(conv));
  document.getElementById('btn-convert-lead')?.addEventListener('click', () => convertToLead(conv));
  document.getElementById('btn-transfer-human')?.addEventListener('click', async () => {
    try {
      const { supabase } = await import('../supabase.js');
      await supabase.from('conversations').update({ ai_handled: false }).eq('id', conv.id);
      conv.ai_handled = false;
      showToast('Conversa transferida para atendimento humano.', 'success');
      openConversation(conv);
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
    }
  });
}

async function loadMessages(conv) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  let messages = [];
  try {
    messages = await messagingDB.getMessages(conv.id) || [];
  } catch (err) {
    container.innerHTML = `<div style="color:#ef4444;padding:20px;">Erro: ${sanitize(err.message)}</div>`;
    return;
  }

  if (messages.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-secondary);">💬 Nenhuma mensagem ainda.</div>`;
    return;
  }

  container.innerHTML = messages.map(msg => renderMessageBubble(msg)).join('');
  container.scrollTop = container.scrollHeight;
}

function renderMessageBubble(msg) {
  const isOutbound = msg.direction === 'outbound';
  const isAI = msg.is_ai_generated;
  const sender = msg.sent_by_profile?.full_name || (isOutbound ? 'Você' : 'Contato');

  return `
    <div class="message-bubble ${isOutbound ? 'outbound' : 'inbound'}"
      style="display:flex;flex-direction:column;align-items:${isOutbound ? 'flex-end' : 'flex-start'};">
      <div style="font-size:10px;color:var(--text-secondary);margin-bottom:2px;padding:0 4px;">
        ${isAI ? '🤖 ' : ''}${sanitize(sender)}
      </div>
      <div class="bubble-content" style="
        max-width:72%;padding:10px 14px;border-radius:${isOutbound ? '16px 16px 4px 16px' : '16px 16px 16px 4px'};
        background:${isAI ? '#d1fae5' : isOutbound ? '#6366f1' : 'white'};
        color:${isAI ? '#065f46' : isOutbound ? 'white' : 'var(--text-primary)'};
        border:${isOutbound ? 'none' : '1px solid var(--border)'};
        font-size:13px;line-height:1.5;box-shadow:0 1px 4px rgba(0,0,0,.07);
        word-break:break-word;">
        ${sanitize(msg.content || '')}
        ${isAI ? '<span style="font-size:10px;opacity:.7;margin-left:6px;">(IA)</span>' : ''}
      </div>
      <div style="font-size:10px;color:var(--text-secondary);margin-top:2px;padding:0 4px;">
        ${timeAgo(msg.created_at)}
      </div>
    </div>
  `;
}

async function sendMessage(conv) {
  const input = document.getElementById('msg-input');
  const content = input?.value.trim();
  if (!content) return;

  const btn = document.getElementById('send-msg-btn');
  btn.disabled = true; btn.textContent = '...';
  input.value = '';

  try {
    const msg = await messagingDB.sendMessage(conv.id, content, currentUser?.id);

    // Append bubble optimistically
    const messagesEl = document.getElementById('chat-messages');
    if (messagesEl) {
      const emptyMsg = messagesEl.querySelector('[style*="Nenhuma mensagem"]');
      if (emptyMsg) emptyMsg.remove();
      const div = document.createElement('div');
      div.innerHTML = renderMessageBubble({
        ...msg,
        direction: 'outbound',
        sent_by_profile: { full_name: currentProfile?.full_name || 'Você' }
      });
      messagesEl.appendChild(div.firstElementChild);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    // Send via Evolution API for WhatsApp
    if (conv.channel === 'whatsapp') {
      try {
        await sendEvolutionMessage(conv, content);
      } catch (waErr) {
        console.warn('Evolution API warn:', waErr.message);
      }
    }

    // Update conversation list
    conv.last_message = content;
    conv.last_message_at = new Date().toISOString();
    renderConversationList(document.getElementById('conv-search')?.value || '');
  } catch (err) {
    showToast('Erro ao enviar: ' + err.message, 'error');
    if (input) input.value = content;
  } finally {
    btn.disabled = false; btn.textContent = 'Enviar ↗';
    input?.focus();
  }
}

// ============================================================
// EVOLUTION API — Send WhatsApp
// ============================================================
async function sendEvolutionMessage(conv, content) {
  let config = {};
  try { config = await configDB.get('evolution_api') || {}; } catch {}

  const { base_url, api_key, instance } = config;
  if (!base_url || !api_key || !instance) return;

  const phone = (conv.contact_phone || '').replace(/\D/g, '');
  if (!phone) return;
  const fullPhone = phone.startsWith('55') ? phone : `55${phone}`;

  const response = await fetch(`${base_url}/message/sendText/${instance}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': api_key },
    body: JSON.stringify({ number: fullPhone, text: content })
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${response.status}`);
  }
}

// ============================================================
// LINK CLIENT MODAL
// ============================================================
function openLinkClientModal(conv) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal-sm">
      <div class="modal-header">
        <h2 class="modal-title">🔗 Vincular a Cliente</h2>
        <button class="modal-close" id="close-link-modal">✕</button>
      </div>
      <div class="modal-body">
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;">
          Selecione o cliente que corresponde a esta conversa com <strong>${sanitize(conv.contact_name || 'Contato')}</strong>.
        </p>
        <div class="form-group">
          <label class="form-label">Cliente *</label>
          <select class="form-select" id="link-client-select">
            <option value="">Selecionar cliente...</option>
            ${allClients.map(c => `<option value="${c.id}">${sanitize(c.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="cancel-link-modal">Cancelar</button>
        <button class="btn-primary" id="save-link-modal">🔗 Vincular</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('close-link-modal').addEventListener('click', () => overlay.remove());
  document.getElementById('cancel-link-modal').addEventListener('click', () => overlay.remove());
  document.getElementById('save-link-modal').addEventListener('click', async () => {
    const clientId = document.getElementById('link-client-select').value;
    if (!clientId) { showToast('Selecione um cliente', 'warning'); return; }
    try {
      const { supabase } = await import('../supabase.js');
      await supabase.from('conversations').update({ client_id: clientId }).eq('id', conv.id);
      const client = allClients.find(c => c.id === clientId);
      conv.client_id = clientId;
      conv.client = client ? { id: client.id, name: client.name } : null;
      // Update in list
      const idx = allConversations.findIndex(c => c.id === conv.id);
      if (idx !== -1) allConversations[idx] = conv;
      showToast('Conversa vinculada!', 'success');
      overlay.remove();
      openConversation(conv);
      renderConversationList();
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
    }
  });
}

// ============================================================
// CONVERT TO LEAD
// ============================================================
async function convertToLead(conv) {
  const ok = await import('../utils.js').then(u => u.showConfirm(
    `Criar um novo lead "${sanitize(conv.contact_name || 'Contato')}" no CRM a partir desta conversa?`,
    'Converter em Lead'
  ));
  if (!ok) return;

  try {
    const { clientsDB: cdb } = await import('../supabase.js');
    const newClient = await import('../supabase.js').then(m => m.clientsDB.create({
      name: conv.contact_name || 'Novo Lead',
      status: 'lead',
      phone: conv.contact_phone || null,
      whatsapp: conv.contact_phone || null,
      source: conv.channel || 'direct'
    }));

    // Link conversation to new client
    const { supabase } = await import('../supabase.js');
    await supabase.from('conversations').update({ client_id: newClient.id }).eq('id', conv.id);
    conv.client_id = newClient.id;
    conv.client = { id: newClient.id, name: newClient.name };
    allConversations = allConversations.map(c => c.id === conv.id ? conv : c);

    allClients.push(newClient);
    showToast(`Lead "${sanitize(newClient.name)}" criado no CRM!`, 'success');
    openConversation(conv);
    renderConversationList();
  } catch (err) {
    showToast('Erro ao converter: ' + err.message, 'error');
  }
}

// ============================================================
// AI PANEL (default state — no conversation selected)
// ============================================================
function renderAIPanelDefault() {
  return `
    <div id="ai-panel-default" style="padding:32px;height:100%;overflow-y:auto;">
      <div style="max-width:480px;margin:0 auto;">
        <div style="text-align:center;margin-bottom:32px;">
          <div style="font-size:56px;margin-bottom:12px;">🤖</div>
          <h2 style="font-size:18px;font-weight:800;margin-bottom:6px;">Pré-atendente IA</h2>
          <p style="font-size:13px;color:var(--text-secondary);">Configure e monitore o assistente inteligente de atendimento.</p>
        </div>

        <div class="card" style="padding:20px;margin-bottom:16px;" id="ai-status-card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <div>
              <div style="font-size:14px;font-weight:700;">Status da IA</div>
              <div style="font-size:12px;color:var(--text-secondary);">Respostas automáticas</div>
            </div>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
              <span id="ai-status-label" style="font-size:12px;color:var(--text-secondary);">Carregando...</span>
              <div id="ai-toggle-wrapper" style="position:relative;">
                <input type="checkbox" id="ai-toggle" style="opacity:0;position:absolute;width:0;height:0;">
                <div id="ai-toggle-track" style="width:44px;height:24px;background:#d1d5db;border-radius:12px;cursor:pointer;transition:background .2s;position:relative;">
                  <div id="ai-toggle-thumb" style="position:absolute;top:2px;left:2px;width:20px;height:20px;background:white;border-radius:50%;transition:left .2s;box-shadow:0 1px 3px rgba(0,0,0,.2);"></div>
                </div>
              </div>
            </label>
          </div>
          <div id="ai-active-message" style="display:none;background:#d1fae5;border-radius:8px;padding:10px;font-size:12px;color:#065f46;">
            ✅ A IA está respondendo automaticamente mensagens novas.
          </div>
        </div>

        <div class="card" style="padding:20px;" id="ai-interactions-card">
          <h4 style="font-size:13px;font-weight:700;margin-bottom:12px;">Últimas interações da IA</h4>
          <div id="ai-interactions-list" style="font-size:13px;color:var(--text-secondary);">
            Carregando...
          </div>
        </div>

        <div style="margin-top:16px;text-align:center;">
          <p style="font-size:12px;color:var(--text-secondary);">
            Para configurar a IA, vá em <a href="#" id="go-ai-settings" style="color:#6366f1;font-weight:600;">Configurações → IA / Pré-atendente</a>
          </p>
        </div>
      </div>
    </div>
  `;
}

// Load AI panel data after render
async function loadAIPanelData() {
  try {
    const aiConfig = await configDB.get('ai_config') || {};
    const isEnabled = aiConfig.enabled || false;

    const toggle = document.getElementById('ai-toggle');
    const track = document.getElementById('ai-toggle-track');
    const thumb = document.getElementById('ai-toggle-thumb');
    const statusLabel = document.getElementById('ai-status-label');
    const activeMsg = document.getElementById('ai-active-message');

    if (!toggle) return;

    const setToggleState = (enabled) => {
      track.style.background = enabled ? '#6366f1' : '#d1d5db';
      thumb.style.left = enabled ? '22px' : '2px';
      statusLabel.textContent = enabled ? 'Ativada' : 'Desativada';
      statusLabel.style.color = enabled ? '#6366f1' : 'var(--text-secondary)';
      activeMsg.style.display = enabled ? 'block' : 'none';
      toggle.checked = enabled;
    };

    setToggleState(isEnabled);

    track.addEventListener('click', async () => {
      const newVal = !toggle.checked;
      setToggleState(newVal);
      try {
        await configDB.set('ai_config', { ...aiConfig, enabled: newVal }, currentUser?.id);
        showToast(newVal ? 'IA ativada!' : 'IA desativada.', newVal ? 'success' : 'info');
      } catch (err) {
        setToggleState(!newVal);
        showToast('Erro: ' + err.message, 'error');
      }
    });

    // Load last AI interactions
    try {
      const { supabase } = await import('../supabase.js');
      const { data: aiMsgs } = await supabase
        .from('messages')
        .select('*, conversation:conversations(contact_name, channel)')
        .eq('is_ai_generated', true)
        .order('created_at', { ascending: false })
        .limit(5);

      const interactionsList = document.getElementById('ai-interactions-list');
      if (interactionsList) {
        if (!aiMsgs || aiMsgs.length === 0) {
          interactionsList.innerHTML = '<div style="color:var(--text-secondary);">Nenhuma interação ainda.</div>';
        } else {
          interactionsList.innerHTML = aiMsgs.map(m => `
            <div style="padding:8px;border-bottom:1px solid var(--border);margin-bottom:4px;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:2px;">
                <span style="font-size:12px;font-weight:600;">${sanitize(m.conversation?.contact_name || 'Contato')}</span>
                <span style="font-size:10px;color:var(--text-secondary);">${timeAgo(m.created_at)}</span>
              </div>
              <div style="font-size:12px;color:var(--text-secondary);">${sanitize(truncate(m.content || '', 60))}</div>
            </div>
          `).join('');
        }
      }
    } catch {}
  } catch (err) {
    console.warn('AI panel error:', err);
  }
}

// ============================================================
// REAL-TIME SUBSCRIPTIONS
// ============================================================
function setupRealtime() {
  if (realtimeSub) {
    try { realtime.unsubscribe(realtimeSub); } catch {}
  }

  realtimeSub = realtime.subscribeToConversations(async (payload) => {
    try {
      // Reload conversations list
      allConversations = await messagingDB.getConversations();
      renderConversationList(document.getElementById('conv-search')?.value || '');

      // If viewing the updated conversation, reload messages
      if (selectedConvId && payload.new?.conversation_id === selectedConvId) {
        const conv = allConversations.find(c => c.id === selectedConvId);
        if (conv) loadMessages(conv);
      }
    } catch {}
  });

  // Load AI panel data after a brief delay
  setTimeout(loadAIPanelData, 500);

  // Cleanup on page navigation
  window.addEventListener('beforeunload', () => {
    if (realtimeSub) {
      try { realtime.unsubscribe(realtimeSub); } catch {}
    }
  });
}
