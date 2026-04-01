import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  getDay, 
  startOfWeek, 
  endOfWeek,
  isSameMonth,
  parseISO
} from "date-fns"
import { ptBR } from "date-fns/locale"

export async function exportScheduleToPDF(schedules: any[], currentMonth: Date) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  })

  const pageWidth = doc.internal.pageSize.width
  const pageHeight = doc.internal.pageSize.height
  const margin = 10

  // Colors based on branding
  const primaryColor = [198, 93, 59] as [number, number, number] // Terracotta #C65D3B
  const headerGray = [240, 240, 240] as [number, number, number]
  const textGray = [80, 80, 80] as [number, number, number]
  
  // 1. Header & Branding (Premium Style)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
  doc.setFontSize(24)
  doc.text("FieldMap", margin, 15)
  
  doc.setFontSize(10)
  doc.setTextColor(120, 120, 120)
  doc.text("CONGREGAÇÃO PARQUE DOS ANJOS", margin, 20)

  doc.setFontSize(14)
  doc.setTextColor(textGray[0], textGray[1], textGray[2])
  const monthYearLabel = format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR }).toUpperCase()
  doc.text(monthYearLabel, margin, 28)

  // 2. Prepare Calendar Data
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 }) // Sunday
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd })
  
  // Group schedules by date string (YYYY-MM-DD)
  const schedulesByDate: Record<string, any[]> = {}
  schedules.forEach(s => {
    const dateStr = s.date.split('T')[0]
    if (!schedulesByDate[dateStr]) schedulesByDate[dateStr] = []
    schedulesByDate[dateStr].push(s)
  })

  // Create table rows (weeks)
  const rows: any[][] = []
  let currentRow: any[] = []

  days.forEach((day, index) => {
    const dateStr = format(day, 'yyyy-MM-dd')
    const isCurrentMonth = isSameMonth(day, currentMonth)
    
    let content = ""
    if (isCurrentMonth) {
      content = `${format(day, 'd')}\n`
      const daySchedules = (schedulesByDate[dateStr] || []).sort((a,b) => {
        return (a.arrangement?.start_time || "").localeCompare(b.arrangement?.start_time || "")
      })
      
      daySchedules.forEach(s => {
        const time = s.arrangement?.start_time?.substring(0, 5) || ""
        const label = s.arrangement?.label || ""
        const leader = s.arrangement?.is_group_mode ? "Grupo" : (s.leader?.name?.split(' ')[0] || "---")
        content += `\n${time} - ${label}\n(${leader})`
      })
    }

    currentRow.push({
      content,
      styles: {
        fillColor: isCurrentMonth ? [255, 255, 255] : [250, 250, 250],
        textColor: isCurrentMonth ? [0, 0, 0] : [200, 200, 200],
        fontSize: 7,
        halign: 'left',
        valign: 'top',
        minCellHeight: 32, // More vertical space
        lineWidth: 0.1,
        lineColor: [220, 220, 220]
      }
    })

    if ((index + 1) % 7 === 0) {
      rows.push(currentRow)
      currentRow = []
    }
  })

  // 3. Render Table
  autoTable(doc, {
    startY: 32,
    head: [['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']],
    body: rows,
    theme: 'grid',
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'center'
    },
    styles: {
      overflow: 'linebreak',
      cellPadding: 1.5,
      font: 'helvetica'
    },
    margin: { left: margin, right: margin },
    tableWidth: pageWidth - (margin * 2),
  })

  // 4. Footer
  const pageTotal = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= pageTotal; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(180, 180, 180)
    doc.text(
      `FieldMap • Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 
      pageWidth / 2, 
      pageHeight - 8, 
      { align: "center" }
    )
  }

  doc.save(`escala-${format(currentMonth, "yyyy-MM")}.pdf`)
}
