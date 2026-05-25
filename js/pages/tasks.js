// ============================================================
// TASKS PAGE — Kanban + Calendar
// ============================================================

import { tasksDB, clientsDB, teamDB, currentUser, currentProfile } from '../supabase.js';
import { TASK_STATUS_LABELS, TASK_PRIORITY_LABELS, MONTHS } from '../config.js';
import {
  formatDate, formatDateTime, timeAgo, renderAvatar,
  showToast, showConfirm, renderEmptyState, sanitize,
  generateId, isOverdue, daysUntil, formatDaysRelative, truncate
} from '../utils.js';

let currentView = 'kanban';
let allTasks = [];
let allClients = [];
let allMembers = [];
let activeFilters = { client: '', assignee: '', priority: '', search: '' };
let draggedTaskId = null;

const COLUMNS = ['briefing', 'production', 'review', 'approval', 'done'];

// ============================================================
// MAIN ENTRY POINT
// ============================================================
export async function renderTasks(container, profile, options = {}) {
  currentView = options.view === 'calendar' ? 'calendar' : 'kanban';

  container.innerHTML = `
    <div id="tasks-root">
      <div class="page-header">
        <div>
          <h1 class="page-title">Tarefas</h1>
          <p style="font-size:13px;color:var(--text-secondary);margin-top:2px;">Gerencie o fluxo de trabalho da equipe</p>
        </div>
        <div class="page-actions">
          ${['master','admin'].includes(profile?.role) ? `
            <button class="btn-secondary btn-sm" id="btn-generate-recurring">⚡ Gerar Recorrentes</button>
          ` : ''}
          <button class="btn-secondary btn-sm" id="btn-toggle-view">
            ${currentView === 'kanban' ? '📅 Ver Calendário' : '📋 Ver Kanban'}
          </button>
          <button class="btn-primary" id="btn-new-task">+ Nova Tarefa</button>
        </div>
      </div>

      <div class="filters-bar" id="tasks-filters">
        <input type="text" class="filter-search" id="filter-search" placeholder="🔍 Buscar tarefas..." value="${sanitize(activeFilters.search)}">
        <select id="filter-client" style="padding:8px 12px;border-radius:8px;border:1px solid var(--border);font-size:13px;background:white;color:var(--text-primary);">
          <option value="">Todos os clientes</option>
        </select>
        <select id="filter-assignee" style="padding:8px 12px;border-radius:8px;border:1px solid var(--border);font-size:13px;background:white;color:var(--text-primary);">
          <option value="">Todos os membros</option>
        </select>
        ${['low','medium','high','urgent'].map(p => {
          const pl = TASK_PRIORITY_LABELS[p];
          return `<button class="filter-chip ${activeFilters.priority === p ? 'active' : ''}" data-priority="${p}" style="${activeFilters.priority === p ? `background:${pl.bg};color:${pl.color};border-color:${pl.color};` : ''}">${pl.label}</button>`;
        }).join('')}
      </div>

      <div id="tasks-view-container" style="margin-top:20px;">
        <div style="text-align:center;padding:60px;color:var(--text-secondary);">
          <div style="font-size:32px;margin-bottom:8px;">⏳</div>
          <div>Carregando tarefas...</div>
        </div>
      </div>
    </div>
  `;

  // Load data
  try {
    [allTasks, allClients, allMembers] = await Promise.all([
      tasksDB.getAll(),
      clientsDB.getAll({ active: true }),
      teamDB.getAll()
    ]);
  } catch (err) {
    console.error('Tasks load error:', err);
    showToast('Erro ao carregar tarefas: ' + err.message, 'error');
    allTasks = []; allClients = []; allMembers = [];
  }

  // Populate filter dropdowns
  const clientSel = document.getElementById('filter-client');
  allClients.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id; opt.textContent = c.name;
    clientSel.appendChild(opt);
  });
  if (activeFilters.client) clientSel.value = activeFilters.client;

  const assigneeSel = document.getElementById('filter-assignee');
  allMembers.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id; opt.textContent = m.full_name;
    assigneeSel.appendChild(opt);
  });
  if (activeFilters.assignee) assigneeSel.value = activeFilters.assignee;

  bindFilterEvents();
  renderView();

  // Event listeners
  document.getElementById('btn-new-task').addEventListener('click', () => openTaskModal(null, profile));
  document.getElementById('btn-toggle-view').addEventListener('click', () => {
    currentView = currentView === 'kanban' ? 'calendar' : 'kanban';
    document.getElementById('btn-toggle-view').textContent =
      currentView === 'kanban' ? '📅 Ver Calendário' : '📋 Ver Kanban';
    renderView();
  });

  const genBtn = document.getElementById('btn-generate-recurring');
  if (genBtn) {
    genBtn.addEventListener('click', () => openGenerateRecurringModal());
  }
}

// ============================================================
// FILTER LOGIC
// ============================================================
function bindFilterEvents() {
  const searchInput = document.getElementById('filter-search');
  let searchTimer;
  searchInput?.addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      activeFilters.search = e.target.value;
      renderView();
    }, 300);
  });

  document.getElementById('filter-client')?.addEventListener('change', e => {
    activeFilters.client = e.target.value;
    renderView();
  });

  document.getElementById('filter-assignee')?.addEventListener('change', e => {
    activeFilters.assignee = e.target.value;
    renderView();
  });

  document.querySelectorAll('[data-priority]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.priority;
      activeFilters.priority = activeFilters.priority === p ? '' : p;
      document.querySelectorAll('[data-priority]').forEach(b => {
        const pl = TASK_PRIORITY_LABELS[b.dataset.priority];
        if (activeFilters.priority === b.dataset.priority) {
          b.classList.add('active');
          b.style.background = pl.bg;
          b.style.color = pl.color;
          b.style.borderColor = pl.color;
        } else {
          b.classList.remove('active');
          b.style.background = '';
          b.style.color = '';
          b.style.borderColor = '';
        }
      });
      renderView();
    });
  });
}

function getFilteredTasks() {
  return allTasks.filter(t => {
    if (activeFilters.client && t.client_id !== activeFilters.client) return false;
    if (activeFilters.assignee && !(t.assigned_to || []).includes(activeFilters.assignee)) return false;
    if (activeFilters.priority && t.priority !== activeFilters.priority) return false;
    if (activeFilters.search) {
      const q = activeFilters.search.toLowerCase();
      if (!(t.title || '').toLowerCase().includes(q) &&
          !(t.client?.name || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

// ============================================================
// VIEW ROUTER
// ============================================================
function renderView() {
  const container = document.getElementById('tasks-view-container');
  if (!container) return;
  if (currentView === 'calendar') {
    renderCalendarView(container);
  } else {
    renderKanbanView(container);
  }
}

// ============================================================
// KANBAN VIEW
// ============================================================
function renderKanbanView(container) {
  const filtered = getFilteredTasks();
  const byStatus = {};
  COLUMNS.forEach(s => { byStatus[s] = []; });
  filtered.forEach(t => {
    if (byStatus[t.status]) byStatus[t.status].push(t);
  });

  container.innerHTML = `
    <div class="kanban-board" id="kanban-board">
      ${COLUMNS.map(status => {
        const sl = TASK_STATUS_LABELS[status];
        const tasks = byStatus[status];
        return `
          <div class="kanban-column" data-status="${status}">
            <div class="kanban-column-header">
              <span>${sl.icon} ${sl.label}</span>
              <span style="background:${sl.bg};color:${sl.color};padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;">${tasks.length}</span>
            </div>
            <div class="kanban-cards" id="col-${status}"
              data-status="${status}"
              ondragover="event.preventDefault();this.classList.add('drag-over')"
              ondragleave="this.classList.remove('drag-over')"
              ondrop="window.__kanbanDrop && window.__kanbanDrop(event, '${status}')">
              ${tasks.length === 0
                ? `<div style="padding:12px;text-align:center;font-size:12px;color:var(--text-secondary);opacity:.6;">Nenhuma tarefa</div>`
                : tasks.map(t => renderKanbanCard(t)).join('')}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Bind drag & drop
  window.__kanbanDrop = async (event, newStatus) => {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    if (!draggedTaskId) return;
    const task = allTasks.find(t => t.id === draggedTaskId);
    if (!task || task.status === newStatus) return;
    try {
      await tasksDB.update(draggedTaskId, { status: newStatus });
      task.status = newStatus;
      showToast(`Tarefa movida para ${TASK_STATUS_LABELS[newStatus].label}`, 'success');
      renderView();
    } catch (err) {
      showToast('Erro ao mover tarefa: ' + err.message, 'error');
    }
    draggedTaskId = null;
  };

  // Bind card clicks
  container.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('click', () => {
      const taskId = card.dataset.taskId;
      const task = allTasks.find(t => t.id === taskId);
      if (task) openTaskDetail(task, currentProfile);
    });
    card.addEventListener('dragstart', e => {
      draggedTaskId = card.dataset.taskId;
      card.style.opacity = '0.5';
    });
    card.addEventListener('dragend', () => {
      card.style.opacity = '';
      document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });
  });
}

function renderKanbanCard(task) {
  const pl = TASK_PRIORITY_LABELS[task.priority] || TASK_PRIORITY_LABELS.medium;
  const overdue = isOverdue(task.due_date) && !['done','cancelled'].includes(task.status);
  const checklist = Array.isArray(task.checklist) ? task.checklist : [];
  const done = checklist.filter(i => i.done).length;
  const total = checklist.length;
  const assignees = Array.isArray(task.assigned_to) ? task.assigned_to : [];
  const memberMap = Object.fromEntries(allMembers.map(m => [m.id, m]));

  return `
    <div class="kanban-card" data-task-id="${task.id}" draggable="true" style="cursor:pointer;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:8px;">
        <div class="kanban-card-title">${sanitize(task.title)}</div>
        <span class="badge" style="background:${pl.bg};color:${pl.color};white-space:nowrap;flex-shrink:0;font-size:10px;">${pl.label}</span>
      </div>
      ${task.client?.name ? `<div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">🏢 ${sanitize(task.client.name)}</div>` : ''}
      <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;">
        <div style="display:flex;align-items:center;gap:4px;">
          ${assignees.slice(0,3).map(id => {
            const m = memberMap[id];
            return m ? renderAvatar({ full_name: m.full_name, avatar_url: m.avatar_url }, 22) : '';
          }).join('')}
          ${assignees.length > 3 ? `<span style="font-size:10px;color:var(--text-secondary);">+${assignees.length - 3}</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          ${total > 0 ? `<span style="font-size:10px;color:var(--text-secondary);">✓ ${done}/${total}</span>` : ''}
          ${task.due_date ? `
            <span style="font-size:10px;font-weight:600;color:${overdue ? '#ef4444' : 'var(--text-secondary)'};">
              ${overdue ? '🔴 ' : '📅 '}${formatDate(task.due_date)}
            </span>
          ` : ''}
        </div>
      </div>
      ${total > 0 ? `
        <div class="progress" style="margin-top:8px;height:3px;">
          <div class="progress-bar" style="width:${Math.round(done/total*100)}%;background:${done===total?'#10b981':'#6366f1'};"></div>
        </div>
      ` : ''}
    </div>
  `;
}

// ============================================================
// CALENDAR VIEW
// ============================================================
let calendarMonth = new Date().getMonth() + 1;
let calendarYear = new Date().getFullYear();

function renderCalendarView(container) {
  const filtered = getFilteredTasks();
  const tasksByDate = {};
  filtered.forEach(t => {
    const d = t.scheduled_date || t.due_date;
    if (d) {
      const key = d.split('T')[0];
      if (!tasksByDate[key]) tasksByDate[key] = [];
      tasksByDate[key].push(t);
    }
  });

  const firstDay = new Date(calendarYear, calendarMonth - 1, 1).getDay();
  const daysInMonth = new Date(calendarYear, calendarMonth, 0).getDate();
  const today = new Date().toISOString().split('T')[0];

  let cells = '';
  const dayNames = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const headers = dayNames.map(d => `<div style="font-size:11px;font-weight:700;color:var(--text-secondary);padding:8px;text-align:center;">${d}</div>`).join('');

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    cells += `<div style="min-height:100px;background:#f9fafb;border-radius:8px;"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${calendarYear}-${String(calendarMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const dayTasks = tasksByDate[dateStr] || [];
    const isToday = dateStr === today;

    cells += `
      <div style="min-height:100px;border:1px solid ${isToday ? '#6366f1' : 'var(--border)'};border-radius:8px;padding:6px;background:${isToday ? '#f0f1ff' : 'white'};">
        <div style="font-size:12px;font-weight:${isToday?'800':'600'};color:${isToday?'#6366f1':'var(--text-primary)'};margin-bottom:4px;">${day}</div>
        ${dayTasks.slice(0,3).map(t => {
          const sl = TASK_STATUS_LABELS[t.status];
          return `
            <div class="task-cal-event" data-task-id="${t.id}"
              style="font-size:10px;padding:2px 6px;border-radius:4px;margin-bottom:2px;
                background:${sl.bg};color:${sl.color};cursor:pointer;
                white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
              title="${sanitize(t.title)}">
              ${sanitize(truncate(t.title, 20))}
            </div>`;
        }).join('')}
        ${dayTasks.length > 3 ? `<div style="font-size:10px;color:var(--text-secondary);">+${dayTasks.length - 3} mais</div>` : ''}
      </div>
    `;
  }

  container.innerHTML = `
    <div class="card" style="padding:20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <button class="btn-secondary btn-sm" id="cal-prev">← Anterior</button>
        <h2 style="font-size:16px;font-weight:700;">${MONTHS[calendarMonth-1]} ${calendarYear}</h2>
        <button class="btn-secondary btn-sm" id="cal-next">Próximo →</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:4px;">
        ${headers}
      </div>
      <div id="cal-grid" style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;">
        ${cells}
      </div>
    </div>
  `;

  document.getElementById('cal-prev')?.addEventListener('click', () => {
    calendarMonth--;
    if (calendarMonth < 1) { calendarMonth = 12; calendarYear--; }
    renderCalendarView(container);
  });
  document.getElementById('cal-next')?.addEventListener('click', () => {
    calendarMonth++;
    if (calendarMonth > 12) { calendarMonth = 1; calendarYear++; }
    renderCalendarView(container);
  });

  container.querySelectorAll('.task-cal-event').forEach(el => {
    el.addEventListener('click', () => {
      const task = allTasks.find(t => t.id === el.dataset.taskId);
      if (task) openTaskDetail(task, currentProfile);
    });
  });
}

// ============================================================
// NEW / EDIT TASK MODAL
// ============================================================
function openTaskModal(task = null, profile) {
  const isEdit = !!task;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const assignedIds = task?.assigned_to || [];
  const checklist = Array.isArray(task?.checklist) ? task.checklist : [];

  overlay.innerHTML = `
    <div class="modal modal-lg">
      <div class="modal-header">
        <h2 class="modal-title">${isEdit ? 'Editar Tarefa' : 'Nova Tarefa'}</h2>
        <button class="modal-close" id="close-task-modal">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="form-group" style="grid-column:1/-1;">
            <label class="form-label">Título *</label>
            <input type="text" class="form-input" id="task-title" value="${sanitize(task?.title || '')}" placeholder="Título da tarefa">
          </div>
          <div class="form-group" style="grid-column:1/-1;">
            <label class="form-label">Descrição</label>
            <textarea class="form-textarea" id="task-desc" rows="3" placeholder="Descreva a tarefa...">${sanitize(task?.description || '')}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Cliente</label>
            <select class="form-select" id="task-client">
              <option value="">Selecionar cliente...</option>
              ${allClients.map(c => `<option value="${c.id}" ${task?.client_id === c.id ? 'selected' : ''}>${sanitize(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Tipo</label>
            <select class="form-select" id="task-type">
              <option value="briefing" ${task?.type === 'briefing' ? 'selected' : ''}>Briefing</option>
              <option value="recurring" ${task?.type === 'recurring' ? 'selected' : ''}>Recorrente</option>
              <option value="internal" ${task?.type === 'internal' ? 'selected' : ''}>Interno</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Status</label>
            <select class="form-select" id="task-status">
              ${Object.entries(TASK_STATUS_LABELS).filter(([k]) => k !== 'cancelled').map(([k,v]) =>
                `<option value="${k}" ${(task?.status || 'briefing') === k ? 'selected' : ''}>${v.label}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Prioridade</label>
            <select class="form-select" id="task-priority">
              ${Object.entries(TASK_PRIORITY_LABELS).map(([k,v]) =>
                `<option value="${k}" ${(task?.priority || 'medium') === k ? 'selected' : ''}>${v.label}</option>`
              ).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Data de Entrega</label>
            <input type="date" class="form-input" id="task-due" value="${task?.due_date || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Data Agendada</label>
            <input type="date" class="form-input" id="task-scheduled" value="${task?.scheduled_date || ''}">
          </div>
          <div class="form-group" style="grid-column:1/-1;">
            <label class="form-label">Responsáveis</label>
            <div style="border:1px solid var(--border);border-radius:8px;padding:12px;max-height:160px;overflow-y:auto;background:white;">
              ${allMembers.map(m => `
                <label style="display:flex;align-items:center;gap:8px;padding:4px;cursor:pointer;">
                  <input type="checkbox" value="${m.id}" ${assignedIds.includes(m.id) ? 'checked' : ''} class="assignee-cb">
                  ${renderAvatar({ full_name: m.full_name, avatar_url: m.avatar_url }, 24)}
                  <span style="font-size:13px;">${sanitize(m.full_name)}</span>
                </label>
              `).join('')}
            </div>
          </div>
          <div class="form-group" style="grid-column:1/-1;">
            <label class="form-label" style="display:flex;align-items:center;gap:10px;">
              <input type="checkbox" id="task-recurring" ${task?.is_recurring ? 'checked' : ''}>
              Tarefa Recorrente
            </label>
            <div id="recurrence-field" style="display:${task?.is_recurring ? 'block' : 'none'};margin-top:8px;">
              <label class="form-label">Dia do Mês para Recorrência</label>
              <input type="number" class="form-input" id="task-recurrence-day" min="1" max="28" value="${task?.recurrence_day || 1}">
              <p class="form-hint">Este dia será usado ao gerar tarefas mensais automaticamente.</p>
            </div>
          </div>
        </div>

        <!-- Checklist Builder -->
        <div style="margin-top:16px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <label class="form-label" style="margin:0;">Checklist</label>
            <button class="btn-secondary btn-sm" id="add-checklist-item" type="button">+ Adicionar Item</button>
          </div>
          <div id="checklist-items">
            ${checklist.map((item, i) => renderChecklistEditorItem(item.text || item, i)).join('')}
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="cancel-task-modal">Cancelar</button>
        <button class="btn-primary" id="save-task-modal">${isEdit ? 'Salvar Alterações' : 'Criar Tarefa'}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('task-recurring').addEventListener('change', e => {
    document.getElementById('recurrence-field').style.display = e.target.checked ? 'block' : 'none';
  });

  document.getElementById('add-checklist-item').addEventListener('click', () => {
    const container = document.getElementById('checklist-items');
    const idx = container.querySelectorAll('.checklist-editor-item').length;
    const div = document.createElement('div');
    div.innerHTML = renderChecklistEditorItem('', idx);
    container.appendChild(div.firstElementChild);
    container.querySelector(`.checklist-editor-item:last-child input[type=text]`)?.focus();
  });

  overlay.addEventListener('click', e => {
    if (e.target.classList.contains('remove-checklist-item')) {
      e.target.closest('.checklist-editor-item')?.remove();
    }
  });

  const closeModal = () => overlay.remove();
  document.getElementById('close-task-modal').addEventListener('click', closeModal);
  document.getElementById('cancel-task-modal').addEventListener('click', closeModal);

  document.getElementById('save-task-modal').addEventListener('click', async () => {
    const title = document.getElementById('task-title').value.trim();
    if (!title) { showToast('Informe o título da tarefa', 'warning'); return; }

    const assignedTo = [...document.querySelectorAll('.assignee-cb:checked')].map(cb => cb.value);
    const checklistItems = [...document.querySelectorAll('.checklist-editor-item input[type=text]')]
      .map(inp => inp.value.trim()).filter(Boolean)
      .map(text => ({ text, done: false }));

    const data = {
      title,
      description: document.getElementById('task-desc').value.trim(),
      client_id: document.getElementById('task-client').value || null,
      type: document.getElementById('task-type').value,
      status: document.getElementById('task-status').value,
      priority: document.getElementById('task-priority').value,
      due_date: document.getElementById('task-due').value || null,
      scheduled_date: document.getElementById('task-scheduled').value || null,
      assigned_to: assignedTo,
      is_recurring: document.getElementById('task-recurring').checked,
      recurrence_day: document.getElementById('task-recurring').checked
        ? parseInt(document.getElementById('task-recurrence-day').value) : null,
      checklist: checklistItems,
      created_by: currentUser?.id
    };

    const btn = document.getElementById('save-task-modal');
    btn.textContent = 'Salvando...'; btn.disabled = true;
    try {
      if (isEdit) {
        await tasksDB.update(task.id, data);
        const idx = allTasks.findIndex(t => t.id === task.id);
        if (idx !== -1) allTasks[idx] = { ...allTasks[idx], ...data };
        showToast('Tarefa atualizada!', 'success');
      } else {
        const newTask = await tasksDB.create(data);
        const client = allClients.find(c => c.id === data.client_id);
        allTasks.unshift({ ...newTask, client: client ? { id: client.id, name: client.name } : null });
        showToast('Tarefa criada!', 'success');
      }
      closeModal();
      renderView();
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
      btn.textContent = isEdit ? 'Salvar Alterações' : 'Criar Tarefa';
      btn.disabled = false;
    }
  });
}

function renderChecklistEditorItem(text, idx) {
  return `
    <div class="checklist-editor-item" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
      <input type="text" class="form-input" style="flex:1;" value="${sanitize(text)}" placeholder="Item da checklist...">
      <button class="btn-danger btn-sm remove-checklist-item" type="button">✕</button>
    </div>
  `;
}

// ============================================================
// TASK DETAIL MODAL
// ============================================================
async function openTaskDetail(task, profile) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal-xl">
      <div class="modal-header">
        <h2 class="modal-title">📋 Detalhes da Tarefa</h2>
        <div style="display:flex;gap:8px;">
          <button class="btn-secondary btn-sm" id="btn-edit-task">✏️ Editar</button>
          <button class="modal-close" id="close-detail-modal">✕</button>
        </div>
      </div>
      <div class="modal-body" id="task-detail-content">
        <div style="text-align:center;padding:40px;">⏳ Carregando...</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('close-detail-modal').addEventListener('click', () => overlay.remove());
  document.getElementById('btn-edit-task').addEventListener('click', () => {
    overlay.remove();
    openTaskModal(task, profile);
  });

  try {
    const fullTask = await tasksDB.getById(task.id);
    renderTaskDetailContent(fullTask, profile, overlay);
  } catch (err) {
    document.getElementById('task-detail-content').innerHTML =
      `<div style="color:#ef4444;padding:20px;">Erro ao carregar: ${sanitize(err.message)}</div>`;
  }
}

function renderTaskDetailContent(task, profile, overlay) {
  const pl = TASK_PRIORITY_LABELS[task.priority] || TASK_PRIORITY_LABELS.medium;
  const sl = TASK_STATUS_LABELS[task.status] || {};
  const overdue = isOverdue(task.due_date) && !['done','cancelled'].includes(task.status);
  const checklist = Array.isArray(task.checklist) ? task.checklist : [];
  const comments = Array.isArray(task.task_comments) ? task.task_comments : [];
  const revisions = Array.isArray(task.task_revisions) ? task.task_revisions : [];
  const assignees = Array.isArray(task.assigned_to) ? task.assigned_to : [];
  const memberMap = Object.fromEntries(allMembers.map(m => [m.id, m]));
  const done = checklist.filter(i => i.done).length;

  const canApprove = ['master','admin','manager'].includes(profile?.role);
  const canSubmit = profile?.role === 'collaborator' || canApprove;

  document.getElementById('task-detail-content').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 320px;gap:24px;">
      <!-- Left column -->
      <div>
        <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:16px;">
          <div style="flex:1;">
            <h3 style="font-size:18px;font-weight:700;margin-bottom:6px;">${sanitize(task.title)}</h3>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span class="badge" style="background:${sl.bg};color:${sl.color};">${sl.icon} ${sl.label}</span>
              <span class="badge" style="background:${pl.bg};color:${pl.color};">${pl.label}</span>
              ${task.client?.name ? `<span class="badge" style="background:#f0f9ff;color:#0ea5e9;">🏢 ${sanitize(task.client.name)}</span>` : ''}
            </div>
          </div>
        </div>

        ${task.description ? `
          <div style="background:#f9fafb;border-radius:8px;padding:14px;margin-bottom:16px;font-size:13px;line-height:1.7;color:var(--text-secondary);">
            ${sanitize(task.description)}
          </div>
        ` : ''}

        <!-- Checklist -->
        ${checklist.length > 0 ? `
          <div style="margin-bottom:20px;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
              <h4 style="font-size:14px;font-weight:700;">Checklist <span style="font-weight:400;color:var(--text-secondary);">(${done}/${checklist.length})</span></h4>
            </div>
            <div class="progress progress-labeled" style="margin-bottom:12px;">
              <div class="progress-bar" style="width:${checklist.length > 0 ? Math.round(done/checklist.length*100) : 0}%;"></div>
            </div>
            <div id="task-checklist-items">
              ${checklist.map((item, i) => `
                <label style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:6px;cursor:pointer;transition:background .15s;" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background=''">
                  <input type="checkbox" data-idx="${i}" class="check-item" ${item.done ? 'checked' : ''} style="width:16px;height:16px;cursor:pointer;">
                  <span style="font-size:13px;${item.done ? 'text-decoration:line-through;color:var(--text-secondary);' : ''}">${sanitize(item.text)}</span>
                </label>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Status actions -->
        <div id="task-status-actions" style="margin-bottom:20px;">
          ${renderStatusActions(task, profile)}
        </div>

        <!-- Comments -->
        <div>
          <h4 style="font-size:14px;font-weight:700;margin-bottom:12px;">Comentários (${comments.length})</h4>
          <div id="comments-list" style="margin-bottom:14px;">
            ${comments.length === 0
              ? `<p style="font-size:13px;color:var(--text-secondary);">Nenhum comentário ainda.</p>`
              : comments.map(c => `
                <div style="display:flex;gap:10px;margin-bottom:12px;">
                  ${renderAvatar(c.user, 32)}
                  <div style="flex:1;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
                      <span style="font-size:12px;font-weight:700;">${sanitize(c.user?.full_name || 'Usuário')}</span>
                      <span style="font-size:11px;color:var(--text-secondary);">${timeAgo(c.created_at)}</span>
                    </div>
                    <div style="font-size:13px;background:#f9fafb;border-radius:8px;padding:10px;line-height:1.5;">${sanitize(c.content)}</div>
                  </div>
                </div>
              `).join('')}
          </div>
          <div style="display:flex;gap:8px;">
            <textarea id="new-comment" class="form-textarea" rows="2" placeholder="Escrever comentário..." style="flex:1;resize:none;"></textarea>
            <button class="btn-primary btn-sm" id="send-comment" style="align-self:flex-end;">Enviar</button>
          </div>
        </div>
      </div>

      <!-- Right column -->
      <div>
        <div class="card" style="padding:16px;margin-bottom:16px;">
          <h4 style="font-size:13px;font-weight:700;margin-bottom:12px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;">Detalhes</h4>
          <div style="display:flex;flex-direction:column;gap:10px;font-size:13px;">
            <div style="display:flex;justify-content:space-between;">
              <span style="color:var(--text-secondary);">Data de Entrega</span>
              <span style="font-weight:600;color:${overdue ? '#ef4444' : 'var(--text-primary)'};">
                ${task.due_date ? formatDate(task.due_date) : '—'}
                ${overdue ? ' 🔴' : ''}
              </span>
            </div>
            <div style="display:flex;justify-content:space-between;">
              <span style="color:var(--text-secondary);">Data Agendada</span>
              <span style="font-weight:600;">${task.scheduled_date ? formatDate(task.scheduled_date) : '—'}</span>
            </div>
            <div style="display:flex;justify-content:space-between;">
              <span style="color:var(--text-secondary);">Tipo</span>
              <span style="font-weight:600;text-transform:capitalize;">${task.type || '—'}</span>
            </div>
            <div style="display:flex;justify-content:space-between;">
              <span style="color:var(--text-secondary);">Criado por</span>
              <span style="font-weight:600;">${sanitize(task.creator?.full_name || '—')}</span>
            </div>
          </div>
        </div>

        <!-- Assignees -->
        <div class="card" style="padding:16px;margin-bottom:16px;">
          <h4 style="font-size:13px;font-weight:700;margin-bottom:12px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;">Responsáveis</h4>
          ${assignees.length === 0
            ? `<p style="font-size:13px;color:var(--text-secondary);">Nenhum responsável.</p>`
            : assignees.map(id => {
              const m = memberMap[id];
              return m ? `
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                  ${renderAvatar({ full_name: m.full_name, avatar_url: m.avatar_url }, 28)}
                  <span style="font-size:13px;">${sanitize(m.full_name)}</span>
                </div>
              ` : '';
            }).join('')}
        </div>

        <!-- Revision History -->
        ${revisions.length > 0 ? `
          <div class="card" style="padding:16px;">
            <h4 style="font-size:13px;font-weight:700;margin-bottom:12px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;">Histórico de Revisões</h4>
            ${revisions.map(r => {
              const rs = TASK_STATUS_LABELS[r.status] || {};
              return `
                <div style="border-left:3px solid ${rs.color || '#e5e7eb'};padding-left:10px;margin-bottom:10px;">
                  <div style="font-size:11px;font-weight:700;color:${rs.color};">v${r.version} — ${rs.label || r.status}</div>
                  ${r.feedback ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:3px;">${sanitize(r.feedback)}</div>` : ''}
                  <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">${formatDateTime(r.created_at)}</div>
                </div>
              `;
            }).join('')}
          </div>
        ` : ''}
      </div>
    </div>
  `;

  // Checklist toggle
  document.querySelectorAll('.check-item').forEach(cb => {
    cb.addEventListener('change', async () => {
      const idx = parseInt(cb.dataset.idx);
      checklist[idx].done = cb.checked;
      const label = cb.closest('label');
      const span = label.querySelector('span');
      if (cb.checked) {
        span.style.textDecoration = 'line-through';
        span.style.color = 'var(--text-secondary)';
      } else {
        span.style.textDecoration = '';
        span.style.color = '';
      }
      try {
        await tasksDB.update(task.id, { checklist });
        const t = allTasks.find(t => t.id === task.id);
        if (t) t.checklist = checklist;
      } catch (err) {
        showToast('Erro ao salvar: ' + err.message, 'error');
      }
    });
  });

  // Send comment
  document.getElementById('send-comment')?.addEventListener('click', async () => {
    const content = document.getElementById('new-comment').value.trim();
    if (!content) return;
    try {
      const comment = await tasksDB.addComment(task.id, currentUser?.id, content);
      document.getElementById('new-comment').value = '';
      const list = document.getElementById('comments-list');
      const div = document.createElement('div');
      div.innerHTML = `
        <div style="display:flex;gap:10px;margin-bottom:12px;">
          ${renderAvatar(comment.user, 32)}
          <div style="flex:1;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
              <span style="font-size:12px;font-weight:700;">${sanitize(comment.user?.full_name || 'Você')}</span>
              <span style="font-size:11px;color:var(--text-secondary);">agora</span>
            </div>
            <div style="font-size:13px;background:#f9fafb;border-radius:8px;padding:10px;line-height:1.5;">${sanitize(content)}</div>
          </div>
        </div>
      `;
      if (list.querySelector('p')) list.innerHTML = '';
      list.appendChild(div.firstElementChild);
    } catch (err) {
      showToast('Erro ao comentar: ' + err.message, 'error');
    }
  });

  // Status action buttons
  bindStatusActionEvents(task, profile, overlay);
}

function renderStatusActions(task, profile) {
  const isCollaborator = profile?.role === 'collaborator';
  const canApprove = ['master','admin','manager'].includes(profile?.role);
  const s = task.status;
  const buttons = [];

  if (isCollaborator || canApprove) {
    if (s === 'production') {
      buttons.push(`<button class="btn-primary btn-sm" data-action="submit-review">📤 Enviar para Revisão</button>`);
    }
  }
  if (canApprove) {
    if (s === 'review') {
      buttons.push(`<button class="btn-primary btn-sm" data-action="submit-approval">✔️ Enviar para Aprovação</button>`);
      buttons.push(`<button class="btn-danger btn-sm" data-action="reject">❌ Rejeitar</button>`);
    }
    if (s === 'approval') {
      buttons.push(`<button class="btn-primary btn-sm" data-action="approve">✅ Aprovar / Concluir</button>`);
      buttons.push(`<button class="btn-danger btn-sm" data-action="reject">❌ Rejeitar</button>`);
      buttons.push(`<button class="btn-secondary btn-sm" data-action="generate-approval-link">🔗 Link p/ Cliente</button>`);
    }
    if (s === 'briefing') {
      buttons.push(`<button class="btn-secondary btn-sm" data-action="start-production">▶️ Iniciar Produção</button>`);
    }
  }

  if (!buttons.length) return '';

  return `
    <div style="background:#f9fafb;border-radius:10px;padding:14px;">
      <p style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">Ações de Status</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">${buttons.join('')}</div>
      <div id="reject-feedback-area" style="display:none;margin-top:10px;">
        <textarea class="form-textarea" id="reject-feedback" rows="2" placeholder="Feedback de rejeição (obrigatório)..."></textarea>
        <button class="btn-danger btn-sm" id="confirm-reject" style="margin-top:8px;">Confirmar Rejeição</button>
      </div>
    </div>
  `;
}

function bindStatusActionEvents(task, profile, overlay) {
  const actionsEl = document.getElementById('task-status-actions');
  if (!actionsEl) return;

  actionsEl.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'reject') {
      document.getElementById('reject-feedback-area').style.display = 'block';
      return;
    }

    if (action === 'generate-approval-link') {
      openApprovalBatchModal(task, profile);
      return;
    }

    const statusMap = {
      'start-production': 'production',
      'submit-review': 'review',
      'submit-approval': 'approval',
      'approve': 'done'
    };

    if (statusMap[action]) {
      try {
        await tasksDB.update(task.id, { status: statusMap[action] });
        await tasksDB.addRevision(task.id, statusMap[action], null, currentUser?.id);
        task.status = statusMap[action];
        const t = allTasks.find(t => t.id === task.id);
        if (t) t.status = statusMap[action];
        showToast('Status atualizado!', 'success');
        overlay.remove();
        renderView();
      } catch (err) {
        showToast('Erro: ' + err.message, 'error');
      }
    }
  });

  document.getElementById('confirm-reject')?.addEventListener('click', async () => {
    const feedback = document.getElementById('reject-feedback')?.value.trim();
    if (!feedback) { showToast('Informe o feedback de rejeição', 'warning'); return; }
    try {
      await tasksDB.update(task.id, { status: 'production' });
      await tasksDB.addRevision(task.id, 'production', feedback, currentUser?.id);
      task.status = 'production';
      const t = allTasks.find(t => t.id === task.id);
      if (t) t.status = 'production';
      showToast('Tarefa rejeitada — voltou para produção', 'warning');
      overlay.remove();
      renderView();
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
    }
  });
}

// ============================================================
// GENERATE RECURRING MODAL
// ============================================================
function openGenerateRecurringModal() {
  const now = new Date();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal-sm">
      <div class="modal-header">
        <h2 class="modal-title">⚡ Gerar Tarefas Recorrentes</h2>
        <button class="modal-close" id="close-gen-modal">✕</button>
      </div>
      <div class="modal-body">
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">
          Gera automaticamente todas as tarefas recorrentes ativas para o mês selecionado.
        </p>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">Mês</label>
            <select class="form-select" id="gen-month">
              ${MONTHS.map((m,i) => `<option value="${i+1}" ${i+1 === now.getMonth()+1 ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Ano</label>
            <input type="number" class="form-input" id="gen-year" value="${now.getFullYear()}" min="2020" max="2035">
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="cancel-gen-modal">Cancelar</button>
        <button class="btn-primary" id="confirm-gen-modal">⚡ Gerar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('close-gen-modal').addEventListener('click', () => overlay.remove());
  document.getElementById('cancel-gen-modal').addEventListener('click', () => overlay.remove());
  document.getElementById('confirm-gen-modal').addEventListener('click', async () => {
    const month = parseInt(document.getElementById('gen-month').value);
    const year = parseInt(document.getElementById('gen-year').value);
    const btn = document.getElementById('confirm-gen-modal');
    btn.textContent = 'Gerando...'; btn.disabled = true;
    try {
      const count = await tasksDB.generateRecurring(month, year);
      showToast(`${count} tarefas geradas para ${MONTHS[month-1]}/${year}!`, 'success');
      overlay.remove();
      renderView();
    } catch(err) {
      showToast('Erro: ' + err.message, 'error');
      btn.textContent = '⚡ Gerar'; btn.disabled = false;
    }
  });
}

// ============================================================
// APPROVAL BATCH MODAL — Gerar Link para Cliente
// ============================================================
async function openApprovalBatchModal(task, profile) {
  const client = allClients.find(c => c.id === task.client_id);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal-sm" style="max-width:480px;">
      <div class="modal-header" style="background:linear-gradient(135deg,#1A0530,#4A1070);border-radius:12px 12px 0 0;">
        <h2 class="modal-title" style="color:#EFC219;">🔗 Link de Aprovação</h2>
        <button class="modal-close" id="close-appr" style="color:rgba(255,255,255,.6);">✕</button>
      </div>
      <div class="modal-body" style="padding:24px;">
        <div style="text-align:center;padding:20px;color:var(--text-secondary);">⏳ Gerando link...</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#close-appr').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  try {
    const { supabase } = await import('../supabase.js');
    const now = new Date();

    const { data: batch, error: batchErr } = await supabase
      .from('content_approval_batches')
      .insert({
        client_id: task.client_id,
        title: `Aprovação — ${task.title}`,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        created_by: profile?.id || null
      })
      .select()
      .single();
    if (batchErr) throw batchErr;

    await supabase.from('content_approval_items').insert({
      batch_id: batch.id,
      task_id: task.id,
      title: task.title,
      description: task.description || null,
      platform: task.platforms?.[0] || 'other',
      media_url: task.reference_url || null,
      caption: task.brief || null,
      scheduled_date: task.due_date || null
    });

    const link = `${window.location.origin}/approval.html?token=${batch.token}`;
    const phone = (client?.whatsapp || client?.phone || '').replace(/\D/g, '');
    const msgText =
      `Olá, ${client?.contact_name || client?.name || 'cliente'}! Seus conteúdos estão prontos para aprovação.\n\n` +
      `Acesse o link para revisar e aprovar:\n${link}\n\n` +
      `Qualquer dúvida, estamos à disposição!`;
    const waLink = phone
      ? `https://wa.me/55${phone}?text=${encodeURIComponent(msgText)}`
      : `https://wa.me/?text=${encodeURIComponent(msgText)}`;

    overlay.querySelector('.modal-body').innerHTML = `
      <div style="margin-bottom:16px;">
        <div style="font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">Link de Aprovação</div>
        <div style="display:flex;gap:8px;align-items:center;">
          <input type="text" id="approval-link-input" value="${link}" readonly
            style="flex:1;padding:10px 12px;border-radius:8px;border:1.5px solid var(--primary);font-size:12px;background:#f9f6ff;color:var(--primary);font-weight:600;">
          <button id="btn-copy-link" class="btn-secondary btn-sm">Copiar</button>
        </div>
        <div style="font-size:11px;color:var(--text-secondary);margin-top:6px;">Válido por 30 dias. O cliente não precisa fazer login.</div>
      </div>
      <div style="background:var(--surface-2);border-radius:10px;padding:12px;margin-bottom:16px;">
        <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:6px;text-transform:uppercase;">Mensagem pré-formatada</div>
        <div style="font-size:12px;white-space:pre-wrap;line-height:1.6;">${msgText}</div>
      </div>
      ${!phone ? `<div style="font-size:11px;color:#92400e;padding:8px 12px;background:#fffbeb;border-radius:6px;border-left:3px solid #f59e0b;">Nenhum WhatsApp cadastrado para este cliente.</div>` : `<div style="font-size:12px;color:var(--text-secondary);">Enviar para: <strong>+55 ${phone}</strong></div>`}
    `;

    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    footer.style.gap = '8px';
    footer.innerHTML = `
      <button class="btn-secondary" id="close-appr-2">Fechar</button>
      <button id="btn-wa-appr" style="background:#25d366;color:#fff;border:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">
        Enviar WhatsApp
      </button>
    `;
    overlay.querySelector('.modal').appendChild(footer);
    overlay.querySelector('#btn-copy-link').addEventListener('click', () => {
      navigator.clipboard.writeText(link).then(() => showToast('Link copiado!', 'success'));
    });
    overlay.querySelector('#close-appr-2').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#btn-wa-appr').addEventListener('click', () => { window.open(waLink, '_blank'); overlay.remove(); });

  } catch(err) {
    overlay.querySelector('.modal-body').innerHTML = `<div style="color:#ef4444;padding:20px;">Erro ao gerar link: ${err.message}</div>`;
  }
}
