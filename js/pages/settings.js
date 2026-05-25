// ============================================================
// SETTINGS PAGE — Agency, Integrations, AI, Notifications, etc.
// ============================================================

import { configDB, aiDB, currentUser, supabase } from '../supabase.js';
import { ROLE_LABELS } from '../config.js';
import {
  showToast, showConfirm, sanitize, generateId, renderAvatar, truncate
} from '../utils.js';

let activeSettingsTab = 'agencia';

// ============================================================
// MAIN ENTRY POINT
// ============================================================
export async function renderSettings(container, profile, options = {}) {
  activeSettingsTab = options.tab || 'agencia';
  const isMaster = profile?.role === 'master';

  const tabs = [
    { key: 'agencia', label: '🏢 Agência' },
    { key: 'integracoes', label: '🔌 Integrações' },
    { key: 'ai', label: '🤖 IA / Pré-atendente' },
    { key: 'notificacoes', label: '📣 Notificações' },
    { key: 'onboarding', label: '🚀 Onboarding' },
    ...(isMaster ? [{ key: 'usuarios', label: '👥 Usuários' }] : [])
  ];

  container.innerHTML = `
    <div id="settings-root">
      <div class="page-header">
        <div>
          <h1 class="page-title">Configurações</h1>
          <p style="font-size:13px;color:var(--text-secondary);margin-top:2px;">Configure sua agência, integrações e automações</p>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:200px 1fr;gap:24px;align-items:start;">
        <!-- Sidebar nav -->
        <div class="card" style="padding:8px;">
          ${tabs.map(t => `
            <button class="settings-nav-item" data-tab="${t.key}"
              style="display:block;width:100%;text-align:left;padding:10px 14px;border-radius:8px;border:none;background:${activeSettingsTab === t.key ? 'var(--primary-light)' : 'transparent'};
                color:${activeSettingsTab === t.key ? 'var(--primary)' : 'var(--text-primary)'};
                font-size:13px;font-weight:${activeSettingsTab === t.key ? '700' : '500'};
                cursor:pointer;transition:background .15s;margin-bottom:2px;">
              ${t.label}
            </button>
          `).join('')}
        </div>

        <!-- Tab content -->
        <div id="settings-tab-content">
          <div style="text-align:center;padding:40px;">⏳ Carregando...</div>
        </div>
      </div>
    </div>
  `;

  document.querySelectorAll('.settings-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      activeSettingsTab = item.dataset.tab;
      document.querySelectorAll('.settings-nav-item').forEach(i => {
        i.style.background = i.dataset.tab === activeSettingsTab ? 'var(--primary-light)' : 'transparent';
        i.style.color = i.dataset.tab === activeSettingsTab ? 'var(--primary)' : 'var(--text-primary)';
        i.style.fontWeight = i.dataset.tab === activeSettingsTab ? '700' : '500';
      });
      renderSettingsTab(activeSettingsTab, profile);
    });
  });

  renderSettingsTab(activeSettingsTab, profile);
}

async function renderSettingsTab(tab, profile) {
  const content = document.getElementById('settings-tab-content');
  if (!content) return;
  content.innerHTML = `<div style="text-align:center;padding:40px;">⏳ Carregando...</div>`;
  try {
    switch (tab) {
      case 'agencia': await renderAgenciaTab(content, profile); break;
      case 'integracoes': await renderIntegracoesTab(content, profile); break;
      case 'ai': await renderAITab(content, profile); break;
      case 'notificacoes': await renderNotificacoesTab(content, profile); break;
      case 'onboarding': await renderOnboardingTab(content, profile); break;
      case 'usuarios': await renderUsuariosTab(content, profile); break;
    }
  } catch (err) {
    content.innerHTML = `<div style="color:#ef4444;padding:20px;">Erro ao carregar: ${sanitize(err.message)}</div>`;
  }
}

// ============================================================
// TAB 1: AGÊNCIA
// ============================================================
async function renderAgenciaTab(container, profile) {
  let config = {};
  try { config = await configDB.getAll(); } catch {}
  const agency = config.agency_config || {};

  container.innerHTML = `
    <div class="card" style="padding:24px;">
      <h3 style="font-size:15px;font-weight:700;margin-bottom:20px;">🏢 Configurações da Agência</h3>
      <form id="form-agency">
        <div class="form-grid">
          <div class="form-group" style="grid-column:1/-1;">
            <label class="form-label">Nome da Agência *</label>
            <input type="text" class="form-input" id="agency-name" value="${sanitize(agency.name || '')}" placeholder="Minha Agência Digital">
          </div>
          <div class="form-group" style="grid-column:1/-1;">
            <label class="form-label">Logo da Agência</label>
            <!-- Preview -->
            <div id="logo-preview-area" style="margin-bottom:12px;display:flex;align-items:center;gap:16px;">
              <div id="logo-preview" style="width:72px;height:72px;border-radius:12px;border:2px dashed var(--border);display:flex;align-items:center;justify-content:center;overflow:hidden;background:#f9fafb;">
                ${agency.logo_url
                  ? `<img src="${agency.logo_url}" style="width:100%;height:100%;object-fit:contain;">`
                  : `<span style="font-size:24px;">🏢</span>`}
              </div>
              <div>
                <label for="logo-file-input" style="display:inline-block;padding:8px 16px;background:var(--primary);color:white;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">
                  📁 Escolher arquivo
                </label>
                <input type="file" id="logo-file-input" accept="image/png,image/jpeg,image/svg+xml,image/webp" style="display:none;">
                <div style="font-size:11px;color:var(--text-secondary);margin-top:6px;">PNG, JPG, SVG ou WebP. Máx 2MB.</div>
                <div id="logo-upload-status" style="font-size:12px;margin-top:4px;"></div>
              </div>
            </div>
            <!-- URL manual (fallback) -->
            <div style="display:flex;gap:8px;align-items:center;">
              <input type="url" class="form-input" id="agency-logo" value="${sanitize(agency.logo_url || '')}" placeholder="Ou cole a URL diretamente...">
            </div>
            <p class="form-hint">Faça upload ou cole a URL pública da imagem (PNG, SVG, JPG).</p>
          </div>
          <div class="form-group">
            <label class="form-label">Cor Principal</label>
            <div style="display:flex;align-items:center;gap:10px;">
              <input type="color" id="agency-color" value="${agency.primary_color || '#6366f1'}"
                style="width:48px;height:40px;padding:2px;border-radius:8px;border:1px solid var(--border);cursor:pointer;">
              <input type="text" class="form-input" id="agency-color-text" value="${agency.primary_color || '#6366f1'}"
                style="flex:1;" placeholder="#6366f1">
            </div>
            <p class="form-hint">Esta cor será aplicada ao tema visual do sistema.</p>
          </div>
          <div class="form-group">
            <label class="form-label">WhatsApp da Agência</label>
            <input type="tel" class="form-input" id="agency-whatsapp" value="${sanitize(agency.whatsapp || '')}" placeholder="(11) 99999-9999">
          </div>
          <div class="form-group" style="grid-column:1/-1;">
            <label class="form-label">E-mail da Agência</label>
            <input type="email" class="form-input" id="agency-email" value="${sanitize(agency.email || '')}" placeholder="contato@agencia.com">
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:20px;">
          <button type="submit" class="btn-primary">💾 Salvar Configurações</button>
        </div>
      </form>
    </div>
  `;

  // Logo file upload
  document.getElementById('logo-file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      document.getElementById('logo-upload-status').innerHTML = '<span style="color:#ef4444;">❌ Arquivo muito grande. Máx 2MB.</span>';
      return;
    }

    const statusEl = document.getElementById('logo-upload-status');
    statusEl.innerHTML = '<span style="color:var(--primary);">⏳ Fazendo upload...</span>';

    try {
      const ext = file.name.split('.').pop().toLowerCase();
      const filename = `logo_${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage
        .from('agency-assets')
        .upload(filename, file, { upsert: true, contentType: file.type });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('agency-assets')
        .getPublicUrl(filename);

      document.getElementById('agency-logo').value = publicUrl;
      document.getElementById('logo-preview').innerHTML = `<img src="${publicUrl}" style="width:100%;height:100%;object-fit:contain;">`;
      statusEl.innerHTML = '<span style="color:#10b981;">✅ Upload concluído!</span>';
    } catch (err) {
      statusEl.innerHTML = `<span style="color:#ef4444;">❌ Erro: ${err.message}</span>`;
    }
  });

  // Update preview when URL is typed manually
  document.getElementById('agency-logo')?.addEventListener('input', e => {
    const url = e.target.value.trim();
    const preview = document.getElementById('logo-preview');
    if (url) {
      preview.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:contain;" onerror="this.parentElement.innerHTML='<span style=font-size:24px>🏢</span>'">`;
    }
  });

  // Color sync
  document.getElementById('agency-color')?.addEventListener('input', e => {
    document.getElementById('agency-color-text').value = e.target.value;
    document.documentElement.style.setProperty('--primary', e.target.value);
  });
  document.getElementById('agency-color-text')?.addEventListener('input', e => {
    if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
      document.getElementById('agency-color').value = e.target.value;
      document.documentElement.style.setProperty('--primary', e.target.value);
    }
  });

  document.getElementById('form-agency')?.addEventListener('submit', async e => {
    e.preventDefault();
    const newConfig = {
      name: document.getElementById('agency-name').value.trim(),
      logo_url: document.getElementById('agency-logo').value.trim() || null,
      primary_color: document.getElementById('agency-color').value,
      whatsapp: document.getElementById('agency-whatsapp').value.trim() || null,
      email: document.getElementById('agency-email').value.trim() || null
    };
    const btn = e.target.querySelector('[type=submit]');
    btn.textContent = 'Salvando...'; btn.disabled = true;
    try {
      await configDB.set('agency_config', newConfig, currentUser?.id);
      showToast('Configurações da agência salvas!', 'success');
      btn.textContent = '✅ Salvo!';
      setTimeout(() => { btn.textContent = '💾 Salvar Configurações'; btn.disabled = false; }, 2000);
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
      btn.textContent = '💾 Salvar Configurações'; btn.disabled = false;
    }
  });
}

// ============================================================
// TAB 2: INTEGRAÇÕES
// ============================================================
async function renderIntegracoesTab(container, profile) {
  let evolutionConfig = {}, asaasConfig = {};
  try {
    evolutionConfig = await configDB.get('evolution_api') || {};
    asaasConfig = await configDB.get('asaas_config') || {};
  } catch {}

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:20px;">

      <!-- Evolution API -->
      <div class="card" style="padding:24px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
          <div style="width:44px;height:44px;background:#25d366;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:22px;">📱</div>
          <div>
            <h3 style="font-size:15px;font-weight:700;margin:0;">Evolution API — WhatsApp</h3>
            <p style="font-size:12px;color:var(--text-secondary);margin:0;">Envio e recebimento de mensagens WhatsApp</p>
          </div>
          <div id="evolution-status-badge" style="margin-left:auto;"></div>
        </div>
        <form id="form-evolution">
          <div class="form-grid">
            <div class="form-group" style="grid-column:1/-1;">
              <label class="form-label">URL Base *</label>
              <input type="url" class="form-input" id="evo-url" value="${sanitize(evolutionConfig.base_url || '')}" placeholder="https://evolution.suaagencia.com">
            </div>
            <div class="form-group">
              <label class="form-label">API Key *</label>
              <input type="password" class="form-input" id="evo-key" value="${sanitize(evolutionConfig.api_key || '')}" placeholder="sua-api-key">
            </div>
            <div class="form-group">
              <label class="form-label">Nome da Instância *</label>
              <input type="text" class="form-input" id="evo-instance" value="${sanitize(evolutionConfig.instance || '')}" placeholder="agencia-principal">
            </div>
          </div>
          <div style="display:flex;gap:10px;margin-top:16px;">
            <button type="button" class="btn-secondary" id="btn-test-evolution">🧪 Testar Conexão</button>
            <button type="submit" class="btn-primary">💾 Salvar</button>
          </div>
        </form>

        <div id="evolution-qr-section" style="display:none;margin-top:20px;padding:16px;background:#f9fafb;border-radius:10px;">
          <h4 style="font-size:13px;font-weight:700;margin-bottom:10px;">📱 Conectar WhatsApp</h4>
          <ol style="font-size:13px;color:var(--text-secondary);line-height:1.8;padding-left:18px;">
            <li>Salve as configurações acima</li>
            <li>Acesse o painel da Evolution API: <code style="background:#e5e7eb;padding:1px 6px;border-radius:4px;">${sanitize(evolutionConfig.base_url || 'http://...')}/manager</code></li>
            <li>Selecione a instância <strong>${sanitize(evolutionConfig.instance || '...')}</strong></li>
            <li>Clique em <strong>"Connect"</strong> e escaneie o QR Code com o WhatsApp do número da agência</li>
          </ol>
          <button class="btn-secondary btn-sm" id="btn-show-qr">📷 Ver QR Code na Evolution</button>
        </div>
      </div>

      <!-- Asaas -->
      <div class="card" style="padding:24px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
          <div style="width:44px;height:44px;background:#00a896;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:22px;">💳</div>
          <div>
            <h3 style="font-size:15px;font-weight:700;margin:0;">Asaas — Cobrança</h3>
            <p style="font-size:12px;color:var(--text-secondary);margin:0;">Automação de cobranças e boletos</p>
          </div>
        </div>
        <form id="form-asaas">
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">API Key *</label>
              <input type="password" class="form-input" id="asaas-key" value="${sanitize(asaasConfig.api_key || '')}" placeholder="$aact_...">
            </div>
            <div class="form-group">
              <label class="form-label">Ambiente</label>
              <select class="form-select" id="asaas-env">
                <option value="sandbox" ${asaasConfig.environment === 'sandbox' ? 'selected' : ''}>🧪 Sandbox (Testes)</option>
                <option value="production" ${asaasConfig.environment === 'production' ? 'selected' : ''}>🚀 Produção</option>
              </select>
            </div>
          </div>
          <div style="background:#f0f9ff;border-radius:8px;padding:12px;margin-top:12px;font-size:12px;color:#0369a1;">
            <strong>Webhook URL para configurar no Asaas:</strong>
            <code style="display:block;margin-top:4px;background:white;padding:6px;border-radius:4px;font-size:11px;">${window.location.origin}/api/asaas/webhook</code>
          </div>
          <div style="display:flex;justify-content:flex-end;margin-top:16px;">
            <button type="submit" class="btn-primary">💾 Salvar</button>
          </div>
        </form>
      </div>

      <!-- Meta API -->
      <div class="card" style="padding:24px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
          <div style="width:44px;height:44px;background:linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:22px;">📸</div>
          <div>
            <h3 style="font-size:15px;font-weight:700;margin:0;">Meta API — Instagram & Facebook</h3>
            <p style="font-size:12px;color:var(--text-secondary);margin:0;">Receber mensagens do Instagram e Facebook Messenger</p>
          </div>
        </div>
        <div class="alert" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px;">
          <p style="font-size:13px;font-weight:700;color:#1e40af;margin-bottom:10px;">📋 Como obter permissões da Meta API:</p>
          <ol style="font-size:13px;color:#1d4ed8;line-height:1.9;padding-left:18px;">
            <li>Crie um app em <a href="https://developers.facebook.com" target="_blank" style="color:#1d4ed8;font-weight:600;">developers.facebook.com</a></li>
            <li>Adicione os produtos: <strong>Messenger</strong> e <strong>Instagram Basic Display</strong></li>
            <li>Em configurações, adicione o Webhook URL: <code style="background:#dbeafe;padding:1px 6px;border-radius:4px;">${window.location.origin}/api/meta/webhook</code></li>
            <li>Solicite as permissões: <code style="background:#dbeafe;padding:1px 4px;border-radius:3px;">instagram_manage_messages</code>, <code style="background:#dbeafe;padding:1px 4px;border-radius:3px;">pages_messaging</code></li>
            <li>Configure o <strong>verify_token</strong> igual ao definido no seu backend</li>
            <li>Submeta para revisão da Meta para produção</li>
          </ol>
          <div style="margin-top:12px;padding:10px;background:#dbeafe;border-radius:6px;font-size:12px;color:#1e40af;">
            ℹ️ Para ambiente de desenvolvimento, o webhook funciona com qualquer conta de desenvolvedor sem revisão. A revisão da Meta é necessária apenas para contas de produção.
          </div>
        </div>
      </div>
    </div>
  `;

  // Evolution form
  document.getElementById('form-evolution')?.addEventListener('submit', async e => {
    e.preventDefault();
    const config = {
      base_url: document.getElementById('evo-url').value.trim().replace(/\/$/, ''),
      api_key: document.getElementById('evo-key').value.trim(),
      instance: document.getElementById('evo-instance').value.trim()
    };
    if (!config.base_url || !config.api_key || !config.instance) {
      showToast('Preencha todos os campos da Evolution API', 'warning'); return;
    }
    const btn = e.target.querySelector('[type=submit]');
    btn.textContent = 'Salvando...'; btn.disabled = true;
    try {
      await configDB.set('evolution_api', config, currentUser?.id);
      showToast('Evolution API configurada!', 'success');
      document.getElementById('evolution-qr-section').style.display = 'block';
      btn.textContent = '✅ Salvo!';
      setTimeout(() => { btn.textContent = '💾 Salvar'; btn.disabled = false; }, 2000);
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
      btn.textContent = '💾 Salvar'; btn.disabled = false;
    }
  });

  document.getElementById('btn-test-evolution')?.addEventListener('click', async () => {
    const url = document.getElementById('evo-url').value.trim().replace(/\/$/, '');
    const key = document.getElementById('evo-key').value.trim();
    if (!url || !key) { showToast('Preencha URL e API Key', 'warning'); return; }
    const btn = document.getElementById('btn-test-evolution');
    btn.textContent = '⏳ Testando...'; btn.disabled = true;
    try {
      const resp = await fetch(`${url}/instance/fetchInstances`, {
        headers: { 'apikey': key }
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const count = Array.isArray(data) ? data.length : 0;
      document.getElementById('evolution-status-badge').innerHTML =
        `<span style="background:#d1fae5;color:#065f46;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;">✅ Conectado — ${count} instância${count !== 1 ? 's' : ''}</span>`;
      document.getElementById('evolution-qr-section').style.display = 'block';
      showToast('Evolution API conectada com sucesso!', 'success');
    } catch (err) {
      document.getElementById('evolution-status-badge').innerHTML =
        `<span style="background:#fee2e2;color:#dc2626;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:700;">❌ Falha: ${sanitize(err.message)}</span>`;
      showToast('Erro ao conectar: ' + err.message, 'error');
    }
    btn.textContent = '🧪 Testar Conexão'; btn.disabled = false;
  });

  document.getElementById('btn-show-qr')?.addEventListener('click', () => {
    const url = document.getElementById('evo-url').value.trim().replace(/\/$/, '');
    const instance = document.getElementById('evo-instance').value.trim();
    if (url && instance) {
      window.open(`${url}/manager`, '_blank');
    }
  });

  // Asaas form
  document.getElementById('form-asaas')?.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]');
    btn.textContent = 'Salvando...'; btn.disabled = true;
    try {
      await configDB.set('asaas_config', {
        api_key: document.getElementById('asaas-key').value.trim(),
        environment: document.getElementById('asaas-env').value
      }, currentUser?.id);
      showToast('Asaas configurado!', 'success');
      btn.textContent = '✅ Salvo!';
      setTimeout(() => { btn.textContent = '💾 Salvar'; btn.disabled = false; }, 2000);
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
      btn.textContent = '💾 Salvar'; btn.disabled = false;
    }
  });

  if (evolutionConfig.base_url) {
    document.getElementById('evolution-qr-section').style.display = 'block';
  }
}

// ============================================================
// TAB 3: AI CONFIG
// ============================================================
async function renderAITab(container, profile) {
  let aiConfig = {}, knowledgeItems = [];
  try {
    aiConfig = await configDB.get('ai_config') || {};
    knowledgeItems = await aiDB.getKnowledge() || [];
  } catch {}

  const KB_CATEGORIES = ['Serviços', 'Preços', 'FAQ', 'Regras de Atendimento', 'Fluxo de Qualificação'];

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:20px;">

      <!-- API + Model -->
      <div class="card" style="padding:24px;">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:20px;">🤖 Configuração da IA</h3>
        <form id="form-ai-config">
          <div class="form-grid">
            <div class="form-group" style="grid-column:1/-1;">
              <label class="form-label">Anthropic API Key</label>
              <input type="password" class="form-input" id="ai-api-key" value="${sanitize(aiConfig.api_key || '')}" placeholder="sk-ant-...">
              <p class="form-hint">Encontre em <a href="https://console.anthropic.com" target="_blank" style="color:var(--primary);">console.anthropic.com</a></p>
            </div>
            <div class="form-group">
              <label class="form-label">Modelo</label>
              <select class="form-select" id="ai-model">
                <option value="claude-3-haiku-20240307" ${aiConfig.model === 'claude-3-haiku-20240307' ? 'selected' : ''}>claude-3-haiku (Rápido e econômico)</option>
                <option value="claude-3-5-sonnet-20241022" ${aiConfig.model === 'claude-3-5-sonnet-20241022' ? 'selected' : ''}>claude-3-5-sonnet (Mais inteligente)</option>
              </select>
            </div>
            <div class="form-group" style="display:flex;align-items:center;gap:10px;">
              <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                <input type="checkbox" id="ai-enabled" ${aiConfig.enabled ? 'checked' : ''} style="width:16px;height:16px;">
                <span class="form-label" style="margin:0;">IA Ativa (responde automaticamente)</span>
              </label>
            </div>
          </div>

          <h4 style="font-size:13px;font-weight:700;margin:20px 0 12px;color:var(--text-secondary);text-transform:uppercase;">Persona da IA</h4>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">Nome da IA</label>
              <input type="text" class="form-input" id="ai-name" value="${sanitize(aiConfig.persona_name || 'Luna')}" placeholder="Ex: Luna, Max, Sofia...">
            </div>
            <div class="form-group" style="grid-column:1/-1;">
              <label class="form-label">Descrição da Personalidade</label>
              <textarea class="form-textarea" id="ai-personality" rows="3" placeholder="Ex: Sou a Luna, assistente virtual da Agência X. Sou simpática, profissional e ajudo clientes a entenderem nossos serviços...">${sanitize(aiConfig.persona_description || '')}</textarea>
            </div>
          </div>

          <div style="display:flex;justify-content:flex-end;margin-top:16px;">
            <button type="submit" class="btn-primary">💾 Salvar Configuração IA</button>
          </div>
        </form>
      </div>

      <!-- Knowledge Base -->
      <div class="card" style="padding:24px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <h3 style="font-size:15px;font-weight:700;">📚 Base de Conhecimento</h3>
          <button class="btn-primary btn-sm" id="btn-add-knowledge">+ Adicionar</button>
        </div>

        <div id="knowledge-list" style="display:flex;flex-direction:column;gap:8px;">
          ${renderKnowledgeList(knowledgeItems, KB_CATEGORIES)}
        </div>
      </div>

      <!-- System Prompt Preview -->
      <div class="card" style="padding:24px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <h3 style="font-size:15px;font-weight:700;">📋 System Prompt (Preview)</h3>
          <button class="btn-secondary btn-sm" id="btn-copy-prompt">📋 Copiar</button>
        </div>
        <div id="system-prompt-preview" style="background:#1e1e2e;color:#a8d8ea;border-radius:10px;padding:16px;font-family:monospace;font-size:11px;line-height:1.6;max-height:240px;overflow-y:auto;white-space:pre-wrap;">${generateSystemPrompt(aiConfig, knowledgeItems)}</div>
      </div>

      <!-- Test AI -->
      <div class="card" style="padding:24px;">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:16px;">🧪 Testar IA</h3>
        <div id="test-chat" style="background:#f9fafb;border-radius:10px;padding:12px;min-height:120px;max-height:300px;overflow-y:auto;margin-bottom:12px;display:flex;flex-direction:column;gap:8px;">
          <div style="font-size:12px;color:var(--text-secondary);text-align:center;">Digite uma mensagem para testar a IA</div>
        </div>
        <div style="display:flex;gap:8px;">
          <input type="text" class="form-input" id="test-msg-input" placeholder="Ex: Quais são os serviços disponíveis?" style="flex:1;">
          <button class="btn-primary" id="btn-test-ai">Enviar</button>
        </div>
      </div>
    </div>
  `;

  // Save AI config
  document.getElementById('form-ai-config')?.addEventListener('submit', async e => {
    e.preventDefault();
    const newConfig = {
      api_key: document.getElementById('ai-api-key').value.trim(),
      model: document.getElementById('ai-model').value,
      enabled: document.getElementById('ai-enabled').checked,
      persona_name: document.getElementById('ai-name').value.trim(),
      persona_description: document.getElementById('ai-personality').value.trim(),
      ...(aiConfig.system_prompt && { system_prompt: aiConfig.system_prompt })
    };
    const btn = e.target.querySelector('[type=submit]');
    btn.textContent = 'Salvando...'; btn.disabled = true;
    try {
      await configDB.set('ai_config', newConfig, currentUser?.id);
      aiConfig = newConfig;
      document.getElementById('system-prompt-preview').textContent = generateSystemPrompt(newConfig, knowledgeItems);
      showToast('Configuração da IA salva!', 'success');
      btn.textContent = '✅ Salvo!';
      setTimeout(() => { btn.textContent = '💾 Salvar Configuração IA'; btn.disabled = false; }, 2000);
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
      btn.textContent = '💾 Salvar Configuração IA'; btn.disabled = false;
    }
  });

  // Copy prompt
  document.getElementById('btn-copy-prompt')?.addEventListener('click', () => {
    const text = document.getElementById('system-prompt-preview').textContent;
    navigator.clipboard.writeText(text).then(() => showToast('Prompt copiado!', 'success'));
  });

  // Add knowledge
  document.getElementById('btn-add-knowledge')?.addEventListener('click', () => {
    openKnowledgeModal(null, KB_CATEGORIES, knowledgeItems, container, aiConfig);
  });

  // Edit/delete knowledge
  container.addEventListener('click', e => {
    if (e.target.closest('.btn-edit-knowledge')) {
      const id = e.target.closest('.btn-edit-knowledge').dataset.id;
      const item = knowledgeItems.find(k => k.id === id);
      if (item) openKnowledgeModal(item, KB_CATEGORIES, knowledgeItems, container, aiConfig);
    }
    if (e.target.closest('.btn-delete-knowledge')) {
      const id = e.target.closest('.btn-delete-knowledge').dataset.id;
      deleteKnowledge(id, knowledgeItems, container, aiConfig);
    }
  });

  // Test AI
  document.getElementById('btn-test-ai')?.addEventListener('click', async () => {
    const msg = document.getElementById('test-msg-input').value.trim();
    if (!msg) return;
    await testAI(msg, aiConfig, knowledgeItems);
    document.getElementById('test-msg-input').value = '';
  });
  document.getElementById('test-msg-input')?.addEventListener('keydown', async e => {
    if (e.key === 'Enter') {
      const msg = e.target.value.trim();
      if (!msg) return;
      await testAI(msg, aiConfig, knowledgeItems);
      e.target.value = '';
    }
  });
}

function renderKnowledgeList(items, categories) {
  if (!items.length) return `<div style="text-align:center;padding:20px;color:var(--text-secondary);">📚 Nenhum item na base de conhecimento ainda.</div>`;

  const grouped = {};
  categories.forEach(c => { grouped[c] = []; });
  items.forEach(item => {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  });

  return categories.map(cat => {
    const catItems = grouped[cat] || [];
    if (!catItems.length) return '';
    return `
      <div style="margin-bottom:12px;">
        <div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">${sanitize(cat)}</div>
        ${catItems.map(item => `
          <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;background:#f9fafb;border-radius:8px;margin-bottom:4px;border:1px solid var(--border);">
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:600;">${sanitize(item.title)}</div>
              <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${sanitize(truncate(item.content, 80))}</div>
            </div>
            <div style="display:flex;gap:4px;flex-shrink:0;">
              <button class="btn-secondary btn-sm btn-edit-knowledge" data-id="${item.id}">✏️</button>
              <button class="btn-danger btn-sm btn-delete-knowledge" data-id="${item.id}">🗑️</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }).join('');
}

function generateSystemPrompt(aiConfig, knowledgeItems) {
  const name = aiConfig.persona_name || 'Assistente';
  const description = aiConfig.persona_description || 'Sou um assistente virtual profissional.';

  const kbText = knowledgeItems.length > 0
    ? '\n\n## Base de Conhecimento\n\n' + knowledgeItems.map(item =>
        `### ${item.category}: ${item.title}\n${item.content}`
      ).join('\n\n')
    : '';

  return `Você é ${name}, assistente virtual. ${description}

## Diretrizes de Atendimento
- Seja sempre cordial, profissional e objetivo
- Responda em português brasileiro
- Se não souber a resposta, diga que vai verificar com a equipe
- Não invente informações que não estão na base de conhecimento
- Para assuntos fora do seu escopo, transfira para atendimento humano${kbText}

## Formato de resposta
- Use linguagem natural e acessível
- Mensagens curtas e diretas
- Use emojis com moderação`;
}

async function testAI(userMessage, aiConfig, knowledgeItems) {
  const chatEl = document.getElementById('test-chat');
  if (!chatEl) return;

  // Remove empty state
  const emptyEl = chatEl.querySelector('[style*="Digite uma mensagem"]');
  if (emptyEl) emptyEl.remove();

  // Append user message
  const userDiv = document.createElement('div');
  userDiv.style.cssText = 'display:flex;justify-content:flex-end;';
  userDiv.innerHTML = `<div style="background:#6366f1;color:white;border-radius:12px 12px 4px 12px;padding:8px 12px;font-size:13px;max-width:80%;">${sanitize(userMessage)}</div>`;
  chatEl.appendChild(userDiv);

  const loadingDiv = document.createElement('div');
  loadingDiv.innerHTML = `<div style="background:white;border-radius:12px 12px 12px 4px;padding:8px 12px;font-size:13px;border:1px solid var(--border);color:var(--text-secondary);">⏳ Pensando...</div>`;
  chatEl.appendChild(loadingDiv);
  chatEl.scrollTop = chatEl.scrollHeight;

  if (!aiConfig.api_key) {
    loadingDiv.innerHTML = `<div style="background:white;border-radius:12px;padding:8px 12px;font-size:13px;border:1px solid #fecaca;color:#dc2626;">❌ Configure a API Key da Anthropic primeiro.</div>`;
    return;
  }

  try {
    const systemPrompt = generateSystemPrompt(aiConfig, knowledgeItems);
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': aiConfig.api_key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: aiConfig.model || 'claude-3-haiku-20240307',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text || 'Sem resposta';
    loadingDiv.innerHTML = `<div style="background:white;border-radius:12px 12px 12px 4px;padding:8px 12px;font-size:13px;border:1px solid var(--border);line-height:1.5;white-space:pre-wrap;">${sanitize(reply)}</div>`;
  } catch (err) {
    loadingDiv.innerHTML = `<div style="background:white;border-radius:12px;padding:8px 12px;font-size:13px;border:1px solid #fecaca;color:#dc2626;">❌ Erro: ${sanitize(err.message)}</div>`;
  }

  chatEl.scrollTop = chatEl.scrollHeight;
}

function openKnowledgeModal(item, categories, knowledgeItems, container, aiConfig) {
  const isEdit = !!item;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header">
        <h2 class="modal-title">${isEdit ? '✏️ Editar Item' : '+ Novo Item'} — Base de Conhecimento</h2>
        <button class="modal-close" id="close-kb-modal">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Categoria *</label>
          <select class="form-select" id="kb-category">
            ${categories.map(c => `<option value="${c}" ${item?.category === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Título *</label>
          <input type="text" class="form-input" id="kb-title" value="${sanitize(item?.title || '')}" placeholder="Ex: Preço do pacote básico">
        </div>
        <div class="form-group">
          <label class="form-label">Conteúdo *</label>
          <textarea class="form-textarea" id="kb-content" rows="5" placeholder="Detalhes completos deste item...">${sanitize(item?.content || '')}</textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="cancel-kb-modal">Cancelar</button>
        <button class="btn-primary" id="save-kb-modal">${isEdit ? '💾 Salvar' : '+ Adicionar'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('close-kb-modal').addEventListener('click', () => overlay.remove());
  document.getElementById('cancel-kb-modal').addEventListener('click', () => overlay.remove());

  document.getElementById('save-kb-modal').addEventListener('click', async () => {
    const title = document.getElementById('kb-title').value.trim();
    const content = document.getElementById('kb-content').value.trim();
    const category = document.getElementById('kb-category').value;
    if (!title || !content) { showToast('Preencha título e conteúdo', 'warning'); return; }
    const btn = document.getElementById('save-kb-modal');
    btn.textContent = 'Salvando...'; btn.disabled = true;
    try {
      const saved = await aiDB.saveKnowledge({
        ...(item?.id && { id: item.id }),
        category, title, content,
        is_active: true,
        order_index: item?.order_index ?? knowledgeItems.length
      });
      if (isEdit) {
        const idx = knowledgeItems.findIndex(k => k.id === item.id);
        if (idx !== -1) knowledgeItems[idx] = saved;
      } else {
        knowledgeItems.push(saved);
      }
      // Re-render knowledge list
      const listEl = document.getElementById('knowledge-list');
      if (listEl) listEl.innerHTML = renderKnowledgeList(knowledgeItems, categories);
      // Update system prompt
      const promptEl = document.getElementById('system-prompt-preview');
      if (promptEl) promptEl.textContent = generateSystemPrompt(aiConfig, knowledgeItems);
      showToast(isEdit ? 'Item atualizado!' : 'Item adicionado!', 'success');
      overlay.remove();
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
      btn.textContent = isEdit ? '💾 Salvar' : '+ Adicionar'; btn.disabled = false;
    }
  });
}

async function deleteKnowledge(id, knowledgeItems, container, aiConfig) {
  const ok = await showConfirm('Remover este item da base de conhecimento?', 'Confirmar Exclusão');
  if (!ok) return;
  try {
    await aiDB.deleteKnowledge(id);
    const idx = knowledgeItems.findIndex(k => k.id === id);
    if (idx !== -1) knowledgeItems.splice(idx, 1);
    const listEl = document.getElementById('knowledge-list');
    const categories = ['Serviços', 'Preços', 'FAQ', 'Regras de Atendimento', 'Fluxo de Qualificação'];
    if (listEl) listEl.innerHTML = renderKnowledgeList(knowledgeItems, categories);
    const promptEl = document.getElementById('system-prompt-preview');
    if (promptEl) promptEl.textContent = generateSystemPrompt(aiConfig, knowledgeItems);
    showToast('Item removido.', 'success');
  } catch (err) {
    showToast('Erro: ' + err.message, 'error');
  }
}

// ============================================================
// TAB 4: NOTIFICAÇÕES
// ============================================================
async function renderNotificacoesTab(container, profile) {
  let templates = {};
  try { templates = await configDB.get('notification_templates') || {}; } catch {}

  const defaultTemplates = {
    before_3_days: templates.before_3_days || 'Olá, {nome}! 👋\n\nLembrando que sua fatura de {valor} vence em 3 dias (dia {data}).\n\nAcesse nosso site para pagar via PIX: {pix_key}\n\nObrigado! 🙏',
    due_day: templates.due_day || 'Olá, {nome}! 📅\n\nSua fatura de {valor} vence HOJE.\n\nPague via PIX: {pix_key}\n\nEm caso de dúvidas, fale conosco. Obrigado!',
    overdue_3: templates.overdue_3 || 'Olá, {nome},\n\nIdentificamos que sua fatura de {valor} está há 3 dias em atraso.\n\nPague via PIX: {pix_key}\n\nEntre em contato se precisar de ajuda.',
    overdue_7: templates.overdue_7 || 'Olá, {nome},\n\n⚠️ Sua fatura de {valor} está há 7 dias em aberto.\n\nSolicito que regularize o pagamento o mais breve possível.\n\nPIX: {pix_key}\n\nAtenciosamente.'
  };

  const templateConfigs = [
    { key: 'before_3_days', label: '🔔 3 dias antes do vencimento', color: '#6366f1' },
    { key: 'due_day', label: '📅 No dia do vencimento', color: '#f59e0b' },
    { key: 'overdue_3', label: '🔴 D+3 de atraso', color: '#f97316' },
    { key: 'overdue_7', label: '🚨 D+7 de atraso', color: '#ef4444' }
  ];

  container.innerHTML = `
    <div>
      <div class="card" style="padding:16px;margin-bottom:20px;background:#fffbeb;border:1px solid #fef3c7;">
        <p style="font-size:13px;color:#92400e;">
          <strong>Variáveis disponíveis:</strong>
          ${['{nome}', '{valor}', '{data}', '{pix_key}', '{mes_ref}'].map(v =>
            `<code style="background:#fef3c7;padding:1px 6px;border-radius:4px;margin:0 2px;">${v}</code>`
          ).join('')}
        </p>
      </div>

      <form id="form-notifications">
        <div style="display:flex;flex-direction:column;gap:16px;">
          ${templateConfigs.map(tc => `
            <div class="card" style="padding:20px;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
                <div style="width:8px;height:30px;background:${tc.color};border-radius:4px;flex-shrink:0;"></div>
                <h4 style="font-size:13px;font-weight:700;color:${tc.color};">${tc.label}</h4>
              </div>
              <div class="form-group">
                <textarea class="form-textarea" name="${tc.key}" rows="5" style="font-family:monospace;font-size:12px;">${sanitize(defaultTemplates[tc.key])}</textarea>
              </div>
            </div>
          `).join('')}
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:16px;">
          <button type="submit" class="btn-primary">💾 Salvar Templates</button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('form-notifications')?.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const newTemplates = {};
    templateConfigs.forEach(tc => { newTemplates[tc.key] = fd.get(tc.key); });
    const btn = e.target.querySelector('[type=submit]');
    btn.textContent = 'Salvando...'; btn.disabled = true;
    try {
      await configDB.set('notification_templates', newTemplates, currentUser?.id);
      showToast('Templates salvos!', 'success');
      btn.textContent = '✅ Salvo!';
      setTimeout(() => { btn.textContent = '💾 Salvar Templates'; btn.disabled = false; }, 2000);
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
      btn.textContent = '💾 Salvar Templates'; btn.disabled = false;
    }
  });
}

// ============================================================
// TAB 5: ONBOARDING TEMPLATE
// ============================================================
async function renderOnboardingTab(container, profile) {
  let items = [];
  try { items = await configDB.get('onboarding_template') || []; } catch {}
  if (!items.length) {
    items = [
      'Reunião de kickoff realizada',
      'Acesso às redes sociais recebido',
      'Briefing de identidade visual preenchido',
      'Calendario editorial do 1º mês aprovado',
      'Primeiro conteúdo publicado'
    ];
  }

  const renderItems = () => {
    const list = document.getElementById('onboarding-items-list');
    if (!list) return;
    list.innerHTML = items.map((item, i) => `
      <div class="onboarding-item" data-index="${i}" draggable="true"
        style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:white;border-radius:8px;border:1px solid var(--border);margin-bottom:6px;cursor:grab;">
        <span style="color:var(--text-secondary);cursor:grab;font-size:16px;">⋮⋮</span>
        <input type="text" class="form-input" style="flex:1;" value="${sanitize(item)}" data-idx="${i}">
        <button class="btn-danger btn-sm remove-onboarding-item" data-idx="${i}">✕</button>
      </div>
    `).join('');
    bindDragDrop();
  };

  container.innerHTML = `
    <div class="card" style="padding:24px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <h3 style="font-size:15px;font-weight:700;">🚀 Template de Onboarding</h3>
        <button class="btn-secondary btn-sm" id="btn-add-onboarding">+ Adicionar Item</button>
      </div>
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">
        Esta lista é usada como checklist padrão para novos clientes. Arraste para reordenar.
      </p>
      <div id="onboarding-items-list"></div>
      <div style="display:flex;justify-content:flex-end;margin-top:16px;">
        <button class="btn-primary" id="save-onboarding">💾 Salvar Template</button>
      </div>
    </div>
  `;

  renderItems();

  document.getElementById('btn-add-onboarding')?.addEventListener('click', () => {
    items.push('Novo item...');
    renderItems();
    setTimeout(() => {
      const inputs = document.querySelectorAll('.onboarding-item input');
      inputs[inputs.length - 1]?.focus();
      inputs[inputs.length - 1]?.select();
    }, 50);
  });

  container.addEventListener('input', e => {
    const input = e.target.closest('[data-idx]');
    if (input && input.tagName === 'INPUT') {
      items[parseInt(input.dataset.idx)] = input.value;
    }
  });

  container.addEventListener('click', e => {
    if (e.target.classList.contains('remove-onboarding-item')) {
      const idx = parseInt(e.target.dataset.idx);
      items.splice(idx, 1);
      renderItems();
    }
  });

  document.getElementById('save-onboarding')?.addEventListener('click', async () => {
    // Sync from DOM
    document.querySelectorAll('.onboarding-item input').forEach((inp, i) => {
      items[i] = inp.value.trim();
    });
    const filtered = items.filter(Boolean);
    const btn = document.getElementById('save-onboarding');
    btn.textContent = 'Salvando...'; btn.disabled = true;
    try {
      await configDB.set('onboarding_template', filtered, currentUser?.id);
      items = filtered;
      showToast('Template de onboarding salvo!', 'success');
      btn.textContent = '✅ Salvo!';
      setTimeout(() => { btn.textContent = '💾 Salvar Template'; btn.disabled = false; }, 2000);
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
      btn.textContent = '💾 Salvar Template'; btn.disabled = false;
    }
  });

  function bindDragDrop() {
    let dragFrom = null;
    document.querySelectorAll('.onboarding-item').forEach(item => {
      item.addEventListener('dragstart', () => { dragFrom = parseInt(item.dataset.index); });
      item.addEventListener('dragover', e => { e.preventDefault(); item.style.background = '#f0f1ff'; });
      item.addEventListener('dragleave', () => { item.style.background = 'white'; });
      item.addEventListener('drop', () => {
        item.style.background = 'white';
        const dragTo = parseInt(item.dataset.index);
        if (dragFrom === null || dragFrom === dragTo) return;
        const moved = items.splice(dragFrom, 1)[0];
        items.splice(dragTo, 0, moved);
        dragFrom = null;
        renderItems();
      });
    });
  }
}

// ============================================================
// TAB 6: USUÁRIOS (master only)
// ============================================================
async function renderUsuariosTab(container, profile) {
  let users = [];
  try {
    const { supabase } = await import('../supabase.js');
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    users = data || [];
  } catch {}

  container.innerHTML = `
    <div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <h3 style="font-size:15px;font-weight:700;">👥 Usuários do Sistema (${users.length})</h3>
        <button class="btn-primary btn-sm" id="btn-invite-user">📧 Convidar Usuário</button>
      </div>

      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr>
            <th>Usuário</th>
            <th>E-mail</th>
            <th>Role</th>
            <th>Último Acesso</th>
            <th>Ações</th>
          </tr></thead>
          <tbody id="users-tbody">
            ${users.map(u => renderUserRow(u, profile)).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('btn-invite-user')?.addEventListener('click', () => showInviteModal());

  // Role change
  container.addEventListener('change', async e => {
    if (e.target.classList.contains('role-select')) {
      const userId = e.target.dataset.userId;
      const newRole = e.target.value;
      const prevRole = e.target.dataset.currentRole;
      if (userId === currentUser?.id) {
        showToast('Você não pode alterar sua própria role.', 'warning');
        e.target.value = prevRole; return;
      }
      try {
        const { supabase } = await import('../supabase.js');
        await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
        e.target.dataset.currentRole = newRole;
        showToast('Role atualizada!', 'success');
      } catch (err) {
        showToast('Erro: ' + err.message, 'error');
        e.target.value = prevRole;
      }
    }
  });

  // Deactivate
  container.addEventListener('click', async e => {
    const deactivateBtn = e.target.closest('.btn-deactivate-user');
    if (!deactivateBtn) return;
    const userId = deactivateBtn.dataset.userId;
    if (userId === currentUser?.id) { showToast('Você não pode desativar sua própria conta.', 'warning'); return; }
    const ok = await showConfirm('Desativar este usuário? Ele não poderá mais fazer login.', 'Desativar Usuário');
    if (!ok) return;
    try {
      const { supabase } = await import('../supabase.js');
      await supabase.from('profiles').update({ is_active: false }).eq('id', userId);
      users = users.filter(u => u.id !== userId);
      document.getElementById('users-tbody').innerHTML = users.map(u => renderUserRow(u, profile)).join('');
      showToast('Usuário desativado.', 'success');
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
    }
  });
}

function renderUserRow(user, profile) {
  const rl = ROLE_LABELS[user.role] || '👤 —';
  const isMe = user.id === currentUser?.id;
  return `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:8px;">
          ${renderAvatar({ full_name: user.full_name, avatar_url: user.avatar_url }, 32)}
          <div>
            <div style="font-size:13px;font-weight:600;">${sanitize(user.full_name || '—')} ${isMe ? '<span style="font-size:10px;background:#f0fdf4;color:#10b981;padding:1px 6px;border-radius:10px;">Você</span>' : ''}</div>
            <div style="font-size:11px;color:var(--text-secondary);">${sanitize(user.email || '')}</div>
          </div>
        </div>
      </td>
      <td><span style="font-size:12px;">${rl}</span></td>
      <td><span style="font-size:12px;color:${user.is_active ? '#10b981' : '#6b7280'};">${user.is_active ? '✅ Ativo' : '⛔ Inativo'}</span></td>
      <td>
        ${!isMe ? `<button class="btn-secondary btn-sm btn-deactivate-user" data-user-id="${user.id}" style="font-size:11px;">Desativar</button>` : ''}
      </td>
    </tr>
  `;
}
