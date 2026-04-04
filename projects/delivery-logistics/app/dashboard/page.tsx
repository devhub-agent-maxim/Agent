'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import AddressInput from '../components/AddressInput';
import DriverSettings from '../components/DriverSettings';
import RouteResults from '../components/RouteResults';
import type { DriverRoute, MultiDriverPlan } from '../../src/routes/multi-driver';
import { saveRoute, getRoute } from '../../src/lib/route-storage';
import { createSupabaseClient } from '../../src/lib/supabase';

type Step = 'input' | 'loading' | 'results';

const DEMO_ADDRESSES = [
  // Jurong West / Jurong East
  'Block 101 Jurong West Street 41, Singapore 640101',
  'Block 203 Jurong West Avenue 1, Singapore 640203',
  'Block 305 Jurong West Street 81, Singapore 640305',
  'Block 407 Jurong East Street 13, Singapore 600407',
  'Block 512 Jurong East Avenue 1, Singapore 600512',
  'Block 618 Jurong West Street 61, Singapore 640618',
  'Block 724 Jurong West Street 72, Singapore 640724',
  'Block 830 Jurong East Street 32, Singapore 600830',
  'Block 111 Boon Lay Drive, Singapore 640111',
  'Block 212 Boon Lay Way, Singapore 640212',
  // Tampines
  'Block 103 Tampines Street 11, Singapore 520103',
  'Block 207 Tampines Street 21, Singapore 520207',
  'Block 312 Tampines Street 32, Singapore 520312',
  'Block 418 Tampines Street 42, Singapore 520418',
  'Block 523 Tampines Street 45, Singapore 520523',
  'Block 631 Tampines Street 61, Singapore 520631',
  'Block 737 Tampines Street 71, Singapore 520737',
  'Block 843 Tampines Street 83, Singapore 520843',
  'Block 149 Tampines Avenue 5, Singapore 520149',
  'Block 255 Tampines Central 1, Singapore 520255',
  // Pasir Ris
  'Block 101 Pasir Ris Street 11, Singapore 510101',
  'Block 205 Pasir Ris Street 21, Singapore 510205',
  'Block 312 Pasir Ris Street 51, Singapore 510312',
  'Block 418 Pasir Ris Street 71, Singapore 510418',
  'Block 524 Pasir Ris Drive 1, Singapore 510524',
  // Bedok
  'Block 101 Bedok North Street 2, Singapore 460101',
  'Block 203 Bedok North Road, Singapore 460203',
  'Block 315 Bedok South Avenue 2, Singapore 460315',
  'Block 422 New Upper Changi Road, Singapore 462422',
  'Block 537 Bedok North Avenue 3, Singapore 460537',
  'Block 641 Chai Chee Street, Singapore 461641',
  'Block 748 Bedok Reservoir Road, Singapore 470748',
  // Woodlands
  'Block 101 Woodlands Street 13, Singapore 730101',
  'Block 207 Woodlands Drive 14, Singapore 730207',
  'Block 318 Woodlands Avenue 1, Singapore 730318',
  'Block 423 Woodlands Circle, Singapore 730423',
  'Block 531 Woodlands Drive 50, Singapore 730531',
  'Block 636 Woodlands Street 82, Singapore 730636',
  'Block 742 Woodlands Drive 62, Singapore 730742',
  // Sembawang
  'Block 101 Sembawang Drive, Singapore 750101',
  'Block 207 Sembawang Crescent, Singapore 750207',
  'Block 313 Sembawang Vista, Singapore 750313',
  // Yishun
  'Block 101 Yishun Avenue 5, Singapore 760101',
  'Block 205 Yishun Ring Road, Singapore 760205',
  'Block 312 Yishun Street 20, Singapore 760312',
  'Block 418 Yishun Avenue 11, Singapore 760418',
  'Block 525 Yishun Street 43, Singapore 760525',
  'Block 631 Yishun Street 61, Singapore 760631',
  'Block 737 Yishun Ring Road, Singapore 760737',
  // Ang Mo Kio
  'Block 101 Ang Mo Kio Avenue 4, Singapore 560101',
  'Block 207 Ang Mo Kio Avenue 6, Singapore 560207',
  'Block 315 Ang Mo Kio Avenue 10, Singapore 560315',
  'Block 422 Ang Mo Kio Avenue 3, Singapore 560422',
  'Block 530 Ang Mo Kio Street 21, Singapore 560530',
  'Block 638 Ang Mo Kio Avenue 1, Singapore 560638',
  // Bishan
  'Block 101 Bishan Street 11, Singapore 570101',
  'Block 208 Bishan Street 13, Singapore 570208',
  'Block 314 Bishan Street 22, Singapore 570314',
  'Block 420 Bishan Street 23, Singapore 570420',
  // Toa Payoh
  'Block 101 Toa Payoh Lorong 1, Singapore 310101',
  'Block 207 Toa Payoh Lorong 4, Singapore 310207',
  'Block 313 Toa Payoh Lorong 7, Singapore 310313',
  'Block 419 Toa Payoh Lorong 8, Singapore 310419',
  'Block 525 Toa Payoh Central, Singapore 310525',
  // Punggol
  'Block 101 Punggol Field, Singapore 820101',
  'Block 207 Punggol Central, Singapore 820207',
  'Block 312 Punggol Drive, Singapore 820312',
  'Block 418 Punggol Walk, Singapore 820418',
  'Block 525 Punggol Place, Singapore 820525',
  'Block 631 Edgedale Plains, Singapore 820631',
  'Block 737 Northshore Drive, Singapore 820737',
  // Sengkang
  'Block 101 Sengkang East Way, Singapore 540101',
  'Block 208 Sengkang East Road, Singapore 540208',
  'Block 315 Compassvale Drive, Singapore 540315',
  'Block 421 Rivervale Drive, Singapore 540421',
  'Block 528 Anchorvale Lane, Singapore 540528',
  'Block 634 Fernvale Road, Singapore 540634',
  // Hougang
  'Block 101 Hougang Avenue 4, Singapore 530101',
  'Block 207 Hougang Avenue 7, Singapore 530207',
  'Block 314 Hougang Street 22, Singapore 530314',
  'Block 420 Hougang Avenue 10, Singapore 530420',
  'Block 527 Hougang Street 52, Singapore 530527',
  // Serangoon
  'Block 101 Serangoon Avenue 2, Singapore 550101',
  'Block 208 Serangoon North Avenue 4, Singapore 550208',
  'Block 314 Serangoon Central Drive, Singapore 550314',
  // Queenstown
  'Block 101 Queenstown Road, Singapore 160101',
  'Block 208 Commonwealth Avenue, Singapore 140208',
  'Block 314 Mei Ling Street, Singapore 140314',
  'Block 420 Margaret Drive, Singapore 149420',
  // Bukit Merah
  'Block 101 Henderson Road, Singapore 159101',
  'Block 207 Bukit Merah View, Singapore 151207',
  'Block 313 Telok Blangah Street 31, Singapore 100313',
  'Block 419 Redhill Close, Singapore 158419',
  'Block 525 Tiong Bahru Road, Singapore 168525',
  // Bukit Panjang
  'Block 101 Bukit Panjang Road, Singapore 679101',
  'Block 208 Pending Road, Singapore 678208',
  'Block 315 Segar Road, Singapore 677315',
  'Block 421 Fajar Road, Singapore 678421',
  // Choa Chu Kang
  'Block 101 Choa Chu Kang Avenue 1, Singapore 680101',
  'Block 207 Choa Chu Kang North 5, Singapore 689207',
  'Block 313 Choa Chu Kang Street 52, Singapore 689313',
  'Block 419 Yew Tee Avenue, Singapore 688419',
  'Block 525 Teck Whye Lane, Singapore 688525',
  // Bukit Batok
  'Block 101 Bukit Batok West Avenue 6, Singapore 650101',
  'Block 207 Bukit Batok Street 21, Singapore 650207',
  'Block 313 Bukit Batok East Avenue 3, Singapore 650313',
  'Block 419 Bukit Batok West Avenue 8, Singapore 650419',
  // Clementi
  'Block 101 Clementi Avenue 3, Singapore 120101',
  'Block 207 Clementi Avenue 4, Singapore 120207',
  'Block 314 West Coast Road, Singapore 127314',
  'Block 421 Clementi Street 13, Singapore 120421',
  // Marine Parade / Geylang / Kallang
  'Block 101 Marine Parade Road, Singapore 449101',
  'Block 207 Marine Crescent, Singapore 449207',
  'Block 313 Geylang Bahru Lane, Singapore 339313',
  'Block 419 Kallang Avenue, Singapore 339419',
  'Block 525 Balam Road, Singapore 370525',
  'Block 631 Guillemard Road, Singapore 399631',
  // Novena / Balestier
  'Block 101 Balestier Road, Singapore 329101',
  'Block 207 Moulmein Road, Singapore 308207',
  'Block 313 Thomson Road, Singapore 307313',
  // Buona Vista / one-north
  'Block 101 Holland Drive, Singapore 270101',
  'Block 208 Holland Avenue, Singapore 278208',
  'Block 314 Ghim Moh Road, Singapore 270314',
  // Kovan / Bartley
  'Block 101 Kovan Road, Singapore 548101',
  'Block 207 Bartley Road, Singapore 539207',
  'Block 314 Upper Paya Lebar Road, Singapore 534314',
  // Simei / Changi
  'Block 101 Simei Street 1, Singapore 520101',
  'Block 207 Simei Avenue, Singapore 529207',
  'Block 314 Tampines Avenue 10, Singapore 529314',
  // Jurong Island / Pioneer
  'Block 101 Pioneer Road, Singapore 639101',
  'Block 207 Tuas Avenue 1, Singapore 638207',
  // Additional spread
  'Block 412 Pandan Gardens, Singapore 609412',
  'Block 523 Jurong West Street 52, Singapore 640523',
  'Block 634 Bukit Batok Central, Singapore 650634',
  'Block 745 Bukit Panjang Ring Road, Singapore 670745',
  'Block 856 Woodlands Avenue 5, Singapore 738856',
];

const DEMO_DRIVER_NAMES = ['Ahmad', 'Wei Ming', 'Ravi', 'Siti', 'Kumar'];
const DEMO_DEPOT = 'Block 1 Toa Payoh Industrial Park, Singapore 319384';

interface ApiRouteShape {
  stops: DriverRoute['stops'];
  segments: DriverRoute['segments'];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
}

interface ApiResponse {
  mock?: boolean;
  message?: string;
  plan?: {
    routes: DriverRoute[];
    totalStops: number;
    totalDrivers: number;
    totalDistanceMeters: number;
    totalDurationSeconds: number;
  };
  routes?: DriverRoute[];
  route?: ApiRouteShape;
  error?: string;
}

function normalizeToDriverRoutes(data: ApiResponse, driverCount: number, names: string[]): DriverRoute[] {
  if (data.plan?.routes && data.plan.routes.length > 0) {
    return data.plan.routes.map((r, i) => ({ ...r, driverName: names[i] || r.driverName }));
  }
  if (data.routes && data.routes.length > 0) {
    return data.routes.map((r, i) => ({ ...r, driverName: names[i] || r.driverName }));
  }
  if (data.route) {
    const allStops = data.route.stops;
    const effective = Math.min(driverCount, Math.max(1, allStops.length));
    const buckets: DriverRoute['stops'][] = Array.from({ length: effective }, () => []);
    allStops.forEach((stop, i) => { buckets[i % effective].push(stop); });
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

async function saveRouteToSupabase(plan: MultiDriverPlan, userId: string): Promise<void> {
  const supabase = createSupabaseClient();
  if (!supabase) return;

  await supabase.from('routes').insert({
    user_id: userId,
    plan_data: plan,
    total_stops: plan.totalStops,
    total_drivers: plan.totalDrivers,
    name: null,
  });
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>('input');
  const [addresses, setAddresses] = useState<string[]>([]);
  const [driverCount, setDriverCount] = useState(3);
  const [driverNames, setDriverNames] = useState<string[]>(['Driver 1', 'Driver 2', 'Driver 3']);
  const [depotAddress, setDepotAddress] = useState('');
  const [routes, setRoutes] = useState<DriverRoute[]>([]);
  const [planId, setPlanId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isMockData, setIsMockData] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Check auth state on mount
  useEffect(() => {
    const supabase = createSupabaseClient();
    if (!supabase) return;

    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => { subscription.unsubscribe(); };
  }, []);

  // Load a plan from localStorage if ?loadPlan=<id> is present
  useEffect(() => {
    const loadPlanId = searchParams.get('loadPlan');
    if (!loadPlanId) return;

    const plan = getRoute(loadPlanId);
    if (!plan) return;

    setPlanId(loadPlanId);
    setRoutes(plan.routes);
    setAddresses(plan.routes.flatMap((r) => r.stops.map((s) => s.address)));
    setDriverCount(plan.totalDrivers);
    setDriverNames(plan.routes.map((r) => r.driverName));
    setStep('results');

    // Clean up query param without triggering a full navigation
    router.replace('/dashboard', { scroll: false });
  }, [searchParams, router]);

  const canOptimize = addresses.length >= 1;

  async function handleOptimize() {
    if (!canOptimize) return;
    setStep('loading');
    setError(null);
    setSaveStatus('idle');

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

      // Also persist to Supabase if user is authenticated
      if (user) {
        setSaveStatus('saving');
        try {
          await saveRouteToSupabase(plan, user.id);
          setSaveStatus('saved');
        } catch {
          setSaveStatus('error');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setStep('input');
    }
  }

  const handleSaveManually = useCallback(async () => {
    if (!user || step !== 'results') return;
    const plan = getRoute(planId);
    if (!plan) return;

    setSaveStatus('saving');
    try {
      await saveRouteToSupabase(plan, user.id);
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
  }, [user, step, planId]);

  function handleReset() {
    setStep('input');
    setRoutes([]);
    setPlanId('');
    setError(null);
    setIsMockData(false);
    setSaveStatus('idle');
  }

  function handleLoadDemo() {
    setAddresses(DEMO_ADDRESSES);
    setDriverCount(3);
    setDriverNames(DEMO_DRIVER_NAMES);
    setDepotAddress(DEMO_DEPOT);
  }

  async function handleSignOut() {
    const supabase = createSupabaseClient();
    if (supabase) await supabase.auth.signOut();
    setUser(null);
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

          {/* Auth controls */}
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <Link
                  href="/dashboard/history"
                  className="text-sm text-slate-400 hover:text-white transition-colors hidden sm:block"
                >
                  Route history
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="text-sm text-slate-400 hover:text-white transition-colors"
                >
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="text-sm text-slate-400 hover:text-white transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  href="/auth/signup"
                  className="px-3 py-1.5 text-sm font-medium rounded-lg bg-green-600/20 border border-green-500/30 text-green-400 hover:bg-green-600/30 transition-colors"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
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
              <div className="flex flex-wrap gap-2 items-center">
                {isMockData && (
                  <span className="self-center px-2.5 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs font-medium">
                    Demo data — set API key for real routes
                  </span>
                )}

                {/* Save to Supabase button (only when logged in and not auto-saved) */}
                {user && saveStatus !== 'saved' && (
                  <button
                    type="button"
                    onClick={handleSaveManually}
                    disabled={saveStatus === 'saving'}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-green-600/20 border border-green-500/30 text-green-400 hover:bg-green-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'error' ? 'Retry save' : 'Save route'}
                  </button>
                )}
                {user && saveStatus === 'saved' && (
                  <span className="self-center px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-medium">
                    Saved to history
                  </span>
                )}
                {!user && (
                  <Link
                    href="/auth/login"
                    className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-600 text-slate-400 hover:border-slate-500 hover:text-white transition-colors"
                  >
                    Sign in to save
                  </Link>
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
                  Load demo (150 SG addresses)
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
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
                <AddressInput addresses={addresses} onChange={setAddresses} />
              </div>
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
              {!user && (
                <p className="text-xs text-slate-500">
                  <Link href="/auth/login" className="text-slate-400 hover:text-white underline">Sign in</Link> to save routes to your history.
                </p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <svg className="w-8 h-8 animate-spin text-green-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
