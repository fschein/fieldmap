"use client"

import { useState, useEffect, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Loader2, MapPin, CheckCircle2, ArrowRight } from "lucide-react"
import { toast } from "sonner"
import { cn, fmtTerritoryNumber } from "@/lib/utils"
import { Territory, Group } from "@/lib/types"
import { useRequestTerritory, UrgentGroupSuggestion } from "@/hooks/use-request-territory"
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
  const { fetchGroups, fetchAvailableTerritory, findMostUrgentGroup, requestTerritory } = useRequestTerritory()

  const [step, setStep] = useState<Step>("select-group")
  const [groups, setGroups] = useState<Group[]>([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState("")
  const [selectedIsCommercial, setSelectedIsCommercial] = useState(false)
  const [loadingGroupId, setLoadingGroupId] = useState<string | null>(null)
  const [territory, setTerritory] = useState<Territory | null>(null)
  const [noTerritory, setNoTerritory] = useState(false)
  const [noCampaignTerritory, setNoCampaignTerritory] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [tooRecent, setTooRecent] = useState(false)
  const [urgentSuggestion, setUrgentSuggestion] = useState<UrgentGroupSuggestion | null>(null)
  const [activeCampaign, setActiveCampaign] = useState<ActiveCampaign | null>(null)
  const [campaignMode, setCampaignMode] = useState(false)

  useEffect(() => {
    if (!open) return
    setStep("select-group")
    setSelectedGroupId("")
    setSelectedIsCommercial(false)
    setTerritory(null)
    setNoTerritory(false)
    setNoCampaignTerritory(false)
    setTooRecent(false)
    setUrgentSuggestion(null)

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

  const handleSelect = useCallback(async (opts: { groupId?: string; commercial?: boolean }) => {
    const key = opts.commercial ? "comercial" : (opts.groupId ?? "")
    setSelectedGroupId(key)
    setSelectedIsCommercial(!!opts.commercial)
    setLoadingGroupId(key)
    setNoTerritory(false)
    setNoCampaignTerritory(false)
    setTooRecent(false)
    setUrgentSuggestion(null)
    try {
      const campaign = campaignMode && activeCampaign
        ? { id: activeCampaign.id, startDate: activeCampaign.startDate }
        : null
      const selector = opts.commercial
        ? { territoryType: "comercial" as const }
        : { groupId: opts.groupId! }
      const { territory: result, blockedByRecency } = await fetchAvailableTerritory(selector, campaign)
      setTerritory(result)
      if (result === null) {
        if (campaignMode) {
          setNoCampaignTerritory(true)
        } else if (blockedByRecency) {
          setTooRecent(true)
          findMostUrgentGroup().then(setUrgentSuggestion)
        } else {
          setNoTerritory(true)
        }
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
    setTooRecent(false)
    setUrgentSuggestion(null)
  }, [])

  const selectedGroup = groups.find((g) => g.id === selectedGroupId)
  const COMMERCIAL_KEY = "comercial"

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
                  Carregando…
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => handleSelect({ groupId: g.id })}
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

                  <div className="h-px bg-border my-0.5" />

                  <button
                    onClick={() => handleSelect({ commercial: true })}
                    disabled={loadingGroupId !== null}
                    className={cn(
                      "flex items-center gap-3 w-full px-3 py-2.5 rounded-lg border text-sm font-medium text-left transition-colors",
                      "bg-card hover:bg-muted/60 border-border",
                      "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                  >
                    {loadingGroupId === COMMERCIAL_KEY ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-muted-foreground" />
                    ) : (
                      <span className="inline-block h-3 w-3 rounded-full shrink-0 bg-amber-500" />
                    )}
                    Comercial
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-5 pt-1">
            {noCampaignTerritory ? (
              <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-1">
                <p className="text-sm font-medium text-foreground">
                  Todos os territórios desta região já foram cobertos na campanha.
                </p>
                <p className="text-xs text-muted-foreground">
                  Escolha outra região ou desmarque o modo campanha.
                </p>
              </div>
            ) : tooRecent ? (
              <div className="space-y-2">
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                  <p className="text-sm font-medium text-foreground">
                    Territórios desta região foram trabalhados recentemente.
                  </p>
                </div>
                {urgentSuggestion && (
                  <button
                    onClick={() => handleSelect({ groupId: urgentSuggestion.groupId })}
                    disabled={loadingGroupId !== null}
                    className="w-full flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left hover:bg-muted/60 transition-colors disabled:opacity-50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground">Região com territórios mais urgentes</p>
                      <p className="text-sm font-semibold text-foreground">
                        {urgentSuggestion.groupName}
                        <span className="font-normal text-muted-foreground ml-1">
                          · {urgentSuggestion.days === 9999 ? "nunca trabalhado" : `${urgentSuggestion.days} dias`}
                        </span>
                      </p>
                    </div>
                    {loadingGroupId === urgentSuggestion.groupId
                      ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                      : <ArrowRight className="h-4 w-4 text-emerald-500 shrink-0" />
                    }
                  </button>
                )}
              </div>
            ) : noTerritory || !territory ? (
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground">
                  Nenhum território disponível nesta região no momento.
                </p>
              </div>
            ) : (
              <div className={cn("rounded-xl border p-4 space-y-3", "bg-muted/30")}>
                <div className="flex items-center gap-3">
                  <div
                    className="h-8 w-1 rounded-full shrink-0"
                    style={{ backgroundColor: selectedIsCommercial ? "#f59e0b" : (selectedGroup?.color || territory.color || "var(--primary)") }}
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
