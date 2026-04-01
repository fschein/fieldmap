# 🗺️ FieldMap

Uma ferramenta robusta para gestão de territórios, designações e quadras, focada em simplicidade e eficiência para a pregação de casa em casa.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ffschein%2Fterritorios-app&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY&project-name=fieldmap&repository-name=fieldmap)

## ✨ Funcionalidades

- **Gestão de Territórios**: Visualize e gerencie territórios de forma intuitiva.
- **Mapa Interativo**: Integração com Leaflet para visualização de quadras e pontos.
- **Designações inteligentes**: Atribua territórios a publicadores e acompanhe o status em tempo real.
- **Quadras**: Gerenciamento detalhado de cada setor do território.
- **Escalas por Grupo**: Suporte a arranjos coletivos para saídas de campo (ex: domingos), onde territórios são vinculados a grupos inteiros.
- **Não Visitar**: Marque residências que não devem ser visitadas com histórico e edição.
- **Histórico Completo**: Acompanhe todas as designações e conclusões passadas.
- **Segurança**: Fluxo de alteração de senha obrigatório ou simplificado para novos cadastros.
- **Notificações**: Alertas administrativos para pedidos de designação e conclusões.

## Como publicar sua instância

### 1. Requisitos prévios
- Conta no [Supabase](https://supabase.com/).
- Conta na [Vercel](https://vercel.com/).
- Node.js instalado localmente (opcional para desenvolvimento).

### 2. Configurando o Supabase
1. Crie um novo projeto no Supabase.
2. Vá em **SQL Editor** e clique em **New Query**.
3. Copie o conteúdo do arquivo `full-setup.sql` (localizado na raiz deste projeto) e cole no editor.
4. Clique em **RUN**. Isso criará todas as tabelas, funções e políticas de segurança necessárias de uma só vez.
5. Em **Project Settings > API**, anote a `URL`, `anon public key` e `service_role key`.

### 3. Deploy na Vercel
Clique no botão **Deploy to Vercel** no topo deste README. 

> [!TIP]
> **Dica Pro (Integração nativa):** Ao criar o projeto na Vercel, você pode adicionar a Integração da Supabase. Isso vinculará automaticamente as chaves `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`, restando apenas configurar a `SUPABASE_SERVICE_ROLE_KEY` manualmente.

#### Variáveis de ambiente necessárias:
| Variável | Descrição | Onde encontrar (Supabase) |
|----------|-----------|---------------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do Projeto | Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave Anon | Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave Service Role | Settings > API (Mantenha Segura!) |
| `NEXT_PUBLIC_APP_URL` | URL do seu App | URL da Vercel ou localhost:3000 |

### 4. Primeiro acesso (Admin)
1. No painel do Supabase, vá em **Authentication > Settings > Sign In / Up** e desative a opção **Confirm email** (para testar sem e-mails reais).
2. Acesse o seu App e clique em **"Criar Conta de Administrador"** no alerta de primeira instalação (ou vá em `/signup`).
3. Cadastre seu e-mail e senha.
4. **Pronto!** Como você é o primeiro usuário, o sistema te tornará **Admin automaticamente**. O menu de Administração será liberado imediatamente.

## 💻 Desenvolvimento local

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
Desenvolvido para facilitar a organização ministerial.