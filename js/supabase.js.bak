// ============================================================
// CLIENTE SUPABASE + OPERAÇÕES DE BANCO
// ============================================================

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Inicializar cliente Supabase (carregado via CDN no index.html)
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

// Estado global do usuário autenticado
export let currentUser = null;
export let currentProfile = null;

export function setCurrentUser(user) { currentUser = user; }
export function setCurrentProfile(profile) { currentProfile = profile; }

// ============================================================
// AUTH
// ============================================================
export const auth = {
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  async getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session;
  },

  async getProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data;
  },

  async updateProfile(userId, updates) {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updatePassword(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },

  async createUser(email, password, metadata) {
    // Admin cria usuário (requer service role key — ver README)
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: metadata }
    });
    if (error) throw error;
    return data;
  },

  async uploadAvatar(userId, file) {
    const ext = file.name.split('.').pop();
    const path = `${userId}/avatar.${ext}`;
    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return data.publicUrl;
  }
};

// ============================================================
// CLIENTS
// ============================================================
export const clientsDB = {
  async getAll(filters = {}) {
    let query = supabase.from('clients').select(`
      *,
      assigned_manager:profiles!assigned_manager_id(id, full_name, avatar_url)
    `).order('created_at', { ascending: false });

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.manager) query = query.eq('assigned_manager_id', filters.manager);
    if (filters.search) query = query.ilike('name', `%${filters.search}%`);
    if (filters.active !== undefined) query = query.eq('is_active', filters.active);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async getById(id) {
    const { data, error } = await supabase
      .from('clients')
      .select(`
        *,
        assigned_manager:profiles!assigned_manager_id(id, full_name, avatar_url, phone),
        onboarding_items(*),
        client_nps(* ORDER BY year DESC, month DESC LIMIT 6),
        financial_contracts(*)
      `)
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async create(data) {
    const { data: client, error } = await supabase
      .from('clients')
      .insert(data)
      .select()
      .single();
    if (error) throw error;

    // Criar checklist de onboarding padrão
    const config = await configDB.get('onboarding_template');
    if (config) {
      const items = config.map((item, i) => ({
        client_id: client.id,
        item,
        order_index: i
      }));
      await supabase.from('onboarding_items').insert(items);
    }
    return client;
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('clients')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const { error } = await supabase.from('clients').delete().eq('id', id);
    if (error) throw error;
  },

  async getCredentials(clientId) {
    const { data, error } = await supabase
      .from('client_credentials')
      .select('*')
      .eq('client_id', clientId)
      .order('platform');
    if (error) throw error;
    return data;
  },

  async saveCredential(credential) {
    const { data, error } = await supabase
      .from('client_credentials')
      .upsert(credential)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getMeetings(clientId) {
    const { data, error } = await supabase
      .from('client_meetings')
      .select('*, created_by_profile:profiles!created_by(full_name)')
      .eq('client_id', clientId)
      .order('meeting_date', { ascending: false });
    if (error) throw error;
    return data;
  },

  async createMeeting(meeting) {
    const { data, error } = await supabase
      .from('client_meetings')
      .insert(meeting)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getNPS(clientId) {
    const { data, error } = await supabase
      .from('client_nps')
      .select('*')
      .eq('client_id', clientId)
      .order('year', { ascending: false })
      .order('month', { ascending: false });
    if (error) throw error;
    return data;
  },

  async saveNPS(npsData) {
    const { data, error } = await supabase
      .from('client_nps')
      .upsert(npsData)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
};

// ============================================================
// TASKS
// ============================================================
export const tasksDB = {
  async getAll(filters = {}) {
    let query = supabase.from('tasks').select(`
      *,
      client:clients(id, name),
      creator:profiles!created_by(id, full_name, avatar_url)
    `).neq('status', 'cancelled').order('due_date', { ascending: true, nullsFirst: false });

    if (filters.client_id) query = query.eq('client_id', filters.client_id);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.assigned_to) query = query.contains('assigned_to', [filters.assigned_to]);
    if (filters.type) query = query.eq('type', filters.type);
    if (filters.month && filters.year) {
      const start = `${filters.year}-${String(filters.month).padStart(2, '0')}-01`;
      const end = new Date(filters.year, filters.month, 0).toISOString().split('T')[0];
      query = query.gte('scheduled_date', start).lte('scheduled_date', end);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async getById(id) {
    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        client:clients(id, name),
        task_comments(*, user:profiles(id, full_name, avatar_url)),
        task_revisions(*),
        creator:profiles!created_by(id, full_name, avatar_url)
      `)
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async create(task) {
    const { data, error } = await supabase
      .from('tasks')
      .insert(task)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('tasks')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async addComment(taskId, userId, content) {
    const { data, error } = await supabase
      .from('task_comments')
      .insert({ task_id: taskId, user_id: userId, content })
      .select('*, user:profiles(id, full_name, avatar_url)')
      .single();
    if (error) throw error;
    return data;
  },

  async addRevision(taskId, status, feedback, reviewedBy) {
    // Buscar versão atual
    const { data: revisions } = await supabase
      .from('task_revisions')
      .select('version')
      .eq('task_id', taskId)
      .order('version', { ascending: false })
      .limit(1);

    const version = revisions?.length ? revisions[0].version + 1 : 1;

    const { data, error } = await supabase
      .from('task_revisions')
      .insert({ task_id: taskId, version, status, feedback, reviewed_by: reviewedBy })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async generateRecurring(month, year) {
    // Criar tarefas recorrentes para o mês
    const { data: recurring } = await supabase
      .from('tasks')
      .select('*')
      .eq('is_recurring', true)
      .eq('type', 'recurring');

    if (!recurring?.length) return 0;

    const newTasks = recurring.map(t => ({
      client_id: t.client_id,
      title: t.title,
      description: t.description,
      type: 'recurring',
      status: 'briefing',
      priority: t.priority,
      assigned_to: t.assigned_to,
      scheduled_date: `${year}-${String(month).padStart(2, '0')}-${String(t.recurrence_day || 1).padStart(2, '0')}`,
      due_date: `${year}-${String(month).padStart(2, '0')}-${String(t.recurrence_day || 28).padStart(2, '0')}`,
      is_recurring: false,
      tags: t.tags,
      estimated_hours: t.estimated_hours,
      created_by: t.created_by
    }));

    const { data, error } = await supabase.from('tasks').insert(newTasks).select();
    if (error) throw error;
    return data?.length || 0;
  }
};

// ============================================================
// TEAM
// ============================================================
export const teamDB = {
  async getAll() {
    const { data, error } = await supabase
      .from('team_members')
      .select('*, profile:profiles(id, role, last_seen_at)')
      .eq('is_active', true)
      .order('full_name');
    if (error) throw error;
    return data;
  },

  async getById(id) {
    const { data, error } = await supabase
      .from('team_members')
      .select(`
        *,
        profile:profiles(id, role, last_seen_at),
        team_documents(*),
        team_payments(* ORDER BY year DESC, month DESC LIMIT 24),
        team_absences(*)
      `)
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async create(member) {
    const { data, error } = await supabase
      .from('team_members')
      .insert(member)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, updates) {
    const { data, error } = await supabase
      .from('team_members')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async uploadDocument(memberId, file, type, name, uploadedBy) {
    const path = `${memberId}/${type}_${Date.now()}.${file.name.split('.').pop()}`;
    const { error: uploadError } = await supabase.storage
      .from('team-documents')
      .upload(path, file);
    if (uploadError) throw uploadError;

    const { data, error } = await supabase
      .from('team_documents')
      .insert({ team_member_id: memberId, name, type, storage_path: path, uploaded_by: uploadedBy })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async registerPayment(payment) {
    const { data, error } = await supabase
      .from('team_payments')
      .insert(payment)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async registerAbsence(absence) {
    const { data, error } = await supabase
      .from('team_absences')
      .insert(absence)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getWorkload(memberId) {
    const today = new Date();
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const { data, error } = await supabase
      .from('tasks')
      .select('id, title, status, due_date, estimated_hours, client:clients(name)')
      .contains('assigned_to', [memberId])
      .not('status', 'in', '("done","cancelled")')
      .lte('due_date', weekEnd.toISOString().split('T')[0]);
    if (error) throw error;
    return data;
  }
};

// ============================================================
// MONITORING
// ============================================================
export const monitoringDB = {
  async getData(clientId, month, year) {
    const { data, error } = await supabase
      .from('monitoring_data')
      .select('*')
      .eq('client_id', clientId)
      .eq('month', month)
      .eq('year', year);
    if (error) throw error;
    return data;
  },

  async getHistory(clientId, platform, months = 6) {
    const { data, error } = await supabase
      .from('monitoring_data')
      .select('*')
      .eq('client_id', clientId)
      .eq('platform', platform)
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(months);
    if (error) throw error;
    return data?.reverse() || [];
  },

  async save(record) {
    const { data, error } = await supabase
      .from('monitoring_data')
      .upsert(record, { onConflict: 'client_id,month,year,platform' })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getGoals(clientId) {
    const { data, error } = await supabase
      .from('monitoring_goals')
      .select('*')
      .eq('client_id', clientId);
    if (error) throw error;
    return data;
  },

  async saveGoal(goal) {
    const { data, error } = await supabase
      .from('monitoring_goals')
      .upsert(goal, { onConflict: 'client_id,platform,metric_name' })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
};

// ============================================================
// FINANCIAL
// ============================================================
export const financialDB = {
  async getContracts(clientId) {
    const { data, error } = await supabase
      .from('financial_contracts')
      .select('*')
      .eq('client_id', clientId)
      .eq('is_active', true);
    if (error) throw error;
    return data;
  },

  async createContract(contract) {
    const { data, error } = await supabase
      .from('financial_contracts')
      .insert(contract)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getPayments(filters = {}) {
    let query = supabase.from('financial_payments').select(`
      *,
      client:clients(id, name, whatsapp, phone)
    `).order('due_date', { ascending: false });

    if (filters.client_id) query = query.eq('client_id', filters.client_id);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.month) query = query.eq('month', filters.month);
    if (filters.year) query = query.eq('year', filters.year);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async updatePayment(id, updates) {
    const { data, error } = await supabase
      .from('financial_payments')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async markPaid(id, paidDate, method) {
    return this.updatePayment(id, {
      status: 'paid',
      paid_date: paidDate || new Date().toISOString().split('T')[0],
      payment_method: method || 'pix'
    });
  },

  async generateMonthlyPayments(month, year) {
    // Buscar contratos ativos
    const { data: contracts } = await supabase
      .from('financial_contracts')
      .select('*, client:clients(id, name)')
      .eq('is_active', true);

    if (!contracts?.length) return 0;

    const payments = contracts.map(c => ({
      client_id: c.client_id,
      contract_id: c.id,
      month,
      year,
      amount: c.total_value,
      due_date: `${year}-${String(month).padStart(2, '0')}-${String(c.billing_day).padStart(2, '0')}`,
      status: 'pending',
      payment_method: c.payment_method
    }));

    const { data, error } = await supabase
      .from('financial_payments')
      .upsert(payments, { onConflict: 'client_id,month,year', ignoreDuplicates: true })
      .select();
    if (error) throw error;
    return data?.length || 0;
  },

  async getMRRHistory(months = 12) {
    const result = [];
    const now = new Date();
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();
      const { data } = await supabase
        .from('financial_payments')
        .select('amount')
        .eq('month', m)
        .eq('year', y)
        .eq('status', 'paid');
      const total = data?.reduce((s, p) => s + (p.amount || 0), 0) || 0;
      result.push({ month: m, year: y, total });
    }
    return result;
  }
};

// ============================================================
// MESSAGING
// ============================================================
export const messagingDB = {
  async getConversations(filters = {}) {
    let query = supabase.from('conversations').select(`
      *,
      client:clients(id, name),
      assigned_agent:profiles(id, full_name, avatar_url),
      latest_message:messages(content, created_at, direction)
    `).order('last_message_at', { ascending: false, nullsFirst: false });

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.channel) query = query.eq('channel', filters.channel);
    if (filters.assigned_to) query = query.eq('assigned_to', filters.assigned_to);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async getMessages(conversationId) {
    const { data, error } = await supabase
      .from('messages')
      .select('*, sent_by_profile:profiles!sent_by(id, full_name, avatar_url)')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
  },

  async sendMessage(conversationId, content, userId) {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        direction: 'outbound',
        content,
        sent_by: userId
      })
      .select()
      .single();
    if (error) throw error;

    // Atualizar última mensagem
    await supabase.from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    return data;
  },

  async markRead(conversationId) {
    await supabase.from('messages')
      .update({ is_read: true })
      .eq('conversation_id', conversationId)
      .eq('direction', 'inbound');
  }
};

// ============================================================
// AI KNOWLEDGE
// ============================================================
export const aiDB = {
  async getKnowledge() {
    const { data, error } = await supabase
      .from('ai_knowledge')
      .select('*')
      .eq('is_active', true)
      .order('category')
      .order('order_index');
    if (error) throw error;
    return data;
  },

  async saveKnowledge(item) {
    const { data, error } = await supabase
      .from('ai_knowledge')
      .upsert(item)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteKnowledge(id) {
    const { error } = await supabase
      .from('ai_knowledge')
      .update({ is_active: false })
      .eq('id', id);
    if (error) throw error;
  }
};

// ============================================================
// SYSTEM CONFIG
// ============================================================
export const configDB = {
  async get(key) {
    const { data, error } = await supabase
      .from('system_config')
      .select('value')
      .eq('key', key)
      .single();
    if (error) return null;
    return data?.value;
  },

  async set(key, value, userId) {
    const { data, error } = await supabase
      .from('system_config')
      .upsert({ key, value, updated_by: userId, updated_at: new Date().toISOString() })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async getAll() {
    const { data, error } = await supabase
      .from('system_config')
      .select('*');
    if (error) throw error;
    return Object.fromEntries(data.map(r => [r.key, r.value]));
  }
};

// ============================================================
// ACTIVITY LOG
// ============================================================
export const logDB = {
  async log(action, entityType, entityId, entityName, details = {}) {
    if (!currentUser) return;
    await supabase.from('activity_log').insert({
      user_id: currentUser.id,
      action,
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
      details
    });
  },

  async getRecent(limit = 30) {
    const { data, error } = await supabase
      .from('activity_log')
      .select('*, user:profiles(id, full_name, avatar_url)')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }
};

// ============================================================
// REALTIME SUBSCRIPTIONS
// ============================================================
export const realtime = {
  subscribeToConversations(callback) {
    return supabase
      .channel('conversations-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, callback)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, callback)
      .subscribe();
  },

  subscribeToTasks(callback) {
    return supabase
      .channel('tasks-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, callback)
      .subscribe();
  },

  subscribeToPayments(callback) {
    return supabase
      .channel('payments-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financial_payments' }, callback)
      .subscribe();
  },

  unsubscribe(channel) {
    if (channel) supabase.removeChannel(channel);
  }
};
