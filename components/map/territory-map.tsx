"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import "leaflet-draw/dist/leaflet.draw.css"
import "leaflet-draw"
import type { Block, Territory } from "@/lib/types"

interface TerritoryMapProps {
  territory: Territory
  blocks: Block[]
  center?: [number, number]
  zoom?: number
  editable?: boolean
  onBlockCreate?: (coordinates: [number, number][][]) => void
  onBlockUpdate?: (blockId: string, coordinates: [number, number][][]) => void
  onBlockDelete?: (blockId: string) => void
  onBlockSelect?: (block: Block) => void
}

const STATUS_COLORS = {
  available: "#22c55e",
  assigned: "#3b82f6",
  completed: "#6b7280",
}

export function TerritoryMap({
  territory,
  blocks,
  center = [-23.5505, -46.6333], // São Paulo default
  zoom = 15,
  editable = false,
  onBlockCreate,
  onBlockUpdate,
  onBlockDelete,
  onBlockSelect,
}: TerritoryMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null)
  const blockLayersRef = useRef<Map<string, L.Layer>>(new Map())
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)

  const initializeMap = useCallback(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    // Initialize map
    const map = L.map(mapRef.current).setView(center, zoom)
    mapInstanceRef.current = map

    // Add tile layer
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
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
      map.on(L.Draw.Event.CREATED, (e: L.DrawEvents.Created) => {
        const layer = e.layer as L.Polygon
        const coordinates = (layer.getLatLngs()[0] as L.LatLng[]).map((latlng) => [
          latlng.lat,
          latlng.lng,
        ] as [number, number])
        
        if (onBlockCreate) {
          onBlockCreate([coordinates])
        }
      })

      // Handle delete
      map.on(L.Draw.Event.DELETED, (e: L.DrawEvents.Deleted) => {
        const layers = e.layers
        layers.eachLayer((layer: L.Layer) => {
          const blockId = (layer as L.Polygon & { blockId?: string }).blockId
          if (blockId && onBlockDelete) {
            onBlockDelete(blockId)
            blockLayersRef.current.delete(blockId)
          }
        })
      })

      // Handle edit
      map.on(L.Draw.Event.EDITED, (e: L.DrawEvents.Edited) => {
        const layers = e.layers
        layers.eachLayer((layer: L.Layer) => {
          const polygon = layer as L.Polygon & { blockId?: string }
          const blockId = polygon.blockId
          if (blockId && onBlockUpdate) {
            const coordinates = (polygon.getLatLngs()[0] as L.LatLng[]).map((latlng) => [
              latlng.lat,
              latlng.lng,
            ] as [number, number])
            onBlockUpdate(blockId, [coordinates])
          }
        })
      })
    }

    return map
  }, [center, zoom, editable, territory.color, onBlockCreate, onBlockDelete, onBlockUpdate])

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

  // Update blocks on map
  useEffect(() => {
    if (!mapInstanceRef.current || !drawnItemsRef.current) return

    const map = mapInstanceRef.current
    const drawnItems = drawnItemsRef.current

    // Clear existing layers
    drawnItems.clearLayers()
    blockLayersRef.current.clear()

    // Add blocks to map
    blocks.forEach((block) => {
      if (!block.coordinates || block.coordinates.length === 0) return

      const coordinates = block.coordinates[0].map(
        (coord) => [coord[0], coord[1]] as L.LatLngExpression
      )

      const color = STATUS_COLORS[block.status] || territory.color
      const polygon = L.polygon(coordinates, {
        color: selectedBlockId === block.id ? "#000" : color,
        fillColor: color,
        fillOpacity: 0.3,
        weight: selectedBlockId === block.id ? 3 : 2,
      }) as L.Polygon & { blockId?: string }

      polygon.blockId = block.id

      // Add tooltip
      polygon.bindTooltip(block.name, {
        permanent: false,
        direction: "center",
      })

      // Handle click
      polygon.on("click", () => {
        setSelectedBlockId(block.id)
        if (onBlockSelect) {
          onBlockSelect(block)
        }
      })

      drawnItems.addLayer(polygon)
      blockLayersRef.current.set(block.id, polygon)
    })

    // Fit bounds if there are blocks
    if (blocks.length > 0 && blocks.some((b) => b.coordinates)) {
      const bounds = drawnItems.getBounds()
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] })
      }
    }
  }, [blocks, territory.color, selectedBlockId, onBlockSelect])

  return (
    <div className="relative h-full w-full">
      <div ref={mapRef} className="h-full w-full rounded-lg" />
      {editable && (
        <div className="absolute bottom-4 left-4 z-[1000] rounded-lg bg-card p-3 shadow-lg">
          <p className="text-sm font-medium">Instruções:</p>
          <ul className="mt-1 text-xs text-muted-foreground space-y-1">
            <li>Use as ferramentas para desenhar quadras</li>
            <li>Clique em uma quadra para selecioná-la</li>
            <li>Use o botão de edição para modificar</li>
          </ul>
        </div>
      )}
    </div>
  )
}
