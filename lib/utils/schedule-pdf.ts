import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import { format, parseISO } from "date-fns"
import { ptBR } from "date-fns/locale"

// ─── Constants ────────────────────────────────────────────────────────────────

const BRAND   = [198, 93, 59]   as [number, number, number]  // #C65D3B terracotta
const DARK    = [30,  30,  30]  as [number, number, number]  // quase preto
const MUTED   = [120, 120, 120] as [number, number, number]  // cinza médio
const LIGHT   = [245, 244, 241] as [number, number, number]  // off-white quente
const WHITE   = [255, 255, 255] as [number, number, number]
const BORDER  = [220, 218, 214] as [number, number, number]  // borda sutil

const PAGE_W  = 210  // A4 mm
const PAGE_H  = 297
const MARGIN  = 14
const COL_W   = PAGE_W - MARGIN * 2  // 182 mm

// Weekday names abbreviated (pt-BR)
const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

// ─── Types ────────────────────────────────────────────────────────────────────

interface Schedule {
  id: string
  date: string            // "yyyy-MM-dd"
  status: string
  arrangement?: {
    id: string
    label: string
    start_time: string
    is_group_mode: boolean
    weekday: number
  }
  leader?: { name: string } | null
  territory?: { number: string; name: string } | null
}

interface ArrangementBlock {
  arrangementId: string
  label: string
  startTime: string
  weekday: number
  isGroupMode: boolean
  slots: { date: string; displayDate: string; weekdayShort: string; assignee: string; isPublished: boolean }[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setFont(doc: jsPDF, style: "normal" | "bold" | "italic" = "normal", size = 10) {
  doc.setFont("helvetica", style)
  doc.setFontSize(size)
}

function setColor(doc: jsPDF, color: [number, number, number]) {
  doc.setTextColor(color[0], color[1], color[2])
}

function hRule(doc: jsPDF, y: number, color = BORDER, width = 0.3) {
  doc.setDrawColor(color[0], color[1], color[2])
  doc.setLineWidth(width)
  doc.line(MARGIN, y, PAGE_W - MARGIN, y)
}

// ─── Main export function ────────────────────────────────────────────────────

export async function exportScheduleToPDF(schedules: Schedule[], currentMonth: Date) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })

  // ── 1. Group schedules by arrangement ──────────────────────────────────────

  const arrangementMap = new Map<string, ArrangementBlock>()

  for (const s of schedules) {
    if (!s.arrangement) continue
    const arrId = s.arrangement.id

    if (!arrangementMap.has(arrId)) {
      arrangementMap.set(arrId, {
        arrangementId: arrId,
        label: s.arrangement.label,
        startTime: s.arrangement.start_time?.substring(0, 5) ?? "",
        weekday: s.arrangement.weekday,
        isGroupMode: s.arrangement.is_group_mode,
        slots: [],
      })
    }

    const block = arrangementMap.get(arrId)!
    const parsedDate = parseISO(s.date)
    const weekdayIdx = parsedDate.getDay()

    // Assignee label
    let assignee = "—"
    if (s.arrangement.is_group_mode && s.territory) {
      assignee = `T${s.territory.number} · ${s.territory.name}`
    } else if (!s.arrangement.is_group_mode && s.leader?.name) {
      assignee = s.leader.name
    }

    block.slots.push({
      date: s.date,
      displayDate: format(parsedDate, "dd/MM", { locale: ptBR }),
      weekdayShort: WEEKDAY_SHORT[weekdayIdx] ?? "",
      assignee,
      isPublished: s.status === "published",
    })
  }

  // Sort slots within each arrangement by date
  for (const block of arrangementMap.values()) {
    block.slots.sort((a, b) => a.date.localeCompare(b.date))
  }

  // Sort arrangements: by weekday, then start_time
  const arrangements = Array.from(arrangementMap.values()).sort((a, b) => {
    if (a.weekday !== b.weekday) return a.weekday - b.weekday
    return a.startTime.localeCompare(b.startTime)
  })

  // ── 2. Page header (first page) ─────────────────────────────────────────────

  let curY = drawPageHeader(doc, currentMonth)

  // ── 3. Arrangement blocks ───────────────────────────────────────────────────

  for (let i = 0; i < arrangements.length; i++) {
    const block = arrangements[i]
    const needed = estimateBlockHeight(block)

    // Page break if not enough room
    if (curY + needed > PAGE_H - 20 && i > 0) {
      doc.addPage()
      curY = drawContinuationHeader(doc, currentMonth)
    }

    curY = drawArrangementBlock(doc, block, curY)
    curY += 6 // gap between blocks
  }

  // ── 4. Footer on every page ─────────────────────────────────────────────────

  const totalPages = (doc as any).internal.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    drawFooter(doc, p, totalPages)
  }

  // ── 5. Save ─────────────────────────────────────────────────────────────────

  doc.save(`escala-${format(currentMonth, "yyyy-MM")}.pdf`)
}

// ─── Section renderers ────────────────────────────────────────────────────────

function drawPageHeader(doc: jsPDF, month: Date): number {
  let y = MARGIN

  // Thin brand bar at very top
  doc.setFillColor(BRAND[0], BRAND[1], BRAND[2])
  doc.rect(0, 0, PAGE_W, 4, "F")

  y = 12

  // Generic Title
  setFont(doc, "bold", 18)
  setColor(doc, BRAND)
  doc.text("ESCALA DE SERVIÇO", MARGIN, y)

  // Month label
  const monthLabel = format(month, "MMMM 'de' yyyy", { locale: ptBR })
  const monthCapitalized = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)
  setFont(doc, "bold", 13)
  setColor(doc, DARK)
  doc.text(monthCapitalized, PAGE_W - MARGIN, y, { align: "right" })

  y += 6
  hRule(doc, y, BRAND, 0.6)
  y += 5

  // Legend removed as requested

  return y
}

function drawContinuationHeader(doc: jsPDF, month: Date): number {
  doc.setFillColor(BRAND[0], BRAND[1], BRAND[2])
  doc.rect(0, 0, PAGE_W, 4, "F")

  let y = 10
  setFont(doc, "bold", 9)
  setColor(doc, BRAND)
  doc.text("ESCALA DE SERVIÇO", MARGIN, y)

  const monthLabel = format(month, "MMMM yyyy", { locale: ptBR })
  setFont(doc, "normal", 8)
  setColor(doc, MUTED)
  doc.text(monthLabel, PAGE_W - MARGIN, y, { align: "right" })

  y += 3
  hRule(doc, y, BORDER)
  return y + 5
}

function estimateBlockHeight(block: ArrangementBlock): number {
  return 12 + block.slots.length * 7.5
}

function drawArrangementBlock(doc: jsPDF, block: ArrangementBlock, startY: number): number {
  let y = startY

  // Background pill for the header row
  doc.setFillColor(LIGHT[0], LIGHT[1], LIGHT[2])
  doc.roundedRect(MARGIN, y, COL_W, 9, 2, 2, "F")

  // Accent line on the left
  doc.setFillColor(BRAND[0], BRAND[1], BRAND[2])
  doc.rect(MARGIN, y, 2.5, 9, "F")

  // Title: Only full weekday name (e.g. "QUARTA-FEIRA")
  const fullWeekday = format(parseISO(block.slots[0]?.date || "2000-01-01"), "EEEE", { locale: ptBR }).toUpperCase()
  setFont(doc, "bold", 9)
  setColor(doc, DARK)
  doc.text(fullWeekday, MARGIN + 5, y + 5.8)

  // Time highlight (Pill format)
  const timeStr = block.startTime + "h"
  setFont(doc, "bold", 9)
  const tw = doc.getTextWidth(timeStr)
  const th = 6
  const tx = PAGE_W - MARGIN - tw - 8 // Margin from right edge
  
  doc.setFillColor(240, 240, 240) // soft gray background
  doc.roundedRect(tx - 2, y + 1.5, tw + 4, th, 1, 1, "F")
  
  setColor(doc, DARK)
  doc.text(timeStr, tx, y + 5.6)

  y += 10

  const rows = block.slots.map((slot) => {
    return [
      { content: slot.displayDate, styles: { fontStyle: "bold", textColor: DARK, halign: "center" } } as any,
      { content: slot.weekdayShort, styles: { textColor: MUTED, halign: "center" } } as any,
      { content: slot.assignee, styles: { fontStyle: slot.isPublished ? "bold" : "normal", textColor: DARK } } as any,
    ]
  })

  autoTable(doc, {
    startY: y,
    body: rows,
    theme: "plain",
    styles: {
      fontSize: 9,
      cellPadding: { top: 2.2, bottom: 2.2, left: 3, right: 3 },
      lineWidth: 0,
      font: "helvetica",
      overflow: "ellipsize",
    },
    columnStyles: {
      0: { cellWidth: 18, halign: "center" },
      1: { cellWidth: 12, halign: "center" },
      2: { cellWidth: COL_W - 18 - 12 },
    },
    willDrawCell(data) {
      if (data.section === "body") {
        const isEven = data.row.index % 2 === 0
        doc.setFillColor(isEven ? 249 : 255, isEven ? 248 : 255, isEven ? 246 : 255)
        doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, "F")
      }
    },
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: COL_W,
  })

  const finalY = (doc as any).lastAutoTable.finalY as number
  hRule(doc, finalY + 0.5, BORDER, 0.2)

  return finalY + 1
}

function drawFooter(doc: jsPDF, page: number, total: number) {
  const y = PAGE_H - 7
  setFont(doc, "normal", 6.5)
  setColor(doc, MUTED)
  doc.text(
    `Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}`,
    MARGIN,
    y
  )
  doc.text(
    `${page} / ${total}`,
    PAGE_W - MARGIN,
    y,
    { align: "right" }
  )
}
