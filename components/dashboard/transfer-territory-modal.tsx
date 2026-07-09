"use client"

import { useState, useEffect, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2, ArrowRightLeft, Search } from "lucide-react"
import { toast } from "sonner"
import { cn, fmtTerritoryNumber } from "@/lib/utils"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { useAuth } from "@/hooks/use-auth"

const supabase = getSupabaseBrowserClient()

interface TransferTerritoryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  territoryId: string
  territoryNumber: string
  territoryName: string | null
  assignmentId: string
  campaignId: string | null
  onSuccess: () => void
}

interface ProfileOption {
  id: string
  name: string
}

export function TransferTerritoryModal({
  open,
  onOpenChange,
  territoryId,
  territoryNumber,
  territoryName,
  assignmentId,
  campaignId,
  onSuccess,
}: TransferTerritoryModalProps) {
  const { user, profile } = useAuth()
  const [profiles, setProfiles] = useState<ProfileOption[]>([])
  const [loadingProfiles, setLoadingProfiles] = useState(false)
  const [search, setSearch] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [transferring, setTransferring] = useState(false)

  useEffect(() => {
    if (!open) return
    setSearch("")
    setSelectedId(null)
    setLoadingProfiles(true)
    supabase
      .from("profiles")
      .select("id, name")
      .in("role", ["admin", "dirigente", "publicador", "supervisor"])
      .eq("is_active", true)
      .neq("id", user?.id ?? "")
      .order("name")
      .then(({ data }: { data: ProfileOption[] | null }) => setProfiles(data ?? []))
      .catch(() => toast.error("Erro ao carregar publicadores."))
      .finally(() => setLoadingProfiles(false))
  }, [open, user?.id])

  const handleTransfer = useCallback(async () => {
    if (!selectedId) return
    if (!user?.id) return
    setTransferring(true)
    try {
      const res = await fetch("/api/assignments/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          territoryId,
          assignmentId,
          fromUserId: user.id,
          toUserId: selectedId,
        }),
      })

      if (!res.ok) {
        const { error } = await res.json()
        throw new Error(error || "Erro ao transferir território")
      }

      toast.success("Território transferido com sucesso!")
      onOpenChange(false)
      onSuccess()
    } catch {
      toast.error("Erro ao transferir território.")
    } finally {
      setTransferring(false)
    }
  }, [selectedId, assignmentId, territoryId, user?.id, onOpenChange, onSuccess])

  const filtered = profiles.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )
  const selectedProfile = profiles.find((p) => p.id === selectedId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Transferir Território</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
            <p className="text-xs text-muted-foreground">Território</p>
            <p className="text-sm font-medium text-foreground">
              {fmtTerritoryNumber(territoryNumber)}
              {territoryName && <span className="font-normal text-muted-foreground"> · {territoryName}</span>}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-muted-foreground uppercase tracking-wide">
              Transferir para
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar publicador..."
                className="w-full h-9 pl-8 pr-3 rounded-lg border border-border bg-background text-sm outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {loadingProfiles ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando…
              </div>
            ) : (
              <div className="max-h-56 overflow-y-auto flex flex-col gap-1">
                {filtered.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Nenhum publicador encontrado.
                  </p>
                ) : (
                  filtered.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className={cn(
                        "flex items-center w-full px-3 py-2 rounded-lg border text-sm text-left transition-colors",
                        selectedId === p.id
                          ? "bg-primary/10 border-primary text-foreground font-medium"
                          : "bg-card hover:bg-muted/60 border-border"
                      )}
                    >
                      {p.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleTransfer} disabled={!selectedId || transferring}>
              {transferring
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <ArrowRightLeft className="mr-2 h-4 w-4" />
              }
              {selectedProfile ? `Transferir para ${selectedProfile.name.split(" ")[0]}` : "Transferir"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
