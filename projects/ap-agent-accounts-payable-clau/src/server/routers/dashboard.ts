import { z } from "zod";
import { router, tenantProcedure } from "../trpc";

export const dashboardRouter = router({
  /** High-level AP metrics for the dashboard */
  summary: tenantProcedure.query(async ({ ctx }) => {
    const [
      invoiceCounts,
      totalPayable,
      overdueInvoices,
      vendorCount,
      openPOs,
      recentActivity,
    ] = await Promise.all([
      // Invoice status breakdown
      ctx.prisma.invoice.groupBy({
        by: ["status"],
        where: { tenantId: ctx.tenantId },
        _count: true,
        _sum: { totalAmount: true },
      }),

      // Total outstanding (pending + approved)
      ctx.prisma.invoice.aggregate({
        where: {
          tenantId: ctx.tenantId,
          status: { in: ["pending", "approved"] },
        },
        _sum: { totalAmount: true },
      }),

      // Overdue invoices
      ctx.prisma.invoice.findMany({
        where: {
          tenantId: ctx.tenantId,
          status: { in: ["pending", "approved"] },
          dueDate: { lt: new Date() },
        },
        include: { vendor: { select: { name: true } } },
        orderBy: { dueDate: "asc" },
        take: 10,
      }),

      // Active vendor count
      ctx.prisma.vendor.count({
        where: { tenantId: ctx.tenantId, active: true },
      }),

      // Open PO count + value
      ctx.prisma.purchaseOrder.aggregate({
        where: {
          tenantId: ctx.tenantId,
          status: { in: ["open", "partially_matched"] },
        },
        _count: true,
        _sum: { totalAmount: true },
      }),

      // Last 20 audit events
      ctx.prisma.auditLog.findMany({
        where: { tenantId: ctx.tenantId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    return {
      invoices: {
        byStatus: invoiceCounts.map((g) => ({
          status: g.status,
          count: g._count,
          totalAmount: Number(g._sum.totalAmount ?? 0),
        })),
        totalPayable: Number(totalPayable._sum.totalAmount ?? 0),
      },
      overdue: overdueInvoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        vendorName: inv.vendor.name,
        totalAmount: Number(inv.totalAmount),
        dueDate: inv.dueDate,
        daysOverdue: Math.ceil(
          (Date.now() - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24)
        ),
      })),
      vendors: { activeCount: vendorCount },
      purchaseOrders: {
        openCount: openPOs._count ?? 0,
        openValue: Number(openPOs._sum.totalAmount ?? 0),
      },
      recentActivity,
    };
  }),

  /** Spending by GL code for a date range */
  spendByGlCode: tenantProcedure
    .input(
      z.object({
        from: z.date(),
        to: z.date(),
      })
    )
    .query(async ({ ctx, input }) => {
      const lineItems = await ctx.prisma.lineItem.findMany({
        where: {
          tenantId: ctx.tenantId,
          invoice: {
            status: { in: ["approved", "paid"] },
            receivedAt: { gte: input.from, lte: input.to },
          },
        },
        include: { glCode: true },
      });

      const byCode = new Map<string, { code: string; description: string; total: number }>();
      for (const li of lineItems) {
        const key = li.glCodeId ?? "unassigned";
        const existing = byCode.get(key);
        if (existing) {
          existing.total += Number(li.amount);
        } else {
          byCode.set(key, {
            code: li.glCode?.code ?? "N/A",
            description: li.glCode?.description ?? "Unassigned",
            total: Number(li.amount),
          });
        }
      }

      return Array.from(byCode.values()).sort((a, b) => b.total - a.total);
    }),

  /** Aging buckets: current, 1-30, 31-60, 61-90, 90+ */
  aging: tenantProcedure.query(async ({ ctx }) => {
    const unpaid = await ctx.prisma.invoice.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: { in: ["pending", "approved"] },
      },
      select: { totalAmount: true, dueDate: true },
    });

    const now = Date.now();
    const buckets = { current: 0, "1_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0 };

    for (const inv of unpaid) {
      const daysOverdue = Math.ceil((now - inv.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const amt = Number(inv.totalAmount);
      if (daysOverdue <= 0) buckets.current += amt;
      else if (daysOverdue <= 30) buckets["1_30"] += amt;
      else if (daysOverdue <= 60) buckets["31_60"] += amt;
      else if (daysOverdue <= 90) buckets["61_90"] += amt;
      else buckets["90_plus"] += amt;
    }

    return buckets;
  }),
});
