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
      .gte('date', start.toISOString())
      .lte('date', end.toISOString())
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-foreground">Escala de Dirigentes</h1>
          <p className="text-xs text-muted-foreground font-medium mt-1">
            Gestão e organização das saídas de campo e designações.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2 font-bold border-2" onClick={handleExport}>
            <FileDown className="h-4 w-4" />
            Exportar PDF
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className={isAdmin ? "grid w-full grid-cols-3 mb-8" : "grid w-full grid-cols-1 mb-8"}>
          <TabsTrigger value="calendar" className="gap-2">
            <Calendar className="h-4 w-4" />
            Calendário
          </TabsTrigger>
          {isAdmin && (
            <>
              <TabsTrigger value="config" className="gap-2">
                <Settings className="h-4 w-4" />
                Configurar
              </TabsTrigger>
              <TabsTrigger value="generator" className="gap-2">
                <Wand2 className="h-4 w-4" />
                Gerar Escala
              </TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="calendar">
          <ScheduleCalendar currentMonth={currentMonth} setCurrentMonth={setCurrentMonth} />
        </TabsContent>

        {isAdmin && (
          <>
            <TabsContent value="config">
              <ScheduleConfig />
            </TabsContent>

            <TabsContent value="generator">
              <ScheduleGenerator />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  )
}
