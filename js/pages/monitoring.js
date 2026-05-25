// ============================================================
// MONITORING PAGE — IVY Marketing & Comunicação
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
let selectedPlatform = 'overview';
let allClients = [];
let chartInstances = {};
let _agencyConfig = null;

// IVY Brand colors for PDF
const IVY = {
  purple:    [155, 30, 200],   // #9B1EC8
  purpleDk:  [26, 5, 48],      // #1A0530
  purpleLt:  [243, 232, 255],  // #F3E8FF
  gold:      [239, 194, 25],   // #EFC219
  goldDk:    [180, 140, 10],
  white:     [255, 255, 255],
  gray1:     [17, 24, 39],
  gray2:     [75, 85, 99],
  gray3:     [156, 163, 175],
  gray4:     [243, 244, 246],
  green:     [16, 185, 129],
  red:       [239, 68, 68],
  amber:     [245, 158, 11],
};

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
        <div class="card" style="padding:16px;">
          <div style="font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:12px;letter-spacing:.5px;">Clientes Ativos</div>
          <input type="text" id="client-search" class="form-input" style="margin-bottom:10px;" placeholder="🔍 Buscar...">
          <div id="client-list" style="display:flex;flex-direction:column;gap:4px;">
            <div style="text-align:center;padding:20px;color:var(--text-secondary);">⏳ Carregando...</div>
          </div>
        </div>
        <div id="monitoring-main">
          <div style="text-align:center;padding:80px 40px;color:var(--text-secondary);">
            <div style="font-size:56px;margin-bottom:16px;">📊</div>
            <div style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:8px;">Selecione um cliente</div>
            <div style="font-size:13px;max-width:300px;margin:0 auto;">Escolha um cliente na lista ao lado para visualizar, inserir métricas e gerar relatórios.</div>
          </div>
        </div>
      </div>
    </div>
  `;

  try {
    [allClients, _agencyConfig] = await Promise.all([
      clientsDB.getAll({ active: true }),
      configDB.get('agency_info').catch(() => null)
    ]);
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
        border:1px solid ${selectedClientId === c.id ? 'var(--primary)' : 'transparent'};">
      <div style="font-size:13px;font-weight:${selectedClientId === c.id ? '700' : '500'};color:${selectedClientId === c.id ? 'var(--primary)' : 'var(--text-primary)'};">${sanitize(c.name)}</div>
      <div style="font-size:11px;color:var(--text-secondary);">${sanitize(c.segment || '—')}</div>
    </div>
  `).join('');

  list.querySelectorAll('.client-list-item').forEach(item => {
    item.addEventListener('click', () => {
      selectedClientId = item.dataset.clientId;
      selectedPlatform = 'overview';
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
      <div class="card" style="padding:16px;margin-bottom:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div>
            <h2 style="font-size:17px;font-weight:700;">${sanitize(client.name)}</h2>
            <p style="font-size:12px;color:var(--text-secondary);">Relatório de Performance Mensal</p>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <button class="btn-secondary btn-sm" id="mon-prev-month">←</button>
            <select id="mon-month" style="padding:8px 12px;border-radius:8px;border:1px solid var(--border);font-size:13px;background:white;">
              ${MONTHS.map((m, i) => `<option value="${i+1}" ${i+1 === selectedMonth ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
            <input type="number" id="mon-year" value="${selectedYear}" min="2020" max="2035"
              style="width:80px;padding:8px;border-radius:8px;border:1px solid var(--border);font-size:13px;">
            <button class="btn-secondary btn-sm" id="mon-next-month">→</button>
            <button class="btn-secondary btn-sm" id="btn-set-goals" title="Definir metas">🎯 Metas</button>
            <button class="btn-primary btn-sm" id="btn-generate-pdf" style="background:linear-gradient(135deg,var(--primary),#7B17A0);">
              📄 Gerar Relatório
            </button>
          </div>
        </div>
      </div>

      <div class="tabs" style="margin-bottom:20px;" id="platform-tabs">
        <button class="tab ${selectedPlatform === 'overview' ? 'active' : ''}" data-platform="overview">
          🏠 Visão Geral
        </button>
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

  document.getElementById('mon-prev-month')?.addEventListener('click', () => {
    selectedMonth--; if (selectedMonth < 1) { selectedMonth = 12; selectedYear--; }
    document.getElementById('mon-month').value = selectedMonth;
    document.getElementById('mon-year').value = selectedYear;
    loadPlatformData();
  });
  document.getElementById('mon-next-month')?.addEventListener('click', () => {
    selectedMonth++; if (selectedMonth > 12) { selectedMonth = 1; selectedYear++; }
    document.getElementById('mon-month').value = selectedMonth;
    document.getElementById('mon-year').value = selectedYear;
    loadPlatformData();
  });
  document.getElementById('mon-month')?.addEventListener('change', e => { selectedMonth = parseInt(e.target.value); loadPlatformData(); });
  document.getElementById('mon-year')?.addEventListener('change', e => { selectedYear = parseInt(e.target.value); loadPlatformData(); });

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
  content.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-secondary);">⏳ Carregando...</div>`;

  const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
  const prevYear  = selectedMonth === 1 ? selectedYear - 1 : selectedYear;

  let currentData, prevData, history, goals;
  try {
    [currentData, prevData, history, goals] = await Promise.all([
      monitoringDB.getData(selectedClientId, selectedMonth, selectedYear),
      monitoringDB.getData(selectedClientId, prevMonth, prevYear),
      selectedPlatform !== 'overview'
        ? monitoringDB.getHistory(selectedClientId, selectedPlatform, 6)
        : Promise.resolve([]),
      monitoringDB.getGoals(selectedClientId)
    ]);
  } catch (err) {
    content.innerHTML = `<div style="color:#ef4444;padding:20px;">Erro: ${sanitize(err.message)}</div>`;
    return;
  }

  if (selectedPlatform === 'overview') {
    renderOverview(content, currentData, prevData, goals);
  } else {
    renderPlatformDetail(content, currentData, prevData, history, goals);
  }
}

// ============================================================
// OVERVIEW TAB
// ============================================================
function renderOverview(content, currentData, prevData, goals) {
  const platforms = Object.entries(PLATFORMS);
  const hasAny = (currentData || []).some(d => d.metrics && Object.keys(d.metrics).length > 0);

  if (!hasAny) {
    content.innerHTML = `
      <div style="text-align:center;padding:60px 40px;color:var(--text-secondary);">
        <div style="font-size:40px;margin-bottom:12px;">📭</div>
        <div style="font-size:15px;font-weight:600;color:var(--text-primary);margin-bottom:6px;">Sem dados para ${MONTHS[selectedMonth-1]} / ${selectedYear}</div>
        <div style="font-size:13px;">Selecione uma plataforma nas abas acima e insira as métricas do mês.</div>
      </div>`;
    return;
  }

  // Aggregate scores
  const scores = platforms.map(([key]) => {
    const d = (currentData || []).find(x => x.platform === key);
    if (!d?.metrics || Object.keys(d.metrics).length === 0) return null;
    return { platform: key, score: calculateScore(key, d.metrics) };
  }).filter(Boolean);

  const avgScore = scores.length ? scores.reduce((s, x) => s + x.score, 0) / scores.length : 0;
  const scoreColor = avgScore >= 7 ? '#10b981' : avgScore >= 5 ? '#f59e0b' : '#ef4444';
  const scoreLabel = avgScore >= 7 ? 'Ótimo' : avgScore >= 5 ? 'Regular' : 'Atenção';

  content.innerHTML = `
    <div>
      <!-- Score geral banner -->
      <div style="background:linear-gradient(135deg,#1A0530,#4A1070);border-radius:16px;padding:28px 32px;margin-bottom:24px;display:flex;align-items:center;gap:32px;flex-wrap:wrap;">
        <div style="text-align:center;">
          <div style="width:90px;height:90px;border-radius:50%;border:5px solid ${scoreColor};display:flex;align-items:center;justify-content:center;margin:0 auto 8px;background:rgba(255,255,255,.05);">
            <span style="font-size:28px;font-weight:900;color:${scoreColor};">${avgScore.toFixed(1)}</span>
          </div>
          <div style="font-size:11px;color:rgba(255,255,255,.6);">Score Médio</div>
          <div style="font-size:12px;font-weight:700;color:${scoreColor};">${scoreLabel}</div>
        </div>
        <div style="flex:1;min-width:200px;">
          <div style="font-size:11px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">Período</div>
          <div style="font-size:20px;font-weight:800;color:#EFC219;">${MONTHS[selectedMonth-1]} / ${selectedYear}</div>
          <div style="font-size:12px;color:rgba(255,255,255,.5);margin-top:4px;">${scores.length} plataforma${scores.length !== 1 ? 's' : ''} com dados</div>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          ${scores.map(s => {
            const col = s.score >= 7 ? '#10b981' : s.score >= 5 ? '#f59e0b' : '#ef4444';
            const p = PLATFORMS[s.platform];
            return `
              <div style="background:rgba(255,255,255,.07);border-radius:10px;padding:12px 16px;text-align:center;min-width:80px;">
                <div style="font-size:18px;">${p.icon}</div>
                <div style="font-size:10px;color:rgba(255,255,255,.5);margin:2px 0;">${p.label}</div>
                <div style="font-size:16px;font-weight:800;color:${col};">${s.score.toFixed(1)}</div>
              </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Platform summaries -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;">
        ${platforms.map(([key, p]) => {
          const d = (currentData || []).find(x => x.platform === key);
          const pd = (prevData || []).find(x => x.platform === key);
          if (!d?.metrics || Object.keys(d.metrics).length === 0) return '';
          const metrics = PLATFORM_METRICS[key] || [];
          const score = calculateScore(key, d.metrics);
          const col = score >= 7 ? '#10b981' : score >= 5 ? '#f59e0b' : '#ef4444';
          const highlight = metrics.slice(0, 3);
          return `
            <div class="card" style="padding:16px;cursor:pointer;border:2px solid transparent;transition:border-color .2s;"
              onclick="document.querySelector('[data-platform=${key}]').click()"
              onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='transparent'">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-size:20px;">${p.icon}</span>
                  <span style="font-size:14px;font-weight:700;">${p.label}</span>
                </div>
                <div style="background:${col}20;color:${col};font-size:12px;font-weight:700;padding:3px 10px;border-radius:20px;">
                  ${score.toFixed(1)}/10
                </div>
              </div>
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
                ${highlight.map(m => {
                  const curr = d.metrics[m.key];
                  const prev = pd?.metrics?.[m.key];
                  if (curr == null) return '';
                  const chg = curr != null && prev != null && prev !== 0
                    ? ((curr - prev) / Math.abs(prev)) * 100 : null;
                  return `
                    <div style="background:var(--surface-2);border-radius:8px;padding:8px;">
                      <div style="font-size:10px;color:var(--text-secondary);margin-bottom:2px;">${sanitize(m.label)}</div>
                      <div style="font-size:14px;font-weight:800;">${formatMetricValue(curr, m.type)}</div>
                      ${chg !== null ? `<div style="font-size:10px;color:${chg >= 0 ? '#10b981' : '#ef4444'};font-weight:600;">${chg >= 0 ? '▲' : '▼'} ${Math.abs(chg).toFixed(1)}%</div>` : ''}
                    </div>`;
                }).join('')}
              </div>
              ${d.observations ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:10px;font-style:italic;border-top:1px solid var(--border);padding-top:8px;">${sanitize(d.observations)}</div>` : ''}
            </div>`;
        }).filter(Boolean).join('')}
      </div>
    </div>
  `;
}

// ============================================================
// PLATFORM DETAIL TAB
// ============================================================
function renderPlatformDetail(content, currentData, prevData, history, goals) {
  const currentPlatform = (currentData || []).find(d => d.platform === selectedPlatform);
  const prevPlatform    = (prevData   || []).find(d => d.platform === selectedPlatform);
  const metrics         = PLATFORM_METRICS[selectedPlatform] || [];
  const platformGoals   = (goals || []).filter(g => g.platform === selectedPlatform);
  const goalMap         = Object.fromEntries(platformGoals.map(g => [g.metric_name, g.target_value]));
  const currentMetrics  = currentPlatform?.metrics || {};
  const prevMetrics     = prevPlatform?.metrics || {};
  const score           = calculateScore(selectedPlatform, currentMetrics);
  const scoreColor      = score >= 7 ? '#10b981' : score >= 5 ? '#f59e0b' : '#ef4444';

  content.innerHTML = `
    <div>
      <!-- Score + best post -->
      <div style="display:grid;grid-template-columns:140px 1fr;gap:16px;margin-bottom:20px;align-items:start;">
        <div class="card" style="padding:20px;text-align:center;">
          <div style="width:80px;height:80px;border-radius:50%;border:5px solid ${scoreColor};display:flex;align-items:center;justify-content:center;margin:0 auto 8px;background:${scoreColor}10;">
            <span style="font-size:24px;font-weight:900;color:${scoreColor};">${score.toFixed(1)}</span>
          </div>
          <div style="font-size:11px;color:var(--text-secondary);">Score Geral</div>
          <div style="font-size:11px;font-weight:700;color:${scoreColor};margin-top:2px;">${score >= 7 ? 'Ótimo ✨' : score >= 5 ? 'Regular 🔶' : 'Atenção ⚠️'}</div>
        </div>
        <div class="card" style="padding:16px;">
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">🌟 Melhor Post — URL</label>
              <input type="url" class="form-input" id="best-post-url" value="${sanitize(currentPlatform?.best_post_url || '')}" placeholder="https://instagram.com/p/...">
            </div>
            <div class="form-group">
              <label class="form-label">🖼️ Imagem do Post (URL)</label>
              <input type="url" class="form-input" id="best-post-img" value="${sanitize(currentPlatform?.best_post_image || '')}" placeholder="https://...">
            </div>
            <div class="form-group" style="grid-column:1/-1;">
              <label class="form-label">📝 Observações / Destaque do Mês</label>
              <textarea class="form-textarea" id="observations" rows="2" placeholder="Ex: Lançamos a campanha X e obtivemos...">${sanitize(currentPlatform?.observations || '')}</textarea>
            </div>
          </div>
        </div>
      </div>

      <!-- KPI Cards -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:20px;">
        ${metrics.map(m => {
          const curr = currentMetrics[m.key];
          const prev = prevMetrics[m.key];
          const hasChange = curr != null && prev != null && prev !== 0;
          const change = hasChange ? ((curr - prev) / Math.abs(prev)) * 100 : null;
          const isPos = change > 0;
          const goal = goalMap[m.key];
          const pct = goal && curr != null ? Math.min(100, Math.round((curr / goal) * 100)) : null;
          return `
            <div class="kpi-card" style="padding:14px;">
              <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px;">${sanitize(m.label)}</div>
              <div style="font-size:20px;font-weight:800;color:var(--text-primary);">${formatMetricValue(curr, m.type)}</div>
              ${change !== null ? `
                <div style="font-size:11px;font-weight:600;color:${isPos ? '#10b981' : '#ef4444'};margin-top:2px;">
                  ${isPos ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}% vs anterior
                </div>` : '<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">— sem comparação</div>'}
              ${pct !== null ? `
                <div style="margin-top:6px;">
                  <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-secondary);margin-bottom:2px;">
                    <span>Meta</span><span>${pct}%</span>
                  </div>
                  <div class="progress" style="height:4px;">
                    <div class="progress-bar" style="width:${pct}%;background:${pct >= 100 ? '#10b981' : 'var(--primary)'};"></div>
                  </div>
                  <div style="font-size:9px;color:var(--text-secondary);margin-top:1px;">${formatMetricValue(goal, m.type)}</div>
                </div>` : ''}
            </div>`;
        }).join('')}
      </div>

      <!-- Input form -->
      <div class="card" style="padding:20px;margin-bottom:20px;">
        <h4 style="font-size:14px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:8px;">
          <span>📥</span> Inserir Métricas — ${PLATFORMS[selectedPlatform]?.label}
          <span style="font-size:11px;font-weight:400;color:var(--text-secondary);">${MONTHS[selectedMonth-1]} / ${selectedYear}</span>
        </h4>
        <form id="metrics-form">
          <div class="form-grid-3">
            ${metrics.map(m => `
              <div class="form-group">
                <label class="form-label">${sanitize(m.label)}</label>
                <input type="number" class="form-input" name="${m.key}"
                  value="${currentMetrics[m.key] != null ? currentMetrics[m.key] : ''}"
                  step="${m.type === 'percent' || m.type === 'decimal' ? '0.01' : '1'}"
                  placeholder="${m.type === 'currency' ? '0.00' : m.type === 'percent' ? '0.00' : '0'}">
              </div>
            `).join('')}
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
            <button type="submit" class="btn-primary">💾 Salvar Métricas</button>
          </div>
        </form>
      </div>

      <!-- Evolution Chart -->
      <div class="card" style="padding:20px;">
        <h4 style="font-size:14px;font-weight:700;margin-bottom:12px;">📈 Evolução — Últimos 6 meses</h4>
        <div id="chart-selector" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
          ${metrics.slice(0,5).map((m, i) => `
            <button class="filter-chip ${i === 0 ? 'active' : ''}" data-metric="${m.key}">${sanitize(m.label)}</button>
          `).join('')}
        </div>
        <div style="height:260px;position:relative;">
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
    metrics.forEach(m => { const v = fd.get(m.key); if (v !== '' && v !== null) newMetrics[m.key] = parseFloat(v); });
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
      showToast('Métricas salvas! ✅', 'success');
      loadPlatformData();
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
      btn.textContent = '💾 Salvar Métricas'; btn.disabled = false;
    }
  });

  renderEvolutionChart(history, metrics[0]);
  document.getElementById('chart-selector')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-metric]');
    if (!btn) return;
    document.querySelectorAll('[data-metric]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderEvolutionChart(history, metrics.find(m => m.key === btn.dataset.metric));
  });
}

// ============================================================
// HELPERS
// ============================================================
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
    const engRate  = parseFloat(metrics.engagement_rate) || 0;
    const growth   = parseFloat(metrics.followers_growth) || 0;
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
  if (chartInstances.evolution) { chartInstances.evolution.destroy(); chartInstances.evolution = null; }
  const labels = history.map(h => `${MONTHS[h.month-1].slice(0,3)}/${String(h.year).slice(2)}`);
  const data   = history.map(h => h.metrics?.[metric.key] ?? null);
  if (!window.Chart) {
    canvas.parentElement.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-secondary);">Chart.js não carregado</div>`;
    return;
  }
  chartInstances.evolution = new window.Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: metric.label, data,
        borderColor: '#9B1EC8', backgroundColor: 'rgba(155,30,200,0.08)',
        fill: true, tension: 0.4,
        pointBackgroundColor: '#9B1EC8', pointBorderColor: '#fff',
        pointBorderWidth: 2, pointRadius: 5, borderWidth: 2.5
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1A0530', titleColor: '#EFC219', bodyColor: '#fff', padding: 10,
          callbacks: { label: ctx => ` ${formatMetricValue(ctx.parsed.y, metric.type)}` }
        }
      },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,.04)' }, ticks: { font: { size: 11 }, color: '#6b7280' } },
        x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#6b7280' } }
      }
    }
  });
}

// ============================================================
// GOALS MODAL
// ============================================================
async function openGoalsModal(client) {
  let existingGoals = [];
  try { existingGoals = await monitoringDB.getGoals(selectedClientId) || []; } catch {}
  const platformKey = selectedPlatform === 'overview' ? 'instagram' : selectedPlatform;
  const goalMap = {};
  existingGoals.filter(g => g.platform === platformKey).forEach(g => { goalMap[g.metric_name] = g.target_value; });
  const metrics = PLATFORM_METRICS[platformKey] || [];
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal-md">
      <div class="modal-header">
        <h2 class="modal-title">🎯 Definir Metas — ${PLATFORMS[platformKey]?.label}</h2>
        <button class="modal-close" id="close-goals-modal">✕</button>
      </div>
      <div class="modal-body">
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">
          Metas para <strong>${sanitize(client.name)}</strong> — <strong>${PLATFORMS[platformKey]?.label}</strong>.
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
  overlay.querySelector('#close-goals-modal').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#cancel-goals-modal').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#save-goals-modal').addEventListener('click', async () => {
    const form = overlay.querySelector('#goals-form');
    const fd = new FormData(form);
    const btn = overlay.querySelector('#save-goals-modal');
    btn.textContent = 'Salvando...'; btn.disabled = true;
    try {
      await Promise.all(metrics.map(m => {
        const val = fd.get(m.key);
        if (val === '' || val === null) return Promise.resolve();
        return monitoringDB.saveGoal({ client_id: selectedClientId, platform: platformKey, metric_name: m.key, target_value: parseFloat(val) });
      }));
      showToast('Metas salvas! ✅', 'success');
      overlay.remove();
      loadPlatformData();
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
      btn.textContent = '💾 Salvar Metas'; btn.disabled = false;
    }
  });
}

// ============================================================
// PDF REPORT — BRANDED IVY
// ============================================================
async function generatePDFReport(client) {
  const jsPDFLib = window.jspdf || window.jsPDF;
  if (!jsPDFLib) { showToast('jsPDF não está carregado.', 'error'); return; }
  const btn = document.getElementById('btn-generate-pdf');
  if (btn) { btn.textContent = '⏳ Gerando...'; btn.disabled = true; }
  try {
    const { jsPDF } = jsPDFLib;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    let y = 0;
    const addPage  = () => { doc.addPage(); y = 24; };
    const checkY   = (need = 20) => { if (y + need > H - 18) addPage(); };
    const setFill  = (arr) => doc.setFillColor(...arr);
    const setDraw  = (arr) => doc.setDrawColor(...arr);
    const setTxt   = (arr) => doc.setTextColor(...arr);
    const agencyName = _agencyConfig?.name || 'IVY Marketing & Comunicação';

    // COVER
    setFill(IVY.purpleDk); doc.rect(0, 0, W, H, 'F');
    setFill(IVY.gold); doc.rect(0, 0, W, 4, 'F');
    setFill([50, 10, 90]); doc.triangle(W * 0.4, 0, W, 0, W, H * 0.5, 'F');
    setFill([90, 15, 130]); doc.circle(W * 0.85, H * 0.2, 40, 'F');
    setFill([70, 10, 110]); doc.circle(W * 0.1, H * 0.7, 30, 'F');
    setTxt(IVY.gold);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text(agencyName.toUpperCase(), 20, 24);
    setFill(IVY.gold); doc.rect(20, 27, 40, 1.5, 'F');
    setTxt(IVY.white);
    doc.setFontSize(28); doc.setFont('helvetica', 'bold');
    doc.text('RELATÓRIO DE', 20, 80);
    setTxt(IVY.gold);
    doc.text('PERFORMANCE', 20, 94);
    setTxt(IVY.white);
    doc.setFontSize(16); doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(client.name, W - 40), 20, 112);
    setFill(IVY.purple); doc.roundedRect(20, 122, 70, 12, 3, 3, 'F');
    setTxt(IVY.white);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(`${MONTHS[selectedMonth-1].toUpperCase()} / ${selectedYear}`, 55, 130, { align: 'center' });
    setTxt([180, 140, 210]);
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    if (client.segment) doc.text(`Segmento: ${client.segment}`, 20, 144);
    doc.text(`Emitido em: ${new Date().toLocaleDateString('pt-BR')}`, 20, 152);
    setFill(IVY.gold); doc.rect(0, H - 4, W, 4, 'F');

    // PAGE 2 HEADER
    doc.addPage(); y = 0;
    setFill(IVY.purple); doc.rect(0, 0, W, 18, 'F');
    setTxt(IVY.white);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(agencyName, 14, 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(`${client.name} — ${MONTHS[selectedMonth-1]} / ${selectedYear}`, W - 14, 12, { align: 'right' });
    y = 28;
    setTxt(IVY.purpleDk);
    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text('Visão Geral do Mês', 14, y);
    setFill(IVY.gold); doc.rect(14, y + 2, 50, 1.5, 'F');
    y += 14;

    const [allData, allGoals] = await Promise.all([
      monitoringDB.getData(selectedClientId, selectedMonth, selectedYear),
      monitoringDB.getGoals(selectedClientId)
    ]);
    const activePlatforms = Object.keys(PLATFORMS).filter(key => {
      const d = (allData || []).find(x => x.platform === key);
      return d?.metrics && Object.keys(d.metrics).length > 0;
    });

    if (activePlatforms.length === 0) {
      setTxt(IVY.gray2); doc.setFontSize(11); doc.setFont('helvetica', 'italic');
      doc.text('Nenhum dado inserido para este período.', 14, y);
    } else {
      const cols  = Math.min(activePlatforms.length, 4);
      const cardW = (W - 28 - (cols - 1) * 6) / cols;
      activePlatforms.forEach((key, i) => {
        const d     = (allData || []).find(x => x.platform === key);
        const score = calculateScore(key, d.metrics || {});
        const col   = score >= 7 ? IVY.green : score >= 5 ? IVY.amber : IVY.red;
        const p     = PLATFORMS[key];
        const xPos  = 14 + i * (cardW + 6);
        setFill(IVY.gray4); doc.roundedRect(xPos, y, cardW, 22, 3, 3, 'F');
        setDraw(col); doc.setLineWidth(1.2); doc.circle(xPos + 12, y + 11, 6, 'S');
        setTxt(col); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
        doc.text(score.toFixed(1), xPos + 12, y + 13, { align: 'center' });
        setTxt(IVY.gray1); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
        doc.text(p.label, xPos + 22, y + 9);
        setTxt(IVY.gray2); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
        doc.text(score >= 7 ? 'Ótimo' : score >= 5 ? 'Regular' : 'Atenção', xPos + 22, y + 16);
      });
      y += 32;
    }

    // PLATFORM SECTIONS
    for (const key of activePlatforms) {
      const d        = (allData  || []).find(x => x.platform === key);
      const pGoals   = (allGoals || []).filter(g => g.platform === key);
      const goalMap  = Object.fromEntries(pGoals.map(g => [g.metric_name, g.target_value]));
      const metrics  = PLATFORM_METRICS[key] || [];
      const p        = PLATFORMS[key];
      const score    = calculateScore(key, d.metrics || {});
      const scoreCol = score >= 7 ? IVY.green : score >= 5 ? IVY.amber : IVY.red;
      checkY(50);
      setFill(IVY.purpleDk); doc.rect(0, y - 2, W, 14, 'F');
      setFill(IVY.gold); doc.rect(0, y - 2, 4, 14, 'F');
      setTxt(IVY.white); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
      doc.text(p.label, 12, y + 7);
      setFill(scoreCol); doc.roundedRect(W - 42, y, 30, 10, 2, 2, 'F');
      setTxt(IVY.white); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.text(`Score ${score.toFixed(1)}/10`, W - 27, y + 7, { align: 'center' });
      y += 18;
      if (doc.autoTable) {
        const tableData = metrics.filter(m => d.metrics[m.key] != null).map(m => {
          const goal    = goalMap[m.key];
          const goalStr = goal != null ? formatMetricValue(goal, m.type) : '—';
          const pct     = goal && d.metrics[m.key] != null
            ? Math.min(100, Math.round((d.metrics[m.key] / goal) * 100)) + '%' : '—';
          return [m.label, formatMetricValue(d.metrics[m.key], m.type), goalStr, pct];
        });
        if (tableData.length > 0) {
          doc.autoTable({
            startY: y,
            head: [['Métrica', 'Resultado', 'Meta', 'Atingimento']],
            body: tableData,
            margin: { left: 14, right: 14 },
            styles: { fontSize: 9, cellPadding: 4, font: 'helvetica', textColor: IVY.gray1 },
            headStyles: { fillColor: IVY.purple, textColor: IVY.white, fontStyle: 'bold', fontSize: 9 },
            alternateRowStyles: { fillColor: [248, 245, 255] },
            columnStyles: {
              0: { cellWidth: 70 },
              1: { halign: 'right', fontStyle: 'bold' },
              2: { halign: 'right', textColor: IVY.gray2 },
              3: { halign: 'right' }
            },
            didParseCell(data) {
              if (data.section === 'body' && data.column.index === 3 && data.cell.raw !== '—') {
                const pctNum = parseInt(data.cell.raw);
                if (!isNaN(pctNum))
                  data.cell.styles.textColor = pctNum >= 100 ? IVY.green : pctNum >= 70 ? IVY.amber : IVY.red;
              }
            }
          });
          y = doc.lastAutoTable.finalY + 6;
        }
      } else {
        metrics.filter(m => d.metrics[m.key] != null).forEach(m => {
          checkY(10);
          setTxt(IVY.gray2); doc.setFontSize(9); doc.setFont('helvetica', 'normal');
          doc.text(m.label, 14, y);
          setTxt(IVY.gray1); doc.setFont('helvetica', 'bold');
          doc.text(formatMetricValue(d.metrics[m.key], m.type), W - 14, y, { align: 'right' });
          y += 8;
        });
        y += 4;
      }
      if (d.observations) {
        checkY(16);
        setFill([255, 251, 235]); doc.roundedRect(14, y, W - 28, 12, 2, 2, 'F');
        setFill(IVY.gold); doc.rect(14, y, 3, 12, 'F');
        setTxt([120, 90, 0]); doc.setFontSize(8); doc.setFont('helvetica', 'italic');
        doc.text(doc.splitTextToSize(d.observations, W - 42)[0], 22, y + 8);
        y += 18;
      }
      if (d.best_post_url) {
        checkY(10);
        setTxt(IVY.gray2); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
        doc.text('Melhor Post: ', 14, y);
        setTxt(IVY.purple);
        doc.textWithLink(truncate(d.best_post_url, 60), 40, y, { url: d.best_post_url });
        y += 10;
      }
      y += 6;
    }

    // FOOTER ALL PAGES
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 2; i <= pageCount; i++) {
      doc.setPage(i);
      setFill(IVY.purpleDk); doc.rect(0, H - 10, W, 10, 'F');
      setTxt([180, 130, 220]); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
      doc.text(`${agencyName} — Relatório Confidencial`, 14, H - 4);
      doc.text(`Página ${i - 1} de ${pageCount - 1} — ${new Date().toLocaleDateString('pt-BR')}`, W - 14, H - 4, { align: 'right' });
      setFill(IVY.gold); doc.rect(0, H - 1, W, 1, 'F');
    }

    const filename = `relatorio_${client.name.replace(/\s+/g,'_')}_${MONTHS[selectedMonth-1]}_${selectedYear}.pdf`;
    doc.save(filename);
    if (btn) { btn.textContent = '📄 Gerar Relatório'; btn.disabled = false; }
    showToast('PDF gerado com sucesso! ✅', 'success');
    showWhatsAppModal(client, filename);
  } catch (err) {
    console.error('PDF error:', err);
    showToast('Erro ao gerar PDF: ' + err.message, 'error');
    if (btn) { btn.textContent = '📄 Gerar Relatório'; btn.disabled = false; }
  }
}

// ============================================================
// WHATSAPP SHARE MODAL
// ============================================================
function showWhatsAppModal(client, filename) {
  const period  = `${MONTHS[selectedMonth-1]} / ${selectedYear}`;
  const msgText =
    `Olá, ${client.contact_name || client.name}! 😊\n\n` +
    `Segue o relatório de performance de *${period}*.\n\n` +
    `O arquivo *${filename}* traz um resumo detalhado das métricas das suas plataformas.\n\n` +
    `Qualquer dúvida, estamos à disposição! 🚀`;
  const msg    = encodeURIComponent(msgText);
  const phone  = (client.whatsapp || client.phone || '').replace(/\D/g, '');
  const waLink = phone ? `https://wa.me/55${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal-sm" style="max-width:440px;">
      <div class="modal-header" style="background:linear-gradient(135deg,#1A0530,#4A1070);border-radius:12px 12px 0 0;">
        <h2 class="modal-title" style="color:#EFC219;">✅ PDF Gerado!</h2>
        <button class="modal-close" style="color:rgba(255,255,255,.6);" id="close-wa">✕</button>
      </div>
      <div class="modal-body" style="padding:24px;">
        <div style="text-align:center;margin-bottom:20px;">
          <div style="font-size:40px;margin-bottom:8px;">📄</div>
          <div style="font-size:14px;font-weight:700;margin-bottom:4px;">${sanitize(filename)}</div>
          <div style="font-size:12px;color:var(--text-secondary);">Baixado automaticamente</div>
        </div>
        <div style="background:var(--surface-2);border-radius:10px;padding:14px;margin-bottom:16px;">
          <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:8px;text-transform:uppercase;">Mensagem pré-formatada</div>
          <div style="font-size:12px;color:var(--text-primary);white-space:pre-wrap;line-height:1.6;">${msgText}</div>
        </div>
        ${!phone
          ? `<div style="font-size:11px;color:#92400e;padding:8px 12px;background:#fffbeb;border-radius:6px;border-left:3px solid #f59e0b;margin-bottom:12px;">⚠️ Nenhum WhatsApp cadastrado para este cliente.</div>`
          : `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">Enviar para: <strong>+55 ${phone}</strong></div>`}
      </div>
      <div class="modal-footer" style="gap:8px;">
        <button class="btn-secondary" id="close-wa-2">Fechar</button>
        <button id="btn-wa" style="background:#25d366;color:#fff;border:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
          Enviar via WhatsApp
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#close-wa').addEventListener('click',   () => overlay.remove());
  overlay.querySelector('#close-wa-2').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#btn-wa').addEventListener('click', () => { window.open(waLink, '_blank'); overlay.remove(); });
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}
