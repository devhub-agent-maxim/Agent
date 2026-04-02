import { z } from "zod";
import { router, tenantProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

const poCreateInput = z.object({
  vendorId: z.string(),
  poNumber: z.string().min(1),
  totalAmount: z.number().nonnegative(),
  currency: z.string().default("USD"),
});

const poUpdateInput = z.object({
  id: z.string(),
  status: z.enum(["open", "partially_matched", "closed", "cancelled"]).optional(),
  totalAmount: z.number().nonnegative().optional(),
});

const poListInput = z.object({
  vendorId: z.string().optional(),
  status: z.enum(["open", "partially_matched", "closed", "cancelled"]).optional(),
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).default(25),
});

export const poRouter = router({
  list: tenantProcedure.input(poListInput).query(async ({ ctx, input }) => {
    const where: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (input.vendorId) where.vendorId = input.vendorId;
    if (input.status) where.status = input.status;

    const items = await ctx.prisma.purchaseOrder.findMany({
      where,
      include: { vendor: true, invoices: { select: { id: true, invoiceNumber: true, totalAmount: true, status: true } } },
      orderBy: { createdAt: "desc" },
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    });

    let nextCursor: string | undefined;
    if (items.length > input.limit) {
      nextCursor = items.pop()!.id;
    }

    return { items, nextCursor };
  }),

  byId: tenantProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const po = await ctx.prisma.purchaseOrder.findFirst({
      where: { id: input.id, tenantId: ctx.tenantId },
      include: {
        vendor: true,
        invoices: { include: { lineItems: true } },
      },
    });
    if (!po) throw new TRPCError({ code: "NOT_FOUND", message: "Purchase order not found" });
    return po;
  }),

  create: tenantProcedure.input(poCreateInput).mutation(async ({ ctx, input }) => {
    const po = await ctx.prisma.$transaction(async (tx) => {
      const p = await tx.purchaseOrder.create({
        data: { tenantId: ctx.tenantId, ...input },
      });
      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          entityType: "po",
          entityId: p.id,
          action: "created",
          actorId: ctx.userId,
          actorEmail: ctx.userEmail,
          changes: { poNumber: p.poNumber, totalAmount: input.totalAmount },
        },
      });
      return p;
    });
    return po;
  }),

  update: tenantProcedure.input(poUpdateInput).mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;
    const existing = await ctx.prisma.purchaseOrder.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Purchase order not found" });

    const po = await ctx.prisma.$transaction(async (tx) => {
      const p = await tx.purchaseOrder.update({ where: { id }, data });
      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          entityType: "po",
          entityId: p.id,
          action: "updated",
          actorId: ctx.userId,
          actorEmail: ctx.userEmail,
          changes: { ...data, previousStatus: existing.status },
        },
      });
      return p;
    });
    return po;
  }),

  /** Match invoices against a PO — returns matched total vs PO total */
  matchSummary: tenantProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const po = await ctx.prisma.purchaseOrder.findFirst({
      where: { id: input.id, tenantId: ctx.tenantId },
      include: { invoices: { where: { status: { not: "void" } } } },
    });
    if (!po) throw new TRPCError({ code: "NOT_FOUND", message: "Purchase order not found" });

    const invoicedTotal = po.invoices.reduce(
      (sum, inv) => sum + Number(inv.totalAmount),
      0
    );

    return {
      poNumber: po.poNumber,
      poTotal: Number(po.totalAmount),
      invoicedTotal,
      remaining: Number(po.totalAmount) - invoicedTotal,
      matchPercentage: Number(po.totalAmount) > 0
        ? Math.round((invoicedTotal / Number(po.totalAmount)) * 100)
        : 0,
      invoiceCount: po.invoices.length,
    };
  }),
});
