/**
 * tRPC server context + procedure builders.
 *
 * Tenant extraction strategy:
 *   1. Clerk's `auth()` (Next.js App Router) returns `{ userId, orgId }`.
 *   2. `orgId` is the Clerk organization ID — we look up the matching Tenant
 *      row in Postgres via `clerkOrgId`.
 *   3. The resolved `tenantId` (Postgres CUID) is injected into context so
 *      every procedure can scope queries without repeating the lookup.
 *
 * Reviewer: confirm CLERK_SECRET_KEY is set in .env and that Clerk middleware
 * is configured in middleware.ts to protect all /dashboard/** routes.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import superjson from "superjson";
import { db } from "./db";

export type Context = {
  /** Shared PrismaClient singleton — available to all procedures */
  prisma: typeof db;
  /** Postgres CUID for the resolved tenant — null if unauthenticated */
  tenantId: string | null;
  /** Clerk user ID */
  userId: string | null;
  /** Primary email from Clerk user — used in audit log entries */
  userEmail: string | null;
  /** Clerk org ID (raw) */
  clerkOrgId: string | null;
};

/**
 * Build context for each tRPC request from the Clerk session.
 * Called by the App Router handler in src/app/api/trpc/[trpc]/route.ts.
 *
 * We call `currentUser()` to get the email for audit logs. This adds one
 * Clerk network hop per request but keeps the audit log useful. If latency
 * becomes a concern, move email resolution into a lazy getter or cache in
 * a short-lived Redis key keyed by userId.
 */
export async function createTRPCContext(): Promise<Context> {
  const { userId, orgId } = auth();

  if (!userId || !orgId) {
    return { prisma: db, tenantId: null, userId: null, userEmail: null, clerkOrgId: null };
  }

  // Resolve Clerk org → internal tenant row
  const [tenant, user] = await Promise.all([
    db.tenant.findUnique({
      where: { clerkOrgId: orgId },
      select: { id: true },
    }),
    currentUser(),
  ]);

  const primaryEmail =
    user?.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
      ?.emailAddress ?? null;

  return {
    prisma: db,
    tenantId: tenant?.id ?? null,
    userId,
    userEmail: primaryEmail,
    clerkOrgId: orgId,
  };
}

// ---------------------------------------------------------------------------
// tRPC init
// ---------------------------------------------------------------------------

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        code: error.code,
        message: error.message,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/** Require a resolved tenant. Narrows tenantId and userId to string. */
const enforceTenant = t.middleware(({ ctx, next }) => {
  if (!ctx.tenantId || !ctx.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Must be authenticated with an active organization",
    });
  }
  return next({
    ctx: {
      ...ctx,
      tenantId: ctx.tenantId as string,
      userId: ctx.userId as string,
      userEmail: ctx.userEmail, // string | null — acceptable in audit logs
      prisma: ctx.prisma,
    },
  });
});

/**
 * tenantProcedure — use for all AP operations.
 * Guarantees ctx.tenantId and ctx.userId are non-null strings.
 */
export const tenantProcedure = t.procedure.use(enforceTenant);
