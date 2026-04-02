"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";

function formatAmount(amt: unknown): string {
  const n = typeof amt === "string" ? parseFloat(amt) : Number(amt);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "badge bg-yellow-100 text-yellow-800",
    approved: "badge bg-green-100 text-green-800",
    rejected: "badge bg-red-100 text-red-800",
    paid: "badge bg-blue-100 text-blue-800",
    void: "badge bg-gray-100 text-gray-600",
  };
  return <span className={styles[status] ?? "badge bg-gray-100 text-gray-600"}>{status}</span>;
}

function ConfidenceMeter({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray-400 text-sm">—</span>;
  const pct = Math.round(score * 100);
  const color = pct >= 90 ? "bg-green-500" : pct >= 70 ? "bg-yellow-400" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-medium text-gray-700 w-10 text-right">{pct}%</span>
    </div>
  );
}

// GL Code selector for a single line item
function GlCodeSelector({
  lineItemId,
  currentGlCodeId,
  vendorId,
}: {
  lineItemId: string;
  currentGlCodeId: string | null;
  vendorId: string;
}) {
  const allCodes = trpc.glcode.list.useQuery();
  const suggested = trpc.glcode.vendorHistory.useQuery({ vendorId });

  const [selected, setSelected] = useState(currentGlCodeId ?? "");

  const suggestedIds = new Set((suggested.data ?? []).map((c) => c.id));
  const all = allCodes.data ?? [];

  return (
    <select
      value={selected}
      onChange={(e) => setSelected(e.target.value)}
      className="text-sm border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      <option value="">No GL code</option>

      {suggested.data && suggested.data.length > 0 && (
        <optgroup label="Suggested (vendor history)">
          {suggested.data.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.description}
            </option>
          ))}
        </optgroup>
      )}

      <optgroup label="All GL codes">
        {all
          .filter((c) => !suggestedIds.has(c.id))
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.description}
            </option>
          ))}
      </optgroup>
    </select>
  );
}

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const utils = trpc.useUtils();

  const invoiceQ = trpc.invoice.byId.useQuery({ id: params.id });
  const invoice = invoiceQ.data;

  const poMatchQ = trpc.po.matchSummary.useQuery(
    { id: invoice?.purchaseOrderId ?? "" },
    { enabled: !!invoice?.purchaseOrderId }
  );

  const approvalChainQ = trpc.approval.resolve.useQuery(
    { amount: invoice ? Number(invoice.totalAmount) : 0 },
    { enabled: !!invoice }
  );

  const actionMut = trpc.invoice.action.useMutation({
    onSuccess: () => {
      utils.invoice.byId.invalidate({ id: params.id });
      utils.invoice.list.invalidate();
    },
  });

  if (invoiceQ.isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Loading invoice…
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-gray-500">Invoice not found.</p>
        <Link href="/invoices" className="btn-secondary text-sm">← Back to pipeline</Link>
      </div>
    );
  }

  const canApprove = invoice.status === "pending";
  const canMarkPaid = invoice.status === "approved";
  const canReject = invoice.status === "pending" || invoice.status === "approved";

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/invoices" className="text-sm text-gray-500 hover:text-gray-700 mb-1 block">
            ← Invoice Pipeline
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">
            {invoice.invoiceNumber}
          </h1>
          <p className="text-gray-500 mt-1">{invoice.vendor.name}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={invoice.status} />
          <span className="text-2xl font-bold text-gray-900">
            {formatAmount(invoice.totalAmount)}
          </span>
        </div>
      </div>

      {/* Actions */}
      {(canApprove || canMarkPaid || canReject) && (
        <div className="flex gap-2">
          {canApprove && (
            <button
              onClick={() => actionMut.mutate({ invoiceId: invoice.id, action: "approve" })}
              disabled={actionMut.isPending}
              className="btn-primary"
            >
              ✓ Approve
            </button>
          )}
          {canMarkPaid && (
            <button
              onClick={() => actionMut.mutate({ invoiceId: invoice.id, action: "mark_paid" })}
              disabled={actionMut.isPending}
              className="btn-primary"
            >
              $ Mark Paid
            </button>
          )}
          {canReject && (
            <button
              onClick={() => actionMut.mutate({ invoiceId: invoice.id, action: "reject" })}
              disabled={actionMut.isPending}
              className="btn-secondary text-red-600"
            >
              ✕ Reject
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Extracted data */}
        <div className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Extracted Data
          </h2>

          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Invoice #</dt>
              <dd className="font-medium">{invoice.invoiceNumber}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Vendor</dt>
              <dd className="font-medium">{invoice.vendor.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Due Date</dt>
              <dd className="font-medium">{formatDate(invoice.dueDate)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Received</dt>
              <dd className="font-medium">{formatDate(invoice.receivedAt)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Total</dt>
              <dd className="font-semibold text-gray-900">{formatAmount(invoice.totalAmount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Tax</dt>
              <dd className="font-medium">{formatAmount(invoice.taxAmount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Currency</dt>
              <dd className="font-medium">{invoice.currency}</dd>
            </div>
          </dl>

          <div>
            <dt className="text-xs text-gray-500 mb-1">OCR Confidence</dt>
            <ConfidenceMeter score={invoice.ocrConfidence} />
          </div>

          {invoice.notes && (
            <div>
              <dt className="text-xs text-gray-500 mb-1">Notes</dt>
              <dd className="text-sm text-gray-700 bg-gray-50 rounded p-2">{invoice.notes}</dd>
            </div>
          )}
        </div>

        {/* PO match result */}
        <div className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            PO Match Result
          </h2>

          {!invoice.purchaseOrderId ? (
            <div className="text-sm text-amber-700 bg-amber-50 rounded p-3">
              No purchase order linked to this invoice. Assign a PO to enable 3-way matching.
            </div>
          ) : poMatchQ.isLoading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : poMatchQ.data ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">PO Number</dt>
                <dd className="font-medium">{poMatchQ.data.poNumber}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">PO Total</dt>
                <dd className="font-medium">{formatAmount(poMatchQ.data.poTotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Invoiced Total</dt>
                <dd className="font-medium">{formatAmount(poMatchQ.data.invoicedTotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Remaining</dt>
                <dd
                  className={
                    poMatchQ.data.remaining < 0
                      ? "font-semibold text-red-600"
                      : "font-medium text-green-700"
                  }
                >
                  {formatAmount(poMatchQ.data.remaining)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 mb-1">Match</dt>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        poMatchQ.data.matchPercentage > 100
                          ? "bg-red-500"
                          : poMatchQ.data.matchPercentage >= 95
                          ? "bg-green-500"
                          : "bg-yellow-400"
                      }`}
                      style={{ width: `${Math.min(poMatchQ.data.matchPercentage, 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold w-12 text-right">
                    {poMatchQ.data.matchPercentage}%
                  </span>
                </div>
              </div>
            </dl>
          ) : null}
        </div>

        {/* Approval chain */}
        <div className="card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Approval Chain
          </h2>

          {approvalChainQ.isLoading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : !approvalChainQ.data?.length ? (
            <p className="text-sm text-gray-500">No approval rules configured for this amount.</p>
          ) : (
            <ol className="space-y-2">
              {approvalChainQ.data.map((rule, i) => (
                <li key={rule.id} className="flex items-start gap-3 text-sm">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-bold">
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium text-gray-800">{rule.name}</p>
                    <p className="text-gray-500 text-xs">
                      {rule.approverRole} · {rule.approverEmail}
                    </p>
                    {rule.autoApprove && (
                      <span className="badge bg-green-50 text-green-700 text-xs mt-0.5">
                        Auto-approve
                      </span>
                    )}
                  </div>
                  <div className="ml-auto">
                    {invoice.status === "approved" || invoice.status === "paid" ? (
                      <span className="badge bg-green-100 text-green-700">✓ Done</span>
                    ) : invoice.status === "pending" && i === 0 ? (
                      <span className="badge bg-yellow-100 text-yellow-700">Pending</span>
                    ) : (
                      <span className="badge bg-gray-100 text-gray-500">Waiting</span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}

          {invoice.approvedBy && (
            <p className="text-xs text-gray-500 border-t border-gray-100 pt-3">
              Approved by {invoice.approvedBy} on {formatDate(invoice.approvedAt)}
            </p>
          )}
        </div>
      </div>

      {/* Line items with GL code selector */}
      <div className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Line Items
        </h2>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs text-gray-500 text-left">
              <th className="pb-2 font-medium">Description</th>
              <th className="pb-2 font-medium text-right">Qty</th>
              <th className="pb-2 font-medium text-right">Unit Price</th>
              <th className="pb-2 font-medium text-right">Amount</th>
              <th className="pb-2 font-medium pl-4">GL Code</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lineItems.map((li) => (
              <tr key={li.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 text-gray-800">{li.description}</td>
                <td className="py-2 text-right text-gray-600">{Number(li.quantity)}</td>
                <td className="py-2 text-right text-gray-600">{formatAmount(li.unitPrice)}</td>
                <td className="py-2 text-right font-medium text-gray-900">
                  {formatAmount(li.amount)}
                </td>
                <td className="py-2 pl-4">
                  <GlCodeSelector
                    lineItemId={li.id}
                    currentGlCodeId={li.glCodeId ?? null}
                    vendorId={invoice.vendorId}
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="pt-3 text-right text-xs text-gray-500">Total</td>
              <td className="pt-3 text-right font-bold text-gray-900">
                {formatAmount(invoice.totalAmount)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
