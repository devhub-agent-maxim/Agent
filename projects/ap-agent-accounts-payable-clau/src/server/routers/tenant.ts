import { z } from "zod";
import { router, tenantProcedure, publicProcedure, adminProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";

const notificationSettingsSchema = z.object({
  emails: z.array(z.string().email()).default([]),
  onApproval: z.boolean().default(true),
  onException: z.boolean().default(true),
  dailySummary: z.boolean().default(false),
});

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

  /** QBO connection status — whether OAuth tokens exist and are not expired */
  qboStatus: tenantProcedure.query(async ({ ctx }) => {
    const tenant = await ctx.prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { qboRealmId: true, qboTokenExpiry: true },
    });
    if (!tenant) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });

    const connected = !!tenant.qboRealmId;
    const expired = tenant.qboTokenExpiry ? tenant.qboTokenExpiry < new Date() : true;
    return { connected, expired, realmId: tenant.qboRealmId };
  }),

  /** Notification preferences for this tenant */
  getNotificationSettings: tenantProcedure.query(async ({ ctx }) => {
    const tenant = await ctx.prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { notificationSettings: true },
    });
    if (!tenant) throw new TRPCError({ code: "NOT_FOUND", message: "Tenant not found" });

    const defaults = { emails: [], onApproval: true, onException: true, dailySummary: false };
    if (!tenant.notificationSettings) return defaults;

    // Parse stored JSON safely
    const parsed = notificationSettingsSchema.safeParse(tenant.notificationSettings);
    return parsed.success ? parsed.data : defaults;
  }),

  updateNotificationSettings: adminProcedure
    .input(notificationSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.tenant.update({
        where: { id: ctx.tenantId },
        data: { notificationSettings: input },
      });
      return { success: true };
    }),

  /** Disconnect QBO by clearing OAuth tokens. Existing synced bills are unaffected. */
  qboDisconnect: adminProcedure.mutation(async ({ ctx }) => {
    await ctx.prisma.tenant.update({
      where: { id: ctx.tenantId },
      data: {
        qboRealmId: null,
        qboAccessToken: null,
        qboRefreshToken: null,
        qboTokenExpiry: null,
      },
    });
    return { success: true };
  }),
});
