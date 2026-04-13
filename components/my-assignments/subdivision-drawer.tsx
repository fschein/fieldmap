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
import { CheckCircle2, Calendar, Loader2, Info, Check, CloudUpload } from "lucide-react"
import { useState, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"

interface SubdivisionDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  subdivision: Subdivision
  onToggle: (date?: string) => Promise<void>
  onSaveNotes?: (notes: string) => Promise<void>
  canEdit?: boolean
}

export function SubdivisionDrawer({
  open,
  onOpenChange,
  subdivision,
  onToggle,
  onSaveNotes,
  canEdit = true,
}: SubdivisionDrawerProps) {
  const [loading, setLoading] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")
  const [notes, setNotes] = useState(subdivision.notes || "")
  const [completionDate, setCompletionDate] = useState(new Date().toISOString().split('T')[0])
  const isCompleted = subdivision.completed || subdivision.status === "completed"

  // Reset states when opening/closing
  useEffect(() => {
    if (open) {
      setCompletionDate(new Date().toISOString().split('T')[0])
      setNotes(subdivision.notes || "")
      setSaveStatus("idle")
    }
  }, [open, subdivision])

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

  // Debounced effect for notes
  useEffect(() => {
    if (!open || notes === subdivision.notes) return
    
    setSaveStatus("idle") // Se mudou, volta pro idle antes do timeout se necessário
    const timer = setTimeout(() => {
      silentSave(notes)
    }, 800)

    return () => clearTimeout(timer)
  }, [notes, silentSave, open, subdivision.notes])

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

  const formatDate = (dateString: string) => {
    if (!dateString) return ""
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  }

  return (
    <Dialog open={open} onOpenChange={(val) => !loading && onOpenChange(val)}>
      <DialogContent className="sm:max-w-[440px] w-[95vw] p-0 overflow-hidden z-[10001] animate-in fade-in zoom-in-95 duration-200 focus:outline-none focus-visible:outline-none">
        <DialogHeader className="p-5 pb-0">
          <div className="flex items-center justify-between mb-1">
             <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(var(--primary),0.4)]" style={{ backgroundColor: isCompleted ? '#22c55e' : '#3b82f6' }} />
              <DialogTitle className="text-lg font-black text-foreground tracking-tight">
                Quadra {subdivision.name || "??"}
              </DialogTitle>
            </div>
            <div>
               {isCompleted ? (
                  <span className="text-[0.5625rem] font-black px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-500 uppercase tracking-widest">
                    Concluída
                  </span>
                ) : (
                  <span className="text-[0.5625rem] font-black px-2 py-1 rounded-full bg-primary/10 text-primary uppercase tracking-widest">
                    Pendente
                  </span>
                )}
            </div>
          </div>
          <DialogDescription className="sr-only">
            Detalhes e anotações da quadra {subdivision.name}
          </DialogDescription>
        </DialogHeader>

        <div className="p-5 pt-4 space-y-6">
          {/* Editor de Notas */}
          {!isCompleted && (
            <div className="space-y-2 relative">
             <div className="flex items-center justify-between px-1">
                <Label htmlFor="notes" className="text-[0.5625rem] font-black text-muted-foreground uppercase tracking-[0.2em]">
                  Anotações de Progresso
                </Label>
                
                {/* Indicador de Save Discreto */}
                <div className={cn(
                  "flex items-center gap-1.5 text-[0.5rem] font-black uppercase tracking-tighter transition-all duration-300",
                  saveStatus === "idle" ? "opacity-0 translate-x-1" : "opacity-100 translate-x-0",
                  saveStatus === "saving" ? "text-primary anim-pulse" : "text-emerald-500"
                )}>
                  {saveStatus === "saving" ? (
                    <>
                      <Loader2 className="h-2 w-2 animate-spin" />
                      Salvando
                    </>
                  ) : (
                    <>
                      <Check className="h-2.5 w-2.5" />
                      Salvo
                    </>
                  )}
                </div>
              </div>
              
              <Textarea
                id="notes"
                placeholder="Onde parou? Algum detalhe importante?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={!canEdit || loading}
                className="min-h-[100px] bg-muted/30 border-border rounded-xl font-medium text-sm shadow-sm focus:ring-primary/20 resize-none transition-all duration-200"
              />
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

          {/* Área de Ação */}
          <div className="space-y-4">
            {isCompleted ? (
              <div className="space-y-4">
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5 text-center shadow-inner">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
                  <p className="text-xs font-black text-emerald-500 mb-1 tracking-wider">TRABALHO FINALIZADO</p>
                  <p className="text-[0.625rem] text-emerald-500/60 font-medium uppercase tracking-tight">
                    Registrado em {formatDate(subdivision.updated_at)}
                  </p>
                </div>
                <Button
                  onClick={handleToggle}
                  disabled={!canEdit || loading}
                  variant="outline"
                  className="w-full text-muted-foreground hover:text-destructive border-dashed hover:border-destructive/50 hover:bg-destructive/10 text-[0.625rem] font-black uppercase tracking-widest h-12 rounded-xl transition-all"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "Reabrir Quadra"}
                </Button>
              </div>
            ) : (
              <div className="group/field bg-muted/50 p-5 rounded-2xl space-y-4 shadow-inner border border-border">
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

                <div className="pt-2">
                  <Button
                    onClick={handleToggle}
                    disabled={!canEdit || loading}
                    className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-black rounded-xl shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm uppercase px-5 tracking-widest"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        SALVANDO...
                      </span>
                    ) : (
                      <>
                        <CheckCircle2 className="h-5 w-5" />
                        Finalizar Quadra
                      </>
                    )}
                  </Button>
                </div>
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