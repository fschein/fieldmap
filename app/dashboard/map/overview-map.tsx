"use client"

import { useEffect, useRef, useState } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { GroupInfo, SubdivisionFlat } from "./page"
import { cn } from "@/lib/utils"

interface Props {
  groups: GroupInfo[]
  subdivisions: SubdivisionFlat[]
}

type ViewMode = "group" | "progress" | "history"

const PROGRESS_COLORS = {
  completed:   { fill: "#22c55e", stroke: "#16a34a" },
  inField:     { fill: "#3b82f6", stroke: "#2563eb" },
  paused:      { fill: "#f59e0b", stroke: "#d97706" },
  notStarted:  { fill: "#9ca3af", stroke: "#6b7280" },
}

function subdivisionProgressColor(s: SubdivisionFlat) {
  if (s.completed) return PROGRESS_COLORS.completed
  if (s.notes)     return PROGRESS_COLORS.paused
  if (s.assigneeName) return PROGRESS_COLORS.inField
  return PROGRESS_COLORS.notStarted
}

// Gradiente frio→quente: cinza → azul → verde → amarelo → vermelho
const HEAT_STOPS = [
  { t: 0.00, r: 229, g: 231, b: 235 }, // gray-200  (nunca)
  { t: 0.25, r: 147, g: 197, b: 253 }, // blue-300
  { t: 0.50, r: 74,  g: 222, b: 128 }, // green-400
  { t: 0.75, r: 251, g: 191, b: 36  }, // amber-400
  { t: 1.00, r: 239, g: 68,  b: 68  }, // red-500
]

function heatColor(count: number, maxCount: number): string {
  if (maxCount === 0) return "#e5e7eb"
  const t = Math.min(count / maxCount, 1)
  let lo = HEAT_STOPS[0], hi = HEAT_STOPS[1]
  for (let i = 1; i < HEAT_STOPS.length; i++) {
    if (t <= HEAT_STOPS[i].t) { lo = HEAT_STOPS[i - 1]; hi = HEAT_STOPS[i]; break }
  }
  const range = hi.t - lo.t
  const f = range === 0 ? 0 : (t - lo.t) / range
  const r = Math.round(lo.r + (hi.r - lo.r) * f)
  const g = Math.round(lo.g + (hi.g - lo.g) * f)
  const b = Math.round(lo.b + (hi.b - lo.b) * f)
  return `rgb(${r},${g},${b})`
}

export default function OverviewMap({ groups, subdivisions }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layersRef = useRef<L.FeatureGroup | null>(null)

  const [activeGroups, setActiveGroups] = useState<Set<string | null>>(
    new Set([...groups.map(g => g.id), null])
  )
  const [viewMode, setViewMode] = useState<ViewMode>("group")
  const [filterOpen, setFilterOpen] = useState(false)
  const [popup, setPopup] = useState<SubdivisionFlat | null>(null)

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: [-30.0, -51.2],
      zoom: 13,
      zoomControl: false,
    })

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 20,
    }).addTo(map)

    L.control.zoom({ position: "bottomright" }).addTo(map)
    map.attributionControl.setPrefix("")

    mapRef.current = map
    layersRef.current = L.featureGroup().addTo(map)

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Re-render polygons on filter or view mode change
  useEffect(() => {
    const map = mapRef.current
    const layers = layersRef.current
    if (!map || !layers) return

    layers.clearLayers()

    const visible = subdivisions.filter(s => activeGroups.has(s.groupId))
    const maxCount = Math.max(...subdivisions.map(s => s.historyCount), 1)
    let hasAny = false

    visible.forEach(s => {
      if (!s.coordinates?.length) return

      let fillColor: string
      let strokeColor: string
      let fillOpacity: number

      if (viewMode === "group") {
        fillColor = s.groupColor
        strokeColor = s.groupColor
        fillOpacity = s.completed ? 0.75 : 0.4
      } else if (viewMode === "progress") {
        const c = subdivisionProgressColor(s)
        fillColor = c.fill
        strokeColor = c.stroke
        fillOpacity = 0.55
      } else {
        fillColor = heatColor(s.historyCount, maxCount)
        strokeColor = fillColor
        fillOpacity = 0.8
      }

      const latLngs = s.coordinates.map(ring =>
        ring.map(([lat, lng]) => [lat, lng] as [number, number])
      )

      const poly = L.polygon(latLngs, {
        color: strokeColor,
        weight: 1.5,
        fillColor,
        fillOpacity,
      })

      poly.on("click", () => setPopup(s))
      poly.addTo(layers)
      hasAny = true
    })

    if (hasAny) {
      try { map.fitBounds(layers.getBounds(), { padding: [40, 40], maxZoom: 16 }) } catch {}
    }
  }, [subdivisions, activeGroups, viewMode])

  const toggleGroup = (id: string | null) => {
    setActiveGroups(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allOn = activeGroups.size === groups.length + 1
  const toggleAll = () => {
    if (allOn) setActiveGroups(new Set())
    else setActiveGroups(new Set([...groups.map(g => g.id), null]))
  }

  const visibleSubs = subdivisions.filter(s => activeGroups.has(s.groupId))
  const completedCount = visibleSubs.filter(s => s.completed).length
  const totalCount = visibleSubs.length

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {/* Top bar — única linha, sem sobreposição */}
      <div className="absolute top-3 left-3 right-3 z-[1000] flex items-center gap-2">

        {/* Filter toggle */}
        <button
          onClick={() => setFilterOpen(v => !v)}
          className="flex items-center gap-1.5 rounded-xl bg-card border border-border shadow-md px-3 py-2 text-xs font-semibold text-foreground shrink-0"
        >
          Filtro
          <span className="bg-primary/10 text-primary font-bold px-1.5 py-0.5 rounded-full text-[0.6rem]">
            {activeGroups.size}/{groups.length + 1}
          </span>
        </button>

        {/* View mode toggle */}
        <div className="flex rounded-xl border border-border bg-card shadow-md overflow-hidden text-xs font-semibold shrink-0">
          {(["group", "progress", "history"] as ViewMode[]).map((mode, i) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                "px-3 py-2 transition-colors",
                i > 0 && "border-l border-border",
                viewMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              {mode === "group" ? "Grupo" : mode === "progress" ? "Andamento" : "Heatmap"}
            </button>
          ))}
        </div>

        {/* Progress chip — ocupa o espaço restante, alinhado à direita */}
        <div className="ml-auto flex items-center gap-1.5 rounded-xl bg-card border border-border shadow-md px-2.5 py-2 text-xs font-medium text-foreground shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          <span className="tabular-nums">{completedCount}/{totalCount}</span>
        </div>
      </div>

      {/* Filter panel */}
      {filterOpen && (
        <div className="absolute top-14 left-3 z-[1000] w-52 rounded-xl bg-card border border-border shadow-lg overflow-hidden" style={{ maxHeight: "calc(100dvh - 5rem)", overflowY: "auto" }}>
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Grupos</span>
            <button onClick={toggleAll} className="text-[0.625rem] text-primary font-semibold">
              {allOn ? "Ocultar todos" : "Mostrar todos"}
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto divide-y divide-border/50">
            {groups.map(g => (
              <button
                key={g.id}
                onClick={() => toggleGroup(g.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
                  activeGroups.has(g.id) ? "bg-card" : "bg-muted/40 opacity-50"
                )}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                <span className="truncate">{g.name}</span>
                {activeGroups.has(g.id) && <span className="ml-auto text-primary text-xs">✓</span>}
              </button>
            ))}
            <button
              onClick={() => toggleGroup(null)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
                activeGroups.has(null) ? "bg-card" : "bg-muted/40 opacity-50"
              )}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-muted-foreground/40 border border-border" />
              <span className="truncate text-muted-foreground">Sem grupo</span>
              {activeGroups.has(null) && <span className="ml-auto text-primary text-xs">✓</span>}
            </button>
          </div>

          {/* Legend — muda conforme o modo */}
          <div className="px-3 py-2 border-t border-border space-y-1.5">
            <p className="text-[0.625rem] font-bold uppercase tracking-wide text-muted-foreground mb-1">Legenda</p>
            {viewMode === "group" && groups.map(g => (
              <div key={g.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: g.color }} />
                {g.name}
              </div>
            ))}
            {viewMode === "progress" && (
              <>
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="w-3 h-3 rounded-sm shrink-0 bg-emerald-500" /> Concluída</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="w-3 h-3 rounded-sm shrink-0 bg-blue-500" /> Em campo</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="w-3 h-3 rounded-sm shrink-0 bg-amber-500" /> Com observação</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="w-3 h-3 rounded-sm shrink-0 bg-gray-400" /> Não iniciada</div>
              </>
            )}
            {viewMode === "history" && (
              <>
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="w-3 h-3 rounded-sm shrink-0 bg-gray-200" /> Nunca/raramente</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="w-3 h-3 rounded-sm shrink-0 bg-blue-300" /> Poucas vezes</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="w-3 h-3 rounded-sm shrink-0 bg-green-400" /> Moderado</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="w-3 h-3 rounded-sm shrink-0 bg-amber-400" /> Frequente</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="w-3 h-3 rounded-sm shrink-0 bg-red-500" /> Muito frequente</div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Popup */}
      {popup && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] w-72 rounded-2xl bg-card border border-border shadow-xl p-4">
          <button
            onClick={() => setPopup(null)}
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground text-lg leading-none"
          >×</button>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-5 rounded-full shrink-0" style={{ backgroundColor: popup.groupColor }} />
            <div className="min-w-0">
              <p className="font-semibold text-sm text-foreground truncate">
                {popup.territoryNumber} · {popup.territoryName}
              </p>
              <p className="text-[0.625rem] text-muted-foreground">{popup.groupName}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            Quadra: <span className="font-medium text-foreground">{popup.name}</span>
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              "text-[0.625rem] font-bold px-2 py-0.5 rounded-full",
              popup.completed
                ? "bg-emerald-500/10 text-emerald-600"
                : popup.notes
                  ? "bg-amber-500/10 text-amber-600"
                  : popup.assigneeName
                    ? "bg-blue-500/10 text-blue-600"
                    : "bg-muted text-muted-foreground"
            )}>
              {popup.completed ? "Concluída" : popup.notes ? "Com observação" : popup.assigneeName ? "Em campo" : "Não iniciada"}
            </span>
            {popup.assigneeName && (
              <span className="text-[0.625rem] text-muted-foreground truncate">→ {popup.assigneeName}</span>
            )}
          </div>
          {popup.historyCount > 0 && (
            <p className="mt-1.5 text-[0.625rem] text-muted-foreground">
              Trabalhado <span className="font-semibold text-foreground">{popup.historyCount}×</span> no histórico
            </p>
          )}
          {popup.notes && (
            <p className="mt-2 text-[0.6875rem] text-amber-600 bg-amber-500/10 rounded-lg px-2.5 py-1.5 italic">
              "{popup.notes}"
            </p>
          )}
        </div>
      )}

      <style>{`
        .leaflet-container { background: var(--muted) !important; }
      `}</style>
    </div>
  )
}
