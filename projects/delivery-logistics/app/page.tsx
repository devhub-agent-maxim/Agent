import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight">RouteFlow</h1>
        <p className="mt-4 text-xl text-gray-600">
          Optimize your delivery routes
        </p>
        <Link
          href="/dashboard"
          className="mt-8 inline-block rounded-lg bg-blue-600 px-6 py-3 text-lg font-medium text-white transition hover:bg-blue-700"
        >
          Go to Dashboard
        </Link>
      </div>
    </main>
  );
}
