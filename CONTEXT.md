# FieldMap — Contexto do Repositório

Documento gerado para uso no Claude Web. Contém o suficiente para continuar discussões de feature/bug sem acesso ao código.

---

## Propósito e Stack

**FieldMap** é uma PWA de gestão de territórios para pregação (Testemunhas de Jeová). Permite atribuir territórios a publicadores, acompanhar conclusões, gerar escalas e coordenar grupos.

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| Estilos | Tailwind CSS 4.1, Radix UI, Shadcn/UI |
| Backend | Supabase (PostgreSQL + Auth + RLS) |
| Mapas | Leaflet.js + Leaflet Draw |
| Forms | React Hook Form + Zod |
| Notificações | Sonner (toasts) + Web Push API |
| Deploy | Vercel (PWA via @ducanh2912/next-pwa) |

---

## Estrutura de Diretórios

```
fieldmap/
├── app/
│   ├── layout.tsx                        # Root layout com providers
│   ├── login/page.tsx
│   ├── signup/page.tsx
│   ├── auth/callback/route.ts
│   └── dashboard/
│       ├── page.tsx                      # Dashboard admin (stats, rankings)
│       ├── territories/
│       │   ├── page.tsx                  # Lista/mapa de territórios
│       │   └── [id]/
│       │       ├── page.tsx              # Detalhe do território
│       │       ├── map/page.tsx          # Editor de mapa (Leaflet)
│       │       └── condominium/page.tsx  # Módulo de condomínio
│       ├── assignments/page.tsx          # Gestão de designações (admin)
│       ├── my-assignments/page.tsx       # Designações do publicador
│       ├── my-schedule/page.tsx          # Escala do publicador
│       ├── schedule/page.tsx             # Escala admin
│       ├── groups/page.tsx
│       ├── campaigns/page.tsx
│       ├── users/page.tsx                # Gestão de usuários (admin)
│       ├── notifications/page.tsx
│       ├── profile/page.tsx
│       └── supervisor/page.tsx
├── components/
│   ├── dashboard/                        # Componentes de feature
│   ├── map/                              # Wrappers Leaflet
│   ├── my-assignments/
│   ├── ui/                               # Primitivos Shadcn/UI
│   └── layout/                           # Sidebar, header, nav
├── lib/
│   ├── types.ts                          # Interfaces TypeScript centrais
│   ├── utils.ts                          # cn(), fmtTerritoryNumber()
│   ├── date-utils.ts
│   ├── notifications.ts
│   ├── supabase/
│   │   ├── client.ts                     # Browser client (singleton)
│   │   ├── server.ts                     # Server client (SSR)
│   │   └── middleware.ts
│   └── utils/
│       ├── api-utils.ts
│       ├── schedule-pdf.ts
│       └── scheduling-engine.ts          # Algoritmo de geração de escala
├── hooks/
│   ├── use-auth.ts
│   ├── use-notifications.ts
│   ├── use-offline-manager.ts
│   └── use-unread-notifications.ts
├── providers/                            # AuthProvider, SettingsProvider
├── scripts/                              # Migrations SQL (prefixo numérico)
└── full-setup.sql                        # Schema consolidado completo
```

---

## Módulos e Features

### Territórios
- CRUD de territórios com tipos: `residencial`, `comercial`, `condominium`
- Subtipo para condomínio: `building` | `houses`
- Desenho de polígono no mapa (Leaflet Draw)
- Status: available, assigned, completed, inactive
- Histórico completo de designações

### Subdivisões (Quadras)
- Divisão de território em quadras menores
- Status independente por quadra (available, assigned, completed)

### Designações
- Admin atribui território a publicador ou grupo
- Suporte a designação de subdivisão individual
- Status: active → completed | returned
- Motivo de devolução + notificação por e-mail ao admin

### Grupos e Escala
- Publicadores agrupados em grupos
- `schedule_arrangements`: modelo de escala (dia da semana, horário, modo grupo)
- `leader_arrangements`: disponibilidade por publicador
- `schedules`: instâncias geradas com território e dirigente
- Geração automática de escala

### Campanhas
- Campanhas temáticas com data de início/fim
- Territórios e escalas vinculados a campanhas

### Notificações
- Tipos: request, returned, idle, assigned, completed
- Web Push para notificações em background
- Tabela `notifications` como audit trail

### Usuários e Auth
- Roles: `admin` | `dirigente` | `supervisor` | `publicador`
- Primeiro usuário criado vira admin automaticamente (trigger)
- Fluxo de troca obrigatória de senha (`must_change_password`)

---

## Módulo de Condomínio (em desenvolvimento)

Migration `scripts/031-condominium-module.sql` **aplicada em produção**.

### O que existe no banco

```sql
-- territories.type: adicionado 'condominium'
-- territories.subtype: nova coluna ('building' | 'houses')
-- subdivisoes.status: adicionado 'assigned'

CREATE TABLE blocks (
  id uuid PRIMARY KEY,
  territory_id uuid REFERENCES territories,
  name text NOT NULL,
  order_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE units (
  id uuid PRIMARY KEY,
  block_id uuid REFERENCES blocks,       -- XOR
  subdivision_id uuid REFERENCES subdivisions, -- XOR
  number text NOT NULL,
  floor integer,
  status text DEFAULT 'pending',  -- pending | visited | do_not_visit
  observation text,
  do_not_visit_until timestamptz,
  created_at timestamptz,
  updated_at timestamptz
  -- CHECK: block_id IS NOT NULL XOR subdivision_id IS NOT NULL
);
```

### Regras de negócio (camada app, não DB)

- `do_not_visit_until` default = NOW() + 1 ano quando status = `do_not_visit`
- Quando `do_not_visit_until` vence, unidade reverte para `pending` (check em query-time, não trigger)
- Revisita por publicador maduro: fase futura, não implementada

### Status de implementação

- [x] Formulário de criação/edição de território tipo condomínio (`components/dashboard/territory-form-modal.tsx`)
- [x] Página de blocos e unidades (`app/dashboard/territories/[id]/condominium/page.tsx`)
- [ ] Lógica de `do_not_visit_until` na camada app

---

## Esquema do Banco (tabelas principais)

```
profiles          id, name, email, role, gender, phone, group_id,
                  must_change_password, is_active, last_seen_at

territories       id, number, name, type, subtype, color, description,
                  group_id, assigned_to, campaign_id, geometry,
                  last_completed_at, notes

subdivisions      id, territory_id, name, status, coordinates[],
                  order_index, completed, completed_at, notes

assignments       id, territory_id, subdivision_id?, user_id?, group_id?,
                  campaign_id, status, assigned_at, delivered_at,
                  completed_at, returned_at, notes

groups            id, name, color, description

campaigns         id, name, description, active, start_date, end_date

do_not_visits     id, territory_id, latitude, longitude, address, notes, created_by

notifications     id, type, title, message, user_id, read, created_at

blocks            id, territory_id, name, order_index          (condomínio)

units             id, block_id|subdivision_id, number, floor,   (condomínio)
                  status, observation, do_not_visit_until

schedule_arrangements  id, weekday, start_time, is_group_mode
leader_arrangements    id, profile_id, arrangement_id, frequency
schedules              id, date, arrangement_id, leader_id, territory_id, status
```

**RLS** habilitado em todas as tabelas. Admin/dirigente têm acesso total; publicador lê apenas suas designações e territórios.

**Triggers:**
- `on_auth_user_created` — cria profile; primeiro usuário vira admin
- `update_*_updated_at` — mantém `updated_at` em todas as tabelas
- `trig_handle_assignment_completion` — ao completar/devolver designação, atualiza status do território e limpa `assigned_to`

---

## Tipos TypeScript Principais (`lib/types.ts`)

```typescript
type UserRole = "admin" | "dirigente" | "publicador" | "supervisor"
type TerritoryType = "residencial" | "comercial" | "condominium"
type AssignmentStatus = "active" | "completed" | "returned"
type SubdivisionStatus = "available" | "assigned" | "completed"
type UnitStatus = "pending" | "visited" | "do_not_visit"

interface Profile {
  id: string; name: string; email: string; role: UserRole;
  gender?: string; phone?: string; group_id?: string;
  must_change_password?: boolean; is_active?: boolean;
  last_seen_at?: string; created_at: string; updated_at: string;
}

interface Territory {
  id: string; number: string; name: string;
  type: TerritoryType; subtype?: "building" | "houses";
  color: string; description?: string;
  group_id?: string; assigned_to?: string; campaign_id?: string;
  geometry?: GeoJSON; last_completed_at?: string; notes?: string;
}

interface Subdivision {
  id: string; territory_id: string; name: string;
  status: SubdivisionStatus; coordinates: [number, number][];
  order_index: number; completed?: boolean; completed_at?: string;
}

interface Assignment {
  id: string; territory_id: string; subdivision_id?: string;
  user_id?: string; group_id?: string; campaign_id?: string;
  status: AssignmentStatus;
  assigned_at: string; completed_at?: string; returned_at?: string;
  notes?: string;
}

interface Block {
  id: string; territory_id: string; name: string; order_index: number;
}

interface Unit {
  id: string; block_id?: string; subdivision_id?: string;
  number: string; floor?: number; status: UnitStatus;
  observation?: string; do_not_visit_until?: string;
}
```

---

## Auth e Roles

### Fluxo
1. `/login` — email + senha via Supabase Auth
2. `/signup` — cadastro; primeiro usuário vira `admin` (trigger DB)
3. `/dashboard/setup-password` — troca obrigatória se `must_change_password = true`
4. Middleware protege rotas; redireciona não-autenticados para `/login`

### Hook de auth (`hooks/use-auth.ts`)
```typescript
const { user, profile, isReady, loading,
        isAdmin, isSupervisor, isDirigente,
        signIn, signUp, signOut, refreshProfile } = useAuth()
```

### API Routes de admin
```
POST /api/admin/create-user     # Admin cria usuário
POST /api/admin/reset-password  # Reset de senha
POST /api/assignments/complete  # Marcar designação como concluída
POST /api/push/subscribe        # Registrar push subscription
GET  /api/cron/check-overdue    # Verificar designações atrasadas
```

---

## Padrões de Implementação

**Supabase Client**
```typescript
// Browser (componentes client-side)
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
const supabase = getSupabaseBrowserClient()

// Server (Server Components, Route Handlers)
import { getSupabaseServerClient } from "@/lib/supabase/server"
const supabase = await getSupabaseServerClient()
```

**Subscriptions em tempo real**
```typescript
supabase.channel("territories").on("postgres_changes", ...).subscribe()
```

**Forms**: React Hook Form + Zod. Modais para criar/editar (não páginas separadas).

**Estado**: React Context (Auth, Settings) + useState local. Sem Redux/Zustand.

**Estilo**: Tailwind direto. `cn()` de `@/lib/utils` para classes condicionais. Dark mode via `next-themes`.

**Toasts**: `import { toast } from "sonner"` — `toast.success()`, `toast.error()`.

---

## Variáveis de Ambiente

```env
NEXT_PUBLIC_SUPABASE_URL=https://kaiexhfmmvvryyqaxlya.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # Só server-side (API routes)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Migrations

- Ficam em `scripts/` com prefixo numérico: `001-...`, `002-...`, ..., `031-...`
- Aplicadas via **Supabase SQL Editor** (conexão psql direta falha por IPv6)
- Incluem `IF NOT EXISTS` para re-execução segura
- Migration mais recente: `031-condominium-module.sql` (aplicada em produção)
- Schema consolidado: `full-setup.sql`
