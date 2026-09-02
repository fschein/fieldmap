"use client"

import { useState, useEffect, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Loader2, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { cn, fmtTerritoryNumber } from "@/lib/utils"
import { Territory, Group } from "@/lib/types"
import { useRequestTerritory, RegionPreview } from "@/hooks/use-request-territory"
import { useAuth } from "@/hooks/use-auth"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"

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

const REASON_LABEL: Record<string, string> = {
  empty: "Nenhum território nesta região",
  covered: "Territórios cobertos pela campanha",
  recent: "Todos trabalhados recentemente",
}

function previewLabel(preview: RegionPreview | undefined): string {
  if (!preview) return ""
  if (preview.reason !== "ok") return REASON_LABEL[preview.reason] ?? ""
  return preview.days === Infinity ? "Nunca trabalhado" : `${preview.days} dias sem trabalho`
}

function priorityReason(days: number): string {
  if (days === Infinity) return "Nunca trabalhado"
  return `Sem ser trabalhado há ${days} ${days === 1 ? "dia" : "dias"}`
}

export function RequestTerritoryModal({
  open,
  onOpenChange,
  onSuccess,
}: RequestTerritoryModalProps) {
  const { fetchGroups, fetchRegionPreviews, requestTerritory } = useRequestTerritory()
  const { user } = useAuth()

  const [step, setStep] = useState<Step>("select-group")
  const [groups, setGroups] = useState<Group[]>([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [previews, setPreviews] = useState<Record<string, RegionPreview>>({})
  const [territory, setTerritory] = useState<Territory | null>(null)
  const [territoryDays, setTerritoryDays] = useState<number>(Infinity)
  const [confirming, setConfirming] = useState(false)
  const [activeCampaign, setActiveCampaign] = useState<ActiveCampaign | null>(null)
  const [campaignMode, setCampaignMode] = useState(false)

  const loadPreviews = useCallback(async (groupsData: Group[], campaign: { id: string } | null) => {
    const result = await fetchRegionPreviews(groupsData, campaign)
    setPreviews(result)
  }, [fetchRegionPreviews])

  useEffect(() => {
    if (!open) return
    setStep("select-group")
    setTerritory(null)
    setPreviews({})
    setGroups([])
    setLoadingGroups(true)

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
        const campaign = found ? { id: found.id, name: found.name, startDate: found.start_date } : null
        setActiveCampaign(campaign)
        setCampaignMode(!!campaign)
      })
      .catch(() => toast.error("Erro ao carregar regiões."))
      .finally(() => setLoadingGroups(false))
  }, [open, fetchGroups])

  // Recalcula as prévias sempre que os grupos carregarem ou o modo campanha mudar
  useEffect(() => {
    if (!open || loadingGroups) return
    loadPreviews(groups, campaignMode ? activeCampaign : null)
  }, [open, loadingGroups, groups, campaignMode, activeCampaign, loadPreviews])

  const handleSelect = useCallback((key: string) => {
    const preview = previews[key]
    if (!preview?.territory) return
    setTerritory(preview.territory)
    setTerritoryDays(preview.days)
    setStep("confirm")
  }, [previews])

  const handleConfirm = useCallback(async () => {
    if (!territory || !user?.id) return
    setConfirming(true)
    try {
      await requestTerritory(territory.id)
      toast.success("Território designado com sucesso!")
      onOpenChange(false)
      onSuccess()

      fetch("/api/notifications/request-territory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          territoryId: territory.id,
          territoryNumber: territory.number,
          territoryName: territory.name,
        }),
      }).catch(() => {})
    } catch (err: any) {
      console.error("Erro ao confirmar designação:", err)
      toast.error(err?.message ? `Erro ao confirmar designação: ${err.message}` : "Erro ao confirmar designação.")
    } finally {
      setConfirming(false)
    }
  }, [territory, requestTerritory, onOpenChange, onSuccess, user?.id])

  const handleBack = useCallback(() => {
    setStep("select-group")
    setTerritory(null)
    setTerritoryDays(Infinity)
  }, [])

  const territoryGroup = territory ? groups.find((g) => g.id === territory.group_id) : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto overflow-x-hidden" aria-describedby={undefined}>
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
                    <RegionButton
                      key={g.id}
                      label={`Região ${g.name}`}
                      dotColor={g.color}
                      preview={previews[g.id]}
                      onClick={() => handleSelect(g.id)}
                    />
                  ))}

                  <div className="h-px bg-border my-0.5" />

                  <RegionButton
                    label="Geral"
                    dotClassName="bg-muted-foreground"
                    preview={previews.geral}
                    onClick={() => handleSelect("geral")}
                  />

                  <div className="h-px bg-border my-0.5" />

                  <RegionButton
                    label="Comercial"
                    dotClassName="bg-amber-500"
                    preview={previews.comercial}
                    onClick={() => handleSelect("comercial")}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="space-y-5 pt-1">
            {territory ? (
              <div className={cn("rounded-xl border p-4 space-y-3", "bg-muted/30")}>
                <div className="flex items-center gap-3">
                  <div
                    className="h-8 w-1 rounded-full shrink-0"
                    style={{ backgroundColor: territoryGroup?.color || "hsl(var(--muted-foreground))" }}
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
                  <span>{priorityReason(territoryDays)}</span>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm text-muted-foreground">
                  Nenhum território disponível nesta região no momento.
                </p>
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

function RegionButton({
  label,
  dotColor,
  dotClassName,
  preview,
  onClick,
}: {
  label: string
  dotColor?: string
  dotClassName?: string
  preview?: RegionPreview
  onClick: () => void
}) {
  const disabled = !preview || preview.reason !== "ok"
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col w-full px-3 py-2.5 rounded-lg border text-sm font-medium text-left transition-colors gap-1",
        "bg-card border-border",
        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/60"
      )}
    >
      <span className="flex items-center gap-3">
        {dotColor ? (
          <span className="inline-block h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
        ) : (
          <span className={cn("inline-block h-3 w-3 rounded-full shrink-0", dotClassName)} />
        )}
        <span className="flex-1 min-w-0 truncate">{label}</span>
        {!preview && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-muted-foreground" />}
      </span>
      {preview && (
        <span className={cn(
          "text-xs pl-6",
          disabled ? "text-muted-foreground" : "text-muted-foreground/80"
        )}>
          {previewLabel(preview)}
        </span>
      )}
    </button>
  )
}
