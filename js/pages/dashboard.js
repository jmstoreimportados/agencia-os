// ============================================================
// DASHBOARD PAGE
// Company Dashboard (master/admin) + Collaborator Dashboard
// ============================================================

import { clientsDB, tasksDB, financialDB, logDB } from '../supabase.js';
import { CLIENT_STATUS_LABELS, MONTHS } from '../config.js';
import {
  formatCurrency, formatDate, timeAgo, renderAvatar,
  getHealthColor, showToast, renderEmptyState, sanitize, truncate
} from '../utils.js';

// Track active Chart.js instance so we can destroy before re-render
let mrrChartInstance = null;

// ============================================================
// MAIN ENTRY POINT
// ============================================================
export async function renderDashboard(container, profile, agencyConfig) {
  const isCompany = ['master', 'admin'].includes(profile?.role);

  container.innerHTML = `
    <div id="dashboard-root">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;">
        <div>
          <h1 style="font-size:22px;font-weight:800;color:var(--text-primary);">
            ${isCompany ? 'Dashboard' : 'Meu Painel'}
          </h1>
          <p style="font-size:13px;color:var(--text-secondary);margin-top:2px;">
            ${isCompany
              ? 'Visão geral da agência'
              : `Olá, ${sanitize(profile?.full_name?.split(' ')[0] || 'colaborador')}!`}
          </p>
        </div>
        <button class="btn-primary" id="dash-refresh-btn" style="gap:6px;">
          <span>🔄</span> Atualizar
        </button>
      </div>
      <div id="dashboard-content">
        ${renderLoadingSkeleton(isCompany)}
      </div>
    </div>
  `;

  document.getElementById('dash-refresh-btn').addEventListener('click', () => {
    loadDashboard(container, profile, agencyConfig, isCompany);
  });

  await loadDashboard(container, profile, agencyConfig, isCompany);
}

async function loadDashboard(container, profile, agencyConfig, isCompany) {
  const content = document.getElementById('dashboard-content');
  content.innerHTML = renderLoadingSkeleton(isCompany);

  try {
    if (isCompany) {
      await renderCompanyDashboard(content, profile, agencyConfig);
    } else {
      await renderCollaboratorDashboard(content, profile);
    }
  } catch (err) {
    console.error('Dashboard error:', err);
    content.innerHTML = `
      <div class="card" style="text-align:center;padding:48px;color:var(--text-secondary);">
        <div style="font-size:40px;margin-bottom:12px;">⚠️</div>
        <div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:6px;">Erro ao carregar dashboard</div>
        <div style="font-size:13px;">${sanitize(err.message)}</div>
        <button class="btn-primary" style="margin:20px auto 0;" onclick="window.location.reload()">Tentar novamente</button>
      </div>
    `;
  }
}

// ============================================================
// COMPANY DASHBOARD
// ============================================================
async function renderCompanyDashboard(container, profile, agencyConfig) {
  const [clients, tasks, mrrHistory, recentActivity, npsData, pendingApprovals] = await Promise.all([
    clientsDB.getAll().catch(() => []),
    tasksDB.getAll().catch(() => []),
    financialDB.getMRRHistory(6).catch(() => []),
    logDB.getRecent(20).catch(() => []),
    // NPS dos últimos 3 meses
    (async () => {
      const { supabase } = await import('../supabase.js');
      const now = new Date();
      const { data } = await supabase.from('client_nps').select('score').gte('created_at', new Date(now.getFullYear(), now.getMonth()-2, 1).toISOString());
      return data || [];
    })().catch(() => []),
    // Aprovações pendentes
    (async () => {
      const { supabase } = await import('../supabase.js');
      const { data } = await supabase.from('content_approval_batches').select('id,title,client_id').eq('status','pending').order('created_at', {ascending:false}).limit(10);
      return data || [];
    })().catch(() => [])
  ]);

  const today = new Date().toISOString().split('T')[0];
  const activeClients = clients.filter(c => c.status === 'active');
  const openTasks = tasks.filter(t => !['done', 'cancelled'].includes(t.status));
  const overdueTasks = tasks.filter(t =>
    !['done', 'cancelled'].includes(t.status) && t.due_date && t.due_date < today
  );
  const currentMRR = activeClients.reduce((s, c) => s + (c.monthly_value || 0), 0);
  const atRiskClients = clients.filter(c => c.status === 'at_risk');

  // Weekly agenda: tasks due in next 7 days
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = weekEnd.toISOString().split('T')[0];
  const weeklyTasks = tasks.filter(t =>
    !['done', 'cancelled'].includes(t.status) &&
    t.due_date && t.due_date >= today && t.due_date <= weekEndStr
  ).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 15);

  // NPS médio
  const npsAvg = npsData.length > 0
    ? Math.round(npsData.reduce((s, n) => s + n.score, 0) / npsData.length * 10) / 10
    : null;

  // Smart alerts
  const alerts = buildSmartAlerts(clients, tasks, today, pendingApprovals);

  container.innerHTML = `
    <!-- KPI Cards -->
    <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px;">
      ${renderKPICard('Clientes Ativos', activeClients.length, '✅', 'var(--success)', 'var(--success-light)',
        `${clients.filter(c => c.status === 'onboarding').length} em onboarding`)}
      ${renderKPICard('Tarefas Abertas', openTasks.length, '📋', 'var(--primary)', 'var(--primary-light)',
        `${tasks.filter(t => t.status === 'approval').length} aguardando aprovação`)}
      ${renderKPICard('Tarefas Vencidas', overdueTasks.length, '⚠️',
        overdueTasks.length > 0 ? 'var(--danger)' : 'var(--success)',
        overdueTasks.length > 0 ? 'var(--danger-light)' : 'var(--success-light)',
        overdueTasks.length > 0 ? 'Requerem atenção' : 'Tudo em dia')}
      ${renderKPICard('MRR Atual', formatCurrency(currentMRR), '💰', 'var(--warning)', 'var(--warning-light)',
        `${activeClients.length} contratos ativos`)}
      ${npsAvg !== null
        ? renderKPICard(
            'NPS Médio',
            `${npsAvg}/10`,
            npsAvg >= 8 ? '⭐' : npsAvg >= 6 ? '😐' : '😟',
            npsAvg >= 8 ? 'var(--success)' : npsAvg >= 6 ? 'var(--warning)' : 'var(--danger)',
            npsAvg >= 8 ? 'var(--success-light)' : npsAvg >= 6 ? 'var(--warning-light)' : 'var(--danger-light)',
            `${npsData.length} avaliações (3 meses)`
          )
        : renderKPICard('NPS Médio', '—', '⭐', 'var(--text-secondary)', '#f9fafb', 'Nenhuma avaliação ainda')}
    </div>

    <!-- Row: Health Grid + Smart Alerts -->
    <div style="display:grid;grid-template-columns:1fr 340px;gap:16px;margin-bottom:24px;">
      <!-- Client Health Grid -->
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <h2 style="font-size:15px;font-weight:700;">Health Score dos Clientes</h2>
          <span style="font-size:12px;color:var(--text-muted);">${activeClients.length} ativos</span>
        </div>
        ${renderHealthGrid(activeClients)}
      </div>

      <!-- Smart Alerts -->
      <div class="card">
        <h2 style="font-size:15px;font-weight:700;margin-bottom:16px;">Alertas Inteligentes</h2>
        ${renderSmartAlerts(alerts)}
      </div>
    </div>

    <!-- Row: MRR Chart + Weekly Agenda -->
    <div style="display:grid;grid-template-columns:1fr 380px;gap:16px;margin-bottom:24px;">
      <!-- MRR Chart -->
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <h2 style="font-size:15px;font-weight:700;">Receita Recorrente (MRR)</h2>
          <span style="font-size:12px;color:var(--text-muted);">Últimos 6 meses</span>
        </div>
        <div style="position:relative;height:220px;">
          <canvas id="mrr-chart"></canvas>
        </div>
      </div>

      <!-- Weekly Delivery Agenda -->
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <h2 style="font-size:15px;font-weight:700;">Agenda de Entregas</h2>
          <span style="font-size:12px;color:var(--text-muted);">Próximos 7 dias</span>
        </div>
        ${renderWeeklyAgenda(weeklyTasks)}
      </div>
    </div>

    <!-- Recent Activity Feed -->
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <h2 style="font-size:15px;font-weight:700;">Atividade Recente</h2>
        <span style="font-size:12px;color:var(--text-muted);">Últimas 20 ações</span>
      </div>
      ${renderActivityFeed(recentActivity)}
    </div>
  `;

  // Render MRR Chart
  renderMRRChart(mrrHistory);

  // Bind interactions
  bindCompanyDashboardEvents();
}

function renderKPICard(label, value, icon, color, bg, subtitle) {
  return `
    <div class="card" style="border-left:4px solid ${color};">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;">
        <div>
          <div style="font-size:12px;color:var(--text-secondary);font-weight:500;margin-bottom:6px;">${label}</div>
          <div style="font-size:26px;font-weight:800;color:${color};">${value}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${subtitle}</div>
        </div>
        <div style="width:44px;height:44px;border-radius:12px;background:${bg};display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">
          ${icon}
        </div>
      </div>
    </div>
  `;
}

function renderHealthGrid(clients) {
  if (!clients.length) {
    return renderEmptyState('📊', 'Nenhum cliente ativo', 'Adicione clientes para ver o health score');
  }

  const sorted = [...clients].sort((a, b) => (a.health_score || 0) - (b.health_score || 0));

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;max-height:280px;overflow-y:auto;">
      ${sorted.map(client => {
        const score = client.health_score || 0;
        const health = getHealthColor(score);
        return `
          <div class="health-card" data-client-id="${client.id}"
            style="padding:12px;border-radius:10px;background:${health.bg};border:1px solid ${health.color}22;cursor:pointer;transition:all .15s ease;">
            <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
              title="${sanitize(client.name)}">${sanitize(truncate(client.name, 20))}</div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
              <span style="font-size:18px;font-weight:800;color:${health.color};">${score}</span>
              <span style="font-size:14px;">${health.icon}</span>
            </div>
            <div style="height:4px;background:#e5e7eb;border-radius:4px;overflow:hidden;">
              <div style="height:100%;width:${score}%;background:${health.color};border-radius:4px;transition:width .3s;"></div>
            </div>
            <div style="font-size:10px;color:${health.color};font-weight:500;margin-top:4px;">${health.label}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function buildSmartAlerts(clients, tasks, today, pendingApprovals = []) {
  const alerts = [];

  // Overdue tasks
  const overdue = tasks.filter(t =>
    !['done', 'cancelled'].includes(t.status) && t.due_date && t.due_date < today
  );
  if (overdue.length > 0) {
    alerts.push({
      type: 'danger',
      icon: '🔴',
      title: `${overdue.length} tarefa${overdue.length > 1 ? 's' : ''} vencida${overdue.length > 1 ? 's' : ''}`,
      desc: overdue.slice(0, 2).map(t => truncate(t.title, 30)).join(', ')
    });
  }

  // At-risk clients
  const atRisk = clients.filter(c => c.status === 'at_risk');
  if (atRisk.length > 0) {
    alerts.push({
      type: 'warning',
      icon: '⚠️',
      title: `${atRisk.length} cliente${atRisk.length > 1 ? 's' : ''} em risco`,
      desc: atRisk.slice(0, 2).map(c => c.name).join(', ')
    });
  }

  // Tasks awaiting approval
  const approval = tasks.filter(t => t.status === 'approval');
  if (approval.length > 0) {
    alerts.push({
      type: 'info',
      icon: '✔️',
      title: `${approval.length} tarefa${approval.length > 1 ? 's' : ''} aguardando aprovação`,
      desc: approval.slice(0, 2).map(t => truncate(t.title, 30)).join(', ')
    });
  }

  // Pending approval batches
  if (pendingApprovals.length > 0) {
    alerts.push({
      type: 'info',
      icon: '🔗',
      title: `${pendingApprovals.length} lote${pendingApprovals.length > 1 ? 's' : ''} aguardando resposta do cliente`,
      desc: `${pendingApprovals.length} cliente${pendingApprovals.length > 1 ? 's' : ''} ainda não respondeu à aprovação de conteúdo`
    });
  }

  // Low health score clients
  const lowHealth = clients.filter(c => (c.health_score || 0) < 50 && c.status === 'active');
  if (lowHealth.length > 0) {
    alerts.push({
      type: 'warning',
      icon: '📉',
      title: `${lowHealth.length} cliente${lowHealth.length > 1 ? 's' : ''} com health baixo`,
      desc: lowHealth.slice(0, 2).map(c => c.name).join(', ')
    });
  }

  // Due in 2 days
  const twoDaysLater = new Date();
  twoDaysLater.setDate(twoDaysLater.getDate() + 2);
  const dueSoon = tasks.filter(t =>
    !['done', 'cancelled'].includes(t.status) &&
    t.due_date && t.due_date >= today && t.due_date <= twoDaysLater.toISOString().split('T')[0]
  );
  if (dueSoon.length > 0) {
    alerts.push({
      type: 'info',
      icon: '⏰',
      title: `${dueSoon.length} entrega${dueSoon.length > 1 ? 's' : ''} nos próximos 2 dias`,
      desc: dueSoon.slice(0, 2).map(t => truncate(t.title, 30)).join(', ')
    });
  }

  if (alerts.length === 0) {
    alerts.push({ type: 'success', icon: '✅', title: 'Tudo em ordem!', desc: 'Nenhum alerta crítico no momento.' });
  }

  return alerts;
}

function renderSmartAlerts(alerts) {
  const colorMap = {
    danger: { color: 'var(--danger)', bg: 'var(--danger-light)' },
    warning: { color: 'var(--warning)', bg: 'var(--warning-light)' },
    info: { color: 'var(--info)', bg: 'var(--info-light)' },
    success: { color: 'var(--success)', bg: 'var(--success-light)' }
  };

  return `
    <div style="display:flex;flex-direction:column;gap:8px;max-height:280px;overflow-y:auto;">
      ${alerts.map(a => {
        const c = colorMap[a.type] || colorMap.info;
        return `
          <div style="padding:10px 12px;border-radius:8px;background:${c.bg};border-left:3px solid ${c.color};">
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:16px;">${a.icon}</span>
              <div>
                <div style="font-size:12px;font-weight:600;color:var(--text-primary);">${a.title}</div>
                ${a.desc ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">${sanitize(a.desc)}</div>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderWeeklyAgenda(tasks) {
  if (!tasks.length) {
    return renderEmptyState('📅', 'Sem entregas esta semana', 'Nenhuma tarefa agendada para os próximos 7 dias');
  }

  const grouped = {};
  tasks.forEach(t => {
    const date = t.due_date;
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(t);
  });

  const today = new Date().toISOString().split('T')[0];

  return `
    <div style="display:flex;flex-direction:column;gap:12px;max-height:280px;overflow-y:auto;">
      ${Object.entries(grouped).map(([date, dayTasks]) => {
        const isToday = date === today;
        const d = new Date(date + 'T12:00:00');
        const label = isToday ? 'Hoje' : d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
        return `
          <div>
            <div style="font-size:11px;font-weight:700;color:${isToday ? 'var(--primary)' : 'var(--text-muted)'};
              text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">${label}</div>
            ${dayTasks.map(t => `
              <div class="agenda-task" data-task-id="${t.id}"
                style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;
                  background:var(--surface-2);border:1px solid var(--border);margin-bottom:4px;cursor:pointer;
                  transition:all .15s ease;">
                <div style="width:8px;height:8px;border-radius:50%;flex-shrink:0;
                  background:${isToday ? 'var(--primary)' : 'var(--text-muted)'};">
                </div>
                <div style="flex:1;min-width:0;">
                  <div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    ${sanitize(truncate(t.title, 35))}
                  </div>
                  <div style="font-size:10px;color:var(--text-muted);">
                    ${t.client?.name ? sanitize(t.client.name) : ''}
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderMRRChart(mrrHistory) {
  const canvas = document.getElementById('mrr-chart');
  if (!canvas) return;

  if (mrrChartInstance) {
    mrrChartInstance.destroy();
    mrrChartInstance = null;
  }

  const labels = mrrHistory.map(m => `${MONTHS[m.month - 1].substring(0, 3)}/${String(m.year).slice(-2)}`);
  const values = mrrHistory.map(m => m.total);

  mrrChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'MRR',
        data: values,
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99,102,241,.1)',
        borderWidth: 2.5,
        pointBackgroundColor: '#6366f1',
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(ctx.raw)}`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: v => new Intl.NumberFormat('pt-BR', { notation: 'compact', style: 'currency', currency: 'BRL' }).format(v),
            font: { size: 11 }
          },
          grid: { color: '#f3f4f6' }
        },
        x: {
          ticks: { font: { size: 11 } },
          grid: { display: false }
        }
      }
    }
  });
}

function renderActivityFeed(activities) {
  if (!activities.length) {
    return renderEmptyState('📜', 'Sem atividades', 'As ações do sistema aparecerão aqui');
  }

  const actionLabels = {
    create: { icon: '➕', label: 'criou' },
    update: { icon: '✏️', label: 'atualizou' },
    delete: { icon: '🗑️', label: 'removeu' },
    login: { icon: '🔑', label: 'fez login' },
    status_change: { icon: '🔄', label: 'alterou status de' },
    comment: { icon: '💬', label: 'comentou em' },
    complete: { icon: '✅', label: 'concluiu' }
  };

  return `
    <div style="display:flex;flex-direction:column;gap:1px;">
      ${activities.map(a => {
        const act = actionLabels[a.action] || { icon: '📌', label: a.action };
        return `
          <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);">
            ${renderAvatar(a.user, 32)}
            <div style="flex:1;min-width:0;">
              <div style="font-size:12px;color:var(--text-primary);line-height:1.5;">
                <strong>${sanitize(a.user?.full_name || 'Sistema')}</strong>
                <span style="color:var(--text-secondary);"> ${act.label} </span>
                <span>${sanitize(truncate(a.entity_name || '', 40))}</span>
              </div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">${timeAgo(a.created_at)}</div>
            </div>
            <span style="font-size:16px;">${act.icon}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function bindCompanyDashboardEvents() {
  // Health card clicks → navigate to client
  document.querySelectorAll('.health-card[data-client-id]').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.clientId;
      window.dispatchEvent(new CustomEvent('navigate', { detail: { route: 'client', id } }));
    });
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-2px)';
      card.style.boxShadow = 'var(--shadow)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
      card.style.boxShadow = '';
    });
  });

  // Agenda task clicks → open task detail
  document.querySelectorAll('.agenda-task[data-task-id]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.taskId;
      window.dispatchEvent(new CustomEvent('navigate', { detail: { route: 'tasks', taskId: id } }));
    });
    el.addEventListener('mouseenter', () => {
      el.style.borderColor = 'var(--primary)';
      el.style.background = 'var(--primary-light)';
    });
    el.addEventListener('mouseleave', () => {
      el.style.borderColor = 'var(--border)';
      el.style.background = 'var(--surface-2)';
    });
  });
}

// ============================================================
// COLLABORATOR DASHBOARD
// ============================================================
async function renderCollaboratorDashboard(container, profile) {
  const userId = profile?.id;
  const today = new Date().toISOString().split('T')[0];

  const [allTasks, clients] = await Promise.all([
    tasksDB.getAll({ assigned_to: userId }).catch(() => []),
    clientsDB.getAll().catch(() => [])
  ]);

  const myTasks = allTasks.filter(t =>
    Array.isArray(t.assigned_to) ? t.assigned_to.includes(userId) : t.assigned_to === userId
  );

  const todayTasks = myTasks.filter(t =>
    !['done', 'cancelled'].includes(t.status) &&
    t.due_date === today
  );

  const overdueTasks = myTasks.filter(t =>
    !['done', 'cancelled'].includes(t.status) && t.due_date && t.due_date < today
  );

  const myClients = clients.filter(c => c.assigned_manager_id === userId);

  // Monthly performance (current month)
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const monthTasks = myTasks.filter(t => t.created_at && t.created_at >= monthStart);
  const completedThisMonth = monthTasks.filter(t => t.status === 'done').length;
  const overdueThisMonth = monthTasks.filter(t =>
    t.status !== 'done' && t.due_date && t.due_date < today
  ).length;
  const approvalTasks = monthTasks.filter(t => t.status === 'approval').length;
  const approvalRate = monthTasks.length > 0
    ? Math.round((completedThisMonth / monthTasks.length) * 100)
    : 0;

  // Weekly agenda (my tasks, next 7 days)
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = weekEnd.toISOString().split('T')[0];
  const weeklyTasks = myTasks.filter(t =>
    !['done', 'cancelled'].includes(t.status) &&
    t.due_date && t.due_date >= today && t.due_date <= weekEndStr
  ).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 12);

  container.innerHTML = `
    <!-- Personal KPIs -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:24px;">
      ${renderKPICard('Tarefas Hoje', todayTasks.length, '📋', 'var(--primary)', 'var(--primary-light)',
        `${approvalTasks} aguardando aprovação`)}
      ${renderKPICard('Vencidas', overdueTasks.length, '⚠️',
        overdueTasks.length > 0 ? 'var(--danger)' : 'var(--success)',
        overdueTasks.length > 0 ? 'var(--danger-light)' : 'var(--success-light)',
        overdueTasks.length > 0 ? 'Precisam de atenção' : 'Nenhuma vencida')}
      ${renderKPICard('Concluídas no Mês', completedThisMonth, '✅', 'var(--success)', 'var(--success-light)',
        `Taxa de conclusão: ${approvalRate}%`)}
      ${renderKPICard('Meus Clientes', myClients.length, '👥', 'var(--warning)', 'var(--warning-light)',
        `${myClients.filter(c => c.status === 'active').length} ativos`)}
    </div>

    <!-- Row: Today's Tasks + My Clients -->
    <div style="display:grid;grid-template-columns:1fr 320px;gap:16px;margin-bottom:24px;">
      <!-- Today's Tasks -->
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <h2 style="font-size:15px;font-weight:700;">Minhas Tarefas Hoje</h2>
          <span style="font-size:12px;color:var(--text-muted);">${todayTasks.length} pendente${todayTasks.length !== 1 ? 's' : ''}</span>
        </div>
        ${renderMyTasks(todayTasks, overdueTasks)}
      </div>

      <!-- Assigned Clients -->
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <h2 style="font-size:15px;font-weight:700;">Meus Clientes</h2>
          <span style="font-size:12px;color:var(--text-muted);">${myClients.length}</span>
        </div>
        ${renderMyClients(myClients)}
      </div>
    </div>

    <!-- Weekly Agenda -->
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <h2 style="font-size:15px;font-weight:700;">Minha Agenda Semanal</h2>
        <span style="font-size:12px;color:var(--text-muted);">Próximos 7 dias</span>
      </div>
      ${renderWeeklyAgenda(weeklyTasks)}
    </div>
  `;

  // Bind task clicks
  document.querySelectorAll('.agenda-task[data-task-id], .my-task-item[data-task-id]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.taskId;
      window.dispatchEvent(new CustomEvent('navigate', { detail: { route: 'tasks', taskId: id } }));
    });
  });

  document.querySelectorAll('.my-client-item[data-client-id]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.clientId;
      window.dispatchEvent(new CustomEvent('navigate', { detail: { route: 'client', id } }));
    });
  });
}

function renderMyTasks(todayTasks, overdueTasks) {
  const allTasks = [
    ...overdueTasks.map(t => ({ ...t, _overdue: true })),
    ...todayTasks.filter(t => !overdueTasks.find(o => o.id === t.id))
  ].slice(0, 15);

  if (!allTasks.length) {
    return renderEmptyState('🎉', 'Nenhuma tarefa para hoje!', 'Aproveite o dia livre ou verifique próximas entregas');
  }

  return `
    <div style="display:flex;flex-direction:column;gap:6px;max-height:320px;overflow-y:auto;">
      ${allTasks.map(t => {
        const isOverdue = t._overdue;
        return `
          <div class="my-task-item" data-task-id="${t.id}"
            style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;
              border:1px solid ${isOverdue ? 'var(--danger-light)' : 'var(--border)'};
              background:${isOverdue ? 'var(--danger-light)' : 'var(--surface-2)'};
              cursor:pointer;transition:all .15s ease;">
            <div style="flex:1;min-width:0;">
              <div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
                color:${isOverdue ? 'var(--danger)' : 'var(--text-primary)'};">
                ${sanitize(truncate(t.title, 40))}
              </div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
                ${t.client?.name ? sanitize(t.client.name) + ' · ' : ''}
                ${isOverdue ? `<span style="color:var(--danger);font-weight:600;">Vencida em ${formatDate(t.due_date)}</span>` : formatDate(t.due_date)}
              </div>
            </div>
            <span style="font-size:11px;font-weight:500;padding:2px 8px;border-radius:20px;
              background:${isOverdue ? 'var(--danger)' : 'var(--primary-light)'};
              color:${isOverdue ? 'white' : 'var(--primary)'};">
              ${isOverdue ? 'Vencida' : t.status}
            </span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderMyClients(clients) {
  if (!clients.length) {
    return renderEmptyState('👥', 'Nenhum cliente atribuído', 'Você não tem clientes associados ainda');
  }

  return `
    <div style="display:flex;flex-direction:column;gap:6px;max-height:320px;overflow-y:auto;">
      ${clients.map(c => {
        const status = CLIENT_STATUS_LABELS[c.status] || { label: c.status, color: '#6b7280', bg: '#f9fafb', icon: '•' };
        const health = getHealthColor(c.health_score || 0);
        return `
          <div class="my-client-item" data-client-id="${c.id}"
            style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;
              border:1px solid var(--border);background:var(--surface-2);cursor:pointer;transition:all .15s ease;">
            <div style="width:36px;height:36px;border-radius:10px;background:${status.bg};
              display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">
              ${status.icon}
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${sanitize(c.name)}</div>
              <div style="font-size:11px;color:var(--text-secondary);">${sanitize(c.segment || status.label)}</div>
            </div>
            <div style="text-align:right;flex-shrink:0;">
              <div style="font-size:11px;font-weight:700;color:${health.color};">${c.health_score || 0}</div>
              <div style="font-size:10px;color:var(--text-secondary);">health</div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}
