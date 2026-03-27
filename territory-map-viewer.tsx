"use client"

import { useEffect, useRef } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { TerritoryWithSubdivisions, Subdivision } from "@/lib/types"

interface TerritoryMapViewerProps {
  territory: TerritoryWithSubdivisions
  onSubdivisionClick: (subdivision: Subdivision) => void
}

export default function TerritoryMapViewer({
  territory,
  onSubdivisionClick,
}: TerritoryMapViewerProps) {
  const mapRef = useRef<L.Map | null>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    // Inicializar o mapa
    const map = L.map(mapContainerRef.current, {
      center: [-27.0945, -52.6166], // Centro padrão (pode ser ajustado)
      zoom: 15,
      zoomControl: true,
    })

    // Remover a bandeira da Ucrânia do prefixo padrão do Leaflet
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" title="A JS library for interactive maps">Leaflet</a>')

    // Adicionar camada de tiles
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!mapRef.current || !territory.subdivisions) return

    const map = mapRef.current

    // Limpar camadas anteriores (exceto a base)
    map.eachLayer((layer) => {
      if (layer instanceof L.Polygon || layer instanceof L.Marker) {
        map.removeLayer(layer)
      }
    })

    const bounds: L.LatLngBounds[] = []

    // Adicionar polígonos das subdivisions
    territory.subdivisions.forEach((subdivision: Subdivision) => {
      if (!subdivision.coordinates || subdivision.coordinates.length === 0) return

      try {
        // Converter coordenadas para formato Leaflet [lat, lng]
        const latLngs = subdivision.coordinates.map((ring: [number, number][]) =>
          ring.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number])
        )

        const isCompleted = subdivision.completed || subdivision.status === "completed"

        // Cores baseadas no status
        const fillColor = isCompleted ? "#22c55e" : territory.color || "#3b82f6"
        const color = isCompleted ? "#16a34a" : territory.color || "#2563eb"

        const polygon = L.polygon(latLngs, {
          color: color,
          fillColor: fillColor,
          fillOpacity: isCompleted ? 0.4 : 0.3,
          weight: 2,
          opacity: 0.8,
        })

        // Adicionar evento de clique
        polygon.on("click", () => {
          onSubdivisionClick(subdivision)
        })

        // Adicionar tooltip
        const tooltipContent = `
          <div class="text-sm">
            <strong>${subdivision.name || 'Quadra sem nome'}</strong><br/>
            Status: ${isCompleted ? '✓ Concluída' : 'Pendente'}
          </div>
        `
        polygon.bindTooltip(tooltipContent, {
          sticky: true,
          className: "custom-tooltip",
        })

        polygon.addTo(map)
        bounds.push(polygon.getBounds())

        // Adicionar label no centro do polígono (opcional)
        if (subdivision.name) {
          const center = polygon.getBounds().getCenter()
          const label = L.marker(center, {
            icon: L.divIcon({
              className: "subdivision-label",
              html: `<div class="bg-white/90 px-2 py-1 rounded shadow-sm text-xs font-semibold border border-slate-300">
                ${subdivision.name}
              </div>`,
              iconSize: [0, 0],
            }),
          })
          label.addTo(map)
        }
      } catch (error) {
        console.error("Erro ao renderizar subdivision:", subdivision.id, error)
      }
    })

    // Ajustar zoom para mostrar todos os polígonos
    if (bounds.length > 0) {
      const group = L.featureGroup(
        bounds.map((b: L.LatLngBounds) => L.rectangle(b, { opacity: 0 }))
      )
      map.fitBounds(group.getBounds(), { padding: [50, 50] })
    }
  }, [territory, onSubdivisionClick])

  return (
    <div className="relative">
      <div
        ref={mapContainerRef}
        className="w-full h-[calc(100vh-16rem)] rounded-lg"
        style={{ minHeight: "500px" }}
      />

      {/* Legenda */}
      <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-4 z-[1000] border">
        <h3 className="text-sm font-semibold mb-3">Legenda</h3>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border-2" style={{
              backgroundColor: territory.color || "#3b82f6",
              borderColor: territory.color || "#2563eb",
              opacity: 0.5,
            }} />
            <span className="text-xs">Quadra Pendente</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border-2 border-green-600 bg-green-500 opacity-60" />
            <span className="text-xs">Quadra Concluída</span>
          </div>
        </div>
      </div>

      {/* Estatísticas no Mapa */}
      <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-4 z-[1000] border">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-slate-900">
              {territory.subdivisions?.filter(s => s.completed || s.status === 'completed').length || 0}
            </div>
            <div className="text-xs text-slate-500">Concluídas</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">
              {territory.subdivisions?.filter(s => !s.completed && s.status !== 'completed').length || 0}
            </div>
            <div className="text-xs text-slate-500">Pendentes</div>
          </div>
        </div>
      </div>

      {/* Estilos customizados */}
      <style jsx global>{`
        .leaflet-container {
          background: #f1f5f9;
        }

        .custom-tooltip {
          background: white;
          border: 1px solid #cbd5e1;
          border-radius: 0.375rem;
          padding: 0.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        .subdivision-label {
          background: transparent;
          border: none;
          text-align: center;
          white-space: nowrap;
        }

        .leaflet-popup-content-wrapper {
          border-radius: 0.5rem;
        }

        .leaflet-popup-content {
          margin: 0.75rem;
        }
      `}</style>
    </div>
  )
}
