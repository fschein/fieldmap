"use client"

import { useState, useEffect, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Loader2, MapPin, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { cn, fmtTerritoryNumber } from "@/lib/utils"
import { Territory, Group } from "@/lib/types"
import { useRequestTerritory } from "@/hooks/use-request-territory"
import { differenceInDays, parseISO } from "date-fns"

interface RequestTerritoryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

type Step = "select-group" | "confirm"

function priorityReason(territory: Territory): string {
  if (!territory.last_completed_at) return "Nunca trabalhado"
  const days = differenceInDays(new Date(), parseISO(territory.last_completed_at))
  return `Sem ser trabalhado há ${days} ${days === 1 ? "dia" : "dias"}`
}

export function RequestTerritoryModal({
  open,
  onOpenChange,
  onSuccess,
}: RequestTerritoryModalProps) {
  const { fetchGroups, fetchAvailableTerritory, requestTerritory } = useRequestTerritory()

  const [step, setStep] = useState<Step>("select-group")
  const [groups, setGroups] = useState<Group[]>([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState("")
  const [loadingGroupId, setLoadingGroupId] = useState<string | null>(null)
  const [territory, setTerritory] = useState<Territory | null>(null)
  const [noTerritory, setNoTerritory] = useState(false)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!open) return
    setStep("select-group")
    setSelectedGroupId("")
    setTerritory(null)
    setNoTerritory(false)

    setLoadingGroups(true)
    fetchGroups()
      .then(setGroups)
      .catch(() => toast.error("Erro ao carregar grupos."))
      .finally(() => setLoadingGroups(false))
  }, [open, fetchGroups])

  const handleGroupSelect = useCallback(async (groupId: string) => {
    setSelectedGroupId(groupId)
    setLoadingGroupId(groupId)
    setNoTerritory(false)
    try {
      const result = await fetchAvailableTerritory(groupId)
      setTerritory(result)
      setNoTerritory(result === null)
      setStep("confirm")
    } catch {
      toast.error("Erro ao buscar território.")
    } finally {
      setLoadingGroupId(null)
    }
  }, [fetchAvailableTerritory])

  const handleConfirm = useCallback(async () => {
    if (!territory) return
    setConfirming(true)
    try {
      await requestTerritory(territory.id)
      toast.success("Território designado com sucesso!")
      onOpenChange(false)
      onSuccess()
    } catch {
      toast.error("Erro ao confirmar designação.")
    } finally {
      setConfirming(false)
    }
  }, [territory, requestTerritory, onOpenChange, onSuccess])

  const selectedGroup = groups.find((g) => g.id === selectedGroupId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>
            {step === "select-group" ? "Pedir Território" : "Confirmar Designação"}
          </DialogTitle>
        </DialogHeader>

        {step === "select-group" && (
          <div className="space-y-2 pt-1">
            <Label>Grupo / Região</Label>
            {loadingGroups ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando grupos…
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {groups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => handleGroupSelect(g.id)}
                    disabled={loadingGroupId !== null}
                    className={cn(
                      "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg border text-sm font-medium text-left transition-colors",
                      "bg-card hover:bg-muted/60 border-border",
                      "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                  >
                    {loadingGroupId === g.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-muted-foreground" />
                    ) : (
                      <span
                        className="inline-block h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: g.color }}
                      />
                    )}
                    {g.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-5 pt-1">
            {noTerritory || !territory ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <MapPin className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Nenhum território disponível neste grupo no momento.
                </p>
              </div>
            ) : (
              <div
                className={cn(
                  "rounded-xl border p-4 space-y-3",
                  "bg-muted/30"
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="h-8 w-1 rounded-full shrink-0"
                    style={{ backgroundColor: selectedGroup?.color || territory.color || "var(--primary)" }}
                  />
                  <div>
                    <p className="font-semibold text-foreground text-base leading-tight">
                      {fmtTerritoryNumber(territory.number)}
                      {territory.name && (
                        <span className="font-normal text-muted-foreground"> · {territory.name}</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">{territory.type}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-background rounded-lg px-3 py-2 border">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                  <span>{priorityReason(territory)}</span>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setStep("select-group")
                  setTerritory(null)
                  setNoTerritory(false)
                }}
              >
                Voltar
              </Button>
              {!noTerritory && territory && (
                <Button onClick={handleConfirm} disabled={confirming}>
                  {confirming && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Confirmar
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
