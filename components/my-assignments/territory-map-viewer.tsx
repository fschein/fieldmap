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
}

export default function TerritoryMapViewer({
  territory,
  onSubdivisionClick,
  onMapClick,
  pinMode = false,
  onPinConfirm,
  onPinCancel,
}: TerritoryMapViewerProps) {
  const mapRef = useRef<L.Map | null>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const userMarkerRef = useRef<L.Marker | null>(null)
  const userRadiusRef = useRef<L.Circle | null>(null)
  const polygonsRef = useRef<L.FeatureGroup | null>(null)

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    // Inicializar o mapa
    const map = L.map(mapContainerRef.current, {
      center: [-27.0945, -52.6166], // Chapecó, SC
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

    const polygons: L.Polygon[] = []
    let hasValidPolygons = false

    console.log("=== DEBUG COORDENADAS ===")
    console.log("Total de subdivisions:", territory.subdivisions.length)

    // Adicionar polígonos das subdivisions
    territory.subdivisions.forEach((subdivision, index) => {
      console.log(`\nSubdivision ${index} (${subdivision.name}):`)
      console.log("Coordinates raw:", subdivision.coordinates)
      
      if (!subdivision.coordinates || subdivision.coordinates.length === 0) {
        console.log("❌ Sem coordenadas")
        return
      }

      try {
        // IMPORTANTE: Não inverter nada aqui!
        // O Leaflet espera [lat, lng], então se já vem como [lat, lng], mantenha assim
        const latLngs = subdivision.coordinates.map((ring) => {
          // Assumindo que coordinates já vem no formato correto do banco
          // Vamos apenas converter direto sem inversão
          const converted = ring.map(([coord1, coord2]) => {
            // Detectar qual é lat e qual é lng
            // Latitude: -90 a 90, Longitude: -180 a 180
            // Brasil: Lat -33 a 5, Lng -35 a -74
            
            let lat, lng
            
            // Se coord1 está entre -33 e 5, provavelmente é latitude
            if (coord1 >= -33 && coord1 <= 5) {
              lat = coord1
              lng = coord2
            } 
            // Se coord2 está entre -33 e 5, provavelmente é latitude
            else if (coord2 >= -33 && coord2 <= 5) {
              lat = coord2
              lng = coord1
            }
            // Se coord1 está entre -74 e -35, provavelmente é longitude
            else if (coord1 >= -74 && coord1 <= -35) {
              lng = coord1
              lat = coord2
            }
            // Se coord2 está entre -74 e -35, provavelmente é longitude
            else if (coord2 >= -74 && coord2 <= -35) {
              lng = coord2
              lat = coord1
            }
            // Fallback: assumir GeoJSON padrão [lng, lat]
            else {
              lng = coord1
              lat = coord2
            }
            
            console.log(`  [${coord1}, ${coord2}] → [lat: ${lat}, lng: ${lng}]`)
            return [lat, lng] as [number, number]
          })
          return converted
        })

        console.log("✅ Convertido para Leaflet:", latLngs)

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
        polygon.on("click", (e) => {
          L.DomEvent.stopPropagation(e)
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
        polygons.push(polygon)
        hasValidPolygons = true

        // Adicionar label no centro do polígono
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
        console.error("❌ Erro ao renderizar subdivision:", subdivision.id, error)
      }
    })

    console.log(`\n=== RESUMO: ${polygons.length} polígonos renderizados ===\n`)

    // Adicionar marcadores de Não Visitar (Filtrando os maiores que 1 ano)
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
          fillOpacity: 0.8,
          radius: 8,
          weight: 2
        });

        const tooltipContent = `
          <div class="text-sm font-semibold text-red-700 mb-1">🛑 Não Visitar</div>
          ${dnv.address ? `<div class="text-xs mb-1"><strong>Endereço:</strong> ${dnv.address}</div>` : ''}
          ${dnv.notes ? `<div class="text-xs text-slate-600"><strong>Obs:</strong> ${dnv.notes}</div>` : ''}
        `
        marker.bindTooltip(tooltipContent, { className: "custom-tooltip" })
        marker.addTo(map)
      }
    })

    // Ajustar zoom para mostrar todos os polígonos
    if (hasValidPolygons && polygons.length > 0) {
      const group = L.featureGroup(polygons)
      polygonsRef.current = group
      const bounds = group.getBounds()
      console.log("Bounds calculados:", bounds)
      map.fitBounds(bounds, { padding: [50, 50] })
    } else {
      console.log("⚠️ Nenhum polígono válido, mantendo centro padrão")
      map.setView([-27.0945, -52.6166], 15)
    }

    // Remover evento de clique no mapa quando em Pin Mode para evitar abrir quadras acidentalmente!
    // E quando não está em Pin Mode, usar onMapClick se provido
    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (!pinMode && onMapClick) {
        onMapClick(e.latlng)
      }
    }
    
    map.on('click', handleMapClick)

    return () => {
      map.off('click', handleMapClick)
    }
  }, [territory, onSubdivisionClick, onMapClick, pinMode])

  // Efeito independente para Geolocalização (watchPosition)
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

          // Criar ícone pulsante usando CSS
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
        (error) => {
          console.warn("Geolocalização erro:", error)
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
      )
    }

    return () => {
      if (watchId !== undefined && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchId)
      }
    }
  }, [pinMode])

  return (
    <div className="relative w-full h-full min-h-[500px]">
      <div
        ref={mapContainerRef}
        className="w-full h-[calc(100vh-12rem)] md:h-[calc(100vh-14rem)] rounded-lg z-0"
        style={{ minHeight: "500px" }}
      />

      {/* Crosshair do Pin Mode */}
      {pinMode && (
        <>
          {/* Target mark (crosshair) */}
          <div className="absolute top-[calc(50%-16px)] left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] pointer-events-none drop-shadow-md">
            <MapPinOff className="w-8 h-8 text-red-600 animate-bounce" />
            <div className="w-2 h-2 bg-red-600 rounded-full mx-auto mt-1 opacity-70"></div>
          </div>
          
          {/* Botões do Pin Mode */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] drop-shadow-lg flex flex-col gap-2 w-[85%] max-w-xs">
            <Button 
              size="lg"
              className="bg-red-600 hover:bg-red-700 text-white font-bold h-12 w-full text-[15px] sm:text-base whitespace-normal text-center leading-tight shadow-md"
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
          
          {/* Header instructions for Pin Mode */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-white/95 px-4 py-2 rounded-full shadow-md border text-sm font-medium text-slate-800 flex items-center gap-2 whitespace-nowrap">
            <MapPinOff className="w-4 h-4 text-red-600" />
            Mova o mapa para apontar o local
          </div>
        </>
      )}

      {/* Legenda (Esconde no Pin Mode) */}
      {!pinMode && (
        <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg p-3 sm:p-4 z-[900] border max-w-[150px] sm:max-w-none">
          <h3 className="text-xs sm:text-sm font-semibold mb-2 sm:mb-3">Legenda</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 sm:w-4 sm:h-4 rounded border-2" style={{
                backgroundColor: territory.color || "#3b82f6",
                borderColor: territory.color || "#2563eb",
                opacity: 0.5,
              }} />
              <span className="text-[10px] sm:text-xs leading-tight">Quadra Pendente</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 sm:w-4 sm:h-4 rounded border-2 border-green-600 bg-green-500 opacity-60" />
              <span className="text-[10px] sm:text-xs leading-tight">Quadra Concluída</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-full border-2 border-red-700 bg-red-600 opacity-80" />
              <span className="text-[10px] sm:text-xs leading-tight text-red-700 font-medium">Não Visitar</span>
            </div>
          </div>
        </div>
      )}

      {/* Estatísticas no Mapa */}
      {!pinMode && (
        <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-lg p-3 sm:p-4 z-[900] border">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 text-center">
            <div>
              <div className="text-xl sm:text-2xl font-bold text-slate-900">
                {territory.subdivisions?.filter(s => s.completed || s.status === 'completed').length || 0}
              </div>
              <div className="text-[10px] sm:text-xs text-slate-500">Concluídas</div>
            </div>
            <div>
              <div className="text-xl sm:text-2xl font-bold text-slate-900">
                {territory.subdivisions?.filter(s => !s.completed && s.status !== 'completed').length || 0}
              </div>
              <div className="text-[10px] sm:text-xs text-slate-500">Pendentes</div>
            </div>
          </div>
        </div>
      )}


      {/* Controles de Centralização */}
      {!pinMode && (
        <div className="absolute right-4 bottom-4 flex flex-col gap-2 z-[900]">
          <Button
            size="icon"
            variant="secondary"
            className="h-10 w-10 bg-white shadow-md border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700"
            title="Centralizar no Território"
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
            className="h-10 w-10 bg-white shadow-md border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700"
            title="Minha Localização"
            onClick={() => {
              if (mapRef.current && userMarkerRef.current) {
                mapRef.current.setView(userMarkerRef.current.getLatLng(), 17)
              } else if ('geolocation' in navigator) {
                // Caso o watchPosition ainda não tenha disparado
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

      {/* Estilos customizados */}
      <style jsx global>{`
        .leaflet-container {
          background: #f1f5f9;
          z-index: 0 !important;
        }

        .leaflet-pane {
          z-index: 400 !important;
        }

        .leaflet-top,
        .leaflet-bottom {
          z-index: 1000 !important;
        }

        .custom-tooltip {
          background: white;
          border: 1px solid #cbd5e1;
          border-radius: 0.375rem;
          padding: 0.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          z-index: 9999 !important;
        }

        .subdivision-label {
          background: transparent;
          border: none;
          text-align: center;
          white-space: nowrap;
          z-index: 600 !important;
        }

        .leaflet-popup-content-wrapper {
          border-radius: 0.5rem;
        }

        .leaflet-popup-content {
          margin: 0.75rem;
        }

        .leaflet-control-zoom,
        .leaflet-control-attribution {
          z-index: 1000 !important;
        }

        .user-location-marker {
          display: flex;
          align-items: center;
          justify-content: center;
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
          0% {
            box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.7);
          }
          70% {
            box-shadow: 0 0 0 10px rgba(37, 99, 235, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(37, 99, 235, 0);
          }
        }
      `}</style>
    </div>
  )
}