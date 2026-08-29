"use client"

import { useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Link2, Loader2 } from "lucide-react"
import { toast } from "sonner"

interface FieldLinkButtonProps {
  territoryId: string
  subdivisionId?: string
  blockId?: string
  label?: string
  className?: string
}

const supabase = getSupabaseBrowserClient()

export function FieldLinkButton({ territoryId, subdivisionId, blockId, label = "Link de campo", className }: FieldLinkButtonProps) {
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    setCreating(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from("field_links")
        .insert({
          territory_id: territoryId,
          subdivision_id: subdivisionId ?? null,
          block_id: blockId ?? null,
          created_by: user?.id ?? null,
        })
        .select("id")
        .single()

      if (error) throw error

      const url = `${window.location.origin}/campo/${data.id}`
      await navigator.clipboard.writeText(url)
      toast.success("Link copiado! Válido por 2 horas.", { description: url, duration: 8000 })
    } catch (e: any) {
      toast.error("Erro ao gerar link: " + e.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleCreate}
      disabled={creating}
      className={className}
    >
      {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Link2 className="h-3.5 w-3.5 mr-1.5" />}
      {label}
    </Button>
  )
}
