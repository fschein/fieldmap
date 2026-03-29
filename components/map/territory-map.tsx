"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import "leaflet-draw/dist/leaflet.draw.css"
import "leaflet-draw"
import type { Subdivision, Territory } from "@/lib/types"

// ------------------------------------------------------------------
// FIX: Webpack/Next.js quebra os caminhos de imagem do Leaflet.
// ------------------------------------------------------------------
if (typeof window !== "undefined") {
  delete (L.Icon.Default.prototype as any)._getIconUrl
  L.Icon.Default.mergeOptions({
    iconUrl: "/images/marker-icon.png",
    iconRetinaUrl: "/images/marker-icon-2x.png",
    shadowUrl: "/images/marker-shadow.png",
  })
  L.Icon.Default.imagePath = "/images/"
}

interface TerritoryMapProps {
  territory: Territory
  subdivisions: Subdivision[]
  center?: [number, number]
  zoom?: number
  editable?: boolean
  focusedSubdivisionId?: string | null
  onSubdivisionCreate?: (coordinates: [number, number][][]) => void
  onSubdivisionUpdate?: (subdivisionId: string, coordinates: [number, number][][]) => void
  onSubdivisionDelete?: (subdivisionId: string) => void
  onSubdivisionSelect?: (subdivision: Subdivision) => void
  onDnvClick?: (dnv: any) => void
  onMapClick?: (latlng: [number, number]) => void
}

const STATUS_COLORS: Record<string, string> = {
  available: "#22c55e",
  assigned: "#3b82f6",
  completed: "#6b7280",
}

const DEFAULT_CENTER: [number, number] = [-29.9447, -50.9919]
const DEFAULT_ZOOM = 15

export function TerritoryMap({
  territory,
  subdivisions,
  center,
  zoom,
  editable = false,
  focusedSubdivisionId,
  onSubdivisionCreate,
  onSubdivisionUpdate,
  onSubdivisionDelete,
  onSubdivisionSelect,
  onMapClick,
}: TerritoryMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null)
  const subdivisionLayersRef = useRef<Map<string, L.Layer>>(new Map())
  const hasInitialFitRef = useRef(false)
  const isEditingRef = useRef(false)   // true enquanto Leaflet Draw edita/remove

  const [selectedSubdivisionId, setSelectedSubdivisionId] = useState<string | null>(null)

  // Ref para callbacks — evita stale closures nos listeners do Leaflet
  const cbRef = useRef({ onSubdivisionCreate, onSubdivisionUpdate, onSubdivisionDelete, onMapClick, territoryColor: territory.color })
  useEffect(() => {
    cbRef.current = { onSubdivisionCreate, onSubdivisionUpdate, onSubdivisionDelete, onMapClick, territoryColor: territory.color }
  }, [onSubdivisionCreate, onSubdivisionUpdate, onSubdivisionDelete, onMapClick, territory.color])

  // ------------------------------------------------------------------
  // 1. INICIALIZAÇÃO DO MAPA — roda uma única vez
  // ------------------------------------------------------------------
  const initializeMap = useCallback(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    const map = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: true,
      dragging: true,
      touchZoom: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
    }).setView(center || DEFAULT_CENTER, zoom || DEFAULT_ZOOM)

    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>')
    mapInstanceRef.current = map

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)

    const drawnItems = new L.FeatureGroup()
    map.addLayer(drawnItems)
    drawnItemsRef.current = drawnItems

    // Rastreia modo de edição para proteger clearLayers()
    map.on("draw:editstart", () => { isEditingRef.current = true })
    map.on("draw:deletestart", () => { isEditingRef.current = true })
    map.on("draw:editstop", () => { isEditingRef.current = false })
    map.on("draw:deletestop", () => { isEditingRef.current = false })

    map.on("click", (e) => {
      cbRef.current.onMapClick?.([e.latlng.lat, e.latlng.lng])
    })

    if (editable) {
      const drawControl = new L.Control.Draw({
        position: "topright",
        draw: {
          polygon: {
            allowIntersection: false,
            drawError: { color: "#e1e4e8", message: "<strong>Erro:</strong> Polígonos não podem se cruzar!" },
            shapeOptions: { color: cbRef.current.territoryColor, fillColor: cbRef.current.territoryColor, fillOpacity: 0.3 },
          },
          rectangle: {
            shapeOptions: { color: cbRef.current.territoryColor, fillColor: cbRef.current.territoryColor, fillOpacity: 0.3 },
          },
          polyline: false, circle: false, circlemarker: false, marker: false,
        },
        edit: { featureGroup: drawnItems, remove: true },
      })
      map.addControl(drawControl)

      map.on(L.Draw.Event.CREATED, (e) => {
        const layer = e.layer as L.Polygon
        const latlngs = layer.getLatLngs()
        if (!latlngs?.length) return
        const raw = Array.isArray(latlngs[0]) ? (latlngs[0] as L.LatLng[]) : (latlngs as L.LatLng[])
        cbRef.current.onSubdivisionCreate?.([raw.map(ll => [ll.lat, ll.lng])])
      })

      map.on(L.Draw.Event.DELETED, (e) => {
        ; (e as L.DrawEvents.Deleted).layers.eachLayer((layer) => {
          const id = (layer as any).subdivisionId
          if (id) {
            cbRef.current.onSubdivisionDelete?.(id)
            subdivisionLayersRef.current.delete(id)
          }
        })
      })

      map.on(L.Draw.Event.EDITED, (e) => {
        ; (e as L.DrawEvents.Edited).layers.eachLayer((layer) => {
          const polygon = layer as L.Polygon & { subdivisionId?: string }
          if (!polygon.subdivisionId) return
          const latlngs = polygon.getLatLngs()
          const raw = Array.isArray(latlngs[0]) ? (latlngs[0] as L.LatLng[]) : (latlngs as L.LatLng[])
          cbRef.current.onSubdivisionUpdate?.(polygon.subdivisionId, [raw.map(ll => [ll.lat, ll.lng])])
        })
      })
    }

    setTimeout(() => { map.invalidateSize() }, 100)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    initializeMap()
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [initializeMap])

  useEffect(() => {
    hasInitialFitRef.current = false
  }, [territory.id])

  // ------------------------------------------------------------------
  // 2. RENDERIZAÇÃO DAS SUBDIVISÕES — nunca roda durante edição
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!mapInstanceRef.current || !drawnItemsRef.current) return

    // CRÍTICO: se o Leaflet Draw estiver em modo de edição,
    // não destruir os layers — isso corrompe os handles de vértice.
    if (isEditingRef.current) return

    const map = mapInstanceRef.current
    const drawnItems = drawnItemsRef.current

    drawnItems.clearLayers()
    subdivisionLayersRef.current.clear()

    subdivisions.forEach((subdivision) => {
      if (!subdivision.coordinates?.length) return

      const coords = subdivision.coordinates[0].map(c => [c[0], c[1]] as L.LatLngExpression)
      const isSelected = selectedSubdivisionId === subdivision.id
      const color = STATUS_COLORS[subdivision.status] ?? territory.color

      const polygon = L.polygon(coords, {
        color: isSelected ? "#1e293b" : color,
        fillColor: color,
        fillOpacity: isSelected ? 0.45 : 0.3,
        weight: isSelected ? 3 : 2,
      }) as L.Polygon & { subdivisionId?: string }

      polygon.subdivisionId = subdivision.id
      polygon.on("click", (e) => {
        L.DomEvent.stopPropagation(e)
        setSelectedSubdivisionId(subdivision.id)
        onSubdivisionSelect?.(subdivision)
      })

      drawnItems.addLayer(polygon)
      subdivisionLayersRef.current.set(subdivision.id, polygon)

      // Label no centro
      const labelCenter = polygon.getBounds().getCenter()
      const anchor = L.circleMarker(labelCenter, { radius: 0, opacity: 0, fillOpacity: 0, interactive: true })
      anchor.bindTooltip(subdivision.name, {
        permanent: true, direction: "center",
        className: "subdivision-tooltip-pill", interactive: true,
      })
      anchor.on("click", (e) => {
        L.DomEvent.stopPropagation(e)
        setSelectedSubdivisionId(subdivision.id)
        onSubdivisionSelect?.(subdivision)
      })
      drawnItems.addLayer(anchor)
    })

      // Marcadores Não Visitar
      ; ((territory as any).do_not_visits ?? []).forEach((dnv: any) => {
        if (!dnv.latitude || !dnv.longitude) return
        const isExpired = Date.now() - new Date(dnv.created_at).getTime() > 365 * 864e5
        L.circleMarker([dnv.latitude, dnv.longitude], {
          color: "#dc2626", fillColor: "#ef4444", fillOpacity: 1, radius: 8, weight: 2,
        })
          .bindTooltip(
            `<div class="dnv-tip-title">🛑 Não Visitar${isExpired ? " (Expirado)" : ""}</div>${dnv.address ? `<div class="dnv-tip-addr">${dnv.address}</div>` : ""}`,
            { className: "dnv-tooltip", direction: "top", offset: [0, -10] }
          )
          .addTo(drawnItems)
      })

    map.invalidateSize()

    // Fit inicial — uma única vez por território
    if (!hasInitialFitRef.current && !focusedSubdivisionId) {
      const withCoords = subdivisions.filter(s => s.coordinates?.length)
      if (withCoords.length > 0) {
        const bounds = drawnItems.getBounds()
        if (bounds.isValid()) {
          map.stop()
          map.fitBounds(bounds, { animate: false, padding: [20, 20], maxZoom: 17 })
          hasInitialFitRef.current = true
        }
      } else {
        if (center) {
          map.setView(center, zoom || DEFAULT_ZOOM, { animate: false })
        } else if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (!hasInitialFitRef.current)
                map.setView([pos.coords.latitude, pos.coords.longitude], 15, { animate: false })
            },
            () => map.setView(DEFAULT_CENTER, 13, { animate: false })
          )
        }
        hasInitialFitRef.current = true
      }
    }
  }, [subdivisions, territory, selectedSubdivisionId, onSubdivisionSelect])

  // ------------------------------------------------------------------
  // 3. FOCO EM QUADRA ESPECÍFICA
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!mapInstanceRef.current || !focusedSubdivisionId) return
    const layer = subdivisionLayersRef.current.get(focusedSubdivisionId)
    if (layer instanceof L.Polygon) {
      const bounds = layer.getBounds()
      if (bounds.isValid()) {
        mapInstanceRef.current.stop()
        mapInstanceRef.current.fitBounds(bounds, { animate: false, padding: [80, 80], maxZoom: 18 })
      }
    }
  }, [focusedSubdivisionId])

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={mapRef} className="h-full w-full" style={{ zIndex: 1 }} />

      {editable && (
        <div className="absolute bottom-4 left-4 z-10 rounded-lg bg-white/90 backdrop-blur-sm p-3 shadow-lg border border-slate-200 pointer-events-none sm:pointer-events-auto">
          <p className="text-sm font-bold text-slate-800">Instruções:</p>
          <ul className="mt-1 text-[11px] text-slate-600 space-y-1 font-medium">
            <li>• Use o polígono (topo dir.) para novas quadras</li>
            <li>• Clique em uma quadra para selecioná-la</li>
            <li>• Clique na aba "Não Visitar" para restrições</li>
          </ul>
        </div>
      )}

      <style jsx global>{`
        /* ── Toolbar do Leaflet Draw ── */
        .leaflet-draw-toolbar a {
          background-image: url('/images/spritesheet.png') !important;
          background-size: 300px 30px !important;
          background-repeat: no-repeat !important;
        }
        .leaflet-draw-toolbar a.leaflet-draw-draw-polygon   { background-position: -31px -2px !important; }
        .leaflet-draw-toolbar a.leaflet-draw-draw-rectangle { background-position: -62px -2px !important; }
        .leaflet-draw-toolbar a.leaflet-draw-edit-edit      { background-position: -152px -2px !important; }
        .leaflet-draw-toolbar a.leaflet-draw-edit-remove    { background-position: -182px -2px !important; }
        @media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) {
          .leaflet-draw-toolbar a {
            background-image: url('/images/spritesheet-2x.png') !important;
          }
        }

        /* ── Barra de Save/Cancel do modo edição ──
           Mantém o display:block original do Leaflet Draw.
           Só ajustamos visual (cor, fonte, borda). */
        .leaflet-draw-actions {
          background: white !important;
          border: 1px solid #e2e8f0 !important;
          border-radius: 0 8px 8px 0 !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.12) !important;
          padding: 0 !important;
          overflow: hidden !important;
        }
        .leaflet-draw-actions li {
          list-style: none !important;
          border-bottom: 1px solid #f1f5f9 !important;
        }
        .leaflet-draw-actions li:last-child { border-bottom: none !important; }
        .leaflet-draw-actions a {
          background: white !important;
          color: #475569 !important;
          font-size: 12px !important;
          font-weight: 600 !important;
          font-family: inherit !important;
          padding: 6px 14px !important;
          text-decoration: none !important;
          display: block !important;
          white-space: nowrap !important;
          transition: background 0.15s !important;
        }
        .leaflet-draw-actions a:hover { background: #f8fafc !important; }
        /* Primeiro item = Save → verde */
        .leaflet-draw-actions li:first-child a { color: #16a34a !important; }
        .leaflet-draw-actions li:first-child a:hover { background: #f0fdf4 !important; }
        /* Último item = Cancel → vermelho */
        .leaflet-draw-actions li:last-child a { color: #dc2626 !important; }
        .leaflet-draw-actions li:last-child a:hover { background: #fef2f2 !important; }

        /* ── Tooltip de instrução (segue o mouse durante edição) ──
           max-width + nowrap evita o bloco largo da imagem. */
        .leaflet-draw-tooltip {
          background: #1e293b !important;
          border: none !important;
          border-radius: 8px !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2) !important;
          color: #f8fafc !important;
          font-size: 11px !important;
          font-weight: 500 !important;
          font-family: inherit !important;
          line-height: 1.4 !important;
          max-width: 200px !important;
          padding: 5px 10px !important;
          pointer-events: none !important;
          white-space: normal !important;
        }
        .leaflet-draw-tooltip::before { display: none !important; }
        .leaflet-draw-tooltip-single  { margin-top: -8px !important; }

        /* ── Labels das quadras ── */
        .subdivision-tooltip-pill {
          background: rgba(255,255,255,0.95) !important;
          border: 1px solid rgba(0,0,0,0.1) !important;
          border-radius: 999px !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1) !important;
          color: #1e293b !important;
          font-size: 11px !important;
          font-weight: 700 !important;
          padding: 2px 9px !important;
          white-space: nowrap !important;
          pointer-events: auto !important;
          cursor: pointer !important;
        }
        .leaflet-tooltip-center::before { display: none !important; }

        /* ── Tooltips de Não Visitar ── */
        .dnv-tooltip {
          background: white !important;
          border: 1px solid #fee2e2 !important;
          border-radius: 8px !important;
          box-shadow: 0 4px 12px rgba(220,38,38,0.1) !important;
          padding: 8px 12px !important;
        }
        .dnv-tip-title { font-size: 12px; font-weight: 700; color: #b91c1c; margin-bottom: 2px; white-space: nowrap; }
        .dnv-tip-addr  { font-size: 11px; color: #64748b; }
      `}</style>
    </div>
  )
}