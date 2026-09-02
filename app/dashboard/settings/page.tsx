"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/use-auth"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Check, Mail, Ban, Home } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { MarkingOption } from "@/lib/types"

const supabase = getSupabaseBrowserClient()

const OPTION_ICON_CLASS = "bg-muted text-muted-foreground"

const MARKING_OPTIONS: {
  key: MarkingOption
  label: string
  icon: typeof Check
  iconClass: string
  isNew?: boolean
}[] = [
  { key: "visited", label: "Falou com morador", icon: Check, iconClass: OPTION_ICON_CLASS },
  { key: "visited_carta", label: "Deixou carta", icon: Mail, iconClass: OPTION_ICON_CLASS },
  { key: "do_not_visit", label: "Não visitar", icon: Ban, iconClass: OPTION_ICON_CLASS },
  { key: "not_home", label: "Não em casa", icon: Home, iconClass: OPTION_ICON_CLASS, isNew: true },
]

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("bg-card rounded-2xl border border-border overflow-hidden shadow-sm", className)}>
      {children}
    </div>
  )
}

function Divider() {
  return <div className="h-px bg-border/60" />
}

function DaysRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string
  description: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Input
          type="number"
          min={1}
          value={value}
          onChange={(e) => onChange(Math.max(1, parseInt(e.target.value, 10) || 1))}
          className="w-16 h-9 text-center font-semibold"
        />
        <span className="text-xs text-muted-foreground">dias</span>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const { isAdmin, isReady } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [overdueDays, setOverdueDays] = useState(90)
  const [recentDays, setRecentDays] = useState(25)
  const [useHouses, setUseHouses] = useState(true)
  const [enabledOptions, setEnabledOptions] = useState<MarkingOption[]>(["visited", "visited_carta", "do_not_visit"])

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("overdue_days, recent_days, use_houses, enabled_marking_options")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }: { data: any }) => {
        if (data) {
          setOverdueDays(data.overdue_days)
          setRecentDays(data.recent_days)
          setUseHouses(data.use_houses)
          setEnabledOptions(data.enabled_marking_options)
        }
        setLoading(false)
      })
  }, [])

  const toggleOption = (key: MarkingOption) => {
    setEnabledOptions((prev) => {
      if (prev.includes(key)) {
        if (prev.length === 1) {
          toast.error("Pelo menos uma opção precisa ficar ativa.")
          return prev
        }
        return prev.filter((o) => o !== key)
      }
      return [...prev, key]
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const { error } = await supabase
        .from("app_settings")
        .update({
          overdue_days: overdueDays,
          recent_days: recentDays,
          use_houses: useHouses,
          enabled_marking_options: enabledOptions,
          updated_at: new Date().toISOString(),
        })
        .eq("id", true)
      if (error) throw error
      toast.success("Configurações salvas!")
    } catch (err: any) {
      toast.error(err?.message ? `Erro ao salvar: ${err.message}` : "Erro ao salvar configurações.")
    } finally {
      setSaving(false)
    }
  }

  if (!isReady || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm font-medium">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Carregando...
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-muted-foreground text-sm">
        Acesso restrito a administradores.
      </div>
    )
  }

  return (
    <div className="space-y-5 pb-24 max-w-2xl">
      <div className="pt-2">
        <h1 className="text-[1.375rem] font-semibold tracking-tight text-foreground leading-none">Configurações</h1>
        <p className="text-[0.6875rem] text-muted-foreground font-medium mt-1 uppercase tracking-wider">
          Ajustes gerais do território e das casas
        </p>
      </div>

      <SectionCard>
        <div className="px-4 pt-3.5 pb-1">
          <h2 className="text-sm font-semibold text-foreground">Prazos de território</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Define os limites de dias usados nos indicadores de atraso e de recência
          </p>
        </div>
        <Divider />
        <DaysRow
          label="Território atrasado"
          description="A partir de quantos dias sem visitas o território fica marcado como atrasado"
          value={overdueDays}
          onChange={setOverdueDays}
        />
        <Divider />
        <DaysRow
          label="Território muito recente"
          description="Até quantos dias desde a última entrega o território é considerado recente demais para reservar de novo"
          value={recentDays}
          onChange={setRecentDays}
        />
      </SectionCard>

      <SectionCard>
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Utilizar casas</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ativa o controle casa a casa nas quadras. Desativado, o botão de gerar link de casas some do popup de quadras
            </p>
          </div>
          <Switch checked={useHouses} onCheckedChange={setUseHouses} className="shrink-0" />
        </div>
      </SectionCard>

      <div className="space-y-2">
        <div className="px-1">
          <h2 className="text-sm font-semibold text-foreground">Opções para marcar as casas</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Escolha quais opções aparecem na gaveta de marcação. Pelo menos uma precisa ficar ativa
          </p>
        </div>

        <div className="space-y-2">
          {MARKING_OPTIONS.map((opt) => {
            const Icon = opt.icon
            const checked = enabledOptions.includes(opt.key)
            return (
              <SectionCard key={opt.key}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", opt.iconClass)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">{opt.label}</p>
                    {opt.isNew && (
                      <Badge variant="secondary" className="text-[0.5625rem] h-4 px-1.5 shrink-0">NOVO</Badge>
                    )}
                  </div>
                  <Switch checked={checked} onCheckedChange={() => toggleOption(opt.key)} className="shrink-0" />
                </div>
              </SectionCard>
            )
          })}
        </div>
      </div>

      <Button
        onClick={handleSave}
        disabled={saving}
        className="w-full h-11 font-semibold"
      >
        {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
        Salvar configurações
      </Button>
    </div>
  )
}
