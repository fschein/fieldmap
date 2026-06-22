"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { TerritoryWithSubdivisions, Subdivision } from "@/lib/types"
import { MapPinOff, Map as MapIcon, Navigation, Compass } from "lucide-react"
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
  const [needsCompassPermission, setNeedsCompassPermission] = useState(false)

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

    // Adicionar camada de tiles com filtro para dark mode
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
      className: 'map-tiles-theme' // Filtro via CSS
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
        const hasNotes = !!subdivision.notes
        
        // Regra de cores: Azul (padrão), Amarelo (iniciada/notas), Verde (concluída)
        let fillColor = "#3b82f6" // Azul padrão
        let strokeColor = "#2563eb"

        if (isCompleted) {
          fillColor = "#22c55e" // Verde
          strokeColor = "#16a34a"
        } else if (hasNotes) {
          fillColor = "#facc15" // Amarelo
          strokeColor = "#ca8a04"
        }

        const polygon = L.polygon(latLngs, {
          color: strokeColor,
          fillColor: fillColor,
          fillOpacity: isCompleted ? 0.4 : 0.45,
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
          ${dnv.address ? `<div class="text-[0.625rem] opacity-90 font-medium"><strong>Endereço:</strong> ${dnv.address}</div>` : ''}
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

    const locationIcon = L.divIcon({
      className: 'user-location-marker',
      html: `<div class="location-wrapper">
        <div class="heading-cone" style="opacity:0"></div>
        <div class="pulse-dot"></div>
      </div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    })

    if ('geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const lat = position.coords.latitude
          const lng = position.coords.longitude
          const accuracy = position.coords.accuracy

          if (!userMarkerRef.current) {
            userMarkerRef.current = L.marker([lat, lng], { icon: locationIcon, zIndexOffset: 1000 }).addTo(map)
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

  const applyHeading = useCallback((heading: number) => {
    const el = userMarkerRef.current?.getElement()
    if (!el) return
    const cone = el.querySelector('.heading-cone') as HTMLElement | null
    if (!cone) return
    cone.style.transform = `rotate(${heading}deg)`
    cone.style.opacity = '1'
  }, [])

  const setupOrientationListeners = useCallback(() => {
    const handler = (e: DeviceOrientationEvent) => {
      let heading: number | null = null
      // iOS fornece webkitCompassHeading (0=norte, sentido horário)
      if (typeof (e as any).webkitCompassHeading === 'number') {
        heading = (e as any).webkitCompassHeading
      } else if (e.alpha !== null) {
        // Android com evento absolute: converte de anti-horário para horário
        heading = (360 - e.alpha) % 360
      }
      if (heading !== null) applyHeading(heading)
    }

    // deviceorientationabsolute é preferido no Android (orientação real em relação ao norte)
    window.addEventListener('deviceorientationabsolute', handler as EventListener)
    window.addEventListener('deviceorientation', handler as EventListener)

    return () => {
      window.removeEventListener('deviceorientationabsolute', handler as EventListener)
      window.removeEventListener('deviceorientation', handler as EventListener)
    }
  }, [applyHeading])

  // Bússola do device para direção do cone
  useEffect(() => {
    // iOS 13+ exige permissão explícita via gesto do usuário
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      setNeedsCompassPermission(true)
      return
    }
    return setupOrientationListeners()
  }, [setupOrientationListeners])

  const handleRequestCompassPermission = useCallback(async () => {
    try {
      const result = await (DeviceOrientationEvent as any).requestPermission()
      if (result === 'granted') {
        setNeedsCompassPermission(false)
        setupOrientationListeners()
      }
    } catch {
      setNeedsCompassPermission(false)
    }
  }, [setupOrientationListeners])

  return (
    <div className="relative w-full h-full min-h-[500px] overflow-hidden">
      <div
        ref={mapContainerRef}
        className="w-full h-full rounded-lg z-0"
      />

      {pinMode && (
        <>
          <div className="absolute top-[calc(50%-16px)] left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] pointer-events-none drop-shadow-md">
            <MapPinOff className="w-8 h-8 text-destructive animate-bounce" />
            <div className="w-2 h-2 bg-destructive rounded-full mx-auto mt-1 opacity-70"></div>
          </div>
          
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] drop-shadow-lg flex flex-col gap-2 w-[85%] max-w-xs">
            <Button 
              size="lg"
              className="bg-destructive hover:bg-destructive/90 text-white font-bold h-12 w-full shadow-md"
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
              className="h-12 w-full bg-card text-foreground border border-border hover:bg-accent font-semibold shadow-md"
              onClick={onPinCancel}
            >
              Cancelar
            </Button>
          </div>
          
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-card/95 px-4 py-2 rounded-full shadow-md border border-border text-sm font-medium text-foreground flex items-center gap-2 whitespace-nowrap">
            <MapPinOff className="w-4 h-4 text-destructive" />
            Mova o mapa para apontar o local
          </div>
        </>
      )}

      {!pinMode && (
        <div className="absolute top-4 right-4 bg-card/90 backdrop-blur-sm rounded-lg shadow-lg p-3 z-[900] border border-border hidden sm:block">
          <h3 className="text-xs font-bold mb-2 text-foreground uppercase tracking-wider">Legenda</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded border border-blue-600 bg-blue-500 opacity-50" />
              <span className="text-[0.625rem] font-bold text-muted-foreground uppercase">Pendente</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded border border-yellow-600 bg-yellow-400 opacity-60" />
              <span className="text-[0.625rem] font-bold text-yellow-700 uppercase">Em Progresso</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded border border-green-600 bg-green-500 opacity-60" />
              <span className="text-[0.625rem] font-bold text-foreground/70 uppercase">Concluída</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full border border-red-700 bg-red-600 opacity-80" />
              <span className="text-[0.625rem] font-bold text-red-700 uppercase">Não Visitar</span>
            </div>
          </div>
        </div>
      )}

      {!pinMode && (
        <div className="absolute right-4 bottom-4 flex flex-col gap-2 z-[900]">
          <Button
            size="icon"
            variant="secondary"
            className="h-11 w-11 bg-card shadow-xl border border-border rounded-full hover:bg-accent text-foreground"
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
            className="h-11 w-11 bg-card shadow-xl border border-border rounded-full hover:bg-accent text-foreground"
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
          {needsCompassPermission && (
            <Button
              size="icon"
              variant="secondary"
              className="h-11 w-11 bg-card shadow-xl border border-border rounded-full hover:bg-accent text-foreground"
              onClick={handleRequestCompassPermission}
              title="Ativar bússola"
            >
              <Compass className="h-5 w-5" />
            </Button>
          )}
        </div>
      )}

      <style jsx global>{`
        .leaflet-container {
          background: transparent;
          z-index: 0 !important;
        }

        .map-tiles-theme {
          filter: var(--map-filter, none);
        }

        .subdivision-tooltip-pill {
          background: var(--card) !important;
          backdrop-filter: blur(4px) !important;
          border: 1px solid var(--border) !important;
          border-radius: 999px !important;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4) !important;
          color: var(--foreground) !important;
          font-size: 12px !important;
          font-weight: 900 !important;
          padding: 4px 12px !important;
          white-space: nowrap !important;
          pointer-events: auto !important;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
          text-shadow: 0 1px 1px rgba(0,0,0,0.1);
        }

        .dnv-tooltip {
          background: hsl(var(--card)) !important;
          border: 1px solid hsl(var(--destructive) / 0.2) !important;
          border-radius: 8px !important;
          box-shadow: 0 4px 12px rgba(220, 38, 38, 0.2) !important;
          padding: 8px 12px !important;
          z-index: 1000 !important;
          color: hsl(var(--foreground)) !important;
        }
        
        .leaflet-tooltip-center::before {
          display: none !important;
        }

        .location-wrapper {
          position: relative;
          width: 40px;
          height: 40px;
        }

        .heading-cone {
          position: absolute;
          inset: 0;
          transform-origin: center center;
          transition: transform 0.15s ease-out, opacity 0.3s ease;
          pointer-events: none;
        }

        .heading-cone::before {
          content: '';
          position: absolute;
          /* base do triângulo alinhada ao centro, ponta aponta para cima (norte) */
          bottom: 50%;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 7px solid transparent;
          border-right: 7px solid transparent;
          border-bottom: 17px solid rgba(59, 130, 246, 0.7);
          filter: drop-shadow(0 0 3px rgba(59,130,246,0.4));
        }

        .pulse-dot {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 14px;
          height: 14px;
          background-color: hsl(var(--primary));
          border-radius: 50%;
          border: 2px solid hsl(var(--background));
          animation: pulse 2s infinite;
          z-index: 1;
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