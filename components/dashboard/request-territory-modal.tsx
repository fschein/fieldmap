"use client"

import { useState, useEffect, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Loader2, MapPin, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { cn, fmtTerritoryNumber } from "@/lib/utils"
import { Territory, Group } from "@/lib/types"
import { useRequestTerritory } from "@/hooks/use-request-territory"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { differenceInDays, parseISO } from "date-fns"

const supabase = getSupabaseBrowserClient()

interface RequestTerritoryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

interface ActiveCampaign {
  id: string
  name: string
  startDate: string
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
  const [noCampaignTerritory, setNoCampaignTerritory] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [activeCampaign, setActiveCampaign] = useState<ActiveCampaign | null>(null)
  const [campaignMode, setCampaignMode] = useState(false)

  useEffect(() => {
    if (!open) return
    setStep("select-group")
    setSelectedGroupId("")
    setTerritory(null)
    setNoTerritory(false)
    setNoCampaignTerritory(false)

    const today = new Date().toISOString().slice(0, 10)

    Promise.all([
      fetchGroups(),
      supabase.from("campaigns").select("id, name, start_date, end_date").eq("active", true),
    ])
      .then(([groupsData, { data: campaignsData }]) => {
        setGroups(groupsData)

        const found = (campaignsData ?? []).find((c: { id: string; name: string; start_date: string | null; end_date: string | null }) => {
          if (!c.start_date) return false
          if (today < c.start_date) return false
          if (c.end_date && today > c.end_date) return false
          return true
        })
        if (found) {
          setActiveCampaign({ id: found.id, name: found.name, startDate: found.start_date })
          setCampaignMode(true)
        } else {
          setActiveCampaign(null)
          setCampaignMode(false)
        }
      })
      .catch(() => toast.error("Erro ao carregar grupos."))
      .finally(() => setLoadingGroups(false))

    setLoadingGroups(true)
  }, [open, fetchGroups])

  const handleGroupSelect = useCallback(async (groupId: string) => {
    setSelectedGroupId(groupId)
    setLoadingGroupId(groupId)
    setNoTerritory(false)
    setNoCampaignTerritory(false)
    try {
      const result = await fetchAvailableTerritory(
        groupId,
        campaignMode && activeCampaign
          ? { id: activeCampaign.id, startDate: activeCampaign.startDate }
          : null
      )
      setTerritory(result)
      if (result === null) {
        if (campaignMode) setNoCampaignTerritory(true)
        else setNoTerritory(true)
      }
      setStep("confirm")
    } catch {
      toast.error("Erro ao buscar território.")
    } finally {
      setLoadingGroupId(null)
    }
  }, [fetchAvailableTerritory, campaignMode, activeCampaign])

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

  const handleBack = useCallback(() => {
    setStep("select-group")
    setTerritory(null)
    setNoTerritory(false)
    setNoCampaignTerritory(false)
  }, [])

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
          <div className="space-y-4 pt-1">
            {activeCampaign && (
              <div className="flex items-center gap-2.5 rounded-lg border bg-muted/40 px-3 py-2.5">
                <Switch
                  id="campaign-mode"
                  checked={campaignMode}
                  onCheckedChange={(v: boolean) => setCampaignMode(v)}
                  className="shrink-0"
                />
                <div className="flex flex-col min-w-0">
                  <label htmlFor="campaign-mode" className="cursor-pointer text-sm font-medium whitespace-nowrap">Para campanha</label>
                  <span className="text-xs text-primary font-semibold truncate">{activeCampaign.name}</span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                Região
              </Label>
              {loadingGroups ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando regiões…
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
                      Região {g.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-5 pt-1">
            {noCampaignTerritory ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <MapPin className="h-8 w-8 text-muted-foreground/40" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    Todos os territórios desta região já foram cobertos na campanha.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Escolha outra região ou desmarque o modo campanha.
                  </p>
                </div>
              </div>
            ) : noTerritory || !territory ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <MapPin className="h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  Nenhum território disponível nesta região no momento.
                </p>
              </div>
            ) : (
              <div className={cn("rounded-xl border p-4 space-y-3", "bg-muted/30")}>
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
              <Button variant="ghost" onClick={handleBack}>
                Voltar
              </Button>
              {territory && (
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
