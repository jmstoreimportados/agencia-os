// ============================================================
// CONFIGURAÇÃO GLOBAL — Supabase + Constantes
// ============================================================

// ⚠️ IMPORTANTE: Substitua com suas credenciais do Supabase
// Encontre em: https://app.supabase.com → Seu Projeto → Settings → API
export const SUPABASE_URL = 'https://vfgaopkwofzkzjdyxazp.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmZ2FvcGt3b2Z6a3pqZHl4YXpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2MzMwMTYsImV4cCI6MjA5NTIwOTAxNn0.K7-6o2b8REwAw42oB32AorwZj-8TgorLktXcRTNrcMc';

// Versão do sistema
export const APP_VERSION = '1.0.0';
export const APP_NAME = 'AgênciaOS';

// Roles de acesso (hierarquia)
export const ROLES = {
  MASTER: 'master',
  ADMIN: 'admin',
  MANAGER: 'manager',
  COLLABORATOR: 'collaborator'
};

export const ROLE_LABELS = {
  master: '👑 Master',
  admin: '🛡️ Admin',
  manager: '🤝 Gerente de Conta',
  collaborator: '👷 Colaborador'
};

export const ROLE_HIERARCHY = {
  master: 4,
  admin: 3,
  manager: 2,
  collaborator: 1
};

// ─── STATUS DOS CLIENTES (já contratados) ────────────────────
// Leads ficam SOMENTE no CRM. Aqui são apenas clientes ativos.
export const CLIENT_STATUS = {
  ONBOARDING: 'onboarding',
  ACTIVE: 'active',
  AT_RISK: 'at_risk',
  PAUSED: 'paused',
  CHURNED: 'churned'
};

export const CLIENT_STATUS_LABELS = {
  onboarding: { label: 'Onboarding',   color: '#f59e0b', bg: '#fffbeb', icon: '🚀' },
  active:     { label: 'Ativo',         color: '#10b981', bg: '#f0fdf4', icon: '✅' },
  at_risk:    { label: 'Em Risco',      color: '#f97316', bg: '#fff7ed', icon: '⚠️' },
  paused:     { label: 'Pausado',       color: '#6b7280', bg: '#f9fafb', icon: '⏸️' },
  churned:    { label: 'Encerrado',     color: '#ef4444', bg: '#fef2f2', icon: '🔴' }
};

// ─── STATUS DOS LEADS no CRM ─────────────────────────────────
export const LEAD_STATUS = {
  NEW: 'new',
  CONTACTED: 'contacted',
  PROPOSAL: 'proposal',
  NEGOTIATION: 'negotiation',
  WON: 'won',
  LOST: 'lost'
};

export const LEAD_STATUS_LABELS = {
  new:         { label: 'Novo Lead',        color: '#3b82f6', bg: '#eff6ff', icon: '🎯' },
  contacted:   { label: 'Contatado',        color: '#8b5cf6', bg: '#f5f3ff', icon: '📞' },
  proposal:    { label: 'Proposta Enviada', color: '#f59e0b', bg: '#fffbeb', icon: '📄' },
  negotiation: { label: 'Em Negociação',   color: '#0ea5e9', bg: '#f0f9ff', icon: '🤝' },
  won:         { label: 'Ganho ✓',         color: '#10b981', bg: '#f0fdf4', icon: '🏆' },
  lost:        { label: 'Perdido',          color: '#ef4444', bg: '#fef2f2', icon: '❌' }
};

// Status das tarefas
export const TASK_STATUS = {
  BRIEFING: 'briefing',
  PRODUCTION: 'production',
  REVIEW: 'review',
  APPROVAL: 'approval',
  DONE: 'done',
  CANCELLED: 'cancelled'
};

export const TASK_STATUS_LABELS = {
  briefing: { label: 'Briefing', color: '#6366f1', bg: '#eef2ff', icon: '📝' },
  production: { label: 'Produção', color: '#f59e0b', bg: '#fffbeb', icon: '⚙️' },
  review: { label: 'Revisão', color: '#8b5cf6', bg: '#f5f3ff', icon: '🔍' },
  approval: { label: 'Aprovação', color: '#0ea5e9', bg: '#f0f9ff', icon: '✔️' },
  done: { label: 'Concluído', color: '#10b981', bg: '#f0fdf4', icon: '🚀' },
  cancelled: { label: 'Cancelado', color: '#6b7280', bg: '#f9fafb', icon: '❌' }
};

// Prioridades
export const TASK_PRIORITY_LABELS = {
  low: { label: 'Baixa', color: '#6b7280', bg: '#f9fafb' },
  medium: { label: 'Média', color: '#f59e0b', bg: '#fffbeb' },
  high: { label: 'Alta', color: '#f97316', bg: '#fff7ed' },
  urgent: { label: 'Urgente', color: '#ef4444', bg: '#fef2f2' }
};

// Status de pagamento
export const PAYMENT_STATUS_LABELS = {
  pending: { label: 'Pendente', color: '#f59e0b', bg: '#fffbeb', icon: '⏳' },
  paid: { label: 'Pago', color: '#10b981', bg: '#f0fdf4', icon: '✅' },
  overdue: { label: 'Inadimplente', color: '#ef4444', bg: '#fef2f2', icon: '🔴' },
  cancelled: { label: 'Cancelado', color: '#6b7280', bg: '#f9fafb', icon: '❌' }
};

// Serviços oferecidos
export const SERVICES = {
  social_media: { label: 'Social Media', icon: '📱', color: '#ec4899' },
  traffic: { label: 'Tráfego Pago', icon: '📡', color: '#f97316' },
  seo: { label: 'SEO / Google', icon: '🔍', color: '#22c55e' },
  website: { label: 'Site / Landing Page', icon: '🌐', color: '#3b82f6' },
  branding: { label: 'Branding', icon: '🎨', color: '#8b5cf6' },
  other: { label: 'Outro', icon: '📦', color: '#6b7280' }
};

// Plataformas de monitoramento
export const PLATFORMS = {
  instagram: { label: 'Instagram', icon: '📸', color: '#e1306c' },
  facebook: { label: 'Facebook', icon: '📘', color: '#1877f2' },
  tiktok: { label: 'TikTok', icon: '🎵', color: '#010101' },
  gmb: { label: 'Google Meu Negócio', icon: '🏢', color: '#34a853' },
  traffic: { label: 'Tráfego Pago', icon: '💰', color: '#f97316' }
};

// Métricas por plataforma
export const PLATFORM_METRICS = {
  instagram: [
    { key: 'followers', label: 'Seguidores', type: 'number' },
    { key: 'followers_growth', label: 'Novos Seguidores', type: 'number' },
    { key: 'reach', label: 'Alcance', type: 'number' },
    { key: 'impressions', label: 'Impressões', type: 'number' },
    { key: 'engagement_rate', label: 'Taxa de Engajamento', type: 'percent' },
    { key: 'posts_count', label: 'Posts Publicados', type: 'number' },
    { key: 'stories_count', label: 'Stories', type: 'number' },
    { key: 'reels_count', label: 'Reels', type: 'number' }
  ],
  facebook: [
    { key: 'followers', label: 'Seguidores / Curtidas', type: 'number' },
    { key: 'reach', label: 'Alcance', type: 'number' },
    { key: 'impressions', label: 'Impressões', type: 'number' },
    { key: 'engagement_rate', label: 'Taxa de Engajamento', type: 'percent' },
    { key: 'posts_count', label: 'Posts Publicados', type: 'number' }
  ],
  tiktok: [
    { key: 'followers', label: 'Seguidores', type: 'number' },
    { key: 'views', label: 'Visualizações', type: 'number' },
    { key: 'likes', label: 'Curtidas', type: 'number' },
    { key: 'engagement_rate', label: 'Taxa de Engajamento', type: 'percent' },
    { key: 'videos_count', label: 'Vídeos Publicados', type: 'number' }
  ],
  gmb: [
    { key: 'reviews_count', label: 'Total de Avaliações', type: 'number' },
    { key: 'avg_rating', label: 'Nota Média', type: 'decimal' },
    { key: 'new_reviews', label: 'Novas Avaliações no Mês', type: 'number' },
    { key: 'searches', label: 'Buscas', type: 'number' },
    { key: 'clicks', label: 'Cliques no Perfil', type: 'number' },
    { key: 'calls', label: 'Ligações', type: 'number' },
    { key: 'direction_requests', label: 'Solicitações de Rota', type: 'number' }
  ],
  traffic: [
    { key: 'investment', label: 'Investimento (R$)', type: 'currency' },
    { key: 'impressions', label: 'Impressões', type: 'number' },
    { key: 'clicks', label: 'Cliques', type: 'number' },
    { key: 'ctr', label: 'CTR (%)', type: 'percent' },
    { key: 'leads', label: 'Leads Gerados', type: 'number' },
    { key: 'cpl', label: 'CPL (R$)', type: 'currency' },
    { key: 'conversions', label: 'Conversões', type: 'number' },
    { key: 'roas', label: 'ROAS', type: 'decimal' }
  ]
};

// Meses
export const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// Rotas do sistema
export const ROUTES = {
  LOGIN: 'login',
  DASHBOARD: 'dashboard',
  CLIENTS: 'clients',
  CRM: 'crm',
  SUPPORT: 'support',
  TASKS: 'tasks',
  CALENDAR: 'calendar',
  TEAM: 'team',
  MONITORING: 'monitoring',
  FINANCIAL: 'financial',
  INBOX: 'inbox',
  SETTINGS: 'settings',
  AI_CONFIG: 'ai-config'
};

// Permissões por rota
export const ROUTE_PERMISSIONS = {
  dashboard: ['master', 'admin', 'manager', 'collaborator'],
  clients: ['master', 'admin', 'manager', 'collaborator'],
  crm: ['master', 'admin', 'manager'],
  support: ['master', 'admin', 'manager', 'collaborator'],
  tasks: ['master', 'admin', 'manager', 'collaborator'],
  calendar: ['master', 'admin', 'manager', 'collaborator'],
  team: ['master', 'admin'],
  monitoring: ['master', 'admin', 'manager'],
  financial: ['master', 'admin'],
  inbox: ['master', 'admin', 'manager'],
  settings: ['master'],
  'ai-config': ['master', 'admin']
};
