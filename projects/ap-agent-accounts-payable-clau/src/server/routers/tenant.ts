import { z } from "zod";
import { router, tenantProcedure, publicProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

/**
 * Tenant router — handles onboarding and tenant config.
 *
 * `provision` is called once after a Clerk org is created. It creates the
 * Tenant row mapping clerkOrgId → internal CUID. All subsequent requests
 * resolve the tenant from the Clerk session via createTRPCContext.
 */
export const tenantRouter = router({
  /**
   * Provision a new tenant for the caller's Clerk org.
   * Called from the post-org-creation webhook or the onboarding page.
   * Idempotent: returns existing tenant if already provisioned.
   */
  provision: publicProcedure
    .input(
      z.object({
        clerkOrgId: z.string().min(1),
        name: z.string().min(1),
        slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.tenant.findUnique({
        where: { clerkOrgId: input.clerkOrgId },
      });
      if (existing) return existing;

      return ctx.prisma.tenant.create({
        data: {
          clerkOrgId: input.clerkOrgId,
          name: input.name,
          slug: input.slug,
          plan: "retainer_500",
        },
      });
    }),

  /** Return the current tenant's metadata (for dashboard header etc.) */
  current: tenantProcedure.query(async ({ ctx }) => {
    const tenant = await ctx.prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { id: true, name: true, slug: true, plan: true, active: true },
    });
    if (!tenant) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });
    return tenant;
  }),
});
