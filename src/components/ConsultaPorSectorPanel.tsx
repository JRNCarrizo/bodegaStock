import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight, Layers, Loader2, Search, Warehouse } from 'lucide-react'
import { formatCantidad } from '@/lib/desglose'
import { focusAndScrollIntoView } from '@/lib/scroll'
import { api, cn } from '@/lib/utils'
import type { Sector } from '@/types'
import { SectorStockView } from '@/components/SectorStockView'
import { Badge, Card, CardBody } from '@/components/ui/Card'
import { useEscHandler } from '@/hooks/useEscHandler'

export function ConsultaPorSectorPanel({
  onSectorSelectedChange
}: {
  onSectorSelectedChange?: (selected: boolean) => void
}) {
  const [sectores, setSectores] = useState<Sector[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedSector, setSelectedSector] = useState<Sector | null>(null)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const load = useCallback(async (q?: string) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ activo: '1' })
      if (q?.trim()) params.set('q', q.trim())
      const data = await api<Sector[]>(`/api/sectores?${params}`)
      setSectores(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar sectores')
      setSectores([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => load(search), 300)
    return () => clearTimeout(timer)
  }, [search, load])

  useEffect(() => {
    setHighlightIndex(-1)
  }, [sectores])

  useEffect(() => {
    onSectorSelectedChange?.(selectedSector !== null)
  }, [selectedSector, onSectorSelectedChange])

  useEffect(() => {
    if (selectedSector !== null) return
    const timer = setTimeout(() => focusAndScrollIntoView(searchRef.current), 80)
    return () => clearTimeout(timer)
  }, [selectedSector])

  useEscHandler(selectedSector !== null, () => {
    setSelectedSector(null)
    return true
  })

  function selectSector(sector: Sector) {
    setSelectedSector(sector)
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (selectedSector) return
    const hasItems = sectores.length > 0 && !loading

    if (e.key === 'ArrowDown' && hasItems) {
      e.preventDefault()
      setHighlightIndex((i) => (i < sectores.length - 1 ? i + 1 : 0))
      return
    }

    if (e.key === 'ArrowUp' && hasItems) {
      e.preventDefault()
      setHighlightIndex((i) => (i > 0 ? i - 1 : sectores.length - 1))
      return
    }

    if (e.key === 'Enter' && hasItems) {
      e.preventDefault()
      const idx = highlightIndex >= 0 ? highlightIndex : 0
      selectSector(sectores[idx])
    }
  }

  if (selectedSector) {
    return (
      <SectorStockView
        sector={selectedSector}
        onBack={() => setSelectedSector(null)}
      />
    )
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden shadow-panel">
        <div className="border-b border-brand-100 bg-gradient-to-r from-brand-50/80 via-white to-white px-5 py-4 sm:px-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-400" />
            <input
              ref={searchRef}
              type="search"
              data-list-search
              placeholder="Buscar sector por nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="w-full rounded-xl border border-surface-border bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
        </div>

        {error && (
          <CardBody className="border-b border-red-100 bg-red-50 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </CardBody>
        )}

        <CardBody className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
              Cargando sectores...
            </div>
          ) : sectores.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <Warehouse className="h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-700">No hay sectores</p>
              <p className="mt-1 text-xs text-slate-500">
                {search.trim() ? 'Probá con otro término de búsqueda' : 'No hay sectores activos'}
              </p>
            </div>
          ) : (
            <ul ref={listRef} className="divide-y divide-surface-border">
              {sectores.map((s, index) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => selectSector(s)}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-brand-50/40 sm:gap-4 sm:px-6',
                      index === highlightIndex && 'bg-brand-50 ring-1 ring-inset ring-brand-200'
                    )}
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                      <Warehouse className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold text-slate-900">{s.nombre}</p>
                        {!!s.es_sector_descuento && (
                          <Badge variant="default">
                            Descuento P{s.prioridad_descuento ?? '—'}
                          </Badge>
                        )}
                      </div>
                      {s.descripcion && (
                        <p className="mt-1 line-clamp-1 text-xs text-slate-500">{s.descripcion}</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        {s.usa_ubicaciones ? (
                          <span className="inline-flex items-center gap-1">
                            <Layers className="h-3.5 w-3.5 text-brand-500" />
                            {s.ubicaciones_count} ubicación{s.ubicaciones_count === 1 ? '' : 'es'}
                          </span>
                        ) : (
                          <span>Sin ubicaciones internas</span>
                        )}
                        {s.productos_con_stock > 0 ? (
                          <span>
                            {s.productos_con_stock} producto{s.productos_con_stock === 1 ? '' : 's'}{' '}
                            · {formatCantidad(s.stock_total_unidades)} total
                          </span>
                        ) : (
                          <span>Sin stock</span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {s.productos_con_stock > 0 && (
                        <span className="inline-flex min-w-[3rem] items-center justify-center rounded-lg bg-brand-50 px-2.5 py-1.5 text-sm font-bold tabular-nums text-brand-700 ring-1 ring-brand-100">
                          {formatCantidad(s.stock_total_unidades)}
                        </span>
                      )}
                      <ChevronRight className="hidden h-4 w-4 text-slate-300 sm:block" />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      <p className="text-center text-xs text-slate-400">
        Elegí un sector para ver todos los productos con stock · Esc vuelve al listado
      </p>
    </div>
  )
}
