"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";

// Confidence below this → "Pending Review"; above → "Awaiting Approval"
const APPROVAL_CONFIDENCE_THRESHOLD = 0.8;

type InvoiceItem = {
  id: string;
  invoiceNumber: string;
  status: string;
  totalAmount: unknown; // Decimal from Prisma, serialised as string or number
  dueDate: Date | string;
  ocrConfidence: number | null;
  vendor: { name: string };
  purchaseOrderId: string | null;
};

function confidenceLabel(score: number | null): { label: string; className: string } {
  if (score === null) return { label: "—", className: "badge bg-gray-100 text-gray-600" };
  const pct = Math.round(score * 100);
  if (pct >= 90) return { label: `${pct}%`, className: "badge bg-green-100 text-green-700" };
  if (pct >= 70) return { label: `${pct}%`, className: "badge bg-yellow-100 text-yellow-700" };
  return { label: `${pct}%`, className: "badge bg-red-100 text-red-700" };
}

function formatAmount(amt: unknown): string {
  const n = typeof amt === "string" ? parseFloat(amt) : Number(amt);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isDue(d: Date | string): boolean {
  return new Date(d) < new Date();
}

// ────────────────────────────────────────────────────────────────────────────
// Invoice card
// ────────────────────────────────────────────────────────────────────────────

function InvoiceCard({
  inv,
  onAction,
  actionLabel,
  actionVariant = "primary",
  isPending,
}: {
  inv: InvoiceItem;
  onAction?: () => void;
  actionLabel?: string;
  actionVariant?: "primary" | "secondary";
  isPending?: boolean;
}) {
  const conf = confidenceLabel(inv.ocrConfidence);
  const overdue = isDue(inv.dueDate);

  return (
    <div className="card p-3 space-y-2 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-1">
        <Link
          href={`/invoices/${inv.id}`}
          className="font-medium text-sm text-blue-600 hover:underline truncate"
        >
          {inv.vendor.name}
        </Link>
        <span className={conf.className}>{conf.label}</span>
      </div>

      <div className="text-base font-semibold text-gray-900">{formatAmount(inv.totalAmount)}</div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span className={overdue ? "text-red-600 font-medium" : ""}>
          {overdue ? "⚠ " : ""}Due {formatDate(inv.dueDate)}
        </span>
        <span className="text-gray-400">{inv.invoiceNumber}</span>
      </div>

      {!inv.purchaseOrderId && (
        <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-0.5">No PO linked</p>
      )}

      {onAction && actionLabel && (
        <button
          onClick={onAction}
          disabled={isPending}
          className={
            actionVariant === "primary"
              ? "btn-primary w-full text-xs py-1"
              : "btn-secondary w-full text-xs py-1"
          }
        >
          {isPending ? "Saving…" : actionLabel}
        </button>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Column
// ────────────────────────────────────────────────────────────────────────────

function Column({
  title,
  count,
  colorClass,
  children,
}: {
  title: string;
  count: number;
  colorClass: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col min-w-0 w-64 flex-shrink-0">
      <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg ${colorClass}`}>
        <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
        <span className="text-xs font-bold bg-white/50 rounded-full px-1.5 py-0.5">{count}</span>
      </div>
      <div className="flex-1 overflow-y-auto bg-gray-50 rounded-b-lg p-2 space-y-2 min-h-40">
        {children}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────

export default function InvoicesPage() {
  const utils = trpc.useUtils();

  const pendingQ = trpc.invoice.list.useQuery({ status: "pending", limit: 50 });
  const approvedQ = trpc.invoice.list.useQuery({ status: "approved", limit: 50 });
  const paidQ = trpc.invoice.list.useQuery({ status: "paid", limit: 25 });

  const actionMut = trpc.invoice.action.useMutation({
    onSuccess: () => {
      utils.invoice.list.invalidate();
    },
  });

  const pending = (pendingQ.data?.items ?? []) as InvoiceItem[];
  const approved = (approvedQ.data?.items ?? []) as InvoiceItem[];
  const paid = (paidQ.data?.items ?? []) as InvoiceItem[];

  // Split pending into two UI columns by confidence
  const pendingReview = pending.filter(
    (inv) => inv.ocrConfidence === null || inv.ocrConfidence < APPROVAL_CONFIDENCE_THRESHOLD
  );
  const awaitingApproval = pending.filter(
    (inv) => inv.ocrConfidence !== null && inv.ocrConfidence >= APPROVAL_CONFIDENCE_THRESHOLD
  );

  const isLoading = pendingQ.isLoading || approvedQ.isLoading || paidQ.isLoading;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 bg-white border-b border-gray-200 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Invoice Pipeline</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {pending.length + approved.length + paid.length} invoices total
          </p>
        </div>
        <Link href="/exceptions" className="btn-secondary text-xs">
          ⚠ Exceptions ({pendingReview.filter((i) => (i.ocrConfidence ?? 0) < 0.7).length})
        </Link>
      </div>

      {/* Board */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
          Loading invoices…
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto p-6">
          <div className="flex gap-4 h-full">
            {/* Column 1: Pending Review */}
            <Column
              title="Pending Review"
              count={pendingReview.length}
              colorClass="bg-slate-200 text-slate-700"
            >
              {pendingReview.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No invoices</p>
              )}
              {pendingReview.map((inv) => (
                <InvoiceCard key={inv.id} inv={inv} />
              ))}
            </Column>

            {/* Column 2: Awaiting Approval */}
            <Column
              title="Awaiting Approval"
              count={awaitingApproval.length}
              colorClass="bg-blue-100 text-blue-800"
            >
              {awaitingApproval.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No invoices</p>
              )}
              {awaitingApproval.map((inv) => (
                <InvoiceCard
                  key={inv.id}
                  inv={inv}
                  actionLabel="Approve →"
                  actionVariant="primary"
                  isPending={
                    actionMut.isPending && actionMut.variables?.invoiceId === inv.id
                  }
                  onAction={() =>
                    actionMut.mutate({ invoiceId: inv.id, action: "approve" })
                  }
                />
              ))}
            </Column>

            {/* Column 3: Approved */}
            <Column
              title="Approved"
              count={approved.length}
              colorClass="bg-green-100 text-green-800"
            >
              {approved.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No invoices</p>
              )}
              {approved.map((inv) => (
                <InvoiceCard
                  key={inv.id}
                  inv={inv}
                  actionLabel="Mark Paid →"
                  actionVariant="secondary"
                  isPending={
                    actionMut.isPending && actionMut.variables?.invoiceId === inv.id
                  }
                  onAction={() =>
                    actionMut.mutate({ invoiceId: inv.id, action: "mark_paid" })
                  }
                />
              ))}
            </Column>

            {/* Column 4: Paid */}
            <Column
              title="Paid"
              count={paid.length}
              colorClass="bg-gray-200 text-gray-600"
            >
              {paid.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No invoices</p>
              )}
              {paid.map((inv) => (
                <InvoiceCard key={inv.id} inv={inv} />
              ))}
            </Column>
          </div>
        </div>
      )}
    </div>
  );
}
