import { z } from "zod";
import { router, tenantProcedure } from "../trpc";

export const glcodeRouter = router({
  list: tenantProcedure
    .input(z.object({ category: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.prisma.glCode.findMany({
        where: {
          tenantId: ctx.tenantId,
          active: true,
          ...(input?.category ? { category: input.category } : {}),
        },
        orderBy: [{ category: "asc" }, { code: "asc" }],
      });
    }),

  /** Vendor GL code history — returns the GL codes used most often for this vendor */
  vendorHistory: tenantProcedure
    .input(z.object({ vendorId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Count how often each GL code appears on paid/approved invoices from this vendor
      const lineItems = await ctx.prisma.lineItem.findMany({
        where: {
          tenantId: ctx.tenantId,
          glCodeId: { not: null },
          invoice: {
            vendorId: input.vendorId,
            status: { in: ["approved", "paid"] },
          },
        },
        select: { glCodeId: true, glCode: true },
      });

      const freq = new Map<string, { glCode: { id: string; code: string; description: string }; count: number }>();
      for (const li of lineItems) {
        if (!li.glCodeId || !li.glCode) continue;
        const existing = freq.get(li.glCodeId);
        if (existing) {
          existing.count++;
        } else {
          freq.set(li.glCodeId, { glCode: li.glCode, count: 1 });
        }
      }

      return Array.from(freq.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map((v) => v.glCode);
    }),
});
