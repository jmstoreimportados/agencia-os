// ============================================================
// TEAM MANAGEMENT PAGE
// ============================================================

import { teamDB, tasksDB, clientsDB, currentUser } from '../supabase.js';
import { ROLE_LABELS, MONTHS } from '../config.js';
import {
  formatCurrency, formatDate, formatDateTime, timeAgo, renderAvatar,
  showToast, showConfirm, renderEmptyState, sanitize,
  formatCPF, formatPhone, generateId, truncate
} from '../utils.js';

let allMembers = [];
let allClients = [];

// ============================================================
// MAIN ENTRY POINT
// ============================================================
export async function renderTeam(container, profile) {
  container.innerHTML = `
    <div id="team-root">
      <div class="page-header">
        <div>
          <h1 class="page-title">Equipe</h1>
          <p style="font-size:13px;color:var(--text-secondary);margin-top:2px;">Gerencie os membros da sua equipe</p>
        </div>
        <div class="page-actions">
          ${['master','admin'].includes(profile?.role) ? `
            <button class="btn-primary" id="btn-new-member">+ Novo Membro</button>
          ` : ''}
        </div>
      </div>
      <div id="team-grid-container">
        <div style="text-align:center;padding:60px;color:var(--text-secondary);">
          <div style="font-size:32px;margin-bottom:8px;">⏳</div>
          <div>Carregando equipe...</div>
        </div>
      </div>
    </div>
  `;

  try {
    [allMembers, allClients] = await Promise.all([
      teamDB.getAll(),
      clientsDB.getAll({ active: true })
    ]);
  } catch (err) {
    showToast('Erro ao carregar equipe: ' + err.message, 'error');
    allMembers = []; allClients = [];
  }

  renderTeamGrid(profile);

  document.getElementById('btn-new-member')?.addEventListener('click', () => openMemberModal(null, profile));
}

// ============================================================
// TEAM GRID
// ============================================================
async function renderTeamGrid(profile) {
  const container = document.getElementById('team-grid-container');
  if (!container) return;

  if (allMembers.length === 0) {
    container.innerHTML = renderEmptyState('👥', 'Nenhum membro cadastrado', 'Adicione membros à equipe para começar.');
    return;
  }

  // Load workload data
  const workloads = {};
  await Promise.all(allMembers.map(async m => {
    try {
      const tasks = await teamDB.getWorkload(m.id);
      workloads[m.id] = tasks || [];
    } catch { workloads[m.id] = []; }
  }));

  // Monthly stats (tasks done this month)
  const now = new Date();
  let allTasks = [];
  try { allTasks = await tasksDB.getAll({ month: now.getMonth()+1, year: now.getFullYear() }); }
  catch { allTasks = []; }

  const stats = {};
  allMembers.forEach(m => {
    const myTasks = allTasks.filter(t => (t.assigned_to || []).includes(m.id));
    const done = myTasks.filter(t => t.status === 'done').length;
    const late = myTasks.filter(t => t.status !== 'done' && t.due_date && t.due_date < now.toISOString().split('T')[0]).length;
    stats[m.id] = { done, late, total: myTasks.length };
  });

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px;">
      ${allMembers.map(m => renderMemberCard(m, workloads[m.id] || [], stats[m.id] || {}, profile)).join('')}
    </div>
  `;

  container.querySelectorAll('.member-card').forEach(card => {
    card.addEventListener('click', () => {
      const member = allMembers.find(m => m.id === card.dataset.memberId);
      if (member) openMemberDetail(member, profile);
    });
  });
}

function renderMemberCard(member, workload, stats, profile) {
  const rl = ROLE_LABELS[member.profile?.role] || '👤 Membro';
  const workloadPct = Math.min(100, Math.round((workload.length / 10) * 100));
  const workloadColor = workloadPct >= 80 ? '#ef4444' : workloadPct >= 60 ? '#f59e0b' : '#10b981';

  return `
    <div class="card member-card" data-member-id="${member.id}" style="cursor:pointer;transition:transform .15s,box-shadow .15s;" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,.1)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;">
        ${renderAvatar({ full_name: member.full_name, avatar_url: member.avatar_url }, 52)}
        <div style="flex:1;min-width:0;">
          <div style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:2px;">${sanitize(member.full_name)}</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;">${sanitize(member.position || '—')}</div>
          <span class="badge" style="font-size:10px;">${rl}</span>
        </div>
      </div>
      <div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-secondary);margin-bottom:4px;">
          <span>Carga de Trabalho</span>
          <span style="color:${workloadColor};font-weight:700;">${workload.length}/10 tarefas</span>
        </div>
        <div class="progress" style="height:6px;">
          <div class="progress-bar" style="width:${workloadPct}%;background:${workloadColor};"></div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div style="text-align:center;background:#f0fdf4;border-radius:8px;padding:10px;">
          <div style="font-size:20px;font-weight:800;color:#10b981;">${stats.done || 0}</div>
          <div style="font-size:10px;color:var(--text-secondary);">Concluídas</div>
        </div>
        <div style="text-align:center;background:${(stats.late || 0) > 0 ? '#fef2f2' : '#f9fafb'};border-radius:8px;padding:10px;">
          <div style="font-size:20px;font-weight:800;color:${(stats.late || 0) > 0 ? '#ef4444' : 'var(--text-secondary)'};">${stats.late || 0}</div>
          <div style="font-size:10px;color:var(--text-secondary);">Em Atraso</div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// MEMBER DETAIL MODAL
// ============================================================
async function openMemberDetail(member, profile) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal-xl" style="max-height:90vh;display:flex;flex-direction:column;">
      <div class="modal-header">
        <div style="display:flex;align-items:center;gap:12px;">
          ${renderAvatar({ full_name: member.full_name, avatar_url: member.avatar_url }, 40)}
          <div>
            <h2 class="modal-title" style="margin:0;">${sanitize(member.full_name)}</h2>
            <p style="font-size:12px;color:var(--text-secondary);margin:0;">${sanitize(member.position || '')}</p>
          </div>
        </div>
        <button class="modal-close" id="close-member-detail">✕</button>
      </div>
      <div class="tabs" style="padding:0 24px;border-bottom:1px solid var(--border);flex-shrink:0;">
        ${['dados','documentos','pagamentos','ausencias','desempenho','clientes'].map((tab, i) => {
          const labels = { dados: '👤 Dados', documentos: '📁 Docs', pagamentos: '💰 Pagamentos', ausencias: '🗓️ Ausências', desempenho: '📊 Desempenho', clientes: '🏢 Clientes' };
          return `<button class="tab ${i === 0 ? 'active' : ''}" data-tab="${tab}">${labels[tab]}</button>`;
        }).join('')}
      </div>
      <div class="modal-body" id="member-tab-content" style="flex:1;overflow-y:auto;">
        <div style="text-align:center;padding:40px;">⏳ Carregando...</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('close-member-detail').addEventListener('click', () => overlay.remove());

  // Load full member
  let fullMember;
  try {
    fullMember = await teamDB.getById(member.id);
  } catch (err) {
    document.getElementById('member-tab-content').innerHTML =
      `<div style="color:#ef4444;padding:20px;">Erro: ${sanitize(err.message)}</div>`;
    return;
  }

  const showTab = async (tabName) => {
    overlay.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    const content = document.getElementById('member-tab-content');
    content.innerHTML = `<div style="text-align:center;padding:40px;">⏳ Carregando...</div>`;
    switch (tabName) {
      case 'dados': renderDadosPessoais(content, fullMember, profile, overlay); break;
      case 'documentos': renderDocumentos(content, fullMember, profile); break;
      case 'pagamentos': renderPagamentos(content, fullMember, profile); break;
      case 'ausencias': renderAusencias(content, fullMember, profile); break;
      case 'desempenho': await renderDesempenho(content, fullMember); break;
      case 'clientes': renderClientes(content, fullMember); break;
    }
  };

  overlay.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => showTab(tab.dataset.tab));
  });

  showTab('dados');
}

// ---- TAB: Dados Pessoais ----
function renderDadosPessoais(container, member, profile, overlay) {
  const isMaster = profile?.role === 'master';
  container.innerHTML = `
    <form id="form-dados-pessoais">
      <div class="form-grid-3">
        <div class="form-group">
          <label class="form-label">Nome Completo *</label>
          <input type="text" class="form-input" name="full_name" value="${sanitize(member.full_name || '')}" required>
        </div>
        <div class="form-group">
          <label class="form-label">CPF</label>
          <input type="text" class="form-input" name="cpf" value="${sanitize(member.cpf || '')}" placeholder="000.000.000-00" maxlength="14">
        </div>
        <div class="form-group">
          <label class="form-label">RG</label>
          <input type="text" class="form-input" name="rg" value="${sanitize(member.rg || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Data de Nascimento</label>
          <input type="date" class="form-input" name="birth_date" value="${member.birth_date || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">E-mail</label>
          <input type="email" class="form-input" name="email" value="${sanitize(member.email || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Telefone</label>
          <input type="tel" class="form-input" name="phone" value="${sanitize(member.phone || '')}" placeholder="(11) 99999-9999">
        </div>
        <div class="form-group">
          <label class="form-label">Cargo / Função</label>
          <input type="text" class="form-input" name="position" value="${sanitize(member.position || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Data de Admissão</label>
          <input type="date" class="form-input" name="hire_date" value="${member.hire_date || ''}">
        </div>
        ${isMaster ? `
          <div class="form-group">
            <label class="form-label">Salário (R$)</label>
            <input type="number" class="form-input" name="salary" value="${member.salary || ''}" step="0.01">
          </div>
        ` : '<div></div>'}
      </div>

      <h4 style="font-size:13px;font-weight:700;margin:20px 0 12px;color:var(--text-secondary);text-transform:uppercase;">Endereço</h4>
      <div class="form-grid-3">
        <div class="form-group" style="grid-column:1/-1;">
          <label class="form-label">Logradouro</label>
          <input type="text" class="form-input" name="address_street" value="${sanitize(member.address?.street || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Número</label>
          <input type="text" class="form-input" name="address_number" value="${sanitize(member.address?.number || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Bairro</label>
          <input type="text" class="form-input" name="address_neighborhood" value="${sanitize(member.address?.neighborhood || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Cidade</label>
          <input type="text" class="form-input" name="address_city" value="${sanitize(member.address?.city || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Estado</label>
          <input type="text" class="form-input" name="address_state" value="${sanitize(member.address?.state || '')}" maxlength="2" placeholder="SP">
        </div>
        <div class="form-group">
          <label class="form-label">CEP</label>
          <input type="text" class="form-input" name="address_zip" value="${sanitize(member.address?.zip || '')}" maxlength="9" placeholder="00000-000">
        </div>
      </div>

      <h4 style="font-size:13px;font-weight:700;margin:20px 0 12px;color:var(--text-secondary);text-transform:uppercase;">Contato de Emergência</h4>
      <div class="form-grid">
        <div class="form-group">
          <label class="form-label">Nome</label>
          <input type="text" class="form-input" name="emergency_name" value="${sanitize(member.emergency_contact?.name || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Telefone</label>
          <input type="tel" class="form-input" name="emergency_phone" value="${sanitize(member.emergency_contact?.phone || '')}">
        </div>
      </div>

      <h4 style="font-size:13px;font-weight:700;margin:20px 0 12px;color:var(--text-secondary);text-transform:uppercase;">Dados Bancários</h4>
      <div class="form-grid-3">
        <div class="form-group">
          <label class="form-label">Banco</label>
          <input type="text" class="form-input" name="bank_name" value="${sanitize(member.bank_info?.name || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Agência</label>
          <input type="text" class="form-input" name="bank_agency" value="${sanitize(member.bank_info?.agency || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Conta</label>
          <input type="text" class="form-input" name="bank_account" value="${sanitize(member.bank_info?.account || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">Tipo de Conta</label>
          <select class="form-select" name="bank_type">
            <option value="corrente" ${member.bank_info?.type === 'corrente' ? 'selected' : ''}>Corrente</option>
            <option value="poupanca" ${member.bank_info?.type === 'poupanca' ? 'selected' : ''}>Poupança</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">PIX</label>
          <input type="text" class="form-input" name="pix_key" value="${sanitize(member.bank_info?.pix || '')}">
        </div>
      </div>

      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:24px;padding-top:16px;border-top:1px solid var(--border);">
        ${['master','admin'].includes(profile?.role) ? `
          <button type="button" class="btn-secondary" id="btn-create-login" style="margin-right:auto;">🔐 Criar Login</button>
        ` : ''}
        <button type="submit" class="btn-primary">💾 Salvar Dados</button>
      </div>
    </form>
  `;

  // CPF mask
  container.querySelector('[name=cpf]')?.addEventListener('input', e => {
    let v = e.target.value.replace(/\D/g, '');
    v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    e.target.value = v;
  });

  // Phone mask
  container.querySelector('[name=phone]')?.addEventListener('input', e => {
    let v = e.target.value.replace(/\D/g, '');
    if (v.length === 11) v = v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    else if (v.length === 10) v = v.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    e.target.value = v;
  });

  document.getElementById('btn-create-login')?.addEventListener('click', () => {
    showCreateLoginModal(member);
  });

  container.querySelector('#form-dados-pessoais').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {
      full_name: fd.get('full_name'),
      cpf: fd.get('cpf'),
      rg: fd.get('rg'),
      birth_date: fd.get('birth_date') || null,
      email: fd.get('email'),
      phone: fd.get('phone'),
      position: fd.get('position'),
      hire_date: fd.get('hire_date') || null,
      ...(isMaster && { salary: parseFloat(fd.get('salary')) || null }),
      address: {
        street: fd.get('address_street'),
        number: fd.get('address_number'),
        neighborhood: fd.get('address_neighborhood'),
        city: fd.get('address_city'),
        state: fd.get('address_state'),
        zip: fd.get('address_zip')
      },
      emergency_contact: {
        name: fd.get('emergency_name'),
        phone: fd.get('emergency_phone')
      },
      bank_info: {
        name: fd.get('bank_name'),
        agency: fd.get('bank_agency'),
        account: fd.get('bank_account'),
        type: fd.get('bank_type'),
        pix: fd.get('pix_key')
      }
    };

    const btn = e.target.querySelector('[type=submit]');
    btn.textContent = 'Salvando...'; btn.disabled = true;
    try {
      await teamDB.update(member.id, data);
      Object.assign(member, data);
      const idx = allMembers.findIndex(m => m.id === member.id);
      if (idx !== -1) allMembers[idx] = { ...allMembers[idx], ...data };
      showToast('Dados salvos com sucesso!', 'success');
      btn.textContent = '✅ Salvo!';
      setTimeout(() => { btn.textContent = '💾 Salvar Dados'; btn.disabled = false; }, 2000);
    } catch (err) {
      showToast('Erro ao salvar: ' + err.message, 'error');
      btn.textContent = '💾 Salvar Dados'; btn.disabled = false;
    }
  });
}

// ---- TAB: Documentos ----
function renderDocumentos(container, member, profile) {
  const docs = Array.isArray(member.team_documents) ? member.team_documents : [];
  const docTypes = [
    { key: 'rg', label: 'RG', icon: '🪪' },
    { key: 'cpf', label: 'CPF', icon: '📋' },
    { key: 'contrato', label: 'Contrato', icon: '📝' },
    { key: 'outro', label: 'Outro', icon: '📄' }
  ];

  container.innerHTML = `
    <div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <h4 style="font-size:14px;font-weight:700;">Documentos (${docs.length})</h4>
      </div>
      ${docs.length === 0 ? `<div style="text-align:center;padding:40px;color:var(--text-secondary);">📂 Nenhum documento enviado ainda.</div>` : ''}
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px;">
        ${docs.map(doc => {
          const dt = docTypes.find(t => t.key === doc.type) || { icon: '📄', label: 'Documento' };
          return `
            <div style="display:flex;align-items:center;gap:12px;padding:12px;background:#f9fafb;border-radius:8px;border:1px solid var(--border);">
              <span style="font-size:24px;">${dt.icon}</span>
              <div style="flex:1;">
                <div style="font-size:13px;font-weight:600;">${sanitize(doc.name)}</div>
                <div style="font-size:11px;color:var(--text-secondary);">${dt.label} • Enviado em ${formatDate(doc.created_at)}</div>
              </div>
              <div style="display:flex;gap:6px;">
                <button class="btn-secondary btn-sm" onclick="window.__downloadDoc && window.__downloadDoc('${doc.storage_path}','${sanitize(doc.name)}')">⬇️ Baixar</button>
                ${['master','admin'].includes(profile?.role) ? `<button class="btn-danger btn-sm" data-doc-id="${doc.id}">🗑️</button>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="card" style="padding:16px;background:#f0f9ff;border:1px solid #bae6fd;">
        <h4 style="font-size:13px;font-weight:700;margin-bottom:12px;">📎 Enviar Documento</h4>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Tipo</label>
            <select class="form-select" id="doc-type">
              ${docTypes.map(t => `<option value="${t.key}">${t.icon} ${t.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Nome do Documento</label>
            <input type="text" class="form-input" id="doc-name" placeholder="Ex: RG - João Silva">
          </div>
          <div class="form-group" style="grid-column:1/-1;">
            <label class="form-label">Arquivo</label>
            <input type="file" class="form-input" id="doc-file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx">
          </div>
        </div>
        <button class="btn-primary btn-sm" id="btn-upload-doc">📤 Enviar Documento</button>
      </div>
    </div>
  `;

  window.__downloadDoc = async (path, name) => {
    try {
      const { data } = await import('../supabase.js').then(m => m.supabase).then(sb =>
        sb.storage.from('team-documents').download(path)
      );
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
    } catch (err) {
      showToast('Erro ao baixar: ' + err.message, 'error');
    }
  };

  container.querySelectorAll('[data-doc-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ok = await showConfirm('Remover este documento?', 'Confirmar Exclusão');
      if (!ok) return;
      try {
        const { supabase } = await import('../supabase.js');
        await supabase.from('team_documents').delete().eq('id', btn.dataset.docId);
        showToast('Documento removido.', 'success');
        const idx = (member.team_documents || []).findIndex(d => d.id === btn.dataset.docId);
        if (idx !== -1) member.team_documents.splice(idx, 1);
        renderDocumentos(container, member, profile);
      } catch (err) {
        showToast('Erro: ' + err.message, 'error');
      }
    });
  });

  document.getElementById('btn-upload-doc')?.addEventListener('click', async () => {
    const type = document.getElementById('doc-type').value;
    const name = document.getElementById('doc-name').value.trim();
    const file = document.getElementById('doc-file').files[0];
    if (!name) { showToast('Informe o nome do documento', 'warning'); return; }
    if (!file) { showToast('Selecione um arquivo', 'warning'); return; }
    const btn = document.getElementById('btn-upload-doc');
    btn.textContent = 'Enviando...'; btn.disabled = true;
    try {
      const doc = await teamDB.uploadDocument(member.id, file, type, name, currentUser?.id);
      if (!member.team_documents) member.team_documents = [];
      member.team_documents.push(doc);
      showToast('Documento enviado!', 'success');
      renderDocumentos(container, member, profile);
    } catch (err) {
      showToast('Erro ao enviar: ' + err.message, 'error');
      btn.textContent = '📤 Enviar Documento'; btn.disabled = false;
    }
  });
}

// ---- TAB: Pagamentos ----
function renderPagamentos(container, member, profile) {
  const payments = Array.isArray(member.team_payments) ? member.team_payments : [];

  container.innerHTML = `
    <div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <h4 style="font-size:14px;font-weight:700;">Pagamentos (${payments.length})</h4>
        ${['master','admin'].includes(profile?.role) ? `
          <button class="btn-primary btn-sm" id="btn-register-payment">+ Registrar Pagamento</button>
        ` : ''}
      </div>
      ${payments.length === 0
        ? `<div style="text-align:center;padding:40px;color:var(--text-secondary);">💰 Nenhum pagamento registrado ainda.</div>`
        : `
          <div class="table-wrapper">
            <table class="data-table">
              <thead><tr>
                <th>Mês/Ano</th>
                <th>Valor</th>
                <th>Data de Pagamento</th>
                <th>Método</th>
                <th>Observação</th>
              </tr></thead>
              <tbody>
                ${payments.map(p => `
                  <tr>
                    <td style="font-weight:600;">${MONTHS[p.month-1]}/${p.year}</td>
                    <td style="font-weight:700;color:#10b981;">${p.amount ? formatCurrency(p.amount) : '—'}</td>
                    <td>${p.paid_date ? formatDate(p.paid_date) : '—'}</td>
                    <td><span class="badge" style="text-transform:capitalize;">${sanitize(p.method || 'pix')}</span></td>
                    <td style="color:var(--text-secondary);">${sanitize(truncate(p.notes || '', 40))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `}
    </div>
  `;

  document.getElementById('btn-register-payment')?.addEventListener('click', () => {
    openRegisterPaymentModal(member, container, profile);
  });
}

function openRegisterPaymentModal(member, container, profile) {
  const now = new Date();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal-sm">
      <div class="modal-header">
        <h2 class="modal-title">💰 Registrar Pagamento</h2>
        <button class="modal-close" id="close-pay-modal">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Mês</label>
            <select class="form-select" id="pay-month">
              ${MONTHS.map((m,i) => `<option value="${i+1}" ${i+1===now.getMonth()+1?'selected':''}>${m}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Ano</label>
            <input type="number" class="form-input" id="pay-year" value="${now.getFullYear()}" min="2020" max="2035">
          </div>
          <div class="form-group" style="grid-column:1/-1;">
            <label class="form-label">Valor (R$) *</label>
            <input type="number" class="form-input" id="pay-amount" step="0.01" placeholder="0,00" value="${member.salary || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Data de Pagamento</label>
            <input type="date" class="form-input" id="pay-date" value="${now.toISOString().split('T')[0]}">
          </div>
          <div class="form-group">
            <label class="form-label">Método</label>
            <select class="form-select" id="pay-method">
              <option value="pix">PIX</option>
              <option value="transferencia">Transferência</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="deposito">Depósito</option>
            </select>
          </div>
          <div class="form-group" style="grid-column:1/-1;">
            <label class="form-label">Observações</label>
            <textarea class="form-textarea" id="pay-notes" rows="2" placeholder="13º, bônus, etc..."></textarea>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="cancel-pay-modal">Cancelar</button>
        <button class="btn-primary" id="save-pay-modal">💾 Registrar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('close-pay-modal').addEventListener('click', () => overlay.remove());
  document.getElementById('cancel-pay-modal').addEventListener('click', () => overlay.remove());
  document.getElementById('save-pay-modal').addEventListener('click', async () => {
    const amount = parseFloat(document.getElementById('pay-amount').value);
    if (!amount || amount <= 0) { showToast('Informe o valor', 'warning'); return; }
    const btn = document.getElementById('save-pay-modal');
    btn.textContent = 'Salvando...'; btn.disabled = true;
    try {
      const payment = await teamDB.registerPayment({
        team_member_id: member.id,
        month: parseInt(document.getElementById('pay-month').value),
        year: parseInt(document.getElementById('pay-year').value),
        amount,
        paid_date: document.getElementById('pay-date').value || null,
        method: document.getElementById('pay-method').value,
        notes: document.getElementById('pay-notes').value.trim()
      });
      if (!member.team_payments) member.team_payments = [];
      member.team_payments.unshift(payment);
      showToast('Pagamento registrado!', 'success');
      overlay.remove();
      renderPagamentos(container, member, profile);
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
      btn.textContent = '💾 Registrar'; btn.disabled = false;
    }
  });
}

// ---- TAB: Ausências ----
function renderAusencias(container, member, profile) {
  const absences = Array.isArray(member.team_absences) ? member.team_absences : [];
  const typeLabels = { ferias: '🏖️ Férias', falta: '❌ Falta', atestado: '🏥 Atestado', folga: '😌 Folga' };

  container.innerHTML = `
    <div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <h4 style="font-size:14px;font-weight:700;">Ausências (${absences.length})</h4>
        ${['master','admin'].includes(profile?.role) ? `
          <button class="btn-primary btn-sm" id="btn-register-absence">+ Registrar Ausência</button>
        ` : ''}
      </div>
      ${absences.length === 0
        ? `<div style="text-align:center;padding:40px;color:var(--text-secondary);">📅 Nenhuma ausência registrada.</div>`
        : `
          <div class="table-wrapper">
            <table class="data-table">
              <thead><tr><th>Tipo</th><th>Início</th><th>Fim</th><th>Dias</th><th>Observação</th></tr></thead>
              <tbody>
                ${absences.map(a => {
                  const start = new Date(a.start_date);
                  const end = new Date(a.end_date);
                  const days = Math.round((end - start) / 86400000) + 1;
                  return `
                    <tr>
                      <td><span class="badge">${typeLabels[a.type] || a.type}</span></td>
                      <td>${formatDate(a.start_date)}</td>
                      <td>${formatDate(a.end_date)}</td>
                      <td>${days} dia${days !== 1 ? 's' : ''}</td>
                      <td style="color:var(--text-secondary);">${sanitize(truncate(a.notes || '', 40))}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `}
    </div>
  `;

  document.getElementById('btn-register-absence')?.addEventListener('click', () => {
    openRegisterAbsenceModal(member, container, profile);
  });
}

function openRegisterAbsenceModal(member, container, profile) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal-sm">
      <div class="modal-header">
        <h2 class="modal-title">🗓️ Registrar Ausência</h2>
        <button class="modal-close" id="close-abs-modal">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="form-group" style="grid-column:1/-1;">
            <label class="form-label">Tipo *</label>
            <select class="form-select" id="abs-type">
              <option value="ferias">🏖️ Férias</option>
              <option value="falta">❌ Falta</option>
              <option value="atestado">🏥 Atestado</option>
              <option value="folga">😌 Folga</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Data Início *</label>
            <input type="date" class="form-input" id="abs-start">
          </div>
          <div class="form-group">
            <label class="form-label">Data Fim *</label>
            <input type="date" class="form-input" id="abs-end">
          </div>
          <div class="form-group" style="grid-column:1/-1;">
            <label class="form-label">Observações</label>
            <textarea class="form-textarea" id="abs-notes" rows="2" placeholder="Motivo, CID, etc..."></textarea>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="cancel-abs-modal">Cancelar</button>
        <button class="btn-primary" id="save-abs-modal">💾 Registrar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('close-abs-modal').addEventListener('click', () => overlay.remove());
  document.getElementById('cancel-abs-modal').addEventListener('click', () => overlay.remove());
  document.getElementById('save-abs-modal').addEventListener('click', async () => {
    const start = document.getElementById('abs-start').value;
    const end = document.getElementById('abs-end').value;
    if (!start || !end) { showToast('Informe as datas', 'warning'); return; }
    if (end < start) { showToast('Data fim deve ser após data início', 'warning'); return; }
    const btn = document.getElementById('save-abs-modal');
    btn.textContent = 'Salvando...'; btn.disabled = true;
    try {
      const absence = await teamDB.registerAbsence({
        team_member_id: member.id,
        type: document.getElementById('abs-type').value,
        start_date: start,
        end_date: end,
        notes: document.getElementById('abs-notes').value.trim()
      });
      if (!member.team_absences) member.team_absences = [];
      member.team_absences.push(absence);
      showToast('Ausência registrada!', 'success');
      overlay.remove();
      renderAusencias(container, member, profile);
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
      btn.textContent = '💾 Registrar'; btn.disabled = false;
    }
  });
}

// ---- TAB: Desempenho ----
async function renderDesempenho(container, member) {
  container.innerHTML = `<div style="text-align:center;padding:40px;">⏳ Calculando desempenho...</div>`;
  const now = new Date();
  const monthStats = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = d.getMonth() + 1, y = d.getFullYear();
    try {
      const tasks = await tasksDB.getAll({ month: m, year: y });
      const myTasks = tasks.filter(t => (t.assigned_to || []).includes(member.id));
      const done = myTasks.filter(t => t.status === 'done').length;
      const overdue = myTasks.filter(t => t.status !== 'done' && t.due_date && t.due_date < `${y}-${String(m).padStart(2,'0')}-${new Date(y, m, 0).getDate()}`).length;
      monthStats.push({ label: `${MONTHS[m-1].slice(0,3)}/${y}`, done, overdue, total: myTasks.length });
    } catch {
      monthStats.push({ label: `${MONTHS[m-1].slice(0,3)}/${y}`, done: 0, overdue: 0, total: 0 });
    }
  }

  const maxVal = Math.max(...monthStats.map(s => Math.max(s.done, s.overdue, 1)));
  const currentMonth = monthStats[monthStats.length - 1];
  const lateRate = currentMonth.total > 0 ? Math.round((currentMonth.overdue / currentMonth.total) * 100) : 0;

  container.innerHTML = `
    <div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px;">
        <div class="kpi-card">
          <div style="font-size:28px;font-weight:800;color:#10b981;">${currentMonth.done}</div>
          <div style="font-size:12px;color:var(--text-secondary);">Concluídas este mês</div>
        </div>
        <div class="kpi-card">
          <div style="font-size:28px;font-weight:800;color:${currentMonth.overdue > 0 ? '#ef4444' : 'var(--text-secondary)'};">${currentMonth.overdue}</div>
          <div style="font-size:12px;color:var(--text-secondary);">Em atraso</div>
        </div>
        <div class="kpi-card">
          <div style="font-size:28px;font-weight:800;color:${lateRate > 20 ? '#ef4444' : lateRate > 10 ? '#f59e0b' : '#10b981'};">${lateRate}%</div>
          <div style="font-size:12px;color:var(--text-secondary);">Taxa de atraso</div>
        </div>
      </div>

      <div class="card" style="padding:20px;">
        <h4 style="font-size:13px;font-weight:700;margin-bottom:16px;color:var(--text-secondary);text-transform:uppercase;">Últimos 6 meses</h4>
        <div style="display:flex;align-items:flex-end;gap:8px;height:160px;">
          ${monthStats.map(s => `
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
              <div style="width:100%;display:flex;gap:2px;align-items:flex-end;justify-content:center;height:120px;">
                <div style="width:45%;background:#10b981;border-radius:4px 4px 0 0;height:${Math.round((s.done/maxVal)*100)}%;min-height:4px;" title="${s.done} concluídas"></div>
                <div style="width:45%;background:#ef4444;border-radius:4px 4px 0 0;height:${Math.round((s.overdue/maxVal)*100)}%;min-height:4px;" title="${s.overdue} em atraso"></div>
              </div>
              <div style="font-size:10px;color:var(--text-secondary);">${s.label}</div>
            </div>
          `).join('')}
        </div>
        <div style="display:flex;gap:16px;margin-top:12px;font-size:11px;">
          <div style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;background:#10b981;border-radius:2px;display:inline-block;"></span>Concluídas</div>
          <div style="display:flex;align-items:center;gap:4px;"><span style="width:10px;height:10px;background:#ef4444;border-radius:2px;display:inline-block;"></span>Em atraso</div>
        </div>
      </div>
    </div>
  `;
}

// ---- TAB: Clientes ----
function renderClientes(container, member) {
  const managedClients = allClients.filter(c => c.assigned_manager_id === member.id);

  container.innerHTML = `
    <div>
      <h4 style="font-size:14px;font-weight:700;margin-bottom:16px;">Clientes Gerenciados (${managedClients.length})</h4>
      ${managedClients.length === 0
        ? `<div style="text-align:center;padding:40px;color:var(--text-secondary);">🏢 Nenhum cliente atribuído a este membro.</div>`
        : `
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${managedClients.map(c => `
              <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:#f9fafb;border-radius:8px;border:1px solid var(--border);">
                <div style="width:40px;height:40px;border-radius:8px;background:var(--primary-light);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">🏢</div>
                <div style="flex:1;">
                  <div style="font-size:13px;font-weight:700;">${sanitize(c.name)}</div>
                  <div style="font-size:11px;color:var(--text-secondary);">${sanitize(c.segment || '—')}</div>
                </div>
                <span class="badge" style="font-size:10px;">${c.status}</span>
              </div>
            `).join('')}
          </div>
        `}
    </div>
  `;
}

// ============================================================
// NEW MEMBER MODAL
// ============================================================
function openMemberModal(member, profile) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal-lg">
      <div class="modal-header">
        <h2 class="modal-title">👤 Novo Membro da Equipe</h2>
        <button class="modal-close" id="close-new-member">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Nome Completo *</label>
            <input type="text" class="form-input" id="nm-name" placeholder="João Silva">
          </div>
          <div class="form-group">
            <label class="form-label">E-mail *</label>
            <input type="email" class="form-input" id="nm-email" placeholder="joao@agencia.com">
          </div>
          <div class="form-group">
            <label class="form-label">Telefone</label>
            <input type="tel" class="form-input" id="nm-phone" placeholder="(11) 99999-9999">
          </div>
          <div class="form-group">
            <label class="form-label">Cargo / Função *</label>
            <input type="text" class="form-input" id="nm-position" placeholder="Designer, Copywriter, etc.">
          </div>
          <div class="form-group">
            <label class="form-label">Data de Admissão</label>
            <input type="date" class="form-input" id="nm-hire">
          </div>
          ${profile?.role === 'master' ? `
            <div class="form-group">
              <label class="form-label">Salário (R$)</label>
              <input type="number" class="form-input" id="nm-salary" step="0.01">
            </div>
          ` : '<div></div>'}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="cancel-new-member">Cancelar</button>
        <button class="btn-primary" id="save-new-member">+ Criar Membro</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('close-new-member').addEventListener('click', () => overlay.remove());
  document.getElementById('cancel-new-member').addEventListener('click', () => overlay.remove());
  document.getElementById('save-new-member').addEventListener('click', async () => {
    const full_name = document.getElementById('nm-name').value.trim();
    const email = document.getElementById('nm-email').value.trim();
    const position = document.getElementById('nm-position').value.trim();
    if (!full_name || !email || !position) {
      showToast('Preencha os campos obrigatórios', 'warning'); return;
    }
    const btn = document.getElementById('save-new-member');
    btn.textContent = 'Criando...'; btn.disabled = true;
    try {
      const data = {
        full_name, email, position,
        phone: document.getElementById('nm-phone').value.trim() || null,
        hire_date: document.getElementById('nm-hire').value || null,
        salary: profile?.role === 'master' ? parseFloat(document.getElementById('nm-salary').value) || null : null,
        is_active: true
      };
      const newMember = await teamDB.create(data);
      allMembers.push(newMember);
      showToast('Membro criado com sucesso!', 'success');
      overlay.remove();
      renderTeamGrid(profile);
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
      btn.textContent = '+ Criar Membro'; btn.disabled = false;
    }
  });
}

// ============================================================
// CREATE LOGIN MODAL
// ============================================================
function showCreateLoginModal(member) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header">
        <h2 class="modal-title">🔐 Criar Acesso ao Sistema</h2>
        <button class="modal-close" id="close-login-modal">✕</button>
      </div>
      <div class="modal-body">
        <div class="alert" style="background:#fffbeb;border:1px solid #fef3c7;border-radius:8px;padding:16px;margin-bottom:16px;">
          <p style="font-size:13px;color:#92400e;font-weight:600;margin-bottom:8px;">⚠️ Como criar acesso para ${sanitize(member.full_name)}:</p>
          <ol style="font-size:13px;color:#78350f;line-height:1.8;padding-left:18px;">
            <li>Acesse o painel do <strong>Supabase</strong> → Authentication → Users</li>
            <li>Clique em <strong>"Invite user"</strong> e insira o e-mail: <strong>${sanitize(member.email || '...')}</strong></li>
            <li>O membro receberá um e-mail para definir a senha</li>
            <li>Após o login, vá em <strong>Configurações → Usuários</strong> e defina a role correta para este membro</li>
          </ol>
          <p style="font-size:12px;color:#92400e;margin-top:8px;">
            Alternativamente, você pode criar via Supabase CLI ou Service Role Key para automação.
          </p>
        </div>
        <div style="background:#f0f9ff;border-radius:8px;padding:14px;font-size:13px;">
          <strong>E-mail do membro:</strong>
          <div style="font-family:monospace;background:white;border-radius:4px;padding:8px 12px;margin-top:6px;border:1px solid #bae6fd;color:#0369a1;">
            ${sanitize(member.email || 'E-mail não cadastrado')}
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-primary" id="close-login-modal-ok">Entendido</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#close-login-modal').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#close-login-modal-ok').addEventListener('click', () => overlay.remove());
}
