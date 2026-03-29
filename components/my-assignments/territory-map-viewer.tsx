"use client"

import { useEffect, useRef } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { TerritoryWithSubdivisions, Subdivision } from "@/lib/types"
import { MapPinOff, Crosshair, Map as MapIcon, Navigation } from "lucide-react"
import { Button } from "@/components/ui/button"

interface TerritoryMapViewerProps {
  territory: TerritoryWithSubdivisions
  onSubdivisionClick: (subdivision: Subdivision) => void
  onMapClick?: (latlng: L.LatLng) => void
  pinMode?: boolean
  onPinConfirm?: (latlng: L.LatLng) => void
  onPinCancel?: () => void
  animatingSubdivisionId?: string | null
}

export default function TerritoryMapViewer({
  territory,
  onSubdivisionClick,
  onMapClick,
  pinMode = false,
  onPinConfirm,
  onPinCancel,
  animatingSubdivisionId,
}: TerritoryMapViewerProps) {
  const mapRef = useRef<L.Map | null>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const userMarkerRef = useRef<L.Marker | null>(null)
  const userRadiusRef = useRef<L.Circle | null>(null)
  const polygonsRef = useRef<L.FeatureGroup | null>(null)

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    // Inicializar o mapa (SVG renderer is required for custom classNames on paths)
    const map = L.map(mapContainerRef.current, {
      center: [-27.0945, -52.6166], // Chapecó, SC
      zoom: 15,
      zoomControl: true,
      renderer: L.svg()
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
      if (layer instanceof L.Polygon || layer instanceof L.Marker || layer instanceof L.CircleMarker) {
        map.removeLayer(layer)
      }
    })

    const polygons: L.Polygon[] = []
    let hasValidPolygons = false

    // Adicionar polígonos das subdivisions
    territory.subdivisions.forEach((subdivision) => {
      if (!subdivision.coordinates || subdivision.coordinates.length === 0) return

      try {
        const latLngs = subdivision.coordinates.map((ring) => {
          return ring.map(([coord1, coord2]) => {
            let lat, lng
            if (coord1 >= -33 && coord1 <= 5) {
              lat = coord1; lng = coord2
            } else if (coord2 >= -33 && coord2 <= 5) {
              lat = coord2; lng = coord1
            } else if (coord1 >= -74 && coord1 <= -35) {
              lng = coord1; lat = coord2
            } else if (coord2 >= -74 && coord2 <= -35) {
              lng = coord2; lat = coord1
            } else {
              lng = coord1; lat = coord2
            }
            return [lat, lng] as [number, number]
          })
        })

        const isCompleted = subdivision.completed || subdivision.status === "completed"
        const fillColor = isCompleted ? "#22c55e" : territory.color || "#3b82f6"
        const color = isCompleted ? "#16a34a" : territory.color || "#2563eb"

        const polygon = L.polygon(latLngs, {
          color: color,
          fillColor: fillColor,
          fillOpacity: isCompleted ? 0.4 : 0.3,
          weight: 2,
          opacity: 0.8,
          className: animatingSubdivisionId === subdivision.id ? `subdivision-animating-${subdivision.id}` : ''
        })

        polygon.on("click", (e) => {
          L.DomEvent.stopPropagation(e)
          onSubdivisionClick(subdivision)
        })

        polygon.addTo(map)
        polygons.push(polygon)
        hasValidPolygons = true

        // Adicionar label no centro do polígono usando TOOLTIP (refinado)
        if (subdivision.name) {
          const center = polygon.getBounds().getCenter()
          const labelAnchor = L.circleMarker(center, { 
            radius: 0, 
            opacity: 0, 
            fillOpacity: 0,
            interactive: true 
          })
          
          labelAnchor.bindTooltip(subdivision.name, {
            permanent: true,
            direction: "center",
            className: "subdivision-tooltip-pill",
            interactive: true
          })

          labelAnchor.on("click", (e) => {
            L.DomEvent.stopPropagation(e)
            onSubdivisionClick(subdivision)
          })
          
          labelAnchor.addTo(map)
        }
      } catch (error) {
        console.error("Erro ao renderizar subdivision:", subdivision.id, error)
      }
    })

    // Adicionar marcadores de Não Visitar
    const activeDoNotVisits = territory.do_not_visits?.filter((dnv) => {
      if (!dnv.created_at) return true;
      const date = new Date(dnv.created_at);
      const isExpired = new Date().getTime() - date.getTime() > 365 * 24 * 60 * 60 * 1000;
      return !isExpired;
    }) || [];

    activeDoNotVisits.forEach((dnv) => {
      if (dnv.latitude && dnv.longitude) {
        const marker = L.circleMarker([dnv.latitude, dnv.longitude], {
          color: '#dc2626',
          fillColor: '#ef4444',
          fillOpacity: 0.9,
          radius: 8,
          weight: 2
        });

        const tooltipContent = `
          <div class="text-xs font-bold text-red-700 mb-0.5 whitespace-nowrap">🛑 Não Visitar</div>
          ${dnv.address ? `<div class="text-[10px] opacity-90 font-medium"><strong>Endereço:</strong> ${dnv.address}</div>` : ''}
        `
        marker.bindTooltip(tooltipContent, { 
          className: "dnv-tooltip",
          direction: "top",
          offset: [0, -10]
        })
        marker.addTo(map)
      }
    })

    // Ajustar zoom
    if (hasValidPolygons && polygons.length > 0) {
      const group = L.featureGroup(polygons)
      polygonsRef.current = group
      map.fitBounds(group.getBounds(), { padding: [50, 50] })
    }

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (!pinMode && onMapClick) {
        onMapClick(e.latlng)
      }
    }
    
    map.on('click', handleMapClick)

    return () => {
      map.off('click', handleMapClick)
    }
  }, [territory, onSubdivisionClick, onMapClick, pinMode, animatingSubdivisionId])

  // Geolocalização
  useEffect(() => {
    if (!mapRef.current) return
    const map = mapRef.current
    let watchId: number

    if ('geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const lat = position.coords.latitude
          const lng = position.coords.longitude
          const accuracy = position.coords.accuracy

          const blueDotIcon = L.divIcon({
            className: 'user-location-marker',
            html: '<div class="pulse-dot"></div>',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
          })

          if (!userMarkerRef.current) {
            userMarkerRef.current = L.marker([lat, lng], { icon: blueDotIcon, zIndexOffset: 1000 }).addTo(map)
            userRadiusRef.current = L.circle([lat, lng], {
              radius: accuracy,
              color: '#3b82f6',
              fillColor: '#3b82f6',
              fillOpacity: 0.1,
              weight: 1
            }).addTo(map)
          } else {
            userMarkerRef.current.setLatLng([lat, lng])
            if (userRadiusRef.current) {
              userRadiusRef.current.setLatLng([lat, lng])
              userRadiusRef.current.setRadius(accuracy)
            }
          }
        },
        null,
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
      )
    }

    return () => {
      if (watchId !== undefined && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchId)
      }
    }
  }, [])

  return (
    <div className="relative w-full h-full min-h-[500px] overflow-hidden">
      <div
        ref={mapContainerRef}
        className="w-full h-full rounded-lg z-0"
      />

      {pinMode && (
        <>
          <div className="absolute top-[calc(50%-16px)] left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] pointer-events-none drop-shadow-md">
            <MapPinOff className="w-8 h-8 text-red-600 animate-bounce" />
            <div className="w-2 h-2 bg-red-600 rounded-full mx-auto mt-1 opacity-70"></div>
          </div>
          
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] drop-shadow-lg flex flex-col gap-2 w-[85%] max-w-xs">
            <Button 
              size="lg"
              className="bg-red-600 hover:bg-red-700 text-white font-bold h-12 w-full shadow-md"
              onClick={() => {
                if (mapRef.current && onPinConfirm) {
                  onPinConfirm(mapRef.current.getCenter())
                }
              }}
            >
              Confirmar Local
            </Button>
            <Button 
              size="lg"
              variant="secondary" 
              className="h-12 w-full bg-white text-slate-700 border border-slate-300 hover:bg-slate-100 font-semibold shadow-md"
              onClick={onPinCancel}
            >
              Cancelar
            </Button>
          </div>
          
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-white/95 px-4 py-2 rounded-full shadow-md border text-sm font-medium text-slate-800 flex items-center gap-2 whitespace-nowrap">
            <MapPinOff className="w-4 h-4 text-red-600" />
            Mova o mapa para apontar o local
          </div>
        </>
      )}

      {!pinMode && (
        <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg p-3 z-[900] border border-slate-200 hidden sm:block">
          <h3 className="text-xs font-bold mb-2 text-slate-800 uppercase tracking-wider">Legenda</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded border border-slate-300" style={{ backgroundColor: territory.color || "#3b82f6", opacity: 0.5 }} />
              <span className="text-[10px] font-bold text-slate-600 uppercase">Pendente</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded border border-green-600 bg-green-500 opacity-60" />
              <span className="text-[10px] font-bold text-slate-600 uppercase">Concluída</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full border border-red-700 bg-red-600 opacity-80" />
              <span className="text-[10px] font-bold text-red-700 uppercase">Não Visitar</span>
            </div>
          </div>
        </div>
      )}

      {!pinMode && (
        <div className="absolute right-4 bottom-4 flex flex-col gap-2 z-[900]">
          <Button
            size="icon"
            variant="secondary"
            className="h-11 w-11 bg-white shadow-xl border border-slate-200 rounded-full hover:bg-slate-50 text-slate-700"
            onClick={() => {
              if (mapRef.current && polygonsRef.current) {
                mapRef.current.fitBounds(polygonsRef.current.getBounds(), { padding: [50, 50] })
              }
            }}
          >
            <MapIcon className="h-5 w-5" />
          </Button>
          <Button
            size="icon"
            variant="secondary"
            className="h-11 w-11 bg-white shadow-xl border border-slate-200 rounded-full hover:bg-slate-50 text-slate-700"
            onClick={() => {
              if (mapRef.current && userMarkerRef.current) {
                mapRef.current.setView(userMarkerRef.current.getLatLng(), 17)
              } else if ('geolocation' in navigator) {
                navigator.geolocation.getCurrentPosition((pos) => {
                  if (mapRef.current) {
                    mapRef.current.setView([pos.coords.latitude, pos.coords.longitude], 17)
                  }
                })
              }
            }}
          >
            <Navigation className="h-5 w-5" />
          </Button>
        </div>
      )}

      <style jsx global>{`
        .leaflet-container {
          background: #f8fafc;
          z-index: 0 !important;
        }

        .subdivision-tooltip-pill {
          background: rgba(255, 255, 255, 0.95) !important;
          backdrop-filter: blur(4px) !important;
          border: 1px solid rgba(0, 0, 0, 0.1) !important;
          border-radius: 999px !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1) !important;
          color: #1e293b !important;
          font-size: 11px !important;
          font-weight: 800 !important;
          padding: 3px 10px !important;
          white-space: nowrap !important;
          pointer-events: auto !important;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
        }

        .dnv-tooltip {
          background: white !important;
          border: 1px solid #fee2e2 !important;
          border-radius: 8px !important;
          box-shadow: 0 4px 12px rgba(220, 38, 38, 0.1) !important;
          padding: 8px 12px !important;
          z-index: 1000 !important;
        }
        
        .leaflet-tooltip-center::before {
          display: none !important;
        }

        .pulse-dot {
          width: 14px;
          height: 14px;
          background-color: #2563eb;
          border-radius: 50%;
          border: 2px solid white;
          box-shadow: 0 0 0 rgba(37, 99, 235, 0.4);
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.7); }
          70% { box-shadow: 0 0 0 10px rgba(37, 99, 235, 0); }
          100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); }
        }
      `}</style>
    </div>
  )
}