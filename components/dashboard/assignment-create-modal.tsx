"use client"

import { useState, useEffect } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { getLocalTodayStr, toLocalISOString } from "@/lib/date-utils"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Search, AlertTriangle, Clock, User, Users, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface Territory {
  id: string
  name: string
  number: string
  color: string
  assigned_to: string | null
  assignedName?: string | null
  daysInField?: number | null
  last_completed_at: string | null
  urgencyDays: number
  completedCount6m: number
  groups?: { color?: string }
}

interface Publisher {
  id: string
  name: string
}

interface Group {
  id: string
  name: string
  color?: string
}

interface AssignmentCreateModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  preselectedTerritoryId?: string | null
  preselectedPublisherId?: string | null
  onSuccess: () => void
}

type AssigneeType = "publisher" | "group"

export function AssignmentCreateModal({
  open,
  onOpenChange,
  preselectedTerritoryId = null,
  preselectedPublisherId = null,
  onSuccess,
}: AssignmentCreateModalProps) {
  const supabase = getSupabaseBrowserClient()

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [territories, setTerritories] = useState<Territory[]>([])
  const [publishers, setPublishers] = useState<Publisher[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [campaigns, setCampaigns] = useState<{ id: string; name: string; start_date?: string | null; end_date?: string | null }[]>([])

  const [assigneeType, setAssigneeType] = useState<AssigneeType>("publisher")
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string>("")
  const [selectedPublisherId, setSelectedPublisherId] = useState<string>("")
  const [selectedGroupId, setSelectedGroupId] = useState<string>("")
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("")
  const [startDate, setStartDate] = useState(getLocalTodayStr())
  const [endDate, setEndDate] = useState("")
  const [searchTerritory, setSearchTerritory] = useState("")
  const [searchPublisher, setSearchPublisher] = useState("")

  useEffect(() => {
    if (open) {
      setSelectedTerritoryId(preselectedTerritoryId || "")
      setSelectedPublisherId(preselectedPublisherId || "")
      setSelectedGroupId("")
      setSelectedCampaignId("")
      setAssigneeType("publisher")
      setStartDate(getLocalTodayStr())
      setEndDate("")
      setSearchTerritory("")
      setSearchPublisher("")
      loadData()
    }
  }, [open, preselectedTerritoryId, preselectedPublisherId])

  const loadData = async () => {
    setLoading(true)
    try {
      const results = await Promise.all([
        supabase
          .from("territories")
          .select("id, name, number, color, assigned_to, last_completed_at, groups ( color )")
          .order("number"),
        supabase
          .from("profiles")
          .select("id, name")
          .in("role", ["admin", "publicador", "dirigente", "supervisor"])
          .order("name"),
        supabase
          .from("campaigns")
          .select("id, name, start_date, end_date")
          .eq("active", true)
          .order("name"),
        supabase
          .from("assignments")
          .select("territory_id, assigned_at")
          .eq("status", "active"),
        supabase
          .from("groups")
          .select("id, name, color")
          .order("name"),
        supabase
          .from("assignments")
          .select("territory_id")
          .eq("status", "completed")
          .gte("completed_at", new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString()),
      ])

      const [terrRes, pubRes, campRes, activeAssignmentsRes, groupsRes, countRes] = results
      const completedCountsData = countRes.data || []

      if (terrRes.data && activeAssignmentsRes.data) {
        const activeAssigs = activeAssignmentsRes.data || []
        const mapped: Territory[] = terrRes.data.map((t: any) => {
          const now = new Date().getTime()
          let urgencyDays = 0
          if (t.last_completed_at) {
            urgencyDays = Math.floor(
              (now - new Date(t.last_completed_at).getTime()) / (1000 * 60 * 60 * 24)
            )
          } else {
            urgencyDays = 9999
          }

          let assignedName = null
          if (t.assigned_to && pubRes.data) {
            const pub = pubRes.data.find((p: any) => p.id === t.assigned_to)
            assignedName = pub ? pub.name : "Alguém"
          }

          let daysInField = null
          if (t.assigned_to) {
            const activeA = activeAssigs.find((a: any) => a.territory_id === t.id)
            if (activeA?.assigned_at) {
              const start = new Date(activeA.assigned_at).getTime()
              daysInField = Math.floor((now - start) / (1000 * 60 * 60 * 24))
            }
          }

          const count6m = completedCountsData.filter((c: any) => c.territory_id === t.id).length

          return { ...t, urgencyDays, assignedName, daysInField, completedCount6m: count6m }
        })

        mapped.sort((a, b) => {
          if (!a.assigned_to && b.assigned_to) return -1
          if (a.assigned_to && !b.assigned_to) return 1
          return b.urgencyDays - a.urgencyDays
        })

        setTerritories(mapped)
      }

      if (pubRes.data) setPublishers(pubRes.data)
      if (groupsRes.data) setGroups(groupsRes.data)
      if (campRes.data) {
        const campsData = campRes.data as any[]
        setCampaigns(campsData)

        const today = new Date()
        const currentCampaign = campsData.find(c => {
          if (!c.start_date) return false
          const start = new Date(c.start_date + "T00:00:00")
          const end = c.end_date ? new Date(c.end_date + "T23:59:59") : null
          return today >= start && (!end || today <= end)
        })

        if (currentCampaign) setSelectedCampaignId(currentCampaign.id)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const filteredTerritories = territories.filter(
    (t) =>
      t.name.toLowerCase().includes(searchTerritory.toLowerCase()) ||
      t.number.includes(searchTerritory)
  )

  const filteredPublishers = publishers.filter((p) =>
    p.name.toLowerCase().includes(searchPublisher.toLowerCase())
  )

  const selectedTerr = territories.find((t) => t.id === selectedTerritoryId)
  const selectedPub = publishers.find((p) => p.id === selectedPublisherId)
  const selectedGroup = groups.find((g) => g.id === selectedGroupId)

  const handleSave = async () => {
    if (!selectedTerritoryId) { toast.error("Selecione um território"); return }
    if (assigneeType === "publisher" && !selectedPublisherId) { toast.error("Selecione um publicador"); return }
    if (assigneeType === "group" && !selectedGroupId) { toast.error("Selecione um grupo"); return }
    if (!startDate) { toast.error("Data de início é obrigatória"); return }

    setSaving(true)
    try {
      const startISO = toLocalISOString(startDate)
      const endISO = toLocalISOString(endDate)
      const isCompleted = !!endISO
      const isGroupAssign = assigneeType === "group"

      if (!isCompleted) {
        await supabase
          .from("assignments")
          .update({ status: "returned", returned_at: new Date().toISOString() })
          .eq("territory_id", selectedTerritoryId)
          .eq("status", "active")
      }

      const { error: assignErr } = await supabase.from("assignments").insert({
        territory_id: selectedTerritoryId,
        user_id: isGroupAssign ? null : selectedPublisherId,
        group_id: isGroupAssign ? selectedGroupId : null,
        campaign_id: selectedCampaignId || null,
        status: isCompleted ? "completed" : "active",
        assigned_at: startISO,
        completed_at: endISO,
      })

      if (assignErr) throw assignErr

      const terrUpdate: any = {}
      if (isCompleted) {
        terrUpdate.assigned_to = null
        terrUpdate.last_completed_at = endISO
      } else if (!isGroupAssign) {
        terrUpdate.assigned_to = selectedPublisherId
      } else {
        terrUpdate.assigned_to = null
      }

      if (selectedCampaignId) terrUpdate.campaign_id = selectedCampaignId
      else terrUpdate.campaign_id = null

      await supabase.from("territories").update(terrUpdate).eq("id", selectedTerritoryId)

      if (!isCompleted && !isGroupAssign) {
        fetch("/api/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: selectedPublisherId,
            title: "Novo Território!",
            message: `Você recebeu o território ${selectedTerr?.number} - ${selectedTerr?.name}.`,
            url: `/dashboard/my-assignments/${selectedTerritoryId}/map`,
          }),
        }).catch((err: unknown) => console.error("Erro ao disparar push:", err))
      }

      toast.success(
        isCompleted
          ? "Designação histórica salva!"
          : isGroupAssign
            ? `${selectedTerr?.name} → grupo ${selectedGroup?.name}`
            : `${selectedTerr?.name} → ${selectedPub?.name}`
      )
      onOpenChange(false)
      onSuccess()
    } catch (e: any) {
      toast.error("Erro ao salvar: " + (e.message || "Erro desconhecido"))
    } finally {
      setSaving(false)
    }
  }

  // ─── Derived state for summary chips ───────────────────────────────────────
  const isCompleted = !!endDate
  const canSubmit = selectedTerritoryId &&
    (assigneeType === "publisher" ? !!selectedPublisherId : !!selectedGroupId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        Layout strategy (mobile-first):
        - DialogContent fills up to 92dvh, no horizontal overflow
        - Header: fixed 64px (h-16), matches app header spec
        - Body: flex-1 + overflow-y-auto, contains all form fields
        - Footer: fixed height, always visible above keyboard
      */}
      <DialogContent
        className={cn(
          // Dimensions
          "flex flex-col p-0 gap-0",
          "w-full max-w-md",
          // Height: use dvh for mobile browser chrome awareness
          "max-h-[92dvh]",
          // Shape
          "rounded-2xl overflow-hidden",
          // Prevent any child from causing X overflow
          "overflow-x-hidden",
        )}
      >
        {/* ── HEADER ── 64px fixed, matches h-16 app spec */}
        <DialogHeader className="flex-none h-16 flex flex-row items-center gap-3 px-4 border-b bg-card shrink-0">
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-base font-black uppercase tracking-tight leading-none">
              Nova Designação
            </DialogTitle>
            {/* Summary line — replaces the floating summary card */}
            {selectedTerr && (
              <p className="text-[0.6875rem] text-muted-foreground mt-0.5 truncate leading-none">
                <span
                  className="inline-block w-2 h-2 rounded-full mr-1 align-middle"
                  style={{ backgroundColor: selectedTerr.color }}
                />
                {selectedTerr.name}
                {(selectedPub || selectedGroup) && (
                  <span className="text-primary font-bold">
                    {" "}→{" "}
                    {assigneeType === "publisher" ? selectedPub?.name : selectedGroup?.name}
                  </span>
                )}
              </p>
            )}
          </div>
          {/* 6m badge — compact, lives in header when territory is selected */}
          {selectedTerr && selectedTerr.completedCount6m > 0 && (
            <span className="shrink-0 text-[0.625rem] font-black text-primary px-2 py-1 rounded-full bg-primary/10 border border-primary/20 leading-none">
              {selectedTerr.completedCount6m}× (6m)
            </span>
          )}
        </DialogHeader>

        {/* ── BODY — scrollable ── */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Carregando...</p>
            </div>
          ) : (
            <div className="px-4 py-3 space-y-4">

              {/* ── TERRITÓRIO ── */}
              <section className="space-y-1.5">
                <Label className="text-[0.625rem] font-black uppercase tracking-widest text-muted-foreground">
                  Território
                </Label>
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder="Nome ou número..."
                    className="pl-9 h-9 text-sm bg-muted/40 border-border rounded-xl"
                    value={searchTerritory}
                    onChange={(e) => setSearchTerritory(e.target.value)}
                  />
                </div>
                {/* List — tighter max-h to leave room for the rest */}
                <div className="border rounded-xl overflow-hidden bg-card shadow-sm divide-y divide-border">
                  <div className="max-h-36 overflow-y-auto overscroll-contain">
                    {filteredTerritories.length === 0 ? (
                      <p className="text-center text-xs text-muted-foreground py-5">
                        Nenhum território encontrado
                      </p>
                    ) : (
                      filteredTerritories.map((t) => (
                        <TerritoryRow
                          key={t.id}
                          territory={t}
                          selected={selectedTerritoryId === t.id}
                          onSelect={() => setSelectedTerritoryId(t.id)}
                        />
                      ))
                    )}
                  </div>
                </div>
              </section>

              {/* ── DESIGNAR PARA ── */}
              <section className="space-y-1.5">
                <Label className="text-[0.625rem] font-black uppercase tracking-widest text-muted-foreground">
                  Designar para
                </Label>
                {/* Toggle */}
                <div className="flex p-1 rounded-xl bg-muted border border-border gap-1">
                  <SegmentButton
                    active={assigneeType === "publisher"}
                    icon={<User className="w-3.5 h-3.5" />}
                    label="Publicador"
                    onClick={() => { setAssigneeType("publisher"); setSelectedGroupId("") }}
                  />
                  <SegmentButton
                    active={assigneeType === "group"}
                    icon={<Users className="w-3.5 h-3.5" />}
                    label="Grupo"
                    onClick={() => { setAssigneeType("group"); setSelectedPublisherId("") }}
                  />
                </div>

                {/* Publisher list */}
                {assigneeType === "publisher" && (
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                      <Input
                        placeholder="Filtrar publicadores..."
                        className="pl-9 h-9 text-sm bg-muted/40 border-border rounded-xl"
                        value={searchPublisher}
                        onChange={(e) => setSearchPublisher(e.target.value)}
                      />
                    </div>
                    <div className="border rounded-xl overflow-hidden bg-card shadow-sm divide-y divide-border">
                      <div className="max-h-28 overflow-y-auto overscroll-contain">
                        {filteredPublishers.map((p) => (
                          <button
                            key={p.id}
                            className={cn(
                              "w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors",
                              selectedPublisherId === p.id && "bg-primary/8 border-l-2 border-primary"
                            )}
                            onClick={() => setSelectedPublisherId(p.id)}
                          >
                            {selectedPublisherId === p.id && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                            )}
                            <span className={cn(
                              "truncate",
                              selectedPublisherId === p.id ? "font-semibold text-foreground" : "text-foreground"
                            )}>
                              {p.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Group list */}
                {assigneeType === "group" && (
                  <div className="border rounded-xl overflow-hidden bg-card shadow-sm divide-y divide-border">
                    <div className="max-h-28 overflow-y-auto overscroll-contain">
                      {groups.length === 0 ? (
                        <p className="text-center text-xs text-muted-foreground py-4">
                          Nenhum grupo cadastrado
                        </p>
                      ) : (
                        groups.map((g) => (
                          <button
                            key={g.id}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors",
                              selectedGroupId === g.id && "bg-primary/8 border-l-2 border-primary"
                            )}
                            onClick={() => setSelectedGroupId(g.id)}
                          >
                            {g.color && (
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: g.color }}
                              />
                            )}
                            {selectedGroupId === g.id && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                            )}
                            <span className={cn(
                              "truncate",
                              selectedGroupId === g.id ? "font-semibold text-foreground" : "font-medium text-foreground"
                            )}>
                              {g.name}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </section>

              {/* ── CAMPANHA ── */}
              {campaigns.length > 0 && (
                <section className="space-y-1.5">
                  <Label className="text-[0.625rem] font-black uppercase tracking-widest text-muted-foreground">
                    Campanha
                    <span className="ml-1 font-normal normal-case tracking-normal opacity-50">(opcional)</span>
                  </Label>
                  <select
                    className="w-full h-10 rounded-xl border border-border bg-card px-3 text-sm shadow-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none text-foreground"
                    value={selectedCampaignId}
                    onChange={(e) => setSelectedCampaignId(e.target.value)}
                  >
                    <option value="">Nenhuma...</option>
                    {campaigns.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </section>
              )}

              {/* ── DATAS ── */}
              <section className="space-y-1.5">
                <Label className="text-[0.625rem] font-black uppercase tracking-widest text-muted-foreground">
                  Datas
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <span className="text-[0.625rem] text-muted-foreground font-medium">Entrega</span>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="h-10 rounded-xl bg-muted/40 border-border text-sm"
                      max={new Date().toISOString().split("T")[0]}
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[0.625rem] text-muted-foreground font-medium">
                      Conclusão
                      <span className="ml-1 opacity-50">opt.</span>
                    </span>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={startDate}
                      max={new Date().toISOString().split("T")[0]}
                      className="h-10 rounded-xl bg-muted/40 border-border text-sm"
                    />
                  </div>
                </div>
                {/* Historical record hint */}
                {isCompleted && (
                  <p className="text-[0.625rem] text-muted-foreground bg-muted/60 rounded-lg px-2.5 py-1.5 leading-snug">
                    Com data de conclusão, será salvo como registro histórico.
                  </p>
                )}
              </section>

              {/* Bottom breathing room so last item isn't glued to footer */}
              <div className="h-2" />
            </div>
          )}
        </div>

        {/* ── FOOTER — fixed, always visible ── */}
        <div className="flex-none border-t bg-card px-4 py-3 shrink-0">
          <div className="flex gap-2">
            <Button
              className={cn(
                "flex-1 h-12 rounded-xl font-bold text-sm transition-all",
                canSubmit
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 active:scale-[0.98]"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
              onClick={handleSave}
              disabled={saving || loading || !canSubmit}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Confirmar Designação"
              )}
            </Button>
            <Button
              variant="ghost"
              className="h-12 px-4 rounded-xl text-muted-foreground font-medium shrink-0"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function TerritoryRow({
  territory: t,
  selected,
  onSelect,
}: {
  territory: Territory
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-accent",
        selected && "bg-primary/8 border-l-2 border-primary"
      )}
      onClick={onSelect}
    >
      {/* Color dot */}
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: t.groups?.color || t.color || "#C65D3B" }}
      />

      {/* Main text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate leading-tight">
          {t.name}
        </p>
        <p className="text-[0.625rem] text-muted-foreground leading-tight">
          #{t.number}
          {t.assigned_to && (
            <span className="ml-1.5 text-primary font-semibold">
              · {t.assignedName} ({t.daysInField ?? 0}d)
            </span>
          )}
        </p>
      </div>

      {/* Right-side badges — max 2 to keep rows narrow */}
      <div className="flex items-center gap-1 shrink-0">
        {t.urgencyDays === 9999 && !t.assigned_to && (
          <span className="text-[0.5625rem] text-primary font-black uppercase">Nunca</span>
        )}
        {t.urgencyDays > 180 && t.urgencyDays < 9999 && !t.assigned_to && (
          <AlertTriangle className="w-3 h-3 text-red-500" />
        )}
        {t.urgencyDays > 0 && t.urgencyDays <= 180 && !t.assigned_to && (
          <span className="text-[0.5625rem] text-muted-foreground flex items-center gap-0.5">
            <Clock className="w-2.5 h-2.5" />
            {t.urgencyDays}d
          </span>
        )}
        {t.completedCount6m > 0 && (
          <span className="text-[0.5625rem] font-black text-primary bg-primary/8 px-1 py-0.5 rounded border border-primary/15">
            {t.completedCount6m}×
          </span>
        )}
        {selected && (
          <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
        )}
      </div>
    </button>
  )
}

function SegmentButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold transition-all rounded-lg",
        active
          ? "bg-card text-foreground shadow-sm border border-border"
          : "text-muted-foreground hover:bg-card/50"
      )}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  )
}