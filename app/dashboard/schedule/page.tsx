"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/hooks/use-auth"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, Settings, Wand2, FileDown, Plus, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScheduleConfig } from "@/components/dashboard/schedule-config"
import { ScheduleGenerator } from "@/components/dashboard/schedule-generator"
import { ScheduleCalendar } from "@/components/dashboard/schedule-calendar"
import { exportScheduleToPDF } from "@/lib/utils/schedule-pdf"
import { getSupabaseBrowserClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { format, startOfMonth, endOfMonth } from "date-fns"
import { toast } from "sonner"

const supabase = getSupabaseBrowserClient()

export default function SchedulePage() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === "admin"
  const [activeTab, setActiveTab] = useState("calendar")
  const [currentMonth, setCurrentMonth] = useState(new Date())

  async function handleExport() {
    const start = startOfMonth(currentMonth)
    const end = endOfMonth(currentMonth)

    const { data, error } = await supabase
      .from('schedules')
      .select(`
        *,
        arrangement:schedule_arrangements(*),
        leader:profiles(name),
        territory:territories(number, name)
      `)
      .eq('status', 'published')
      .gte('date', format(start, 'yyyy-MM-dd'))
      .lte('date', format(end, 'yyyy-MM-dd'))
      .order('date', { ascending: true })

    if (error || !data || data.length === 0) {
      toast.error("Nenhuma escala publicada encontrada para este mês")
      return
    }

    try {
      await exportScheduleToPDF(data, currentMonth)
      toast.success("PDF gerado com sucesso!")
    } catch (err) {
      toast.error("Erro ao gerar PDF")
    }
  }

  return (
    <div className="container mx-auto p-4 space-y-6 pb-24 md:pb-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-[1.375rem] font-semibold tracking-tight text-foreground leading-none">Gestão de escala</h1>
          <p className="text-[0.6875rem] text-muted-foreground font-medium mt-1 uppercase tracking-wider">
            Organização de saídas e designações
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-10 px-4 gap-2 font-bold border-2 rounded-xl bg-card hover:bg-muted transition-all shadow-sm" onClick={handleExport}>
            <FileDown className="h-4 w-4" />
            <span className="hidden sm:inline">Exportar PDF</span>
            <span className="sm:hidden text-xs">PDF</span>
          </Button>
        </div>
      </div>

      {/* Navegação por abas (Estilo Pills Premium) */}
      <div className="flex overflow-x-auto pb-4 gap-2 hide-scrollbar no-scrollbar scroll-smooth">
        <button
          onClick={() => setActiveTab("calendar")}
          className={cn(
            "shrink-0 h-10 px-6 rounded-full text-[0.625rem] sm:text-[0.6875rem] font-black uppercase tracking-widest border transition-all shadow-sm flex items-center gap-2",
            activeTab === "calendar"
              ? "bg-foreground text-background border-foreground shadow-md active:scale-95"
              : "bg-card text-muted-foreground border-border hover:bg-muted/50"
          )}
        >
          <Calendar className="h-3.5 w-3.5" />
          <span>Calendário</span>
        </button>

        {isAdmin && (
          <>
            <button
              onClick={() => setActiveTab("config")}
              className={cn(
                "shrink-0 h-10 px-6 rounded-full text-[0.625rem] sm:text-[0.6875rem] font-black uppercase tracking-widest border transition-all shadow-sm flex items-center gap-2",
                activeTab === "config"
                  ? "bg-foreground text-background border-foreground shadow-md active:scale-95"
                  : "bg-card text-muted-foreground border-border hover:bg-muted/50"
              )}
            >
              <Settings className="h-3.5 w-3.5" />
              <span>Configurar</span>
            </button>
            <button
              onClick={() => setActiveTab("generator")}
              className={cn(
                "shrink-0 h-10 px-6 rounded-full text-[0.625rem] sm:text-[0.6875rem] font-black uppercase tracking-widest border transition-all shadow-sm flex items-center gap-2",
                activeTab === "generator"
                  ? "bg-foreground text-background border-foreground shadow-md active:scale-95"
                  : "bg-card text-muted-foreground border-border hover:bg-muted/50"
              )}
            >
              <Wand2 className="h-3.5 w-3.5" />
              <span>Gerar Escala</span>
            </button>
          </>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsContent value="calendar" className="mt-0">
          {activeTab === "calendar" && <ScheduleCalendar currentMonth={currentMonth} setCurrentMonth={setCurrentMonth} />}
        </TabsContent>

        {isAdmin && (
          <>
            <TabsContent value="config">
              <ScheduleConfig />
            </TabsContent>

            <TabsContent value="generator">
              {activeTab === "generator" && <ScheduleGenerator currentMonth={currentMonth} setCurrentMonth={setCurrentMonth} />}
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  )
}
