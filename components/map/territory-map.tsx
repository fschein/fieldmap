"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import "leaflet-draw/dist/leaflet.draw.css"
import "leaflet-draw"
import type { Subdivision, Territory } from "@/lib/types"

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
}

const STATUS_COLORS = {
  available: "#22c55e",
  assigned: "#3b82f6",
  completed: "#6b7280",
}

// Coordenadas padrão: Gravataí/RS
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
  onDnvClick,
}: TerritoryMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null)
  const subdivisionLayersRef = useRef<Map<string, L.Layer>>(new Map())
  const [selectedSubdivisionId, setSelectedSubdivisionId] = useState<string | null>(null)
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_CENTER)
  const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM)
  const [initialFitDone, setInitialFitDone] = useState(false)

  // Calcula o centro do mapa baseado nas subdivisões existentes
  const calculateMapCenter = useCallback(() => {
    // 1. Se houver subdivisões com coordenadas, usar bounding box
    const subdivisionsWithCoords = subdivisions.filter(
      (s) => s.coordinates && s.coordinates.length > 0
    )

    if (subdivisionsWithCoords.length > 0) {
      const allCoords = subdivisionsWithCoords.flatMap(
        (s) => s.coordinates![0]
      )

      const lats = allCoords.map((c) => c[0])
      const lngs = allCoords.map((c) => c[1])

      const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2
      const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2

      setMapCenter([centerLat, centerLng])
      setMapZoom(15)
      return
    }

    // 2. Se não houver subdivisões, tentar geolocalização
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setMapCenter([position.coords.latitude, position.coords.longitude])
          setMapZoom(15)
        },
        () => {
          // 3. Se falhar, usar coordenadas padrão de Gravataí/RS
          setMapCenter(DEFAULT_CENTER)
          setMapZoom(13)
        }
      )
    } else {
      // 3. Sem geolocalização disponível, usar padrão
      setMapCenter(DEFAULT_CENTER)
      setMapZoom(13)
    }
  }, [subdivisions])

  useEffect(() => {
    if (!center) {
      calculateMapCenter()
    } else {
      setMapCenter(center)
      setMapZoom(zoom || DEFAULT_ZOOM)
    }
  }, [center, zoom, calculateMapCenter])

  const initializeMap = useCallback(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    // Initialize map
    const map = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView(mapCenter, mapZoom)

    // Remover a bandeira da Ucrânia do prefixo padrão do Leaflet
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" title="A JS library for interactive maps">Leaflet</a>')

    mapInstanceRef.current = map

    // Add tile layer
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)

    // Initialize feature group for drawn items
    const drawnItems = new L.FeatureGroup()
    map.addLayer(drawnItems)
    drawnItemsRef.current = drawnItems

    // Add draw control if editable
    if (editable) {
      const drawControl = new L.Control.Draw({
        position: "topright",
        draw: {
          polygon: {
            allowIntersection: false,
            drawError: {
              color: "#e1e4e8",
              message: "<strong>Erro:</strong> Os polígonos não podem se cruzar!",
            },
            shapeOptions: {
              color: territory.color,
              fillColor: territory.color,
              fillOpacity: 0.3,
            },
          },
          rectangle: {
            shapeOptions: {
              color: territory.color,
              fillColor: territory.color,
              fillOpacity: 0.3,
            },
          },
          polyline: false,
          circle: false,
          circlemarker: false,
          marker: false,
        },
        edit: {
          featureGroup: drawnItems,
          remove: true,
        },
      })
      map.addControl(drawControl)

      // Handle draw created
      // Handle draw created
      // SOLUÇÃO: Removemos a tipagem explícita do 'e' na entrada ou usamos 'any',
      // e fazemos o cast 'as L.DrawEvents.Created' dentro da função.
      map.on(L.Draw.Event.CREATED, (e) => {
        const event = e as L.DrawEvents.Created
        const layer = event.layer as L.Polygon

        // Proteção para garantir que é um polígono e tem LatLngs
        const latlngs = layer.getLatLngs()
        if (!latlngs || latlngs.length === 0) return

        // O Leaflet pode retornar LatLng[] ou LatLng[][], dependendo da forma.
        // Assumindo polígono simples (primeiro array):
        const rawCoordinates = Array.isArray(latlngs[0])
          ? (latlngs[0] as L.LatLng[])
          : (latlngs as L.LatLng[])

        const coordinates = rawCoordinates.map((latlng) => [
          latlng.lat,
          latlng.lng,
        ] as [number, number])

        if (onSubdivisionCreate) {
          onSubdivisionCreate([coordinates])
        }
      })

      // Handle delete
      map.on(L.Draw.Event.DELETED, (e) => {
        const event = e as L.DrawEvents.Deleted
        const layers = event.layers

        layers.eachLayer((layer: L.Layer) => {
          // Aqui precisamos forçar 'any' ou estender o tipo, pois subdivisionId não existe nativamente no Layer
          const subdivisionId = (layer as any).subdivisionId

          if (subdivisionId && onSubdivisionDelete) {
            onSubdivisionDelete(subdivisionId)
            // Verifique se subdivisionLayersRef.current existe antes de chamar delete
            if (subdivisionLayersRef.current) {
              subdivisionLayersRef.current.delete(subdivisionId)
            }
          }
        })
      })

      // Handle edit
      map.on(L.Draw.Event.EDITED, (e) => {
        const event = e as L.DrawEvents.Edited
        const layers = event.layers

        layers.eachLayer((layer: L.Layer) => {
          const polygon = layer as L.Polygon
          // Novamente, acessando propriedade customizada via cast
          const subdivisionId = (polygon as any).subdivisionId

          if (subdivisionId && onSubdivisionUpdate) {
            const latlngs = polygon.getLatLngs()

            // Mesma lógica de extração segura de coordenadas do Create
            const rawCoordinates = Array.isArray(latlngs[0])
              ? (latlngs[0] as L.LatLng[])
              : (latlngs as L.LatLng[])

            const coordinates = rawCoordinates.map((latlng) => [
              latlng.lat,
              latlng.lng,
            ] as [number, number])

            onSubdivisionUpdate(subdivisionId, [coordinates])
          }
        })
      })
    }

    return map
  }, [mapCenter, mapZoom, editable, territory.color, onSubdivisionCreate, onSubdivisionDelete, onSubdivisionUpdate])

  // Initialize map
  useEffect(() => {
    const map = initializeMap()

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [initializeMap])

  // Update subdivisions on map
  useEffect(() => {
    if (!mapInstanceRef.current || !drawnItemsRef.current) return

    const map = mapInstanceRef.current
    const drawnItems = drawnItemsRef.current

    // Add subdivisions to map (Primeiro, para ficarem under)
    subdivisions.forEach((subdivision) => {
      if (!subdivision.coordinates || subdivision.coordinates.length === 0) return

      const coordinates = subdivision.coordinates[0].map(
        (coord) => [coord[0], coord[1]] as L.LatLngExpression
      )

      const color = STATUS_COLORS[subdivision.status] || territory.color
      const polygon = L.polygon(coordinates, {
        color: selectedSubdivisionId === subdivision.id ? "#000" : color,
        fillColor: color,
        fillOpacity: 0.3,
        weight: selectedSubdivisionId === subdivision.id ? 3 : 2,
      }) as L.Polygon & { subdivisionId?: string }

      polygon.subdivisionId = subdivision.id

      // Add tooltip
      polygon.bindTooltip(subdivision.name, {
        permanent: false,
        direction: "center",
      })

      // Handle click
      polygon.on("click", () => {
        setSelectedSubdivisionId(subdivision.id)
        if (onSubdivisionSelect) {
          onSubdivisionSelect(subdivision)
        }
      })

      drawnItems.addLayer(polygon)
      subdivisionLayersRef.current.set(subdivision.id, polygon)
    })

    // Add DNV markers to the Admin Map (Depois, para ficarem on top)
    if ((territory as any).do_not_visits) {
      ;(territory as any).do_not_visits.forEach((dnv: any) => {
        if (dnv.latitude && dnv.longitude) {
          const marker = L.circleMarker([dnv.latitude, dnv.longitude], {
            color: '#dc2626',
            fillColor: '#ef4444',
            fillOpacity: 1, // Torna mais visível
            radius: 8, // Aumenta o tamanho
            weight: 2
          });

          // Check if expired
          const date = new Date(dnv.created_at);
          const isExpired = new Date().getTime() - date.getTime() > 365 * 24 * 60 * 60 * 1000;

          const tooltipContent = `
            <div class="text-sm font-semibold text-red-700 mb-1">🛑 Não Visitar ${isExpired ? '<span class="text-orange-600">(Expirado)</span>' : ''}</div>
            ${dnv.address ? `<div class="text-xs mb-1"><strong>Endereço:</strong> ${dnv.address}</div>` : ''}
            ${dnv.notes ? `<div class="text-xs text-slate-600"><strong>Obs:</strong> ${dnv.notes}</div>` : ''}
          `
          marker.bindTooltip(tooltipContent, { className: "bg-white p-2 rounded shadow border" })
          
          drawnItems.addLayer(marker)
        }
      })
    }

    // AUTO-FIT: Fit bounds if there are subdivisions (APENAS UMA VEZ no início)
    if (subdivisions.length > 0 && subdivisions.some((s) => s.coordinates) && !initialFitDone) {
      const bounds = drawnItems.getBounds()
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 })
        setInitialFitDone(true)
      }
    }
  }, [subdivisions, territory.color, selectedSubdivisionId, onSubdivisionSelect, initialFitDone])

  // FOCUS: Voa para uma subdivisão específica quando clicada na sidebar
  useEffect(() => {
    if (!mapInstanceRef.current || !focusedSubdivisionId) return

    const layer = subdivisionLayersRef.current.get(focusedSubdivisionId)
    if (layer && layer instanceof L.Polygon) {
      const bounds = layer.getBounds()
      mapInstanceRef.current.flyToBounds(bounds, {
        padding: [100, 100],
        duration: 0.8,
        maxZoom: 18
      })
    }
  }, [focusedSubdivisionId])

  return (
    <div className="relative h-full w-full">
      <div ref={mapRef} className="h-full w-full rounded-lg" style={{ zIndex: 1 }} />
      {editable && (
        <div className="absolute bottom-4 left-4 z-10 rounded-lg bg-card p-3 shadow-lg border">
          <p className="text-sm font-medium">Instruções:</p>
          <ul className="mt-1 text-xs text-muted-foreground space-y-1">
            <li>Use as ferramentas para desenhar subdivisões</li>
            <li>Clique em uma subdivisão para selecioná-la</li>
            <li>Use o botão de edição para modificar</li>
          </ul>
        </div>
      )}
    </div>
  )
}

