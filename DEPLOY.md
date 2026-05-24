# 🚀 Guia de Deploy — AgênciaOS

Siga este guia passo a passo para colocar o sistema no ar.  
Tempo estimado: **30 a 60 minutos**

---

## PASSO 1 — Criar projeto no Supabase (Banco de dados + Login)

1. Acesse **https://app.supabase.com** e crie uma conta gratuita (use seu Google)
2. Clique em **"New Project"**
3. Preencha:
   - **Name**: agencia-os (ou o nome que preferir)
   - **Database Password**: crie uma senha forte e anote ela
   - **Region**: South America (São Paulo) — mais próximo do Brasil
4. Aguarde ~2 minutos enquanto o projeto é criado

### 1.1 — Executar o Schema SQL

1. No painel do Supabase, vá em **SQL Editor** (ícone de banco no menu lateral)
2. Clique em **"New Query"**
3. Abra o arquivo `schema.sql` deste projeto
4. Copie todo o conteúdo e cole no editor
5. Clique em **"Run"** (Ctrl+Enter)
6. Você verá: "Success. No rows returned" — isso é correto!

### 1.2 — Criar os Buckets de Storage

1. Vá em **Storage** no menu lateral
2. Clique em **"New Bucket"** e crie cada um:
   - `avatars` → marque **Public** ✅ → Create
   - `team-documents` → deixe **Private** → Create
   - `client-files` → deixe **Private** → Create
   - `monitoring-assets` → marque **Public** ✅ → Create

### 1.3 — Pegar as credenciais da API

1. Vá em **Settings → API** no menu lateral
2. Anote:
   - **Project URL** → ex: `https://xyzabc123.supabase.co`
   - **anon/public key** → chave longa que começa com `eyJ...`

### 1.4 — Criar o primeiro usuário Master

1. Vá em **Authentication → Users**
2. Clique em **"Invite user"** ou **"Add user"**
3. Insira seu e-mail e uma senha
4. Após criar, vá em **SQL Editor** e execute:
   ```sql
   UPDATE profiles 
   SET role = 'master', full_name = 'Seu Nome Aqui'
   WHERE id = (SELECT id FROM auth.users WHERE email = 'seu@email.com');
   ```
5. Pronto! Você tem acesso Master.

---

## PASSO 2 — Configurar o projeto local

1. Abra o arquivo `js/config.js`
2. Substitua as linhas:
   ```javascript
   export const SUPABASE_URL = 'https://SEU_PROJETO.supabase.co';
   export const SUPABASE_ANON_KEY = 'SUA_ANON_KEY_AQUI';
   ```
   Com suas credenciais do Passo 1.3

---

## PASSO 3 — Deploy no Netlify (Hospedagem gratuita)

### Opção A — Via drag and drop (mais fácil)

1. Acesse **https://app.netlify.com** e crie conta gratuita
2. Na tela inicial, você verá uma área que diz **"Drag and drop your site folder here"**
3. Selecione a **pasta inteira** do projeto (`agencia-sistema`)
4. Arraste e solte na área indicada
5. Aguarde o deploy (~30 segundos)
6. Você receberá uma URL como: `https://amazing-name-123.netlify.app`

### Opção B — Via GitHub (permite atualizações automáticas)

1. Suba os arquivos para um repositório privado no GitHub
2. No Netlify, clique em **"Add new site → Import from Git"**
3. Conecte seu GitHub e selecione o repositório
4. Build settings: deixe tudo vazio (é um site estático)
5. Clique em **"Deploy site"**

### Configurar domínio personalizado (opcional)

1. No Netlify, vá em **Domain Settings**
2. Clique em **"Add custom domain"**
3. Digite seu domínio (ex: `sistema.suaagencia.com.br`)
4. No seu provedor de domínio (Registro.br, GoDaddy, etc.), aponte o DNS:
   - Tipo: **CNAME**
   - Nome: `sistema` (ou `@` para o domínio raiz)
   - Valor: a URL do Netlify que ele fornece
5. Aguarde a propagação DNS (até 24h, geralmente <1h)
6. O Netlify configura o SSL automaticamente 🔒

---

## PASSO 4 — Configurar Evolution API (WhatsApp)

### Opção A — VPS (recomendado, controle total)

1. Contrate uma VPS: **DigitalOcean Droplet** ($6/mês) ou **Hostgator VPS** (~R$60/mês)
   - Sistema: Ubuntu 22.04
   - RAM mínima: 1GB

2. Conecte via SSH e execute:
   ```bash
   # Instalar Docker
   curl -fsSL https://get.docker.com | sh
   
   # Baixar Evolution API
   git clone https://github.com/EvolutionAPI/evolution-api
   cd evolution-api
   
   # Configurar
   cp .env.example .env
   nano .env
   # Edite: AUTHENTICATION_API_KEY=sua_chave_secreta_aqui
   
   # Subir
   docker compose up -d
   ```

3. Acesse `http://seu-ip:8080` para confirmar que está rodando

4. No sistema (Configurações → Integrações → Evolution API):
   - **URL**: `http://seu-ip:8080`
   - **API Key**: a chave que você definiu no .env
   - **Instance**: `agencia` (ou qualquer nome)
   - Clique em **"Criar Instância"** e escaneie o QR Code com o WhatsApp Business

### Opção B — Z-API (sem servidor, pago)

1. Crie conta em **https://z-api.io**
2. Crie uma instância (~R$70/mês)
3. Conecte o QR Code
4. No sistema, use a URL e token fornecidos pelo Z-API

---

## PASSO 5 — Configurar Meta API (Instagram + Facebook DMs)

**Atenção**: Este processo pode levar alguns dias. Faça em paralelo com o restante.

### 5.1 — Verificação de Negócio

1. Acesse **https://business.facebook.com**
2. Vá em **Configurações → Verificação de Negócio**
3. Clique em **"Iniciar verificação"**
4. Envie: CNPJ, documento da empresa, telefone comercial
5. Aguarde aprovação (1 a 5 dias úteis)

### 5.2 — Criar App no Meta for Developers

1. Acesse **https://developers.facebook.com/apps**
2. Clique em **"Criar App"** → Tipo: **Business**
3. Associe ao seu Business Manager

### 5.3 — Adicionar produtos

No seu app, adicione:
- **Messenger** (para Facebook)
- **Instagram Graph API** (para Instagram DMs)

### 5.4 — Configurar permissões

Solicite as permissões:
- `instagram_manage_messages`
- `instagram_basic`
- `pages_messaging`
- `pages_read_engagement`

Para aprovação, você precisará:
- Gravar um vídeo de 2-3 minutos mostrando como vai usar a API
- Ter uma página de **Política de Privacidade** publicada (pode ser simples)
- Submeter para revisão da Meta

### 5.5 — Configurar Webhook

1. No app da Meta, vá em **Webhooks**
2. Configure a URL: `https://sua-api.com/webhook/meta` (você precisará de um backend para receber — veja nota abaixo)
3. Selecione os eventos: `messages`, `messaging_postbacks`

> **Nota**: Para receber mensagens em tempo real, você precisará de um pequeno servidor de webhook. Isso pode ser configurado com uma Cloud Function do Supabase Edge Functions (gratuito). Entre em contato para um guia específico.

---

## PASSO 6 — Configurar Asaas (Cobranças e PIX automático)

1. Crie conta gratuita em **https://www.asaas.com**
2. Preencha os dados da empresa (CNPJ, conta bancária para receber)
3. Aguarde aprovação da conta (~1 dia útil)
4. Em **Configurações → Integrações → API**, pegue sua chave de API
5. No sistema (Configurações → Integrações → Asaas):
   - Cole a API Key
   - Selecione **Sandbox** para testes primeiro
   - Depois troque para **Produção**

### Configurar Webhook para baixa automática

1. No Asaas, vá em **Configurações → Notificações → Webhook**
2. URL do Webhook: `https://SEU_PROJETO.supabase.co/functions/v1/asaas-webhook`
3. Selecione os eventos: **PAYMENT_RECEIVED**, **PAYMENT_CONFIRMED**

### Criar a Edge Function no Supabase

1. No Supabase, vá em **Edge Functions → New Function**
2. Nome: `asaas-webhook`
3. Cole o código:
   ```javascript
   import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
   
   Deno.serve(async (req) => {
     const payload = await req.json()
     const supabase = createClient(
       Deno.env.get('SUPABASE_URL'),
       Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
     )
     
     if (['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'].includes(payload.event)) {
       const externalId = payload.payment?.externalReference
       if (externalId) {
         await supabase.from('financial_payments')
           .update({ status: 'paid', paid_date: new Date().toISOString().split('T')[0] })
           .eq('id', externalId)
       }
     }
     
     return new Response(JSON.stringify({ received: true }), { status: 200 })
   })
   ```
4. Deploy a function
5. Configure o campo `externalReference` no Asaas com o ID do pagamento do sistema quando criar cobranças

---

## PASSO 7 — Configurar IA / Pré-atendente (Claude)

1. Acesse **https://console.anthropic.com**
2. Crie conta e vá em **API Keys → Create Key**
3. Copie a chave (começa com `sk-ant-...`)
4. No sistema (Configurações → IA / Pré-atendente):
   - Cole a API Key
   - Selecione o modelo: **claude-3-haiku** (mais barato) ou **claude-3-sonnet** (mais inteligente)
   - Ative o toggle **"Ativar IA"**
5. Preencha a **Base de Conhecimento**:
   - Serviços oferecidos
   - Tabela de preços (ou faixas)
   - Perguntas frequentes
   - Regras de atendimento
6. Clique em **"Testar IA"** para validar antes de ativar

### Custo estimado da IA

| Volume | Custo estimado/mês |
|--------|-------------------|
| 50 conversas | ~R$ 5 |
| 200 conversas | ~R$ 20 |
| 500 conversas | ~R$ 50 |

---

## RESUMO — Custos mensais

| Serviço | Custo |
|---------|-------|
| Supabase | **Gratuito** (até 500MB e 50k usuários) |
| Netlify | **Gratuito** (até 100GB bandwidth) |
| Domínio personalizado | **~R$50/ano** (opcional) |
| Evolution API (VPS) | **~R$40-60/mês** |
| Anthropic API (IA) | **~R$20-50/mês** (variável) |
| Asaas | **Gratuito** (cobra % por transação: 0,99% PIX) |
| **Total mínimo** | **~R$0** para começar |
| **Total com WhatsApp + IA** | **~R$60-100/mês** |

---

## Suporte e dúvidas

- **Supabase**: https://supabase.com/docs
- **Evolution API**: https://doc.evolution-api.com
- **Anthropic**: https://docs.anthropic.com
- **Netlify**: https://docs.netlify.com

---

## Próximas versões planejadas

- [ ] App mobile (PWA)
- [ ] Integração nativa com Meta API via Edge Functions
- [ ] Dashboard público para clientes verem seus relatórios
- [ ] Automação de cobrança no Asaas
- [ ] Integração com Google Analytics API
