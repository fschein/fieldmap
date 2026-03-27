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
Clique no botão **Deploy to Vercel** no topo deste README ou siga manualmente:
1. Importe o repositório na Vercel.
2. Configure as seguintes variáveis de ambiente:
   - `NEXT_PUBLIC_SUPABASE_URL`: Sua URL do Supabase.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Sua chave anon.
   - `SUPABASE_SERVICE_ROLE_KEY`: Sua chave service role (mantenha secreta!).
   - `NEXT_PUBLIC_APP_URL`: A URL final do seu app (ou `http://localhost:3000` para dev).

### 4. Primeiro Acesso
O sistema criará automaticamente um perfil para o primeiro usuário que se registrar via email. Você pode mudar o papel (`role`) para `admin` diretamente no painel do Supabase na tabela `profiles`.

## 🛠️ Tecnologias
- **Frontend**: Next.js 14, Tailwind CSS, Shadcn/UI.
- **Backend/Database**: Supabase (PostgreSQL, Auth, RLS).
- **Mapas**: Leaflet.js.

## 📄 Licença
Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---
Desenvolvido com ❤️ para facilitar a organização ministerial.