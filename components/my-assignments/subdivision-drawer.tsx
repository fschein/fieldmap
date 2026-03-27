"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Subdivision } from "@/lib/types"
import { CheckCircle2, MapPin, Calendar } from "lucide-react"
import { useState } from "react"

interface SubdivisionDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  subdivision: Subdivision
  onToggle: () => void
}

export function SubdivisionDrawer({
  open,
  onOpenChange,
  subdivision,
  onToggle,
}: SubdivisionDrawerProps) {
  const [loading, setLoading] = useState(false)
  const isCompleted = subdivision.completed || subdivision.status === "completed"

  const handleToggle = async () => {
    setLoading(true)
    try {
      await onToggle()
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  }

  return (
    <>
      {/* Overlay customizado com z-index alto */}
      {open && (
        <div 
          className="fixed inset-0 bg-black/50 z-[10000]"
          onClick={() => onOpenChange(false)}
        />
      )}
      
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto z-[10001]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-slate-500" />
              {subdivision.name || "Quadra sem nome"}
            </DialogTitle>
            <DialogDescription>
              Detalhes da quadra e ações disponíveis
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Status Badge */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              {isCompleted ? (
                <Badge className="bg-green-600 hover:bg-green-700">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Concluída
                </Badge>
              ) : (
                <Badge variant="outline">Pendente</Badge>
              )}
            </div>

            {/* Informações */}
            <div className="space-y-3">
              {subdivision.notes && (
                <div>
                  <h4 className="text-sm font-semibold mb-1">Observações</h4>
                  <p className="text-sm text-muted-foreground">{subdivision.notes}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                <div>
                  <h4 className="text-xs text-muted-foreground mb-1">Criado em</h4>
                  <p className="text-sm font-medium flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(subdivision.created_at)}
                  </p>
                </div>
                {subdivision.updated_at && (
                  <div>
                    <h4 className="text-xs text-muted-foreground mb-1">Atualizado em</h4>
                    <p className="text-sm font-medium flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(subdivision.updated_at)}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Ações */}
            <div className="space-y-3 pt-4 border-t">
              {isCompleted ? (
                <div className="space-y-3 text-center">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" />
                    <p className="text-sm font-medium text-green-900">
                      Esta quadra já foi concluída
                    </p>
                  </div>
                  <Button
                    onClick={handleToggle}
                    disabled={loading}
                    variant="ghost"
                    className="w-full text-slate-500 hover:text-red-600 hover:bg-red-50 text-xs"
                  >
                    Retomar quadra (desfazer)
                  </Button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Marque esta quadra como concluída quando terminar o trabalho nela.
                  </p>
                  <Button
                    onClick={handleToggle}
                    disabled={loading}
                    className="w-full h-12 text-base"
                    size="lg"
                  >
                    <CheckCircle2 className="mr-2 h-5 w-5" />
                    {loading ? "Marcando..." : "Finalizar quadra"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}