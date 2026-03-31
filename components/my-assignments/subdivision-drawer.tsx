"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Subdivision } from "@/lib/types"
import { CheckCircle2, MapPin, Calendar, Loader2, Info, ArrowRight, X } from "lucide-react"
import { useState, useEffect } from "react"

interface SubdivisionDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  subdivision: Subdivision
  onToggle: (date?: string) => Promise<void>
}

export function SubdivisionDrawer({
  open,
  onOpenChange,
  subdivision,
  onToggle,
}: SubdivisionDrawerProps) {
  const [loading, setLoading] = useState(false)
  const [completionDate, setCompletionDate] = useState(new Date().toISOString().split('T')[0])
  const isCompleted = subdivision.completed || subdivision.status === "completed"

  // Reset states when opening/closing
  useEffect(() => {
    if (open) {
      setCompletionDate(new Date().toISOString().split('T')[0])
    }
  }, [open, subdivision])

  const handleToggle = async () => {
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
      <DialogContent className="sm:max-w-[440px] w-[95vw] p-0 overflow-hidden z-[10001] animate-in fade-in zoom-in-95 duration-200">
        {/* Custom Header Section */}
        <div className="p-5 pb-0">
          <div className="flex items-center justify-between mb-1">
             <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(var(--primary),0.4)]" style={{ backgroundColor: isCompleted ? 'hsl(var(--success, 142 76% 36%))' : 'hsl(var(--primary))' }} />
              <span className="text-lg font-black text-foreground tracking-tight">
                Quadra {subdivision.name || "??"}
              </span>
            </div>
            <div>
               {isCompleted ? (
                  <span className="text-[9px] font-black px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-500 uppercase tracking-widest">
                    Concluída
                  </span>
                ) : (
                  <span className="text-[9px] font-black px-2 py-1 rounded-full bg-primary/10 text-primary uppercase tracking-widest">
                    Pendente
                  </span>
                )}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-wider">
            Detalhamento de Trabalho
          </p>
        </div>

        <div className="p-5 pt-4 space-y-6">
          {/* Informações / Observações */}
          {subdivision.notes && (
            <div className="bg-muted/50 border border-border p-4 rounded-xl">
              <div className="flex items-center gap-2 mb-2 opacity-50">
                <Info className="h-3.5 w-3.5" />
                <h4 className="text-[9px] font-black uppercase tracking-widest text-foreground">Observações de Campo</h4>
              </div>
              <p className="text-sm text-foreground font-medium leading-relaxed italic">
                "{subdivision.notes}"
              </p>
            </div>
          )}

          {/* Área de Ação e Status */}
          <div className="space-y-4">
            {isCompleted ? (
              // VISÃO CONCLUÍDA
              <div className="space-y-4">
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5 text-center shadow-inner">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
                  <p className="text-xs font-black text-emerald-500 mb-1 tracking-wider">TRABALHO FINALIZADO</p>
                  <p className="text-[10px] text-emerald-500/60 font-medium uppercase tracking-tight">
                    Registrado em {formatDate(subdivision.updated_at)}
                  </p>
                </div>
                <Button
                  onClick={handleToggle}
                  disabled={loading}
                  variant="ghost"
                  className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 text-[9px] font-black uppercase tracking-[0.25em] h-10 rounded-lg transition-all"
                >
                  {loading ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : "Reabrir Quadra (Desfazer)"}
                </Button>
              </div>
            ) : (
              // VISÃO PENDENTE (DIRETA E PROPORCIONAL)
              <div className="group/field bg-muted p-5 rounded-2xl space-y-4 shadow-inner border border-border">
                 <div className="space-y-2">
                  <Label htmlFor="date" className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em] flex items-center gap-2 px-1">
                    <Calendar className="h-3 w-3" />
                    Data da Conclusão
                  </Label>
                  <Input
                    id="date"
                    type="date"
                    value={completionDate}
                    onChange={(e) => setCompletionDate(e.target.value)}
                    className="h-11 bg-background border-border rounded-xl font-bold font-mono text-sm shadow-sm focus:ring-primary/20"
                  />
                  <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest px-1">
                    Corrija se necessário
                  </p>
                </div>

                <div className="space-y-3">
                  <Button
                    onClick={handleToggle}
                    disabled={loading}
                    className="w-full h-10 bg-primary hover:bg-primary/90 text-primary-foreground font-black rounded-lg shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2 text-sm uppercase px-5 tracking-wider"
                  >
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        SALVANDO...
                      </span>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Finalizar Quadra
                      </>
                    )}
                  </Button>
                  
                  <p className="text-[9px] text-center text-muted-foreground font-black uppercase tracking-[0.25em] opacity-60">
                    Toque para registrar a visita
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}