"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";

// Invoices with OCR confidence below this are flagged as low-confidence exceptions
const LOW_CONFIDENCE_THRESHOLD = 0.7;

type InvoiceItem = {
  id: string;
  invoiceNumber: string;
  totalAmount: unknown;
  dueDate: Date | string;
  ocrConfidence: number | null;
  purchaseOrderId: string | null;
  vendor: { name: string };
};

type ExceptionReason = "low_confidence" | "no_po_match";

function getExceptionReasons(inv: InvoiceItem): ExceptionReason[] {
  const reasons: ExceptionReason[] = [];
  if (inv.ocrConfidence === null || inv.ocrConfidence < LOW_CONFIDENCE_THRESHOLD) {
    reasons.push("low_confidence");
  }
  if (!inv.purchaseOrderId) {
    reasons.push("no_po_match");
  }
  return reasons;
}

function formatAmount(amt: unknown): string {
  const n = typeof amt === "string" ? parseFloat(amt) : Number(amt);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ExceptionsPage() {
  // Load all pending invoices, then filter client-side for exceptions
  const q = trpc.invoice.list.useQuery({ status: "pending", limit: 100 });
  const items = (q.data?.items ?? []) as InvoiceItem[];

  const exceptions = items
    .map((inv) => ({ inv, reasons: getExceptionReasons(inv) }))
    .filter(({ reasons }) => reasons.length > 0);

  const lowConfidenceCount = exceptions.filter(({ reasons }) =>
    reasons.includes("low_confidence")
  ).length;
  const noPOCount = exceptions.filter(({ reasons }) => reasons.includes("no_po_match")).length;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 bg-white border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">Exception Queue</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Invoices needing manual review before processing
        </p>
      </div>

      {/* Stats */}
      <div className="px-6 py-4 flex gap-4">
        <div className="card p-4 flex-1">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Exceptions</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{exceptions.length}</p>
        </div>
        <div className="card p-4 flex-1">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Low Confidence</p>
          <p className="text-3xl font-bold text-red-600 mt-1">{lowConfidenceCount}</p>
        </div>
        <div className="card p-4 flex-1">
          <p className="text-xs text-gray-500 uppercase tracking-wide">No PO Match</p>
          <p className="text-3xl font-bold text-amber-600 mt-1">{noPOCount}</p>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-6 pb-8">
        {q.isLoading ? (
          <div className="text-center text-gray-400 text-sm py-12">Loading…</div>
        ) : exceptions.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">✓</p>
            <p className="text-gray-500 font-medium">No exceptions — all invoices look good!</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Vendor
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Invoice #
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Due Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Issues
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Confidence
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {exceptions.map(({ inv, reasons }) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{inv.vendor.name}</td>
                    <td className="px-4 py-3 text-gray-600">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatAmount(inv.totalAmount)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(inv.dueDate)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {reasons.includes("low_confidence") && (
                          <span className="badge bg-red-100 text-red-700">Low confidence</span>
                        )}
                        {reasons.includes("no_po_match") && (
                          <span className="badge bg-amber-100 text-amber-700">No PO</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {inv.ocrConfidence !== null ? (
                        <span
                          className={`font-medium ${
                            inv.ocrConfidence < 0.5
                              ? "text-red-600"
                              : inv.ocrConfidence < LOW_CONFIDENCE_THRESHOLD
                              ? "text-yellow-600"
                              : "text-gray-600"
                          }`}
                        >
                          {Math.round(inv.ocrConfidence * 100)}%
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="btn-primary text-xs"
                      >
                        Review →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
