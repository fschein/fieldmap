import DashboardShell from "./dashboard-shell"

// Todo o conteúdo do dashboard depende de autenticação e é buscado no cliente
// (Supabase). Sem isso, o Next.js trata essas páginas como estáticas e a
// Vercel as serve via cache de CDN (ISR) — o que significa que deploys novos
// podem demorar a aparecer para quem já visitou a página antes, mesmo depois
// de limpar o cache do navegador.
export const dynamic = "force-dynamic"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <DashboardShell>{children}</DashboardShell>
}
