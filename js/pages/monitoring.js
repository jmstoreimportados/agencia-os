// ============================================================
// CLIENT MONITORING PAGE
// ============================================================

import { monitoringDB, clientsDB, configDB } from '../supabase.js';
import { PLATFORMS, PLATFORM_METRICS, MONTHS } from '../config.js';
import {
  formatCurrency, formatDate, showToast, showConfirm,
  renderEmptyState, sanitize, truncate
} from '../utils.js';

let selectedClientId = null;
let selectedMonth = new Date().getMonth() + 1;
let selectedYear = new Date().getFullYear();
let selectedPlatform = 'instagram';
let allClients = [];
let chartInstances = {};

// ============================================================
// MAIN ENTRY POINT
// ============================================================
export async function renderMonitoring(container, profile) {
  container.innerHTML = `
    <div id="monitoring-root">
      <div class="page-header">
        <div>
          <h1 class="page-title">Monitoramento</h1>
          <p style="font-size:13px;color:var(--text-secondary);margin-top:2px;">Métricas de performance por cliente e plataforma</p>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:260px 1fr;gap:24px;align-items:start;">
        <!-- Client List -->
        <div class="card" style="padding:16px;">
          <div style="font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:12px;letter-spacing:.5px;">Clientes</div>
          <input type="text" id="client-search" class="form-input" style="margin-bottom:10px;" placeholder="🔍 Buscar...">
          <div id="client-list" style="display:flex;flex-direction:column;gap:4px;">
            <div style="text-align:center;padding:20px;color:var(--text-secondary);">⏳ Carregando...</div>
          </div>
        </div>

        <!-- Main Panel -->
        <div id="monitoring-main">
          <div style="text-align:center;padding:80px;color:var(--text-secondary);">
            <div style="font-size:48px;margin-bottom:12px;">📊</div>
            <div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:6px;">Selecione um cliente</div>
            <div style="font-size:13px;">Escolha um cliente na lista ao lado para visualizar e editar suas métricas.</div>
          </div>
        </div>
      </div>
    </div>
  `;

  try {
    allClients = await clientsDB.getAll({ active: true });
  } catch (err) {
    showToast('Erro ao carregar clientes: ' + err.message, 'error');
    allClients = [];
  }

  renderClientList();

  document.getElementById('client-search')?.addEventListener('input', e => {
    renderClientList(e.target.value);
  });
}

function renderClientList(search = '') {
  const list = document.getElementById('client-list');
  if (!list) return;
  const filtered = allClients.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );
  if (filtered.length === 0) {
    list.innerHTML = `<div style="text-align:center;padding:20px;font-size:12px;color:var(--text-secondary);">Nenhum cliente encontrado</div>`;
    return;
  }
  list.innerHTML = filtered.map(c => `
    <div class="client-list-item" data-client-id="${c.id}"
      style="padding:10px 12px;border-radius:8px;cursor:pointer;transition:background .15s;
        background:${selectedClientId === c.id ? 'var(--primary-light)' : 'transparent'};
        border:1px solid ${selectedClientId === c.id ? 'var(--primary)' : 'transparent'};"
      onmouseover="if('${c.id}'!=='${selectedClientId}')this.style.background='#f9fafb'"
      onmouseout="if('${c.id}'!=='${selectedClientId}')this.style.background=''">
      <div style="font-size:13px;font-weight:${selectedClientId === c.id ? '700' : '500'};color:${selectedClientId === c.id ? 'var(--primary)' : 'var(--text-primary)'};">${sanitize(c.name)}</div>
      <div style="font-size:11px;color:var(--text-secondary);">${sanitize(c.segment || '—')}</div>
    </div>
  `).join('');

  list.querySelectorAll('.client-list-item').forEach(item => {
    item.addEventListener('click', () => {
      selectedClientId = item.dataset.clientId;
      renderClientList(search);
      loadClientMonitoring();
    });
  });
}

// ============================================================
// LOAD CLIENT MONITORING
// ============================================================
async function loadClientMonitoring() {
  const main = document.getElementById('monitoring-main');
  if (!main || !selectedClientId) return;
  const client = allClients.find(c => c.id === selectedClientId);
  if (!client) return;

  main.innerHTML = `
    <div>
      <!-- Header -->
      <div class="card" style="padding:16px;margin-bottom:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div>
            <h2 style="font-size:17px;font-weight:700;">${sanitize(client.name)}</h2>
            <p style="font-size:12px;color:var(--text-secondary);">Monitoramento de Métricas</p>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <button class="btn-secondary btn-sm" id="mon-prev-month">← </button>
            <select id="mon-month" style="padding:8px 12px;border-radius:8px;border:1px solid var(--border);font-size:13px;background:white;">
              ${MONTHS.map((m, i) => `<option value="${i+1}" ${i+1 === selectedMonth ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
            <input type="number" id="mon-year" value="${selectedYear}" min="2020" max="2035"
              style="width:80px;padding:8px;border-radius:8px;border:1px solid var(--border);font-size:13px;">
            <button class="btn-secondary btn-sm" id="mon-next-month"> →</button>
            <button class="btn-secondary btn-sm" id="btn-set-goals">🎯 Definir Metas</button>
            <button class="btn-primary btn-sm" id="btn-generate-pdf">📄 Gerar PDF</button>
          </div>
        </div>
      </div>

      <!-- Platform Tabs -->
      <div class="tabs" style="margin-bottom:20px;">
        ${Object.entries(PLATFORMS).map(([key, p]) => `
          <button class="tab ${selectedPlatform === key ? 'active' : ''}" data-platform="${key}">
            ${p.icon} ${p.label}
          </button>
        `).join('')}
      </div>

      <div id="platform-content">
        <div style="text-align:center;padding:40px;">⏳ Carregando dados...</div>
      </div>
    </div>
  `;

  // Nav events
  document.getElementById('mon-prev-month')?.addEventListener('click', () => {
    selectedMonth--;
    if (selectedMonth < 1) { selectedMonth = 12; selectedYear--; }
    document.getElementById('mon-month').value = selectedMonth;
    document.getElementById('mon-year').value = selectedYear;
    loadPlatformData();
  });
  document.getElementById('mon-next-month')?.addEventListener('click', () => {
    selectedMonth++;
    if (selectedMonth > 12) { selectedMonth = 1; selectedYear++; }
    document.getElementById('mon-month').value = selectedMonth;
    document.getElementById('mon-year').value = selectedYear;
    loadPlatformData();
  });
  document.getElementById('mon-month')?.addEventListener('change', e => {
    selectedMonth = parseInt(e.target.value);
    loadPlatformData();
  });
  document.getElementById('mon-year')?.addEventListener('change', e => {
    selectedYear = parseInt(e.target.value);
    loadPlatformData();
  });

  document.querySelectorAll('[data-platform]').forEach(tab => {
    tab.addEventListener('click', () => {
      selectedPlatform = tab.dataset.platform;
      document.querySelectorAll('[data-platform]').forEach(t => t.classList.toggle('active', t.dataset.platform === selectedPlatform));
      loadPlatformData();
    });
  });

  document.getElementById('btn-set-goals')?.addEventListener('click', () => openGoalsModal(client));
  document.getElementById('btn-generate-pdf')?.addEventListener('click', () => generatePDFReport(client));

  loadPlatformData();
}

// ============================================================
// LOAD PLATFORM DATA
// ============================================================
async function loadPlatformData() {
  const content = document.getElementById('platform-content');
  if (!content) return;
  content.innerHTML = `<div style="text-align:center;padding:40px;">⏳ Carregando...</div>`;

  let currentData, prevData, history, goals;
  try {
    const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
    const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;
    [currentData, prevData, history, goals] = await Promise.all([
      monitoringDB.getData(selectedClientId, selectedMonth, selectedYear),
      monitoringDB.getData(selectedClientId, prevMonth, prevYear),
      monitoringDB.getHistory(selectedClientId, selectedPlatform, 6),
      monitoringDB.getGoals(selectedClientId)
    ]);
  } catch (err) {
    content.innerHTML = `<div style="color:#ef4444;padding:20px;">Erro: ${sanitize(err.message)}</div>`;
    return;
  }

  const currentPlatform = (currentData || []).find(d => d.platform === selectedPlatform);
  const prevPlatform = (prevData || []).find(d => d.platform === selectedPlatform);
  const metrics = PLATFORM_METRICS[selectedPlatform] || [];
  const platformGoals = (goals || []).filter(g => g.platform === selectedPlatform);
  const goalMap = Object.fromEntries(platformGoals.map(g => [g.metric_name, g.target_value]));

  const currentMetrics = currentPlatform?.metrics || {};
  const prevMetrics = prevPlatform?.metrics || {};

  // Score calculation
  const score = calculateScore(selectedPlatform, currentMetrics);
  const scoreColor = score >= 7 ? '#10b981' : score >= 5 ? '#f59e0b' : '#ef4444';

  content.innerHTML = `
    <div>
      <!-- Score + Best Post -->
      <div style="display:grid;grid-template-columns:auto 1fr;gap:20px;margin-bottom:24px;align-items:start;">
        <div class="card" style="padding:24px;text-align:center;min-width:140px;">
          <div style="width:80px;height:80px;border-radius:50%;border:6px solid ${scoreColor};display:flex;align-items:center;justify-content:center;margin:0 auto 8px;">
            <span style="font-size:26px;font-weight:900;color:${scoreColor};">${score.toFixed(1)}</span>
          </div>
          <div style="font-size:12px;color:var(--text-secondary);">Score Geral</div>
          <div style="font-size:11px;font-weight:700;color:${scoreColor};margin-top:4px;">${score >= 7 ? 'Ótimo' : score >= 5 ? 'Regular' : 'Atenção'}</div>
        </div>

        <!-- Best Post + Observations -->
        <div class="card" style="padding:16px;">
          <div class="form-grid" style="margin-bottom:0;">
            <div class="form-group">
              <label class="form-label">🌟 Melhor Post — URL</label>
              <input type="url" class="form-input" id="best-post-url" value="${sanitize(currentPlatform?.best_post_url || '')}" placeholder="https://instagram.com/p/...">
            </div>
            <div class="form-group">
              <label class="form-label">Imagem do Post</label>
              <input type="url" class="form-input" id="best-post-img" value="${sanitize(currentPlatform?.best_post_image || '')}" placeholder="https://...">
            </div>
            <div class="form-group" style="grid-column:1/-1;">
              <label class="form-label">📝 Observações do Mês</label>
              <textarea class="form-textarea" id="observations" rows="2">${sanitize(currentPlatform?.observations || '')}</textarea>
            </div>
          </div>
        </div>
      </div>

      <!-- Metric Cards (current vs prev) -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:24px;">
        ${metrics.map(m => {
          const curr = currentMetrics[m.key];
          const prev = prevMetrics[m.key];
          const hasChange = curr != null && prev != null && prev !== 0;
          const change = hasChange ? ((curr - prev) / Math.abs(prev)) * 100 : null;
          const isPos = change > 0;
          return `
            <div class="kpi-card" style="padding:14px;">
              <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px;">${sanitize(m.label)}</div>
              <div style="font-size:20px;font-weight:800;color:var(--text-primary);">${formatMetricValue(curr, m.type)}</div>
              ${change !== null ? `
                <div style="font-size:11px;font-weight:600;color:${isPos ? '#10b981' : '#ef4444'};margin-top:2px;">
                  ${isPos ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}% vs mês ant.
                </div>
              ` : ''}
              ${goalMap[m.key] ? `
                <div style="margin-top:6px;">
                  <div class="progress" style="height:4px;">
                    <div class="progress-bar" style="width:${Math.min(100, curr != null ? Math.round((curr/goalMap[m.key])*100) : 0)}%;"></div>
                  </div>
                  <div style="font-size:10px;color:var(--text-secondary);margin-top:2px;">Meta: ${formatMetricValue(goalMap[m.key], m.type)}</div>
                </div>
              ` : ''}
            </div>
          `;
        }).join('')}
      </div>

      <!-- Metric Input Form -->
      <div class="card" style="padding:20px;margin-bottom:24px;">
        <h4 style="font-size:14px;font-weight:700;margin-bottom:16px;">📥 Inserir Métricas — ${PLATFORMS[selectedPlatform]?.label}</h4>
        <form id="metrics-form">
          <div class="form-grid-3">
            ${metrics.map(m => `
              <div class="form-group">
                <label class="form-label">${sanitize(m.label)}</label>
                <input type="${m.type === 'currency' ? 'number' : 'number'}" class="form-input" name="${m.key}"
                  value="${currentMetrics[m.key] != null ? currentMetrics[m.key] : ''}"
                  step="${m.type === 'percent' || m.type === 'decimal' ? '0.01' : '1'}"
                  placeholder="${m.type === 'currency' ? 'R$ 0,00' : m.type === 'percent' ? '0.00%' : '0'}">
              </div>
            `).join('')}
          </div>
          <div style="display:flex;justify-content:flex-end;margin-top:8px;">
            <button type="submit" class="btn-primary">💾 Salvar Métricas</button>
          </div>
        </form>
      </div>

      <!-- Evolution Chart -->
      <div class="card" style="padding:20px;margin-bottom:24px;">
        <h4 style="font-size:14px;font-weight:700;margin-bottom:16px;">📈 Evolução — Últimos 6 meses</h4>
        <div id="chart-selector" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
          ${metrics.slice(0,4).map((m, i) => `
            <button class="filter-chip ${i === 0 ? 'active' : ''}" data-metric="${m.key}" data-label="${sanitize(m.label)}">${sanitize(m.label)}</button>
          `).join('')}
        </div>
        <div style="height:280px;position:relative;">
          <canvas id="evolution-chart"></canvas>
        </div>
      </div>
    </div>
  `;

  // Save form
  document.getElementById('metrics-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const newMetrics = {};
    metrics.forEach(m => {
      const v = fd.get(m.key);
      if (v !== '' && v !== null) newMetrics[m.key] = parseFloat(v);
    });

    const btn = e.target.querySelector('[type=submit]');
    btn.textContent = 'Salvando...'; btn.disabled = true;

    try {
      await monitoringDB.save({
        client_id: selectedClientId,
        platform: selectedPlatform,
        month: selectedMonth,
        year: selectedYear,
        metrics: newMetrics,
        best_post_url: document.getElementById('best-post-url').value.trim() || null,
        best_post_image: document.getElementById('best-post-img').value.trim() || null,
        observations: document.getElementById('observations').value.trim() || null
      });
      showToast('Métricas salvas!', 'success');
      loadPlatformData();
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
      btn.textContent = '💾 Salvar Métricas'; btn.disabled = false;
    }
  });

  // Chart
  renderEvolutionChart(history, metrics[0]);

  document.getElementById('chart-selector')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-metric]');
    if (!btn) return;
    document.querySelectorAll('[data-metric]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const metric = metrics.find(m => m.key === btn.dataset.metric);
    renderEvolutionChart(history, metric);
  });
}

function formatMetricValue(value, type) {
  if (value == null || value === '') return '—';
  const n = parseFloat(value);
  if (isNaN(n)) return '—';
  if (type === 'currency') return formatCurrency(n);
  if (type === 'percent') return `${n.toFixed(2)}%`;
  if (type === 'decimal') return n.toFixed(2);
  return n.toLocaleString('pt-BR');
}

function calculateScore(platform, metrics) {
  let score = 5;
  if (platform === 'instagram' || platform === 'facebook' || platform === 'tiktok') {
    const engRate = parseFloat(metrics.engagement_rate) || 0;
    const growth = parseFloat(metrics.followers_growth) || 0;
    const followers = parseFloat(metrics.followers) || 1;
    if (engRate > 5) score = 9;
    else if (engRate > 3) score = 7.5;
    else if (engRate > 1) score = 6;
    else score = 4;
    const growthPct = (growth / followers) * 100;
    if (growthPct > 5) score = Math.min(10, score + 1);
    else if (growthPct < 0) score = Math.max(0, score - 1);
  } else if (platform === 'traffic') {
    const roas = parseFloat(metrics.roas) || 0;
    if (roas > 5) score = 9;
    else if (roas > 3) score = 7.5;
    else if (roas > 2) score = 6;
    else if (roas > 1) score = 5;
    else score = 3;
  } else if (platform === 'gmb') {
    const rating = parseFloat(metrics.avg_rating) || 0;
    score = Math.max(0, Math.min(10, (rating / 5) * 10));
  }
  return Math.max(0, Math.min(10, score));
}

function renderEvolutionChart(history, metric) {
  if (!metric) return;
  const canvas = document.getElementById('evolution-chart');
  if (!canvas) return;

  // Destroy existing chart
  if (chartInstances.evolution) {
    chartInstances.evolution.destroy();
    chartInstances.evolution = null;
  }

  const labels = history.map(h => `${MONTHS[h.month-1].slice(0,3)}/${h.year}`);
  const data = history.map(h => h.metrics?.[metric.key] ?? null);

  if (!window.Chart) {
    canvas.parentElement.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-secondary);">Chart.js não carregado</div>`;
    return;
  }

  chartInstances.evolution = new window.Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: metric.label,
        data,
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99,102,241,0.1)',
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#6366f1',
        pointRadius: 5
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
          ticks: { font: { size: 11 } }
        },
        x: {
          grid: { display: false },
          ticks: { font: { size: 11 } }
        }
      }
    }
  });
}

// ============================================================
// GOALS MODAL
// ============================================================
async function openGoalsModal(client) {
  let existingGoals = [];
  try {
    existingGoals = await monitoringDB.getGoals(selectedClientId) || [];
  } catch {}

  const goalMap = {};
  existingGoals.filter(g => g.platform === selectedPlatform).forEach(g => {
    goalMap[g.metric_name] = g.target_value;
  });

  const metrics = PLATFORM_METRICS[selectedPlatform] || [];
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header">
        <h2 class="modal-title">🎯 Definir Metas — ${PLATFORMS[selectedPlatform]?.label}</h2>
        <button class="modal-close" id="close-goals-modal">✕</button>
      </div>
      <div class="modal-body">
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">
          Defina os valores alvo para cada métrica desta plataforma para o cliente <strong>${sanitize(client.name)}</strong>.
        </p>
        <form id="goals-form">
          <div class="form-grid">
            ${metrics.map(m => `
              <div class="form-group">
                <label class="form-label">${sanitize(m.label)}</label>
                <input type="number" class="form-input" name="${m.key}"
                  value="${goalMap[m.key] != null ? goalMap[m.key] : ''}"
                  step="${m.type === 'percent' || m.type === 'decimal' ? '0.01' : '1'}"
                  placeholder="Meta...">
              </div>
            `).join('')}
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="cancel-goals-modal">Cancelar</button>
        <button class="btn-primary" id="save-goals-modal">💾 Salvar Metas</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('close-goals-modal').addEventListener('click', () => overlay.remove());
  document.getElementById('cancel-goals-modal').addEventListener('click', () => overlay.remove());

  document.getElementById('save-goals-modal').addEventListener('click', async () => {
    const form = document.getElementById('goals-form');
    const fd = new FormData(form);
    const btn = document.getElementById('save-goals-modal');
    btn.textContent = 'Salvando...'; btn.disabled = true;
    try {
      const saves = [];
      for (const m of metrics) {
        const val = fd.get(m.key);
        if (val !== '' && val !== null) {
          saves.push(monitoringDB.saveGoal({
            client_id: selectedClientId,
            platform: selectedPlatform,
            metric_name: m.key,
            target_value: parseFloat(val)
          }));
        }
      }
      await Promise.all(saves);
      showToast('Metas salvas!', 'success');
      overlay.remove();
      loadPlatformData();
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
      btn.textContent = '💾 Salvar Metas'; btn.disabled = false;
    }
  });
}

// ============================================================
// PDF REPORT GENERATION
// ============================================================
async function generatePDFReport(client) {
  if (!window.jspdf) {
    showToast('jsPDF não está carregado. Adicione a CDN do jsPDF ao index.html.', 'error');
    return;
  }

  showToast('Gerando relatório PDF...', 'info');

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    let y = 0;

    // Helper functions
    const addPage = () => { doc.addPage(); y = 20; };
    const checkPage = (needed = 20) => { if (y + needed > H - 20) addPage(); };

    // ---- COVER ----
    doc.setFillColor(99, 102, 241);
    doc.rect(0, 0, W, 60, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24); doc.setFont('helvetica', 'bold');
    doc.text('RELATÓRIO DE PERFORMANCE', W/2, 22, { align: 'center' });
    doc.setFontSize(16); doc.setFont('helvetica', 'normal');
    doc.text(client.name, W/2, 34, { align: 'center' });
    doc.setFontSize(12);
    doc.text(`${MONTHS[selectedMonth-1]} / ${selectedYear}`, W/2, 44, { align: 'center' });

    y = 72;
    doc.setTextColor(30, 30, 30);

    // ---- FOR EACH PLATFORM ----
    const allPlatformData = await Promise.all(
      Object.keys(PLATFORMS).map(async platform => {
        const data = await monitoringDB.getData(selectedClientId, selectedMonth, selectedYear);
        const goals = await monitoringDB.getGoals(selectedClientId);
        return {
          platform,
          data: (data || []).find(d => d.platform === platform),
          goals: (goals || []).filter(g => g.platform === platform)
        };
      })
    );

    for (const { platform, data, goals } of allPlatformData) {
      if (!data?.metrics || Object.keys(data.metrics).length === 0) continue;
      const pInfo = PLATFORMS[platform];
      const metrics = PLATFORM_METRICS[platform] || [];
      const goalMap = Object.fromEntries(goals.map(g => [g.metric_name, g.target_value]));

      checkPage(50);

      // Platform header
      doc.setFillColor(240, 241, 255);
      doc.rect(14, y - 4, W - 28, 12, 'F');
      doc.setFontSize(12); doc.setFont('helvetica', 'bold');
      doc.setTextColor(99, 102, 241);
      doc.text(`${pInfo.label}`, 18, y + 4);

      // Score
      const score = calculateScore(platform, data.metrics);
      doc.setFontSize(10); doc.setFont('helvetica', 'normal');
      doc.setTextColor(score >= 7 ? 22 : score >= 5 ? 217 : 239, score >= 7 ? 163 : score >= 5 ? 119 : 68, score >= 7 ? 74 : score >= 5 ? 6 : 68);
      doc.text(`Score: ${score.toFixed(1)}/10`, W - 18, y + 4, { align: 'right' });

      y += 14;
      doc.setTextColor(30, 30, 30);

      // Metrics table
      const colW = (W - 28) / 3;
      metrics.forEach((m, i) => {
        if (data.metrics[m.key] == null) return;
        const col = i % 3;
        const row = Math.floor(i / 3);
        if (col === 0 && i > 0) { checkPage(20); }
        const xPos = 14 + col * colW;
        const yPos = y + row * 16;

        doc.setFontSize(8); doc.setTextColor(107, 114, 128);
        doc.text(m.label, xPos, yPos);
        doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(17, 24, 39);
        doc.text(formatMetricValue(data.metrics[m.key], m.type), xPos, yPos + 6);

        if (goalMap[m.key] != null) {
          const pct = Math.min(100, Math.round((data.metrics[m.key] / goalMap[m.key]) * 100));
          doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128);
          doc.text(`Meta: ${formatMetricValue(goalMap[m.key], m.type)} (${pct}%)`, xPos, yPos + 11);
        }
        doc.setFont('helvetica', 'normal');
      });

      const rows = Math.ceil(metrics.filter(m => data.metrics[m.key] != null).length / 3);
      y += rows * 16 + 8;

      if (data.observations) {
        checkPage(16);
        doc.setFontSize(9); doc.setTextColor(75, 85, 99);
        doc.setFont('helvetica', 'italic');
        const lines = doc.splitTextToSize(`Obs: ${data.observations}`, W - 28);
        doc.text(lines, 14, y);
        y += lines.length * 5 + 4;
        doc.setFont('helvetica', 'normal');
      }

      y += 8;
    }

    // ---- FOOTER ----
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8); doc.setTextColor(156, 163, 175);
      doc.text(`Página ${i} de ${pageCount} — Gerado em ${new Date().toLocaleDateString('pt-BR')}`, W/2, H - 8, { align: 'center' });
    }

    const filename = `relatorio_${client.name.replace(/\s+/g,'_')}_${MONTHS[selectedMonth-1]}_${selectedYear}.pdf`;
    doc.save(filename);
    showToast('PDF gerado com sucesso!', 'success');
  } catch (err) {
    console.error('PDF generation error:', err);
    showToast('Erro ao gerar PDF: ' + err.message, 'error');
  }
}
