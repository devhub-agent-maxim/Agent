/**
 * tRPC server context + procedure builders.
 *
 * Tenant extraction strategy:
 *   1. Clerk's `auth()` (Next.js App Router) returns `{ userId, orgId, orgRole }`.
 *   2. `orgId` is the Clerk organization ID — we look up the matching Tenant
 *      row in Postgres via `clerkOrgId`.
 *   3. `orgRole` is mapped to an internal AppRole (admin | approver | viewer)
 *      via clerkRoleToAppRole().
 *   4. The resolved `tenantId` and `role` are injected into context so every
 *      procedure can scope queries and enforce permissions.
 *
 * Reviewer: confirm CLERK_SECRET_KEY is set in .env and that Clerk middleware
 * is configured in middleware.ts to protect all /dashboard/** routes.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import superjson from "superjson";
import { db } from "./db";
import {
  type AppRole,
  type Permission,
  clerkRoleToAppRole,
  hasPermission,
} from "./services/auth";

export type Context = {
  prisma: typeof db;
  tenantId: string | null;
  userId: string | null;
  userEmail: string | null;
  clerkOrgId: string | null;
  role: AppRole;
};

/**
 * Build context for each tRPC request from the Clerk session.
 */
export async function createTRPCContext(): Promise<Context> {
  const { userId, orgId, orgRole } = auth();

  if (!userId || !orgId) {
    return {
      prisma: db,
      tenantId: null,
      userId: null,
      userEmail: null,
      clerkOrgId: null,
      role: "viewer",
    };
  }

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
    role: clerkRoleToAppRole(orgRole),
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
// Middleware: enforce tenant
// ---------------------------------------------------------------------------

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
      userEmail: ctx.userEmail,
      role: ctx.role,
      prisma: ctx.prisma,
    },
  });
});

/**
 * tenantProcedure — use for all AP operations.
 * Guarantees ctx.tenantId and ctx.userId are non-null strings.
 */
export const tenantProcedure = t.procedure.use(enforceTenant);

// ---------------------------------------------------------------------------
// Middleware: enforce specific permission
// ---------------------------------------------------------------------------

function enforcePermission(...required: Permission[]) {
  return t.middleware(({ ctx, next }) => {
    if (!ctx.tenantId || !ctx.userId) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Must be authenticated with an active organization",
      });
    }
    for (const perm of required) {
      if (!hasPermission(ctx.role, perm)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Insufficient permissions: requires "${perm}" (your role: ${ctx.role})`,
        });
      }
    }
    return next({
      ctx: {
        ...ctx,
        tenantId: ctx.tenantId as string,
        userId: ctx.userId as string,
        userEmail: ctx.userEmail,
        role: ctx.role,
        prisma: ctx.prisma,
      },
    });
  });
}

/** Admin-only: configure approval rules, connect QBO, write settings */
export const adminProcedure = t.procedure.use(
  enforcePermission("settings:write")
);

/** Approver+: approve/reject invoices */
export const approverProcedure = t.procedure.use(
  enforcePermission("invoice:approve")
);
