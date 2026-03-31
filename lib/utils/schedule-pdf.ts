import jsPDF from "jspdf"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"

export async function exportScheduleToPDF(schedules: any[], currentMonth: Date) {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.width
  const pageHeight = doc.internal.pageSize.height
  const margin = 15
  const gap = 8
  const colWidth = (pageWidth - 2 * margin - gap) / 2

  // Colors
  const tealColor = [7, 69, 82] as [number, number, number]
  const cardBgColor = [217, 230, 235] as [number, number, number]
  const listBgColor = [232, 241, 245] as [number, number, number]
  const blackColor = [0, 0, 0] as [number, number, number]

  // Group schedules by arrangement
  const groups: Record<string, any[]> = {}
  schedules.forEach(item => {
    const key = `${item.arrangement.id}`
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
  })

  // Weekday priority order (Terça, Quarta, Quinta, Sexta, Sábado, Domingo, Segunda)
  const weekdaysOrder = ["terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo", "segunda-feira"]

  // Sort groups by typical weekday and then by time
  const sortedRowsArr = Object.values(groups).sort((a, b) => {
    const dateA = parseISO(a[0].date)
    const dateB = parseISO(b[0].date)
    const dayA = format(dateA, "EEEE", { locale: ptBR }).toLowerCase()
    const dayB = format(dateB, "EEEE", { locale: ptBR }).toLowerCase()
    
    const scoreA = weekdaysOrder.indexOf(dayA)
    const scoreB = weekdaysOrder.indexOf(dayB)
    
    if (scoreA !== scoreB) return scoreA - scoreB
    
    // If same day, sort by time
    const timeA = a[0].arrangement.start_time || ""
    const timeB = b[0].arrangement.start_time || ""
    return timeA.localeCompare(timeB)
  })

  // Chunk into rows of 2 for the grid
  const finalCardRows: any[][] = []
  for (let i = 0; i < sortedRowsArr.length; i += 2) {
    finalCardRows.push(sortedRowsArr.slice(i, i + 2))
  }

  let currentY = 40

  function drawHeader() {
    // Branding and Header Typography
    doc.setFont("helvetica", "bold")
    doc.setTextColor(tealColor[0], tealColor[1], tealColor[2])
    
    doc.setFontSize(24)
    doc.text("PARQUE", margin, 20)
    doc.setFontSize(20)
    doc.setFont("helvetica", "normal")
    doc.text("DOS ANJOS", margin, 28)
    
    // The Line (HR) - Sits exactly under the branding and connects to the box
    const hrY = 30
    doc.setDrawColor(tealColor[0], tealColor[1], tealColor[2])
    doc.setLineWidth(0.5)
    doc.line(margin, hrY, pageWidth - margin, hrY)

    // Right Badge Box
    const badgeWidth = 75
    const badgeHeight = 11
    const badgeX = pageWidth - margin - badgeWidth
    const badgeY = hrY - badgeHeight // Box sits on the line
    
    doc.setFillColor(tealColor[0], tealColor[1], tealColor[2])
    doc.rect(badgeX, badgeY, badgeWidth, badgeHeight, "F")
    
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(14)
    doc.setFont("helvetica", "bold")
    doc.text("SERVIÇO DE CAMPO", badgeX + badgeWidth / 2, badgeY + 7.5, { align: "center" })
    
    doc.setTextColor(blackColor[0], blackColor[1], blackColor[2])
  }

  drawHeader()

  finalCardRows.forEach((row) => {
    // 1. Calculate the maximum height for cards in this row to ensure perfect alignment
    const calculateRowMaxHeight = (items: any[]) => {
      const headerH = 10
      const metaH = 20
      const listHeaderH = 11
      const itemH = items.length * 6
      const footerH = 8
      return headerH + metaH + listHeaderH + itemH + footerH
    }

    const rowMaxHeight = Math.max(...row.map(calculateRowMaxHeight))

    // Handle Page Wrap
    if (currentY + rowMaxHeight > pageHeight - 20) {
      doc.addPage()
      drawHeader()
      currentY = 40
    }

    // 2. Draw each card in the row
    row.forEach((items, colIdx) => {
      const arrangement = items[0].arrangement
      const x = margin + (colIdx * (colWidth + gap))
      const dateParse = parseISO(items[0].date)
      const dayTitle = format(dateParse, "EEEE", { locale: ptBR }).toUpperCase()

      // Card Main Background
      doc.setFillColor(cardBgColor[0], cardBgColor[1], cardBgColor[2])
      doc.rect(x, currentY, colWidth, rowMaxHeight, "F")

      // Card Weekday Header
      doc.setFillColor(tealColor[0], tealColor[1], tealColor[2])
      doc.rect(x, currentY, colWidth, 7, "F")
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(10)
      doc.setFont("helvetica", "bold")
      doc.text(dayTitle, x + colWidth / 2, currentY + 5, { align: "center" })

      // Time and Local meta information
      doc.setTextColor(0, 0, 0)
      doc.setFontSize(18)
      doc.setFont("helvetica", "bold")
      doc.text(`${arrangement.start_time.substring(0, 5)}h`, x + 8, currentY + 18)
      
      doc.setFontSize(9)
      doc.setFont("helvetica", "bold")
      doc.text("Local:", x + 8, currentY + 25)
      doc.setFont("helvetica", "normal")
      const localStr = arrangement.location || "Salão do Reino"
      doc.text(localStr, x + 19, currentY + 25)

      // Dirichlet List Inner Container
      const listX = x + 5
      const listY = currentY + 30
      const listW = colWidth - 10
      const listH = rowMaxHeight - 35
      
      doc.setFillColor(listBgColor[0], listBgColor[1], listBgColor[2])
      doc.rect(listX, listY, listW, listH, "F")

      // List Heading
      doc.setTextColor(0, 0, 0)
      doc.setFontSize(10)
      doc.setFont("helvetica", "bold")
      doc.text("Dirigentes:", listX + 8, listY + 10)

      // Dirichlet names and dates
      doc.setFontSize(9.5)
      items.forEach((item, innerIdx) => {
        const itemY = listY + 18 + (innerIdx * 6)
        const d = format(parseISO(item.date), "dd/MM")
        // Use normal casing (stored in DB) for names
        const leaderName = item.arrangement.is_group_mode 
          ? "MODO GRUPO" 
          : (item.leader?.name || "Pendente")

        doc.setFont("helvetica", "bold")
        doc.text(d, listX + 28, itemY, { align: "right" })
        
        doc.setFont("helvetica", "normal")
        doc.text(leaderName, listX + 35, itemY)
      })
    })

    currentY += rowMaxHeight + gap
  })

  // Pagination Footer
  const pageTotal = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= pageTotal; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(`Página ${i} de ${pageTotal}`, pageWidth / 2, pageHeight - 10, { align: "center" })
  }

  doc.save(`escala-servico-campo-${format(currentMonth, "yyyy-MM")}.pdf`)
}
