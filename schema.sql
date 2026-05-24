-- ============================================================
-- SISTEMA DE GESTÃO DE AGÊNCIA DE MARKETING
-- Schema Supabase / PostgreSQL
-- Execute este arquivo no SQL Editor do Supabase
-- ============================================================

-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUM TYPES
-- ============================================================
CREATE TYPE user_role AS ENUM ('master', 'admin', 'manager', 'collaborator');
CREATE TYPE client_status AS ENUM ('lead', 'proposal', 'onboarding', 'active', 'at_risk', 'churned');
CREATE TYPE task_status AS ENUM ('briefing', 'production', 'review', 'approval', 'done', 'cancelled');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE task_type AS ENUM ('recurring', 'briefing', 'internal');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'overdue', 'cancelled');
CREATE TYPE message_channel AS ENUM ('whatsapp', 'instagram', 'facebook', 'email', 'internal');
CREATE TYPE message_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE service_type AS ENUM ('social_media', 'traffic', 'seo', 'website', 'branding', 'other');

-- ============================================================
-- PROFILES (extensão do auth.users do Supabase)
-- ============================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'collaborator',
  avatar_url TEXT,
  phone TEXT,
  position TEXT,
  is_active BOOLEAN DEFAULT true,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TEAM MEMBERS (RH completo — pode ou não ter login no sistema)
-- ============================================================
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  cpf TEXT,
  rg TEXT,
  birth_date DATE,
  address JSONB DEFAULT '{}',
  position TEXT NOT NULL,
  role user_role DEFAULT 'collaborator',
  hire_date DATE,
  salary DECIMAL(10,2),
  bank_info JSONB DEFAULT '{}',
  emergency_contact JSONB DEFAULT '{}',
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documentos dos colaboradores (armazenados no Supabase Storage)
CREATE TABLE team_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'rg', 'cpf', 'contrato', 'outro'
  storage_path TEXT NOT NULL,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pagamentos aos colaboradores
CREATE TABLE team_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  paid_date DATE,
  payment_method TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ausências e férias
CREATE TABLE team_absences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'ferias', 'falta', 'atestado', 'folga'
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  notes TEXT,
  approved_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CLIENTS
-- ============================================================
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  company_name TEXT,
  cnpj TEXT,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  address JSONB DEFAULT '{}',
  status client_status NOT NULL DEFAULT 'lead',
  assigned_manager_id UUID REFERENCES profiles(id),
  services service_type[] DEFAULT '{}',
  segment TEXT,
  instagram_handle TEXT,
  facebook_page TEXT,
  tiktok_handle TEXT,
  website TEXT,
  google_business_id TEXT,
  notes TEXT,
  health_score INTEGER DEFAULT 100 CHECK (health_score BETWEEN 0 AND 100),
  contract_start_date DATE,
  contract_end_date DATE,
  monthly_value DECIMAL(10,2),
  lead_source TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Credenciais dos clientes (cofre de senhas)
CREATE TABLE client_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  label TEXT NOT NULL,
  username TEXT,
  password_encrypted TEXT, -- criptografado com pgcrypto
  url TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reuniões e atas
CREATE TABLE client_meetings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  meeting_date TIMESTAMPTZ NOT NULL,
  participants TEXT[],
  summary TEXT,
  action_items JSONB DEFAULT '[]',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- NPS / Satisfação mensal
CREATE TABLE client_nps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 10),
  feedback TEXT,
  recorded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, month, year)
);

-- Checklist de onboarding
CREATE TABLE onboarding_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES profiles(id),
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TASKS (Demandas & Tarefas)
-- ============================================================
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  type task_type NOT NULL DEFAULT 'briefing',
  status task_status NOT NULL DEFAULT 'briefing',
  priority task_priority NOT NULL DEFAULT 'medium',
  assigned_to UUID[] DEFAULT '{}',
  due_date DATE,
  scheduled_date DATE,
  is_recurring BOOLEAN DEFAULT false,
  recurrence_day INTEGER CHECK (recurrence_day BETWEEN 1 AND 31),
  recurrence_months INTEGER[], -- meses em que se repete (null = todos)
  checklist JSONB DEFAULT '[]', -- [{id, text, done}]
  tags TEXT[] DEFAULT '{}',
  estimated_hours DECIMAL(5,2),
  actual_hours DECIMAL(5,2),
  parent_task_id UUID REFERENCES tasks(id),
  created_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comentários nas tarefas
CREATE TABLE task_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  content TEXT NOT NULL,
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Histórico de revisões
CREATE TABLE task_revisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL, -- 'submitted', 'approved', 'rejected'
  feedback TEXT,
  reviewed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- MONITORING (Monitoramento de clientes)
-- ============================================================
CREATE TABLE monitoring_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  platform TEXT NOT NULL, -- 'instagram', 'facebook', 'tiktok', 'gmb', 'traffic'
  metrics JSONB NOT NULL DEFAULT '{}',
  observations TEXT,
  best_post_url TEXT,
  best_post_image_url TEXT,
  score DECIMAL(4,2),
  recorded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, month, year, platform)
);

-- Metas de monitoramento
CREATE TABLE monitoring_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  target_value DECIMAL(15,2) NOT NULL,
  deadline_month INTEGER,
  deadline_year INTEGER,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, platform, metric_name)
);

-- ============================================================
-- FINANCIAL (Financeiro)
-- ============================================================
CREATE TABLE financial_contracts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  services JSONB NOT NULL DEFAULT '[]', -- [{name, type, value}]
  total_value DECIMAL(10,2) NOT NULL,
  billing_day INTEGER NOT NULL CHECK (billing_day BETWEEN 1 AND 31),
  start_date DATE NOT NULL,
  end_date DATE,
  last_adjustment_date DATE,
  next_adjustment_date DATE,
  payment_method TEXT DEFAULT 'pix',
  asaas_subscription_id TEXT, -- integração futura
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE financial_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES financial_contracts(id),
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  due_date DATE NOT NULL,
  paid_date DATE,
  status payment_status NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  asaas_payment_id TEXT, -- para baixa automática futura
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  notified_3days BOOLEAN DEFAULT false,
  notified_dueday BOOLEAN DEFAULT false,
  notified_overdue BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, month, year)
);

-- ============================================================
-- MESSAGING (Caixa de entrada omnichannel)
-- ============================================================
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  channel message_channel NOT NULL,
  external_id TEXT, -- ID externo (WhatsApp ID, Instagram thread ID)
  contact_name TEXT,
  contact_identifier TEXT, -- número de telefone ou username
  status TEXT DEFAULT 'open', -- 'open', 'handled', 'closed'
  assigned_to UUID REFERENCES profiles(id),
  ai_handled BOOLEAN DEFAULT false,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(channel, external_id)
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction message_direction NOT NULL,
  content TEXT NOT NULL,
  media_url TEXT,
  media_type TEXT,
  is_read BOOLEAN DEFAULT false,
  sent_by UUID REFERENCES profiles(id), -- null = IA ou plataforma externa
  external_message_id TEXT,
  ai_generated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AI KNOWLEDGE BASE (Base de conhecimento para o pré-atendente)
-- ============================================================
CREATE TABLE ai_knowledge (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category TEXT NOT NULL, -- 'services', 'pricing', 'faq', 'persona', 'rules'
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  order_index INTEGER DEFAULT 0,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ACTIVITY LOG
-- ============================================================
CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT, -- 'client', 'task', 'payment', etc
  entity_id UUID,
  entity_name TEXT,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SYSTEM CONFIG
-- ============================================================
CREATE TABLE system_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  updated_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Configurações padrão do sistema
INSERT INTO system_config (key, value) VALUES
  ('agency_info', '{"name": "Minha Agência", "logo_url": "", "primary_color": "#6366f1", "whatsapp": "", "email": ""}'),
  ('evolution_api', '{"base_url": "", "api_key": "", "instance": ""}'),
  ('anthropic_api', '{"api_key": "", "model": "claude-3-haiku-20240307", "enabled": false}'),
  ('asaas_api', '{"api_key": "", "environment": "sandbox", "enabled": false}'),
  ('notification_templates', '{"reminder_3days": "Olá {nome}, seu pagamento de R$ {valor} vence em 3 dias ({data}). Qualquer dúvida estamos à disposição! 😊", "reminder_dueday": "Olá {nome}, hoje é o vencimento do seu pagamento de R$ {valor}. Para facilitar, segue nosso PIX: {pix_key} 💙", "overdue": "Olá {nome}, identificamos que o pagamento de R$ {valor} (vencimento {data}) ainda está em aberto. Podemos ajudar a resolver? 🙏"}'),
  ('onboarding_template', '["Coletar acesso ao Instagram", "Coletar acesso ao Facebook/Meta Business", "Coletar acesso ao Google Meu Negócio", "Coletar acesso ao TikTok", "Coletar acesso ao Google Analytics", "Contrato assinado e digitalizado", "Reunião de briefing realizada", "Calendário editorial do 1º mês aprovado", "Configurações de pixel e tag manager", "Acesso ao gerenciador de anúncios (Meta Ads / Google Ads)"]');

-- ============================================================
-- ÍNDICES PARA PERFORMANCE
-- ============================================================
CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_clients_manager ON clients(assigned_manager_id);
CREATE INDEX idx_tasks_client ON tasks(client_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_assigned ON tasks USING GIN(assigned_to);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_monitoring_client_month ON monitoring_data(client_id, month, year);
CREATE INDEX idx_payments_status ON financial_payments(status);
CREATE INDEX idx_payments_due_date ON financial_payments(due_date);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_conversations_client ON conversations(client_id);
CREATE INDEX idx_activity_log_user ON activity_log(user_id);
CREATE INDEX idx_activity_log_created ON activity_log(created_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_nps ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitoring_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitoring_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

-- Função helper para checar role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_admin_or_above()
RETURNS BOOLEAN AS $$
  SELECT role IN ('master', 'admin') FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_manager_or_above()
RETURNS BOOLEAN AS $$
  SELECT role IN ('master', 'admin', 'manager') FROM profiles WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER;

-- PROFILES: todos veem, só admin/master editam outros
CREATE POLICY "profiles_select" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "profiles_admin" ON profiles FOR ALL USING (is_admin_or_above());

-- TEAM MEMBERS: admin/master total, manager lê, colaborador lê próprio
CREATE POLICY "team_admin" ON team_members FOR ALL USING (is_admin_or_above());
CREATE POLICY "team_manager_select" ON team_members FOR SELECT USING (is_manager_or_above());

-- CLIENTS: master/admin tudo; manager vê seus clientes; colaborador vê vinculados
CREATE POLICY "clients_admin" ON clients FOR ALL USING (is_admin_or_above());
CREATE POLICY "clients_manager" ON clients FOR SELECT USING (
  is_manager_or_above() AND (assigned_manager_id = auth.uid() OR is_admin_or_above())
);
CREATE POLICY "clients_collaborator" ON clients FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM tasks
    WHERE tasks.client_id = clients.id
    AND auth.uid() = ANY(tasks.assigned_to)
  )
);

-- CREDENCIAIS: apenas admin/master e manager do cliente
CREATE POLICY "credentials_access" ON client_credentials FOR ALL USING (
  is_admin_or_above() OR
  EXISTS (SELECT 1 FROM clients WHERE id = client_credentials.client_id AND assigned_manager_id = auth.uid())
);

-- TASKS: admin/master tudo; outros veem tarefas assignadas ou do cliente deles
CREATE POLICY "tasks_admin" ON tasks FOR ALL USING (is_admin_or_above());
CREATE POLICY "tasks_assigned" ON tasks FOR SELECT USING (
  auth.uid() = ANY(assigned_to) OR
  EXISTS (SELECT 1 FROM clients WHERE id = tasks.client_id AND assigned_manager_id = auth.uid())
);
CREATE POLICY "tasks_update_assigned" ON tasks FOR UPDATE USING (auth.uid() = ANY(assigned_to));

-- FINANCEIRO: apenas master/admin
CREATE POLICY "financial_admin" ON financial_contracts FOR ALL USING (is_admin_or_above());
CREATE POLICY "payments_admin" ON financial_payments FOR ALL USING (is_admin_or_above());

-- TEAM PAYMENTS: apenas master/admin
CREATE POLICY "team_payments_admin" ON team_payments FOR ALL USING (is_admin_or_above());
CREATE POLICY "team_docs_admin" ON team_documents FOR ALL USING (is_admin_or_above());

-- MONITORING: admin/master tudo; manager vê seus clientes
CREATE POLICY "monitoring_admin" ON monitoring_data FOR ALL USING (is_admin_or_above());
CREATE POLICY "monitoring_manager" ON monitoring_data FOR SELECT USING (
  EXISTS (SELECT 1 FROM clients WHERE id = monitoring_data.client_id AND assigned_manager_id = auth.uid())
);

-- MESSAGES/CONVERSATIONS: admin/master/manager
CREATE POLICY "conversations_access" ON conversations FOR ALL USING (is_manager_or_above());
CREATE POLICY "messages_access" ON messages FOR ALL USING (is_manager_or_above());

-- AI KNOWLEDGE: master/admin gerencia, todos leem
CREATE POLICY "ai_knowledge_read" ON ai_knowledge FOR SELECT USING (true);
CREATE POLICY "ai_knowledge_admin" ON ai_knowledge FOR ALL USING (is_admin_or_above());

-- SYSTEM CONFIG: master total, outros leem
CREATE POLICY "config_master" ON system_config FOR ALL USING (get_user_role() = 'master');
CREATE POLICY "config_read" ON system_config FOR SELECT USING (is_manager_or_above());

-- ACTIVITY LOG: admin/master veem tudo; colaboradores veem o próprio
CREATE POLICY "log_admin" ON activity_log FOR SELECT USING (is_admin_or_above());
CREATE POLICY "log_own" ON activity_log FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "log_insert" ON activity_log FOR INSERT WITH CHECK (true);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-criar profile após registro
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'collaborator')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_monitoring_updated_at BEFORE UPDATE ON monitoring_data FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON financial_contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON financial_payments FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-calcular health score do cliente
CREATE OR REPLACE FUNCTION calculate_client_health(p_client_id UUID)
RETURNS INTEGER AS $$
DECLARE
  overdue_tasks INTEGER;
  overdue_payment BOOLEAN;
  last_nps INTEGER;
  score INTEGER := 100;
BEGIN
  -- Penalizar por tarefas atrasadas
  SELECT COUNT(*) INTO overdue_tasks
  FROM tasks
  WHERE client_id = p_client_id
    AND due_date < CURRENT_DATE
    AND status NOT IN ('done', 'cancelled');
  score := score - (overdue_tasks * 10);

  -- Penalizar por pagamento em atraso
  SELECT EXISTS(
    SELECT 1 FROM financial_payments
    WHERE client_id = p_client_id AND status = 'overdue'
  ) INTO overdue_payment;
  IF overdue_payment THEN score := score - 25; END IF;

  -- Bonificar/penalizar por NPS
  SELECT score INTO last_nps FROM client_nps
  WHERE client_id = p_client_id
  ORDER BY year DESC, month DESC LIMIT 1;

  IF last_nps IS NOT NULL THEN
    IF last_nps >= 9 THEN score := score + 5;
    ELSIF last_nps <= 5 THEN score := score - 20;
    ELSIF last_nps <= 7 THEN score := score - 10;
    END IF;
  END IF;

  RETURN GREATEST(0, LEAST(100, score));
END;
$$ LANGUAGE plpgsql;

-- Buckets no Supabase Storage (executar separadamente no dashboard)
-- storage.createBucket('team-documents', { public: false })
-- storage.createBucket('client-files', { public: false })
-- storage.createBucket('avatars', { public: true })
-- storage.createBucket('monitoring-assets', { public: true })

-- ============================================================
-- FIM DO SCHEMA
-- ============================================================
