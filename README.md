# 🗺️ FieldMap

Uma ferramenta robusta para gestão de territórios, designações e quadras, focada em simplicidade e eficiência para a pregação de casa em casa.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ffschein%2Fterritorios-app&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY&project-name=fieldmap&repository-name=fieldmap)

## ✨ Funcionalidades

- **Gestão de Territórios**: Visualize e gerencie territórios de forma intuitiva.
- **Mapa Interativo**: Integração com Leaflet para visualização de quadras e pontos.
- **Designações Inteligentes**: Atribua territórios a publicadores e acompanhe o status em tempo real.
- **Quadras (Subdivisions)**: Gerenciamento detalhado de cada setor do território.
- **Não Visitar (DNV)**: Marque residências que não devem ser visitadas com histórico e edição.
- **Histórico Completo**: Acompanhe todas as designações e conclusões passadas.
- **Segurança**: Fluxo de alteração de senha obrigatório no primeiro acesso ou após redefinição.
- **Notificações**: Alertas administrativos para pedidos de designação e conclusões.

## 🚀 Como Publicar sua Instância

### 1. Requisitos Prévios
- Conta no [Supabase](https://supabase.com/).
- Conta na [Vercel](https://vercel.com/).
- Node.js instalado localmente (opcional para desenvolvimento).

### 2. Configurando o Supabase
1. Crie um novo projeto no Supabase.
2. Vá em **SQL Editor** e execute os scripts localizados na pasta `/scripts` em ordem numérica (001, 002, etc.).
3. Em **Project Settings > API**, anote a `URL`, `anon public key` e `service_role key`.

### 3. Deploy na Vercel
Clique no botão **Deploy to Vercel** no topo deste README. 

> [!TIP]
> **Dica Pro (Integração Nativa):** Ao criar o projeto na Vercel, você pode adicionar a Integração da Supabase. Isso vinculará automaticamente as chaves `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`, restando apenas configurar a `SUPABASE_SERVICE_ROLE_KEY` manualmente.

#### Variáveis de Ambiente Necessárias:
| Variável | Descrição | Onde encontrar (Supabase) |
|----------|-----------|---------------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do Projeto | Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave Anon | Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave Service Role | Settings > API (Mantenha Segura!) |
| `NEXT_PUBLIC_APP_URL` | URL do seu App | URL da Vercel ou localhost:3000 |

### 4. Primeiro Acesso (Admin)
1. Crie sua conta normalmente via email/senha.
2. No painel do Supabase, vá na tabela `profiles` e mude o campo `role` do seu usuário para `admin`.
3. Pronto! Você agora terá acesso a todas as ferramentas de gestão.

## 💻 Desenvolvimento Local

Se quiser rodar o projeto na sua máquina para testar antes:

1. Clone o repositório.
2. Instale as dependências: `npm install`.
3. Copie o arquivo de exemplo: `cp .env.example .env.local`.
4. Preencha as variáveis no `.env.local`.
5. Rode o servidor: `npm run dev`.
6. Acesse: `http://localhost:3000`.

## 🛠️ Tecnologias
- **Frontend**: Next.js 14, Tailwind CSS, Shadcn/UI.
- **Backend/Database**: Supabase (PostgreSQL, Auth, RLS).
- **Mapas**: Leaflet.js.

## 📄 Licença
Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---
Desenvolvido com ❤️ para facilitar a organização ministerial.