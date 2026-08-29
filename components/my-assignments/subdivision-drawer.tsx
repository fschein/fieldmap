"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Subdivision } from "@/lib/types"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { CheckCircle2, Calendar, Loader2, Info, Check, CloudUpload, Link2, Copy, Ban } from "lucide-react"
import { useState, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface SubdivisionDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  subdivision: Subdivision
  onToggle: (date?: string) => Promise<void>
  onSaveNotes?: (notes: string) => Promise<void>
  canEdit?: boolean
  /** Necessário pra gerar/revogar o link de campo desta quadra. */
  territoryId?: string
  /** Gera/revoga link de campo é recurso de admin/supervisor — mesma regra do resto do módulo de casas. */
  isSupervisor?: boolean
}

interface FieldLink {
  id: string
  expires_at: string
}

// Mesmo tom usado em components/dashboard/house-by-house.tsx pro
// botão de contorno teal (ação secundária do módulo de casas).
const TEAL = "oklch(0.68 0.12 195)"

const supabase = getSupabaseBrowserClient()

export function SubdivisionDrawer({
  open,
  onOpenChange,
  subdivision,
  onToggle,
  onSaveNotes,
  canEdit = true,
  territoryId,
  isSupervisor = false,
}: SubdivisionDrawerProps) {
  const [loading, setLoading] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")
  const [notes, setNotes] = useState(subdivision.notes || "")
  const [completionDate, setCompletionDate] = useState(new Date().toISOString().split('T')[0])
  const [fieldLink, setFieldLink] = useState<FieldLink | null>(null)
  const [linkLoading, setLinkLoading] = useState(false)
  const isCompleted = subdivision.completed || subdivision.status === "completed"

  const allUnits = ((subdivision as any).streets || []).flatMap((s: any) => s.units || [])
  const housesTotal = allUnits.length
  const housesDone = allUnits.filter((u: any) => u.status === "visited" || u.status === "visited_carta").length

  // Reset states when opening/closing
  useEffect(() => {
    if (open) {
      setCompletionDate(new Date().toISOString().split('T')[0])
      setNotes(subdivision.notes || "")
      setSaveStatus("idle")
    }
  }, [open, subdivision])

  useEffect(() => {
    if (!open || !isSupervisor) {
      setFieldLink(null)
      return
    }
    let cancelled = false
    supabase
      .from("field_links")
      .select("id, expires_at")
      .eq("subdivision_id", subdivision.id)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then((res: { data: FieldLink | null }) => {
        if (!cancelled) setFieldLink(res.data ?? null)
      })
    return () => { cancelled = true }
  }, [open, isSupervisor, subdivision.id])

  const handleGenerateLink = async () => {
    if (!territoryId) return
    setLinkLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from("field_links")
        .insert({ territory_id: territoryId, subdivision_id: subdivision.id, created_by: user?.id ?? null })
        .select("id, expires_at")
        .single()
      if (error) throw error
      setFieldLink(data)
      const url = `${window.location.origin}/campo/${data.id}`
      await navigator.clipboard.writeText(url)
      toast.success("Link copiado! Válido por 2 horas.", { description: url, duration: 8000 })
    } catch (error: any) {
      toast.error("Erro ao gerar link: " + error.message)
    } finally {
      setLinkLoading(false)
    }
  }

  const handleRevokeLink = async () => {
    if (!fieldLink) return
    setLinkLoading(true)
    try {
      const { error } = await supabase.from("field_links").delete().eq("id", fieldLink.id)
      if (error) throw error
      setFieldLink(null)
      toast.success("Link revogado.")
    } catch (error: any) {
      toast.error("Erro ao revogar link: " + error.message)
    } finally {
      setLinkLoading(false)
    }
  }

  const handleCopyLink = async () => {
    if (!fieldLink) return
    await navigator.clipboard.writeText(`${window.location.origin}/campo/${fieldLink.id}`)
    toast.success("Link copiado!")
  }

  const formatExpiry = (expiresAt: string) => {
    const diffMs = new Date(expiresAt).getTime() - Date.now()
    const diffMin = Math.max(0, Math.round(diffMs / 60000))
    if (diffMin >= 60) return `expira em ${Math.round(diffMin / 60)}h`
    return `expira em ${diffMin}min`
  }

  const silentSave = useCallback(async (newNotes: string) => {
    if (!canEdit || !onSaveNotes || newNotes === subdivision.notes) return
    setSaveStatus("saving")
    try {
      await onSaveNotes(newNotes)
      setSaveStatus("saved")
      // Reset saved status after 2 seconds
      setTimeout(() => setSaveStatus(prev => prev === "saved" ? "idle" : prev), 2000)
    } catch (error) {
      console.error(error)
      setSaveStatus("idle")
    }
  }, [canEdit, onSaveNotes, subdivision.notes])

  const handleBlur = () => {
    if (notes !== subdivision.notes) {
      silentSave(notes)
    }
  }

  const handleToggle = async () => {
    if (!canEdit) return
    setLoading(true)
    try {
      await onToggle(isCompleted ? undefined : completionDate)
      onOpenChange(false)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const formatDateTime = (dateString: string | null | undefined) => {
    if (!dateString) return ""
    return new Date(dateString).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <Dialog open={open} onOpenChange={(val) => !loading && onOpenChange(val)}>
      <DialogContent 
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="sm:max-w-[440px] w-[95vw] p-0 overflow-hidden z-[10001] animate-in fade-in zoom-in-95 duration-200 focus:outline-none focus-visible:outline-none"
      >
        <DialogHeader className="p-5 pb-0 pr-12 text-left">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-1">
             <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(var(--primary),0.4)] shrink-0" style={{ backgroundColor: isCompleted ? '#22c55e' : '#3b82f6' }} />
              <DialogTitle className="text-lg font-black text-foreground tracking-tight">
                Quadra {subdivision.name || "??"}
              </DialogTitle>
            </div>
            {isCompleted ? (
              <span className="text-[0.5625rem] font-black px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-500 uppercase tracking-widest shrink-0">
                Concluída
              </span>
            ) : (
              <span className="text-[0.5625rem] font-black px-2 py-1 rounded-full bg-primary/10 text-primary uppercase tracking-widest shrink-0">
                Pendente
              </span>
            )}
          </div>
          <DialogDescription className="sr-only">
            Detalhes e anotações da quadra {subdivision.name}
          </DialogDescription>
        </DialogHeader>

        <div className="p-5 pt-4 space-y-6">
          {/* Link de campo + Anotações — agrupados com respiro reduzido entre si */}
          <div className="space-y-4">
          {isSupervisor && (
            <div className="space-y-2">
              <Label className="text-[0.5625rem] font-black text-muted-foreground uppercase tracking-[0.2em] px-1">
                Link de Campo
              </Label>

              {fieldLink ? (
                <div className="bg-muted/50 border border-border rounded-xl p-4 space-y-3">
                  {housesTotal > 0 && (
                    <p className="text-xs font-bold text-foreground">
                      {housesDone} de {housesTotal} casas visitadas
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={`${typeof window !== "undefined" ? window.location.origin : ""}/campo/${fieldLink.id}`}
                      className="h-10 bg-background border-border rounded-lg font-mono text-xs"
                      onFocus={(e) => e.target.select()}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="h-10 w-10 shrink-0 rounded-lg"
                      onClick={handleCopyLink}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[0.625rem] font-bold text-emerald-500 uppercase tracking-wide">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Ativo · {formatExpiry(fieldLink.expires_at)}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={linkLoading}
                      onClick={handleRevokeLink}
                      className="h-7 text-xs font-semibold text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive rounded-lg px-2.5"
                    >
                      {linkLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Ban className="h-3 w-3 mr-1" /> Revogar link</>}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGenerateLink}
                  disabled={linkLoading || !territoryId}
                  className="w-full h-11 bg-transparent rounded-xl shadow-none flex items-center justify-center gap-2 text-sm font-semibold"
                  style={{ color: TEAL, borderColor: TEAL }}
                >
                  {linkLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Link2 className="h-4 w-4" /> Gerar link da quadra</>}
                </Button>
              )}
            </div>
          )}

          {/* Editor de Notas */}
          {!isCompleted && (
            <div className="space-y-2 relative">
             <div className="flex items-center justify-between px-1">
                <Label htmlFor="notes" className="text-[0.5625rem] font-black text-muted-foreground uppercase tracking-[0.2em]">
                  Anotações de Progresso
                </Label>
              </div>
              
              <Textarea
                id="notes"
                placeholder="Onde parou? Algum detalhe importante?"
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value)
                  if (saveStatus === "saved") setSaveStatus("idle")
                }}
                onBlur={handleBlur}
                disabled={!canEdit || loading}
                className="min-h-[100px] bg-muted/30 border-border rounded-xl font-medium text-sm shadow-sm focus:ring-primary/20 resize-none transition-all duration-200"
              />

              <div className="flex items-center justify-between px-1 mt-2">
                <p className="text-[0.5625rem] font-medium text-muted-foreground/70 italic">
                  Salva ao sair ou fechar o teclado
                </p>
                <Button
                  onClick={() => silentSave(notes)}
                  disabled={!canEdit || loading || saveStatus === "saving" || notes === subdivision.notes}
                  variant="secondary"
                  size="sm"
                  className="h-7 text-[0.5625rem] font-black uppercase tracking-wider gap-1.5 rounded-lg px-3 transition-all"
                >
                  {saveStatus === "saving" ? (
                    <><Loader2 className="h-3 w-3 animate-spin" /> Salvando...</>
                  ) : saveStatus === "saved" ? (
                    <><Check className="h-3 w-3 text-emerald-500" /> Salvo!</>
                  ) : (
                    <><CloudUpload className="h-3 w-3" /> Salvar</>
                  )}
                </Button>
              </div>
            </div>
          )}

          {isCompleted && subdivision.notes && (
             <div className="bg-muted/50 border border-border p-4 rounded-xl">
              <div className="flex items-center gap-2 mb-2 opacity-50">
                <Info className="h-3.5 w-3.5" />
                <h4 className="text-[0.5625rem] font-black uppercase tracking-widest text-foreground">Relatório</h4>
              </div>
              <p className="text-sm text-foreground font-medium leading-relaxed italic">
                "{subdivision.notes}"
              </p>
            </div>
          )}
          </div>

          {/* Área de Ação */}
          <div className="space-y-4">
            {isCompleted ? (
              <div className="space-y-4">
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5 text-center shadow-inner">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
                  <p className="text-xs font-black text-emerald-500 mb-1 tracking-wider">TRABALHO FINALIZADO</p>
                  <p className="text-[0.625rem] text-emerald-500/60 font-medium uppercase tracking-tight">
                    Concluída em {formatDateTime(subdivision.completed_at || subdivision.updated_at)}
                  </p>
                </div>
                <Button
                  onClick={handleToggle}
                  disabled={!canEdit || loading}
                  variant="outline"
                  className="w-full text-muted-foreground hover:text-destructive border-dashed hover:border-destructive/50 hover:bg-destructive/10 text-sm font-semibold h-12 rounded-xl transition-all"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "Reabrir quadra"}
                </Button>
              </div>
            ) : (
              <div className="group/field bg-muted/50 p-5 rounded-2xl space-y-2 shadow-inner border border-border">
                 <div className="space-y-2">
                  <Label htmlFor="date" className="text-[0.5625rem] font-black text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-2 px-1">
                    <Calendar className="h-3 w-3" />
                    Data da Conclusão
                  </Label>
                  <Input
                    id="date"
                    type="date"
                    value={completionDate}
                    onChange={(e) => setCompletionDate(e.target.value)}
                    disabled={!canEdit || loading}
                    className="h-11 bg-background border-border rounded-xl font-bold font-mono text-sm shadow-sm focus:ring-primary/20"
                  />
                </div>

                <Button
                  onClick={handleToggle}
                  disabled={!canEdit || loading}
                  className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm px-5"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando...
                    </span>
                  ) : (
                    <>
                      <CheckCircle2 className="h-5 w-5" />
                      Finalizar quadra
                    </>
                  )}
                </Button>
              </div>
            )}
            
            {!canEdit && (
              <div className="flex items-center gap-2 justify-center py-2 text-amber-600 bg-amber-50 rounded-lg border border-amber-200">
                <Info className="h-4 w-4" />
                <span className="text-[0.625rem] font-black uppercase tracking-widest">Apenas Visualização Durante a Semana</span>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}