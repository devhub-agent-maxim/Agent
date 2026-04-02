import { z } from "zod";
import { router, tenantProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

const ruleCreateInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  minAmount: z.number().nonnegative(),
  maxAmount: z.number().nonnegative().optional(),
  approverEmail: z.string().email(),
  approverRole: z.enum(["ap_clerk", "manager", "cfo"]),
  autoApprove: z.boolean().default(false),
  priority: z.number().int().default(0),
});

const ruleUpdateInput = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  minAmount: z.number().nonnegative().optional(),
  maxAmount: z.number().nonnegative().nullable().optional(),
  approverEmail: z.string().email().optional(),
  approverRole: z.enum(["ap_clerk", "manager", "cfo"]).optional(),
  autoApprove: z.boolean().optional(),
  priority: z.number().int().optional(),
  active: z.boolean().optional(),
});

export const approvalRouter = router({
  list: tenantProcedure.query(async ({ ctx }) => {
    return ctx.prisma.approvalRule.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: { priority: "asc" },
    });
  }),

  /** Given an invoice amount, return the matching approval rule(s) */
  resolve: tenantProcedure
    .input(z.object({ amount: z.number().nonnegative() }))
    .query(async ({ ctx, input }) => {
      const rules = await ctx.prisma.approvalRule.findMany({
        where: {
          tenantId: ctx.tenantId,
          active: true,
          minAmount: { lte: input.amount },
          OR: [
            { maxAmount: null },
            { maxAmount: { gte: input.amount } },
          ],
        },
        orderBy: { priority: "asc" },
      });
      return rules;
    }),

  create: tenantProcedure.input(ruleCreateInput).mutation(async ({ ctx, input }) => {
    const rule = await ctx.prisma.$transaction(async (tx) => {
      const r = await tx.approvalRule.create({
        data: { tenantId: ctx.tenantId, ...input },
      });
      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          entityType: "approval_rule",
          entityId: r.id,
          action: "created",
          actorId: ctx.userId,
          actorEmail: ctx.userEmail,
          changes: { name: r.name, minAmount: input.minAmount },
        },
      });
      return r;
    });
    return rule;
  }),

  update: tenantProcedure.input(ruleUpdateInput).mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;
    const existing = await ctx.prisma.approvalRule.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Approval rule not found" });

    const rule = await ctx.prisma.$transaction(async (tx) => {
      const r = await tx.approvalRule.update({ where: { id }, data });
      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          entityType: "approval_rule",
          entityId: r.id,
          action: "updated",
          actorId: ctx.userId,
          actorEmail: ctx.userEmail,
          changes: data,
        },
      });
      return r;
    });
    return rule;
  }),

  delete: tenantProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.approvalRule.findFirst({
      where: { id: input.id, tenantId: ctx.tenantId },
    });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Approval rule not found" });

    await ctx.prisma.$transaction(async (tx) => {
      await tx.approvalRule.delete({ where: { id: input.id } });
      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          entityType: "approval_rule",
          entityId: input.id,
          action: "deleted",
          actorId: ctx.userId,
          actorEmail: ctx.userEmail,
          changes: { name: existing.name },
        },
      });
    });

    return { success: true };
  }),
});
