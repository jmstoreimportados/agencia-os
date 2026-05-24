// ============================================================
// UTILITÁRIOS GLOBAIS
// ============================================================

import { MONTHS } from './config.js';

// Formatar moeda BRL
export function formatCurrency(value) {
  if (value == null) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

// Formatar número com separador de milhar
export function formatNumber(value) {
  if (value == null) return '0';
  return new Intl.NumberFormat('pt-BR').format(value);
}

// Formatar percentual
export function formatPercent(value) {
  if (value == null) return '0%';
  return `${Number(value).toFixed(2).replace('.', ',')}%`;
}

// Formatar data
export function formatDate(date, options = {}) {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d)) return '—';
  const defaultOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
  return d.toLocaleDateString('pt-BR', { ...defaultOptions, ...options });
}

// Formatar data e hora
export function formatDateTime(date) {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d)) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// Formatar tempo relativo ("há 2 horas", "há 3 dias")
export function timeAgo(date) {
  if (!date) return '';
  const now = new Date();
  const d = new Date(date);
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'agora';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `há ${Math.floor(diff / 86400)} dias`;
  return formatDate(date);
}

// Mês/Ano formatado
export function formatMonthYear(month, year) {
  return `${MONTHS[month - 1]}/${year}`;
}

// Gerar iniciais do nome
export function getInitials(name) {
  if (!name) return '?';
  return name.split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(n => n[0].toUpperCase())
    .join('');
}

// Gerar cor de avatar baseada no nome
export function getAvatarColor(name) {
  if (!name) return '#6366f1';
  const colors = [
    '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f97316',
    '#f59e0b', '#10b981', '#14b8a6', '#0ea5e9', '#3b82f6'
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

// Renderizar avatar (foto ou iniciais)
export function renderAvatar(profile, size = 36) {
  const name = profile?.full_name || profile?.name || '?';
  const style = `width:${size}px;height:${size}px;border-radius:50%;font-size:${Math.floor(size * 0.38)}px;
    font-weight:700;display:inline-flex;align-items:center;justify-content:center;
    color:white;flex-shrink:0;`;

  if (profile?.avatar_url) {
    return `<img src="${profile.avatar_url}" alt="${name}" style="${style}object-fit:cover;">`;
  }
  const bg = getAvatarColor(name);
  return `<div style="${style}background:${bg};">${getInitials(name)}</div>`;
}

// Truncar texto
export function truncate(text, maxLength = 60) {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

// Gerar UUID v4 simples (para IDs temporários no frontend)
export function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Debounce
export function debounce(fn, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

// Verificar se data está vencida
export function isOverdue(date) {
  if (!date) return false;
  return new Date(date) < new Date(new Date().toDateString());
}

// Dias até o vencimento (negativo = já venceu)
export function daysUntil(date) {
  if (!date) return null;
  const now = new Date(new Date().toDateString());
  const d = new Date(date);
  return Math.round((d - now) / 86400000);
}

// Formatar dias relativos
export function formatDaysRelative(date) {
  const days = daysUntil(date);
  if (days === null) return '—';
  if (days === 0) return 'Hoje';
  if (days === 1) return 'Amanhã';
  if (days === -1) return 'Ontem';
  if (days > 0) return `Em ${days} dias`;
  return `${Math.abs(days)} dias atrás`;
}

// Health score → cor e label
export function getHealthColor(score) {
  if (score >= 80) return { color: '#10b981', bg: '#f0fdf4', label: 'Saudável', icon: '🟢' };
  if (score >= 50) return { color: '#f59e0b', bg: '#fffbeb', label: 'Atenção', icon: '🟡' };
  return { color: '#ef4444', bg: '#fef2f2', label: 'Em Risco', icon: '🔴' };
}

// Mostrar toast de notificação
export function showToast(message, type = 'success', duration = 3500) {
  const existing = document.getElementById('toast-container');
  if (!existing) {
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(container);
  }

  const colors = {
    success: { bg: '#10b981', icon: '✅' },
    error: { bg: '#ef4444', icon: '❌' },
    warning: { bg: '#f59e0b', icon: '⚠️' },
    info: { bg: '#3b82f6', icon: 'ℹ️' }
  };
  const { bg, icon } = colors[type] || colors.info;

  const toast = document.createElement('div');
  toast.style.cssText = `
    background:${bg};color:white;padding:12px 18px;border-radius:10px;
    font-size:13px;font-weight:500;display:flex;align-items:center;gap:8px;
    box-shadow:0 4px 12px rgba(0,0,0,.15);animation:slideIn .2s ease;
    max-width:340px;
  `;
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;

  document.getElementById('toast-container').appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all .3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Mostrar modal de confirmação
export function showConfirm(message, title = 'Confirmar') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:white;border-radius:16px;padding:28px;max-width:420px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,.2);">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:10px;color:#111827;">${title}</h3>
        <p style="font-size:14px;color:#6b7280;margin-bottom:24px;line-height:1.6;">${message}</p>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button id="confirm-cancel" style="padding:10px 20px;border-radius:8px;border:1px solid #e5e7eb;background:white;font-size:13px;cursor:pointer;color:#374151;">Cancelar</button>
          <button id="confirm-ok" style="padding:10px 20px;border-radius:8px;border:none;background:#ef4444;color:white;font-size:13px;font-weight:600;cursor:pointer;">Confirmar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#confirm-ok').onclick = () => { overlay.remove(); resolve(true); };
    overlay.querySelector('#confirm-cancel').onclick = () => { overlay.remove(); resolve(false); };
  });
}

// Loading spinner inline
export function renderSpinner(size = 20, color = '#6366f1') {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" style="animation:spin 1s linear infinite;">
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
  </svg>`;
}

// Estado vazio (empty state)
export function renderEmptyState(icon, title, subtitle, actionLabel = null, actionId = null) {
  return `
    <div style="text-align:center;padding:60px 20px;color:#9ca3af;">
      <div style="font-size:48px;margin-bottom:12px;">${icon}</div>
      <div style="font-size:16px;font-weight:600;color:#374151;margin-bottom:6px;">${title}</div>
      <div style="font-size:13px;margin-bottom:${actionLabel ? '20px' : '0'}">${subtitle}</div>
      ${actionLabel ? `<button id="${actionId}" class="btn-primary" style="margin:0 auto;">${actionLabel}</button>` : ''}
    </div>
  `;
}

// Sanitizar HTML (evitar XSS)
export function sanitize(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Criptografar senha simples (Base64 — para armazenamento no cofre)
// Nota: use Supabase Vault para produção com dados sensíveis
export function simpleEncrypt(text) {
  return btoa(unescape(encodeURIComponent(text)));
}

export function simpleDecrypt(encoded) {
  try {
    return decodeURIComponent(escape(atob(encoded)));
  } catch { return ''; }
}

// Formatar CPF
export function formatCPF(cpf) {
  if (!cpf) return '';
  return cpf.replace(/\D/g, '')
    .replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

// Formatar CNPJ
export function formatCNPJ(cnpj) {
  if (!cnpj) return '';
  return cnpj.replace(/\D/g, '')
    .replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

// Formatar telefone
export function formatPhone(phone) {
  if (!phone) return '';
  const d = phone.replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return phone;
}

// Exportar dados para CSV
export function exportToCSV(data, filename) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => `"${(row[h] ?? '').toString().replace(/"/g, '""')}"`).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
}

// Calcular MRR
export function calculateMRR(clients) {
  return clients
    .filter(c => c.status === 'active')
    .reduce((sum, c) => sum + (c.monthly_value || 0), 0);
}

// Verificar permissão de acesso
export function hasPermission(userRole, allowedRoles) {
  return allowedRoles.includes(userRole);
}
