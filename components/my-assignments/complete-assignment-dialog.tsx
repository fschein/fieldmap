import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { TerritoryWithSubdivisions } from "@/lib/types"
import { useAppSettings } from "@/hooks/use-app-settings"

interface CompleteAssignmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  territory: TerritoryWithSubdivisions
  activeAssignmentDate?: string
  onConfirm: (reason?: string) => void
}

export function CompleteAssignmentDialog({
  open,
  onOpenChange,
  territory,
  activeAssignmentDate,
  onConfirm,
}: CompleteAssignmentDialogProps) {
  const [reason, setReason] = useState("")
  const { settings } = useAppSettings()

  const completedSubdivisions = territory.subdivisions?.filter(
    s => s.completed || s.status === 'completed'
  ).length || 0
  const totalSubdivisions = territory.subdivisions?.length || 0
  const allCompleted = completedSubdivisions === totalSubdivisions

  const halfDoneSubdivisions = territory.subdivisions?.filter(
    s => !(s.completed || s.status === 'completed') && s.notes?.trim()
  ) || []
  const hasHalfDone = halfDoneSubdivisions.length > 0

  // Math for deadline
  let timeInFieldMs = 0;
  if (activeAssignmentDate) {
    timeInFieldMs = new Date().getTime() - new Date(activeAssignmentDate).getTime();
  }
  const daysInField = Math.ceil(timeInFieldMs / (1000 * 60 * 60 * 24));
  const daysRemaining = settings.overdue_days - daysInField;

  const handleConfirm = () => {
    if (!allCompleted && hasHalfDone) return
    if (!allCompleted && !reason.trim()) {
      alert("Por favor, informe o motivo da devolução incompleta.")
      return
    }
    onConfirm(reason)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {allCompleted ? "Parabéns pela conclusão!" : "Devolver Território"}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 pt-2 text-muted-foreground text-sm">
              <p>
                Território <strong>{territory.number} - {territory.name}</strong>
              </p>
            
            <div className="rounded-lg bg-slate-50 p-3 space-y-2 border border-slate-100">
              <div className="flex justify-between text-xs">
                <span className="text-slate-600">Quadras concluídas:</span>
                <span className="font-semibold">
                  {completedSubdivisions} de {totalSubdivisions}
                </span>
              </div>
              <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-green-500 h-full transition-all" 
                  style={{ width: `${(completedSubdivisions / totalSubdivisions) * 100}%` }} 
                />
              </div>
            </div>

            {!allCompleted ? (
              <div className="space-y-3">
                {hasHalfDone && (
                  <div className="rounded-lg p-3 text-[0.8125rem] border bg-red-50 border-red-200 text-red-800">
                    <p className="font-semibold">⚠️ Não é possível devolver ainda</p>
                    <p className="mt-1">
                      A quadra {halfDoneSubdivisions.map(s => s.name).join(", ")} está com anotação de progresso ("Onde parou") mas não foi finalizada.
                      Finalize a quadra ou apague a anotação antes de devolver o território.
                    </p>
                  </div>
                )}
                <div className={`rounded-lg p-3 text-[0.8125rem] border ${daysRemaining < 0 ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                  {daysRemaining < 0 ? (
                    <>
                      <p className="font-semibold">⚠️ Território atrasado</p>
                      <p className="mt-1">Você está devolvendo o território sem completar todas as quadras. O prazo de {settings.overdue_days} dias foi superado em <strong>{Math.abs(daysRemaining)} {Math.abs(daysRemaining) === 1 ? 'dia' : 'dias'}</strong>.</p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold">Atenção: você está devolvendo sem completar todas as quadras.</p>
                      <p className="mt-1">
                        {activeAssignmentDate
                          ? <>Restam <strong>{daysRemaining} {daysRemaining === 1 ? 'dia' : 'dias'}</strong> para o território ser considerado atrasado. Você pode ficar com ele até a conclusão.</>
                          : <>Informe o motivo da devolução incompleta.</>
                        }
                      </p>
                    </>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="reason" className="text-sm font-semibold text-slate-700">Motivo da devolução <span className="text-red-500">*</span></Label>
                  <Textarea
                    id="reason"
                    placeholder="Ex: Não consegui terminar a Rua X pois choveu..."
                    className="h-24 text-[0.8125rem]"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={hasHalfDone}
                    required
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-600">
                Você finalizou todas as quadras designadas. Deseja devolver o cartão para o arquivo?
              </p>
            )}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            className={allCompleted ? "bg-green-600 hover:bg-green-700" : "bg-orange-600 hover:bg-orange-700"}
            onClick={handleConfirm}
            disabled={!allCompleted && hasHalfDone}
          >
            {allCompleted ? "Sim, concluir tudo" : "Confirmar devolução"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
