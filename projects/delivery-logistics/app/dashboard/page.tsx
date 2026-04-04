'use client';

import { useState } from 'react';
import AddressInput from '../components/AddressInput';
import DriverSettings from '../components/DriverSettings';
import RouteResults from '../components/RouteResults';
import type { DriverRoute, MultiDriverPlan } from '../../src/routes/multi-driver';
import { saveRoute } from '../../src/lib/route-storage';

type Step = 'input' | 'loading' | 'results';

const DEMO_ADDRESSES = [
  'Block 123 Jurong East Street 13, Singapore 600123',
  'Block 456 Tampines Street 42, Singapore 520456',
  'Block 789 Woodlands Drive 14, Singapore 730789',
  'Block 234 Clementi Avenue 3, Singapore 120234',
  'Block 567 Bedok North Street 3, Singapore 460567',
  'Block 890 Ang Mo Kio Avenue 10, Singapore 560890',
  'Block 111 Toa Payoh Lorong 1, Singapore 310111',
  'Block 333 Bishan Street 13, Singapore 570333',
  'Block 555 Punggol Central, Singapore 820555',
  'Block 777 Pasir Ris Street 71, Singapore 510777',
  'Block 222 Bukit Batok West Avenue 6, Singapore 650222',
  'Block 444 Yishun Ring Road, Singapore 760444',
  'Block 666 Hougang Avenue 4, Singapore 530666',
  'Block 888 Sengkang East Way, Singapore 540888',
  'Block 100 Queenstown Road, Singapore 160100',
];

const DEMO_DRIVER_NAMES = ['Ahmad', 'Wei Ming', 'Ravi'];
const DEMO_DEPOT = 'Block 1 Toa Payoh Industrial Park, Singapore 319384';

// The optimize API returns either a multi-driver plan or a single mock route.
// We normalize both into DriverRoute[] so the UI is consistent.
interface ApiRouteShape {
  stops: DriverRoute['stops'];
  segments: DriverRoute['segments'];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
}

interface ApiResponse {
  mock?: boolean;
  message?: string;
  // Wrapped plan shape (returned by optimize API)
  plan?: {
    routes: DriverRoute[];
    totalStops: number;
    totalDrivers: number;
    totalDistanceMeters: number;
    totalDurationSeconds: number;
  };
  // Multi-driver shape (flat)
  routes?: DriverRoute[];
  // Single-route shape
  route?: ApiRouteShape;
  error?: string;
}

function normalizeToDriverRoutes(data: ApiResponse, driverCount: number, names: string[]): DriverRoute[] {
  // Wrapped plan shape (from optimize API)
  if (data.plan?.routes && data.plan.routes.length > 0) {
    return data.plan.routes.map((r, i) => ({
      ...r,
      driverName: names[i] || r.driverName,
    }));
  }

  // Multi-driver shape (flat)
  if (data.routes && data.routes.length > 0) {
    return data.routes.map((r, i) => ({
      ...r,
      driverName: names[i] || r.driverName,
    }));
  }

  // Single-route shape — distribute stops round-robin across drivers
  if (data.route) {
    const allStops = data.route.stops;
    const effective = Math.min(driverCount, Math.max(1, allStops.length));
    const buckets: DriverRoute['stops'][] = Array.from({ length: effective }, () => []);

    allStops.forEach((stop, i) => {
      buckets[i % effective].push(stop);
    });

    return buckets.map((stops, i) => {
      const perStopDist = allStops.length > 0 ? data.route!.totalDistanceMeters / allStops.length : 0;
      const perStopDur = allStops.length > 0 ? data.route!.totalDurationSeconds / allStops.length : 0;
      return {
        driverId: `driver-${i + 1}`,
        driverName: names[i] || `Driver ${i + 1}`,
        stops,
        segments: [],
        totalDistanceMeters: Math.round(stops.length * perStopDist),
        totalDurationSeconds: Math.round(stops.length * perStopDur),
      };
    });
  }

  return [];
}

export default function DashboardPage() {
  const [step, setStep] = useState<Step>('input');
  const [addresses, setAddresses] = useState<string[]>([]);
  const [driverCount, setDriverCount] = useState(3);
  const [driverNames, setDriverNames] = useState<string[]>(['Driver 1', 'Driver 2', 'Driver 3']);
  const [depotAddress, setDepotAddress] = useState('');
  const [routes, setRoutes] = useState<DriverRoute[]>([]);
  const [planId, setPlanId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isMockData, setIsMockData] = useState(false);

  const canOptimize = addresses.length >= 1;

  async function handleOptimize() {
    if (!canOptimize) return;
    setStep('loading');
    setError(null);

    try {
      const res = await fetch('/api/routes/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          addresses,
          driverCount,
          ...(depotAddress.trim() ? { depotAddress: depotAddress.trim() } : {}),
        }),
      });

      const data: ApiResponse = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error ?? `Server error: ${res.status}`);
      }

      const normalizedRoutes = normalizeToDriverRoutes(data, driverCount, driverNames);

      if (normalizedRoutes.length === 0) {
        throw new Error('No routes returned from the server.');
      }

      // Build a MultiDriverPlan to persist in localStorage
      const plan: MultiDriverPlan = {
        routes: normalizedRoutes,
        totalStops: addresses.length,
        totalDrivers: driverCount,
        totalDistanceMeters: normalizedRoutes.reduce((s, r) => s + r.totalDistanceMeters, 0),
        totalDurationSeconds: normalizedRoutes.reduce((s, r) => s + r.totalDurationSeconds, 0),
      };

      const id = saveRoute(plan);
      setPlanId(id);
      setRoutes(normalizedRoutes);
      setIsMockData(!!data.mock);
      setStep('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setStep('input');
    }
  }

  function handleReset() {
    setStep('input');
    setRoutes([]);
    setPlanId('');
    setError(null);
    setIsMockData(false);
  }

  function handleLoadDemo() {
    setAddresses(DEMO_ADDRESSES);
    setDriverCount(3);
    setDriverNames(DEMO_DRIVER_NAMES);
    setDepotAddress(DEMO_DEPOT);
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-white">
      {/* Header */}
      <header className="border-b border-slate-800 px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-green-500 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight">RouteFlow</span>
          </div>
          <span className="text-xs text-slate-500 hidden sm:block">
            Singapore delivery route optimization
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {step === 'results' ? (
          /* ---- RESULTS VIEW ---- */
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h1 className="text-2xl font-bold">Routes planned</h1>
                <p className="text-slate-400 text-sm mt-0.5">
                  {addresses.length} stops across {routes.length} driver{routes.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex gap-2">
                {isMockData && (
                  <span className="self-center px-2.5 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs font-medium">
                    Demo data — set API key for real routes
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-600 text-slate-300 hover:border-slate-400 hover:text-white transition-colors"
                >
                  Plan new routes
                </button>
              </div>
            </div>

            <RouteResults routes={routes} planId={planId} driverNames={driverNames} />
          </div>
        ) : (
          /* ---- INPUT VIEW ---- */
          <div className="space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <h1 className="text-2xl font-bold">Plan today&apos;s routes</h1>
                <p className="text-slate-400 text-sm mt-1">
                  Add delivery addresses, set your drivers, and get optimized routes in seconds.
                </p>
              </div>
              {addresses.length === 0 && (
                <button
                  type="button"
                  onClick={handleLoadDemo}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600/30 transition-colors"
                >
                  🚀 Load demo (15 SG addresses)
                </button>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: Address input */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
                <AddressInput addresses={addresses} onChange={setAddresses} />
              </div>

              {/* Right: Driver settings */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
                <DriverSettings
                  driverCount={driverCount}
                  driverNames={driverNames}
                  depotAddress={depotAddress}
                  onDriverCountChange={setDriverCount}
                  onDriverNamesChange={setDriverNames}
                  onDepotAddressChange={setDepotAddress}
                />
              </div>
            </div>

            {/* Action button */}
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={handleOptimize}
                disabled={!canOptimize || step === 'loading'}
                className="w-full max-w-sm py-3.5 px-6 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 text-base"
              >
                {step === 'loading' ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Optimizing routes...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Plan Routes
                  </>
                )}
              </button>
              {!canOptimize && (
                <p className="text-xs text-slate-500">Add at least 1 delivery address to continue.</p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
