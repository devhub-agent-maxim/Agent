'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';
import type { RouteListItem } from '@/types/database';
import type { MultiDriverPlan } from '@/routes/multi-driver';
import { saveRoute } from '@/lib/route-storage';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-SG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HistoryPage() {
  const router = useRouter();
  const [routes, setRoutes] = useState<RouteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingRouteId, setLoadingRouteId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = createSupabaseClient();
      if (!supabase) {
        setError('Authentication is not configured.');
        setLoading(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/auth/login');
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('routes')
        .select('id, user_id, total_stops, total_drivers, created_at, name')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setRoutes((data ?? []) as RouteListItem[]);
      }

      setLoading(false);
    }

    load();
  }, [router]);

  async function handleLoadRoute(routeId: string) {
    setLoadingRouteId(routeId);

    const supabase = createSupabaseClient();
    if (!supabase) return;

    const { data, error: fetchError } = await supabase
      .from('routes')
      .select('plan_data')
      .eq('id', routeId)
      .single();

    if (fetchError || !data) {
      setLoadingRouteId(null);
      return;
    }

    // Save the plan to localStorage so the dashboard can read it, then navigate
    const planId = saveRoute(data.plan_data as MultiDriverPlan);
    router.push(`/dashboard?loadPlan=${planId}`);
  }

  async function handleSignOut() {
    const supabase = createSupabaseClient();
    if (supabase) await supabase.auth.signOut();
    router.push('/dashboard');
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-white">
      {/* Header */}
      <header className="border-b border-slate-800 px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-green-500 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight">RouteFlow</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Dashboard
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="text-sm text-slate-400 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Route history</h1>
          <p className="text-slate-400 text-sm mt-1">
            Your saved routes. Click any route to load it back into the dashboard.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <svg className="w-6 h-6 animate-spin text-green-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span className="ml-3 text-slate-400">Loading routes...</span>
          </div>
        )}

        {!loading && error && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
            <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}

        {!loading && !error && routes.length === 0 && (
          <div className="text-center py-20">
            <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            </div>
            <p className="text-slate-400 font-medium">No saved routes yet</p>
            <p className="text-slate-500 text-sm mt-1">Plan routes on the dashboard and save them to see them here.</p>
            <Link
              href="/dashboard"
              className="inline-block mt-4 px-4 py-2 text-sm font-medium rounded-lg bg-green-600 hover:bg-green-500 transition-colors"
            >
              Go to dashboard
            </Link>
          </div>
        )}

        {!loading && !error && routes.length > 0 && (
          <div className="space-y-3">
            {routes.map((route) => (
              <button
                key={route.id}
                type="button"
                onClick={() => handleLoadRoute(route.id)}
                disabled={loadingRouteId === route.id}
                className="w-full text-left bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-xl px-5 py-4 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate">
                      {route.name ?? `Route — ${formatDate(route.created_at)}`}
                    </p>
                    <p className="text-slate-400 text-sm mt-0.5">
                      {route.total_stops} stop{route.total_stops !== 1 ? 's' : ''} &middot; {route.total_drivers} driver{route.total_drivers !== 1 ? 's' : ''}
                    </p>
                    <p className="text-slate-600 text-xs mt-1">{formatDate(route.created_at)}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2 text-slate-400">
                    {loadingRouteId === route.id ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
