"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { TerritoryWithSubdivisions } from "@/types"

interface CompleteAssignmentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  territory: TerritoryWithSubdivisions
  onConfirm: () => void
}

export function CompleteAssignmentDialog({
  open,
  onOpenChange,
  territory,
  onConfirm,
}: CompleteAssignmentDialogProps) {
  const completedSubdivisions = territory.subdivisions?.filter(
    s => s.completed || s.status === 'completed'
  ).length || 0
  const totalSubdivisions = territory.subdivisions?.length || 0
  const allCompleted = completedSubdivisions === totalSubdivisions

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Concluir Território {territory.number}?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              Você está prestes a marcar o território <strong>{territory.name}</strong> como concluído.
            </p>
            
            <div className="rounded-lg bg-slate-50 p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Quadras concluídas:</span>
                <span className="font-semibold">
                  {completedSubdivisions} de {totalSubdivisions}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Progresso:</span>
                <span className="font-semibold">
                  {Math.round((completedSubdivisions / totalSubdivisions) * 100)}%
                </span>
              </div>
            </div>

            {!allCompleted && (
              <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3">
                <p className="text-sm text-yellow-800">
                  ⚠️ Atenção: Nem todas as quadras foram marcadas como concluídas. 
                  Tem certeza que deseja continuar?
                </p>
              </div>
            )}

            <p className="text-sm">
              Esta ação irá devolver o território para a lista de territórios disponíveis.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Sim, concluir território
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
