/**
 * tRPC context + middleware unit tests.
 *
 * These tests mock Clerk and Prisma to keep them fast and dependency-free.
 * They verify:
 *   1. createTRPCContext returns null tenantId when unauthenticated
 *   2. createTRPCContext resolves tenantId from clerkOrgId
 *   3. tenantProcedure throws UNAUTHORIZED when tenantId is null
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { TRPCError } from "@trpc/server";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockFindUnique = jest.fn();
const mockCurrentUser = jest.fn();
const mockAuth = jest.fn();

jest.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
  currentUser: () => mockCurrentUser(),
}));

jest.mock("../server/db", () => ({
  db: {
    tenant: { findUnique: mockFindUnique },
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createTRPCContext } = require("../server/trpc") as typeof import("../server/trpc");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createTRPCContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns null tenantId when not authenticated", async () => {
    mockAuth.mockReturnValue({ userId: null, orgId: null });

    const ctx = await createTRPCContext();

    expect(ctx.tenantId).toBeNull();
    expect(ctx.userId).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns null tenantId when userId present but no orgId", async () => {
    mockAuth.mockReturnValue({ userId: "user_abc", orgId: null });

    const ctx = await createTRPCContext();

    expect(ctx.tenantId).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("resolves tenantId from clerkOrgId when authenticated", async () => {
    mockAuth.mockReturnValue({ userId: "user_abc", orgId: "org_xyz" });
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [{ id: "ea_1", emailAddress: "alice@example.com" }],
      primaryEmailAddressId: "ea_1",
    });
    mockFindUnique.mockResolvedValue({ id: "cuid_tenant_123" });

    const ctx = await createTRPCContext();

    expect(ctx.tenantId).toBe("cuid_tenant_123");
    expect(ctx.userId).toBe("user_abc");
    expect(ctx.userEmail).toBe("alice@example.com");
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { clerkOrgId: "org_xyz" },
      select: { id: true },
    });
  });

  it("returns null tenantId when org has no tenant row yet (not provisioned)", async () => {
    mockAuth.mockReturnValue({ userId: "user_abc", orgId: "org_new" });
    mockCurrentUser.mockResolvedValue({
      emailAddresses: [],
      primaryEmailAddressId: null,
    });
    mockFindUnique.mockResolvedValue(null);

    const ctx = await createTRPCContext();

    expect(ctx.tenantId).toBeNull();
    expect(ctx.clerkOrgId).toBe("org_new");
  });
});

describe("tenantProcedure middleware enforcement", () => {
  it("throws UNAUTHORIZED when tenantId is null", async () => {
    // We test enforcement by calling the procedure with a null-tenant context.
    // Import router inline to avoid hoisting issues with jest.mock.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { tenantRouter } = require("../server/routers/tenant") as typeof import("../server/routers/tenant");

    // Simulate a null-tenant context (unauthenticated request)
    const caller = tenantRouter.createCaller({
      prisma: { tenant: { findUnique: jest.fn() } } as unknown as typeof import("../server/db").db,
      tenantId: null,
      userId: null,
      userEmail: null,
      clerkOrgId: null,
    });

    await expect(caller.current()).rejects.toThrow(TRPCError);
  });
});
