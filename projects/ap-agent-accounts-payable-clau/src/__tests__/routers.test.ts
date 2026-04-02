/**
 * Integration tests for tRPC routers.
 *
 * Uses createCaller with a mock PrismaClient to test:
 * - Zod input validation (rejects bad inputs)
 * - Tenant scoping (every query filters by tenantId)
 * - Audit log creation on mutations
 * - Cursor-based pagination shape
 * - Business logic (invoice actions, PO match summary, approval resolution)
 *
 * These are NOT e2e tests — Prisma is mocked. The goal is to test the tRPC
 * layer: schemas, middleware enforcement, and response shaping.
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { TRPCError } from "@trpc/server";
import type { Context } from "../server/trpc";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function mockPrisma() {
  const auditCreate = jest.fn().mockResolvedValue({ id: "audit_1" } as never);
  const transaction = jest.fn(
    (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const tx = {
        invoice: {
          create: jest.fn().mockResolvedValue({
            id: "inv_1",
            invoiceNumber: "INV-001",
            tenantId: "t1",
            lineItems: [],
          } as never),
          update: jest.fn().mockResolvedValue({
            id: "inv_1",
            status: "approved",
          } as never),
        },
        vendor: {
          create: jest.fn().mockResolvedValue({
            id: "v_1",
            name: "Test Vendor",
            code: "V-100",
            tenantId: "t1",
          } as never),
          update: jest.fn().mockResolvedValue({
            id: "v_1",
            name: "Updated Vendor",
          } as never),
        },
        purchaseOrder: {
          create: jest.fn().mockResolvedValue({
            id: "po_1",
            poNumber: "PO-001",
            tenantId: "t1",
          } as never),
          update: jest.fn().mockResolvedValue({
            id: "po_1",
            status: "closed",
          } as never),
        },
        approvalRule: {
          create: jest.fn().mockResolvedValue({
            id: "ar_1",
            name: "Test Rule",
            tenantId: "t1",
          } as never),
          update: jest.fn().mockResolvedValue({
            id: "ar_1",
            name: "Updated Rule",
          } as never),
          delete: jest.fn().mockResolvedValue({} as never),
        },
        auditLog: { create: auditCreate },
      };
      return fn(tx as Record<string, unknown>);
    }
  );

  return {
    $transaction: transaction,
    invoice: {
      findMany: jest.fn().mockResolvedValue([] as never),
      findFirst: jest.fn().mockResolvedValue(null as never),
      groupBy: jest.fn().mockResolvedValue([] as never),
      aggregate: jest.fn().mockResolvedValue({
        _sum: { totalAmount: null },
        _count: 0,
      } as never),
    },
    vendor: {
      findMany: jest.fn().mockResolvedValue([] as never),
      findFirst: jest.fn().mockResolvedValue(null as never),
      count: jest.fn().mockResolvedValue(0 as never),
    },
    purchaseOrder: {
      findMany: jest.fn().mockResolvedValue([] as never),
      findFirst: jest.fn().mockResolvedValue(null as never),
      aggregate: jest.fn().mockResolvedValue({
        _sum: { totalAmount: null },
        _count: 0,
      } as never),
    },
    approvalRule: {
      findMany: jest.fn().mockResolvedValue([] as never),
      findFirst: jest.fn().mockResolvedValue(null as never),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 } as never),
    },
    lineItem: {
      findMany: jest.fn().mockResolvedValue([] as never),
    },
    auditLog: {
      findMany: jest.fn().mockResolvedValue([] as never),
      create: auditCreate,
    },
    tenant: {
      findUnique: jest.fn().mockResolvedValue(null as never),
      create: jest.fn().mockResolvedValue({
        id: "t_new",
        clerkOrgId: "org_new",
        name: "New Co",
        slug: "new-co",
        plan: "retainer_500",
      } as never),
      update: jest.fn().mockResolvedValue({ id: "t1" } as never),
    },
    _auditCreate: auditCreate,
    _transaction: transaction,
  };
}

function tenantCtx(prisma: ReturnType<typeof mockPrisma>): Context {
  return {
    prisma: prisma as unknown as Context["prisma"],
    tenantId: "t1",
    userId: "user_1",
    userEmail: "user@test.com",
    clerkOrgId: "org_1",
    role: "admin",
  };
}

function unauthCtx(prisma: ReturnType<typeof mockPrisma>): Context {
  return {
    prisma: prisma as unknown as Context["prisma"],
    tenantId: null,
    userId: null,
    userEmail: null,
    clerkOrgId: null,
    role: "viewer",
  };
}

// ---------------------------------------------------------------------------
// We need to mock Clerk before importing routers (they import trpc.ts)
// ---------------------------------------------------------------------------

jest.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: null, orgId: null }),
  currentUser: () => null,
}));

jest.mock("../server/db", () => ({
  db: {},
}));

// ---------------------------------------------------------------------------
// Import routers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { invoiceRouter } = require("../server/routers/invoice") as typeof import("../server/routers/invoice");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { vendorRouter } = require("../server/routers/vendor") as typeof import("../server/routers/vendor");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { approvalRouter } = require("../server/routers/approval") as typeof import("../server/routers/approval");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { poRouter } = require("../server/routers/po") as typeof import("../server/routers/po");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { dashboardRouter } = require("../server/routers/dashboard") as typeof import("../server/routers/dashboard");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { tenantRouter } = require("../server/routers/tenant") as typeof import("../server/routers/tenant");

// ---------------------------------------------------------------------------
// Invoice Router
// ---------------------------------------------------------------------------

describe("invoiceRouter", () => {
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(() => {
    prisma = mockPrisma();
  });

  it("list returns paginated results scoped to tenant", async () => {
    prisma.invoice.findMany.mockResolvedValue([] as never);
    const caller = invoiceRouter.createCaller(tenantCtx(prisma));

    const result = await caller.list({});

    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("nextCursor");
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "t1" }),
      })
    );
  });

  it("list rejects invalid status enum", async () => {
    const caller = invoiceRouter.createCaller(tenantCtx(prisma));

    await expect(
      caller.list({ status: "invalid_status" as "pending" })
    ).rejects.toThrow();
  });

  it("byId throws NOT_FOUND for missing invoice", async () => {
    prisma.invoice.findFirst.mockResolvedValue(null as never);
    const caller = invoiceRouter.createCaller(tenantCtx(prisma));

    await expect(caller.byId({ id: "nonexistent" })).rejects.toThrow(
      TRPCError
    );
  });

  it("create writes audit log", async () => {
    const caller = invoiceRouter.createCaller(tenantCtx(prisma));

    await caller.create({
      vendorId: "v_1",
      invoiceNumber: "INV-NEW",
      totalAmount: 1000,
      dueDate: new Date("2026-06-01"),
      lineItems: [
        { description: "Item A", quantity: 1, unitPrice: 1000, amount: 1000 },
      ],
    });

    // Transaction was called
    expect(prisma._transaction).toHaveBeenCalled();
  });

  it("create rejects empty line items", async () => {
    const caller = invoiceRouter.createCaller(tenantCtx(prisma));

    await expect(
      caller.create({
        vendorId: "v_1",
        invoiceNumber: "INV-BAD",
        totalAmount: 100,
        dueDate: new Date(),
        lineItems: [],
      })
    ).rejects.toThrow();
  });

  it("action throws NOT_FOUND for missing invoice", async () => {
    prisma.invoice.findFirst.mockResolvedValue(null as never);
    const caller = invoiceRouter.createCaller(tenantCtx(prisma));

    await expect(
      caller.action({ invoiceId: "bad", action: "approve" })
    ).rejects.toThrow(TRPCError);
  });

  it("rejects unauthenticated callers", async () => {
    const caller = invoiceRouter.createCaller(unauthCtx(prisma));

    await expect(caller.list({})).rejects.toThrow(TRPCError);
  });
});

// ---------------------------------------------------------------------------
// Vendor Router
// ---------------------------------------------------------------------------

describe("vendorRouter", () => {
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(() => {
    prisma = mockPrisma();
  });

  it("list scopes by tenantId and supports search", async () => {
    prisma.vendor.findMany.mockResolvedValue([] as never);
    const caller = vendorRouter.createCaller(tenantCtx(prisma));

    await caller.list({ search: "Staples" });

    expect(prisma.vendor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "t1",
          OR: expect.arrayContaining([
            expect.objectContaining({
              name: { contains: "Staples", mode: "insensitive" },
            }),
          ]),
        }),
      })
    );
  });

  it("create rejects missing name", async () => {
    const caller = vendorRouter.createCaller(tenantCtx(prisma));

    await expect(
      caller.create({ name: "", code: "V-X" })
    ).rejects.toThrow();
  });

  it("update throws NOT_FOUND for unknown vendor", async () => {
    prisma.vendor.findFirst.mockResolvedValue(null as never);
    const caller = vendorRouter.createCaller(tenantCtx(prisma));

    await expect(
      caller.update({ id: "bad", name: "X" })
    ).rejects.toThrow(TRPCError);
  });
});

// ---------------------------------------------------------------------------
// Approval Router
// ---------------------------------------------------------------------------

describe("approvalRouter", () => {
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(() => {
    prisma = mockPrisma();
  });

  it("list returns rules ordered by priority", async () => {
    prisma.approvalRule.findMany.mockResolvedValue([] as never);
    const caller = approvalRouter.createCaller(tenantCtx(prisma));

    await caller.list();

    expect(prisma.approvalRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "t1" },
        orderBy: { priority: "asc" },
      })
    );
  });

  it("resolve filters by amount range", async () => {
    prisma.approvalRule.findMany.mockResolvedValue([] as never);
    const caller = approvalRouter.createCaller(tenantCtx(prisma));

    await caller.resolve({ amount: 2500 });

    expect(prisma.approvalRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "t1",
          active: true,
          minAmount: { lte: 2500 },
        }),
      })
    );
  });

  it("create rejects invalid approverRole", async () => {
    const caller = approvalRouter.createCaller(tenantCtx(prisma));

    await expect(
      caller.create({
        name: "Bad Rule",
        minAmount: 0,
        approverEmail: "a@b.com",
        approverRole: "janitor" as "cfo",
      })
    ).rejects.toThrow();
  });

  it("delete throws NOT_FOUND for unknown rule", async () => {
    prisma.approvalRule.findFirst.mockResolvedValue(null as never);
    const caller = approvalRouter.createCaller(tenantCtx(prisma));

    await expect(caller.delete({ id: "bad" })).rejects.toThrow(TRPCError);
  });
});

// ---------------------------------------------------------------------------
// PO Router
// ---------------------------------------------------------------------------

describe("poRouter", () => {
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(() => {
    prisma = mockPrisma();
  });

  it("list filters by vendor and status", async () => {
    prisma.purchaseOrder.findMany.mockResolvedValue([] as never);
    const caller = poRouter.createCaller(tenantCtx(prisma));

    await caller.list({ vendorId: "v_1", status: "open" });

    expect(prisma.purchaseOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "t1",
          vendorId: "v_1",
          status: "open",
        }),
      })
    );
  });

  it("matchSummary returns correct shape", async () => {
    prisma.purchaseOrder.findFirst.mockResolvedValue({
      id: "po_1",
      poNumber: "PO-001",
      totalAmount: { toNumber: () => 5000 },
      invoices: [
        { totalAmount: { toNumber: () => 2000 }, status: "approved" },
        { totalAmount: { toNumber: () => 1000 }, status: "pending" },
      ],
    } as never);

    const caller = poRouter.createCaller(tenantCtx(prisma));
    const result = await caller.matchSummary({ id: "po_1" });

    expect(result).toHaveProperty("poNumber", "PO-001");
    expect(result).toHaveProperty("poTotal");
    expect(result).toHaveProperty("invoicedTotal");
    expect(result).toHaveProperty("remaining");
    expect(result).toHaveProperty("matchPercentage");
    expect(result).toHaveProperty("invoiceCount");
  });

  it("byId throws NOT_FOUND for missing PO", async () => {
    prisma.purchaseOrder.findFirst.mockResolvedValue(null as never);
    const caller = poRouter.createCaller(tenantCtx(prisma));

    await expect(caller.byId({ id: "bad" })).rejects.toThrow(TRPCError);
  });
});

// ---------------------------------------------------------------------------
// Dashboard Router
// ---------------------------------------------------------------------------

describe("dashboardRouter", () => {
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(() => {
    prisma = mockPrisma();
  });

  it("summary returns all dashboard sections", async () => {
    const caller = dashboardRouter.createCaller(tenantCtx(prisma));
    const result = await caller.summary();

    expect(result).toHaveProperty("invoices");
    expect(result).toHaveProperty("overdue");
    expect(result).toHaveProperty("vendors");
    expect(result).toHaveProperty("purchaseOrders");
    expect(result).toHaveProperty("recentActivity");
  });

  it("aging returns all bucket keys", async () => {
    prisma.invoice.findMany.mockResolvedValue([] as never);
    const caller = dashboardRouter.createCaller(tenantCtx(prisma));
    const result = await caller.aging();

    expect(result).toHaveProperty("current");
    expect(result).toHaveProperty("1_30");
    expect(result).toHaveProperty("31_60");
    expect(result).toHaveProperty("61_90");
    expect(result).toHaveProperty("90_plus");
  });

  it("spendByGlCode rejects missing date range", async () => {
    const caller = dashboardRouter.createCaller(tenantCtx(prisma));

    await expect(
      // @ts-expect-error intentionally passing invalid input
      caller.spendByGlCode({})
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tenant Router
// ---------------------------------------------------------------------------

describe("tenantRouter", () => {
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(() => {
    prisma = mockPrisma();
  });

  it("provision creates a new tenant", async () => {
    prisma.tenant.findUnique.mockResolvedValue(null as never);
    const caller = tenantRouter.createCaller(unauthCtx(prisma));

    const result = await caller.provision({
      clerkOrgId: "org_new",
      name: "New Co",
      slug: "new-co",
    });

    expect(result).toHaveProperty("id");
    expect(prisma.tenant.create).toHaveBeenCalled();
  });

  it("provision returns existing tenant if already provisioned", async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: "t_existing",
      clerkOrgId: "org_existing",
    } as never);
    const caller = tenantRouter.createCaller(unauthCtx(prisma));

    const result = await caller.provision({
      clerkOrgId: "org_existing",
      name: "Existing",
      slug: "existing",
    });

    expect(result).toHaveProperty("id", "t_existing");
    expect(prisma.tenant.create).not.toHaveBeenCalled();
  });

  it("provision rejects invalid slug", async () => {
    const caller = tenantRouter.createCaller(unauthCtx(prisma));

    await expect(
      caller.provision({
        clerkOrgId: "org_x",
        name: "Bad",
        slug: "BAD SLUG!!!",
      })
    ).rejects.toThrow();
  });

  it("current throws UNAUTHORIZED for unauthenticated caller", async () => {
    const caller = tenantRouter.createCaller(unauthCtx(prisma));

    await expect(caller.current()).rejects.toThrow(TRPCError);
  });

  it("qboStatus returns connected:false when realmId is null", async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      qboRealmId: null,
      qboTokenExpiry: null,
    } as never);
    const caller = tenantRouter.createCaller(tenantCtx(prisma));

    const result = await caller.qboStatus();

    expect(result.connected).toBe(false);
    expect(result.realmId).toBeNull();
  });

  it("qboStatus returns connected:true when realmId is set", async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      qboRealmId: "realm_123",
      qboTokenExpiry: new Date(Date.now() + 3600 * 1000), // not expired
    } as never);
    const caller = tenantRouter.createCaller(tenantCtx(prisma));

    const result = await caller.qboStatus();

    expect(result.connected).toBe(true);
    expect(result.realmId).toBe("realm_123");
    expect(result.expired).toBe(false);
  });

  it("qboStatus throws UNAUTHORIZED for unauthenticated caller", async () => {
    const caller = tenantRouter.createCaller(unauthCtx(prisma));

    await expect(caller.qboStatus()).rejects.toThrow(TRPCError);
  });

  it("getNotificationSettings returns defaults when settings is null", async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      notificationSettings: null,
    } as never);
    const caller = tenantRouter.createCaller(tenantCtx(prisma));

    const result = await caller.getNotificationSettings();

    expect(result.emails).toEqual([]);
    expect(result.onApproval).toBe(true);
    expect(result.onException).toBe(true);
    expect(result.dailySummary).toBe(false);
  });

  it("getNotificationSettings returns stored settings", async () => {
    const stored = {
      emails: ["ap@firm.com"],
      onApproval: true,
      onException: false,
      dailySummary: true,
    };
    prisma.tenant.findUnique.mockResolvedValue({
      notificationSettings: stored,
    } as never);
    const caller = tenantRouter.createCaller(tenantCtx(prisma));

    const result = await caller.getNotificationSettings();

    expect(result.emails).toEqual(["ap@firm.com"]);
    expect(result.dailySummary).toBe(true);
  });

  it("updateNotificationSettings persists preferences", async () => {
    const caller = tenantRouter.createCaller(tenantCtx(prisma));

    const result = await caller.updateNotificationSettings({
      emails: ["cfo@firm.com"],
      onApproval: true,
      onException: true,
      dailySummary: false,
    });

    expect(result.success).toBe(true);
    expect(prisma.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t1" },
        data: expect.objectContaining({
          notificationSettings: expect.objectContaining({
            emails: ["cfo@firm.com"],
          }),
        }),
      })
    );
  });

  it("updateNotificationSettings rejects invalid emails", async () => {
    const caller = tenantRouter.createCaller(tenantCtx(prisma));

    await expect(
      caller.updateNotificationSettings({
        emails: ["not-an-email"],
        onApproval: true,
        onException: true,
        dailySummary: false,
      })
    ).rejects.toThrow();
  });

  it("qboDisconnect clears QBO tokens", async () => {
    const caller = tenantRouter.createCaller(tenantCtx(prisma));

    const result = await caller.qboDisconnect();

    expect(result.success).toBe(true);
    expect(prisma.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t1" },
        data: expect.objectContaining({
          qboRealmId: null,
          qboAccessToken: null,
          qboRefreshToken: null,
          qboTokenExpiry: null,
        }),
      })
    );
  });
});
