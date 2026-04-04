import { z } from "zod";
import { router, tenantProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

const vendorCreateInput = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  email: z.string().email().optional(),
  taxId: z.string().optional(),
  address: z
    .object({
      street: z.string(),
      city: z.string(),
      state: z.string(),
      zip: z.string(),
      country: z.string().default("US"),
    })
    .optional(),
  paymentTerms: z.number().int().positive().default(30),
});

const vendorUpdateInput = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  taxId: z.string().optional(),
  address: z
    .object({
      street: z.string(),
      city: z.string(),
      state: z.string(),
      zip: z.string(),
      country: z.string(),
    })
    .optional(),
  paymentTerms: z.number().int().positive().optional(),
  active: z.boolean().optional(),
});

const vendorListInput = z.object({
  search: z.string().optional(),
  active: z.boolean().optional(),
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).default(50),
});

export const vendorRouter = router({
  list: tenantProcedure.input(vendorListInput).query(async ({ ctx, input }) => {
    const where: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (input.active !== undefined) where.active = input.active;
    if (input.search) {
      where.OR = [
        { name: { contains: input.search, mode: "insensitive" } },
        { code: { contains: input.search, mode: "insensitive" } },
      ];
    }

    const items = await ctx.prisma.vendor.findMany({
      where,
      orderBy: { name: "asc" },
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
    const vendor = await ctx.prisma.vendor.findFirst({
      where: { id: input.id, tenantId: ctx.tenantId },
    });
    if (!vendor) throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found" });
    return vendor;
  }),

  create: tenantProcedure.input(vendorCreateInput).mutation(async ({ ctx, input }) => {
    const vendor = await ctx.prisma.$transaction(async (tx) => {
      const v = await tx.vendor.create({
        data: { tenantId: ctx.tenantId, ...input },
      });
      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          entityType: "vendor",
          entityId: v.id,
          action: "created",
          actorId: ctx.userId,
          actorEmail: ctx.userEmail,
          changes: { name: v.name, code: v.code },
        },
      });
      return v;
    });
    return vendor;
  }),

  update: tenantProcedure.input(vendorUpdateInput).mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;
    const existing = await ctx.prisma.vendor.findFirst({
      where: { id, tenantId: ctx.tenantId },
    });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found" });

    const vendor = await ctx.prisma.$transaction(async (tx) => {
      const v = await tx.vendor.update({ where: { id }, data });
      await tx.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          entityType: "vendor",
          entityId: v.id,
          action: "updated",
          actorId: ctx.userId,
          actorEmail: ctx.userEmail,
          changes: data,
        },
      });
      return v;
    });
    return vendor;
  }),
});
