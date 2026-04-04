'use client'

import { useState, useEffect } from 'react'
import { getDriverRoute } from '@/lib/route-storage'
import { buildGoogleMapsUrls, buildSingleStopUrl } from '@/lib/maps-url'
import type { DriverRoute } from '@/routes/multi-driver'

interface ParsedRouteId {
  planId: string
  driverIndex: number
}

function parseRouteId(routeId: string): ParsedRouteId | null {
  const match = routeId.match(/^(.+)--driver(\d+)$/)
  if (!match) return null
  return {
    planId: match[1],
    driverIndex: parseInt(match[2], 10),
  }
}

function formatDistance(meters: number): string {
  const km = meters / 1000
  return km < 1 ? `${meters}m` : `${km.toFixed(1)} km`
}

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `~${mins} min`
  const hrs = Math.floor(mins / 60)
  const remainMins = mins % 60
  return remainMins > 0 ? `~${hrs}h ${remainMins}min` : `~${hrs}h`
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-SG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function DriverRoutePage({
  params,
}: {
  params: Promise<{ routeId: string }>
}) {
  const [routeId, setRouteId] = useState<string | null>(null)
  const [route, setRoute] = useState<DriverRoute | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [checkedStops, setCheckedStops] = useState<Set<string>>(new Set())
  const [today] = useState(() => formatDate(new Date()))

  useEffect(() => {
    params.then(({ routeId: rid }) => {
      setRouteId(rid)
    })
  }, [params])

  useEffect(() => {
    if (!routeId) return

    const parsed = parseRouteId(routeId)
    if (!parsed) {
      setNotFound(true)
      return
    }

    const loaded = getDriverRoute(parsed.planId, parsed.driverIndex)
    if (!loaded) {
      setNotFound(true)
      return
    }

    setRoute(loaded)
  }, [routeId])

  function toggleStop(stopId: string) {
    setCheckedStops((prev) => {
      const next = new Set(prev)
      if (next.has(stopId)) {
        next.delete(stopId)
      } else {
        next.add(stopId)
      }
      return next
    })
  }

  if (notFound) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 bg-white">
        <div className="text-center max-w-sm">
          <div className="text-6xl mb-4">📦</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Route not found</h1>
          <p className="text-lg text-gray-600 leading-relaxed">
            Ask your dispatcher for a new link to your route.
          </p>
        </div>
      </main>
    )
  }

  if (!route) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 bg-white">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-lg text-gray-600">Loading your route...</p>
        </div>
      </main>
    )
  }

  const deliveryStops = route.stops.filter((s) => s.id !== '__depot__')
  const allAddresses = deliveryStops.map((s) => s.address)
  const mapsUrls = buildGoogleMapsUrls(allAddresses)
  const deliveredCount = deliveryStops.filter((s) => checkedStops.has(s.id)).length
  const totalCount = deliveryStops.length
  const progressPercent = totalCount > 0 ? Math.round((deliveredCount / totalCount) * 100) : 0

  return (
    <main className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="bg-green-600 text-white px-4 py-4 flex items-center justify-between shadow-md sticky top-0 z-10">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-green-100 leading-none mb-1">
            RouteFlow
          </div>
          <div className="text-xl font-bold leading-tight">{route.driverName}</div>
        </div>
        <div className="text-right">
          <div className="text-sm text-green-100">{today}</div>
          <div className="text-sm font-semibold text-white mt-0.5">
            {deliveredCount}/{totalCount} done
          </div>
        </div>
      </header>

      <div className="flex flex-col flex-1 px-4 pt-4 pb-8 gap-4">
        {/* Summary bar */}
        <div className="bg-gray-50 rounded-2xl px-5 py-3 flex items-center justify-between border border-gray-100">
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">{totalCount}</div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Stops</div>
          </div>
          <div className="h-8 w-px bg-gray-200" />
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {formatDistance(route.totalDistanceMeters)}
            </div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Distance</div>
          </div>
          <div className="h-8 w-px bg-gray-200" />
          <div className="text-center">
            <div className="text-2xl font-bold text-gray-900">
              {formatDuration(route.totalDurationSeconds)}
            </div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Est. time</div>
          </div>
        </div>

        {/* Big Navigate button(s) — split into parts if >25 stops */}
        {totalCount > 0 && mapsUrls.length === 1 && (
          <a
            href={mapsUrls[0]}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-center font-bold text-xl rounded-2xl py-5 shadow-lg transition-colors"
            style={{ minHeight: '72px', lineHeight: '1.2' }}
          >
            Navigate All Stops
            <span className="block text-sm font-normal text-green-100 mt-1">
              Opens Google Maps with full route
            </span>
          </a>
        )}
        {totalCount > 0 && mapsUrls.length > 1 && (
          <div className="flex flex-col gap-2">
            {mapsUrls.map((url, partIdx) => {
              const partStart = partIdx * 24 + 1;
              const partEnd = Math.min(partStart + 24, totalCount);
              return (
                <a
                  key={partIdx}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-center font-bold text-lg rounded-2xl py-4 shadow-lg transition-colors"
                  style={{ minHeight: '60px', lineHeight: '1.2' }}
                >
                  Navigate Part {partIdx + 1} (stops {partStart}-{partEnd})
                  <span className="block text-sm font-normal text-green-100 mt-1">
                    Opens Google Maps
                  </span>
                </a>
              );
            })}
          </div>
        )}

        {/* Progress bar */}
        {totalCount > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">
                {deliveredCount} of {totalCount} delivered
              </span>
              <span className="text-sm font-bold text-green-600">{progressPercent}%</span>
            </div>
            <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-3 bg-green-500 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Stop list */}
        {totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 text-center py-12">
            <div className="text-5xl mb-3">✅</div>
            <p className="text-xl font-semibold text-gray-700">No stops assigned</p>
            <p className="text-gray-500 mt-1">Contact your dispatcher for details.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <h2 className="text-base font-semibold text-gray-500 uppercase tracking-wide">
              Stops
            </h2>
            {deliveryStops.map((stop, idx) => {
              const isChecked = checkedStops.has(stop.id)
              const singleUrl = buildSingleStopUrl(stop.address)

              return (
                <div
                  key={stop.id}
                  className={`rounded-2xl border-2 transition-colors ${
                    isChecked
                      ? 'bg-green-50 border-green-300'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-start gap-3 px-4 py-4">
                    {/* Tap-to-check area */}
                    <button
                      onClick={() => toggleStop(stop.id)}
                      className="flex-shrink-0 flex items-center justify-center w-11 h-11 rounded-full border-2 border-gray-300 transition-colors focus:outline-none focus:ring-2 focus:ring-green-400"
                      style={{
                        backgroundColor: isChecked ? '#22c55e' : 'white',
                        borderColor: isChecked ? '#22c55e' : '#d1d5db',
                      }}
                      aria-label={isChecked ? 'Mark as undelivered' : 'Mark as delivered'}
                    >
                      {isChecked ? (
                        <svg
                          className="w-6 h-6 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      ) : (
                        <span className="text-sm font-bold text-gray-500">{idx + 1}</span>
                      )}
                    </button>

                    {/* Address and label */}
                    <div className="flex-1 min-w-0">
                      {stop.label && (
                        <div
                          className={`text-xs font-semibold uppercase tracking-wide mb-0.5 ${
                            isChecked ? 'text-green-600' : 'text-gray-400'
                          }`}
                        >
                          {stop.label}
                        </div>
                      )}
                      <div
                        className={`text-base font-semibold leading-snug ${
                          isChecked
                            ? 'line-through text-gray-400'
                            : 'text-gray-900'
                        }`}
                      >
                        {stop.address}
                      </div>
                    </div>

                    {/* Navigate button */}
                    <a
                      href={singleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 flex items-center gap-1 px-3 py-2 bg-blue-50 text-blue-700 font-semibold text-sm rounded-xl border border-blue-200 active:bg-blue-100 transition-colors"
                      style={{ minHeight: '44px' }}
                      aria-label={`Navigate to ${stop.address}`}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                        />
                      </svg>
                      Go
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
