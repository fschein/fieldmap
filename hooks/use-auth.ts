import { useAuthContext } from "@/providers/auth-provider"

// Hook simplificado que consome o contexto exportado
export const useAuth = () => {
  return useAuthContext()
}