import { z } from "zod";
import { router, tenantProcedure, approverProcedure, adminProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { matchPo } from "../services/po-matcher";
import { routeApproval } from "../services/approval-router";
import { syncBillToQbo } from "../services/qbo-sync";

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

const lineItemInput = z.object({
  description: z.string().min(1),
  glCodeId: z.string().optional(),
  quantity: z.number().positive().default(1),
  unitPrice: z.number().nonnegative(),
  amount: z.number().nonnegative(),
});

const invoiceCreateInput = z.object({
  vendorId: z.string(),
  purchaseOrderId: z.string().optional(),
  invoiceNumber: z.string().min(1),
  totalAmount: z.number().nonnegative(),
  taxAmount: z.number().nonnegative().default(0),
  currency: z.string().default("USD"),
  dueDate: z.date(),
  notes: z.string().optional(),
  ocrConfidence: z.number().min(0).max(1).optional(),
  lineItems: z.array(lineItemInput).min(1),
});

const invoiceListInput = z.object({
  status: z.enum(["pending", "approved", "rejected", "paid", "void"]).optional(),
  vendorId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).default(25),
});

const invoiceActionInput = z.object({
  invoiceId: z.string(),
  action: z.enum(["approve", "reject", "void", "mark_paid"]),
  notes: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const invoiceRouter = router({
  list: tenantProcedure.input(invoiceListInput).query(async ({ ctx, input }) => {
    const where: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (input.status) where.status = input.status;
    if (input.vendorId) where.vendorId = input.vendorId;

    const items = await ctx.prisma.invoice.findMany({
      where,
      include: { vendor: true, lineItems: true, purchaseOrder: true },
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
    const invoice = await ctx.prisma.invoice.findFirst({
      where: { id: input.id, tenantId: ctx.tenantId },
      include: { vendor: true, lineItems: { include: { glCode: true }, orderBy: { sortOrder: "asc" } }, purchaseOrder: true },
    });
    if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
    return invoice;
  }),

  create: tenantProcedure.input(invoiceCreateInput).mutation(async ({ ctx, input }) => {
    const { lineItems, ...invoiceData } = input;

    const invoice = await ctx.prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          tenantId: ctx.tenantId,
          ...invoiceData,
          lineItems: {
            createMany: {
              data: lineItems.map((li, i) => ({
                tenantId: ctx.tenantId,
                ...li,
                sortOrder: i,
              })),
            },
          },
        },
        include: { lineItems: true },
      });

      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          entityType: "invoice",
          entityId: inv.id,
          action: "created",
          actorId: ctx.userId,
          actorEmail: ctx.userEmail,
          changes: { invoiceNumber: inv.invoiceNumber, totalAmount: input.totalAmount },
        },
      });

      return inv;
    });

    return invoice;
  }),

  action: approverProcedure.input(invoiceActionInput).mutation(async ({ ctx, input }) => {
    const statusMap: Record<string, string> = {
      approve: "approved",
      reject: "rejected",
      void: "void",
      mark_paid: "paid",
    };

    const invoice = await ctx.prisma.invoice.findFirst({
      where: { id: input.invoiceId, tenantId: ctx.tenantId },
    });
    if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });

    const newStatus = statusMap[input.action];
    const updateData: Record<string, unknown> = { status: newStatus };
    if (input.action === "approve") {
      updateData.approvedAt = new Date();
      updateData.approvedBy = ctx.userEmail;
    }
    if (input.action === "mark_paid") {
      updateData.paidAt = new Date();
    }

    const updated = await ctx.prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.update({
        where: { id: input.invoiceId },
        data: updateData,
      });

      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          entityType: "invoice",
          entityId: inv.id,
          action: input.action,
          actorId: ctx.userId,
          actorEmail: ctx.userEmail,
          changes: { previousStatus: invoice.status, newStatus, notes: input.notes },
        },
      });

      return inv;
    });

    return updated;
  }),

  // ---------------------------------------------------------------------------
  // matchPo — fuzzy-match the invoice's extracted PO number against open POs
  // ---------------------------------------------------------------------------

  matchPo: tenantProcedure
    .input(
      z.object({
        invoiceId: z.string(),
        extractedPoNumber: z.string().optional(),
        invoiceAmount: z.number().nonnegative(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.prisma.invoice.findFirst({
        where: { id: input.invoiceId, tenantId: ctx.tenantId },
      });
      if (!invoice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }

      const match = await matchPo(
        ctx.tenantId,
        input.extractedPoNumber,
        input.invoiceAmount,
        ctx.prisma
      );

      if (match) {
        // Link the PO and record the confidence score
        await ctx.prisma.invoice.update({
          where: { id: input.invoiceId },
          data: {
            purchaseOrderId: match.poId,
            ocrConfidence: match.confidence,
          },
        });

        await ctx.prisma.auditLog.create({
          data: {
            tenantId: ctx.tenantId,
            entityType: "invoice",
            entityId: input.invoiceId,
            action: "po_matched",
            actorId: ctx.userId,
            actorEmail: ctx.userEmail,
            changes: {
              poId: match.poId,
              poNumber: match.poNumber,
              confidence: match.confidence,
              autoApproved: match.autoApproved,
            },
          },
        });
      }

      return { match };
    }),

  // ---------------------------------------------------------------------------
  // routeApproval — evaluate approval rules, create requests, notify approvers
  // ---------------------------------------------------------------------------

  routeApproval: tenantProcedure
    .input(
      z.object({
        invoiceId: z.string(),
        invoiceAmount: z.number().nonnegative(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.prisma.invoice.findFirst({
        where: { id: input.invoiceId, tenantId: ctx.tenantId },
      });
      if (!invoice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }

      const result = await routeApproval(
        ctx.tenantId,
        input.invoiceId,
        input.invoiceAmount,
        ctx.userId,
        ctx.userEmail,
        ctx.prisma
      );

      return result;
    }),

  // ---------------------------------------------------------------------------
  // syncToQbo — push an approved invoice to QuickBooks Online as a Bill
  // ---------------------------------------------------------------------------

  syncToQbo: adminProcedure
    .input(z.object({ invoiceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invoice = await ctx.prisma.invoice.findFirst({
        where: { id: input.invoiceId, tenantId: ctx.tenantId },
      });
      if (!invoice) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      }
      if (invoice.status !== "approved") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invoice must be approved before syncing to QBO (current status: ${invoice.status})`,
        });
      }

      try {
        const result = await syncBillToQbo(
          ctx.tenantId,
          input.invoiceId,
          ctx.prisma
        );
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `QBO sync failed: ${message}`,
        });
      }
    }),
});
