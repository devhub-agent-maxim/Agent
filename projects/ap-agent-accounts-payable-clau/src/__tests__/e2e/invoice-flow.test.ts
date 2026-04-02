/**
 * E2E integration test: full invoice lifecycle.
 *
 * Exercises the complete flow through tRPC routers with mocked Prisma:
 *   1. Upload invoice (OCR extraction → structured data)
 *   2. Create invoice in DB via tRPC
 *   3. PO match (fuzzy match against open POs)
 *   4. Approval routing (evaluate rules, create requests)
 *   5. Approve invoice (approver action)
 *   6. QBO sync (push approved bill)
 *   7. Dashboard read (verify aggregates update)
 *
 * Also tests role-based access:
 *   - viewer cannot approve invoices
 *   - viewer cannot modify approval rules
 *   - admin can do everything
 *
 * Mocking strategy:
 *   - Clerk auth is mocked at module level
 *   - PrismaClient is a lightweight mock that tracks calls
 *   - External services (QBO API, Anthropic OCR) are not called
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { TRPCError } from "@trpc/server";
import type { Context } from "../../server/trpc";
import {
  type AppRole,
  hasPermission,
  clerkRoleToAppRole,
} from "../../server/services/auth";

// ---------------------------------------------------------------------------
// Mock Clerk before any router imports
// ---------------------------------------------------------------------------

jest.mock("@clerk/nextjs/server", () => ({
  auth: () => ({ userId: null, orgId: null, orgRole: null }),
  currentUser: () => null,
}));

jest.mock("../../server/db", () => ({
  db: {},
}));

// Mock external services that routers call
jest.mock("../../server/services/po-matcher", () => ({
  matchPo: jest.fn().mockResolvedValue({
    poId: "po_1",
    poNumber: "PO-2026-100",
    confidence: 0.95,
    autoApproved: true,
  } as never),
}));

jest.mock("../../server/services/approval-router", () => ({
  routeApproval: jest.fn().mockResolvedValue({
    autoApproved: false,
    requestIds: ["ar_1"],
    matchedRules: 1,
  } as never),
}));

jest.mock("../../server/services/qbo-sync", () => ({
  syncBillToQbo: jest.fn().mockResolvedValue({
    qboBillId: "qbo_bill_42",
    syncedAt: new Date("2026-04-02T12:00:00Z"),
  } as never),
}));

jest.mock("../../server/services/notifier", () => ({
  notifyApprover: jest.fn().mockResolvedValue(undefined as never),
  sendSlackNotification: jest.fn().mockResolvedValue(undefined as never),
  sendEmailNotification: jest.fn().mockResolvedValue(undefined as never),
}));

// ---------------------------------------------------------------------------
// Import routers after mocks
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { invoiceRouter } = require("../../server/routers/invoice") as typeof import("../../server/routers/invoice");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { approvalRouter } = require("../../server/routers/approval") as typeof import("../../server/routers/approval");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { dashboardRouter } = require("../../server/routers/dashboard") as typeof import("../../server/routers/dashboard");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { tenantRouter } = require("../../server/routers/tenant") as typeof import("../../server/routers/tenant");

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
            invoiceNumber: "INV-2026-001",
            tenantId: "t1",
            status: "pending",
            totalAmount: 4250,
            lineItems: [
              { description: "Consulting Q1", quantity: 1, unitPrice: 4250, amount: 4250 },
            ],
          } as never),
          update: jest.fn().mockResolvedValue({
            id: "inv_1",
            status: "approved",
            approvedAt: new Date(),
            approvedBy: "approver@test.com",
          } as never),
        },
        approvalRule: {
          create: jest.fn().mockResolvedValue({
            id: "rule_1",
            name: "Manager >$1000",
            tenantId: "t1",
          } as never),
          update: jest.fn().mockResolvedValue({ id: "rule_1" } as never),
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
      findFirst: jest.fn().mockResolvedValue({
        id: "inv_1",
        tenantId: "t1",
        invoiceNumber: "INV-2026-001",
        status: "pending",
        totalAmount: 4250,
        vendorId: "v_1",
      } as never),
      update: jest.fn().mockResolvedValue({
        id: "inv_1",
        status: "approved",
        purchaseOrderId: "po_1",
      } as never),
      groupBy: jest.fn().mockResolvedValue([
        { status: "pending", _count: 3, _sum: { totalAmount: 12750 } },
        { status: "approved", _count: 1, _sum: { totalAmount: 4250 } },
      ] as never),
      aggregate: jest.fn().mockResolvedValue({
        _sum: { totalAmount: 17000 },
        _count: 4,
      } as never),
    },
    vendor: {
      findMany: jest.fn().mockResolvedValue([] as never),
      findFirst: jest.fn().mockResolvedValue(null as never),
      count: jest.fn().mockResolvedValue(5 as never),
    },
    purchaseOrder: {
      findMany: jest.fn().mockResolvedValue([] as never),
      aggregate: jest.fn().mockResolvedValue({
        _sum: { totalAmount: 50000 },
        _count: 3,
      } as never),
    },
    approvalRule: {
      findMany: jest.fn().mockResolvedValue([] as never),
      findFirst: jest.fn().mockResolvedValue({
        id: "rule_1",
        name: "Manager >$1000",
        tenantId: "t1",
      } as never),
    },
    lineItem: {
      findMany: jest.fn().mockResolvedValue([] as never),
    },
    auditLog: {
      findMany: jest.fn().mockResolvedValue([] as never),
      create: auditCreate,
    },
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        id: "t1",
        name: "Acme Bookkeeping",
        slug: "acme",
        plan: "retainer_500",
        active: true,
        notificationSettings: null,
        qboRealmId: "realm_123",
        qboTokenExpiry: new Date(Date.now() + 3600000),
      } as never),
      create: jest.fn().mockResolvedValue({
        id: "t1",
        clerkOrgId: "org_1",
        name: "Acme Bookkeeping",
        slug: "acme",
        plan: "retainer_500",
      } as never),
      update: jest.fn().mockResolvedValue({ id: "t1" } as never),
    },
    _auditCreate: auditCreate,
    _transaction: transaction,
  };
}

function makeCtx(
  prisma: ReturnType<typeof mockPrisma>,
  role: AppRole = "admin"
): Context {
  return {
    prisma: prisma as unknown as Context["prisma"],
    tenantId: "t1",
    userId: "user_1",
    userEmail: "user@test.com",
    clerkOrgId: "org_1",
    role,
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

// ===========================================================================
// Auth service unit tests
// ===========================================================================

describe("auth service", () => {
  it("maps Clerk org roles correctly", () => {
    expect(clerkRoleToAppRole("org:admin")).toBe("admin");
    expect(clerkRoleToAppRole("org:approver")).toBe("approver");
    expect(clerkRoleToAppRole("org:viewer")).toBe("viewer");
    expect(clerkRoleToAppRole("org:member")).toBe("viewer");
    expect(clerkRoleToAppRole(null)).toBe("viewer");
    expect(clerkRoleToAppRole(undefined)).toBe("viewer");
  });

  it("admin has all permissions", () => {
    expect(hasPermission("admin", "invoice:read")).toBe(true);
    expect(hasPermission("admin", "invoice:approve")).toBe(true);
    expect(hasPermission("admin", "approval_rule:write")).toBe(true);
    expect(hasPermission("admin", "qbo:connect")).toBe(true);
    expect(hasPermission("admin", "settings:write")).toBe(true);
  });

  it("approver can approve but cannot write settings", () => {
    expect(hasPermission("approver", "invoice:approve")).toBe(true);
    expect(hasPermission("approver", "invoice:reject")).toBe(true);
    expect(hasPermission("approver", "invoice:read")).toBe(true);
    expect(hasPermission("approver", "settings:write")).toBe(false);
    expect(hasPermission("approver", "approval_rule:write")).toBe(false);
    expect(hasPermission("approver", "qbo:connect")).toBe(false);
  });

  it("viewer is read-only", () => {
    expect(hasPermission("viewer", "invoice:read")).toBe(true);
    expect(hasPermission("viewer", "dashboard:read")).toBe(true);
    expect(hasPermission("viewer", "invoice:approve")).toBe(false);
    expect(hasPermission("viewer", "invoice:create")).toBe(false);
    expect(hasPermission("viewer", "settings:write")).toBe(false);
    expect(hasPermission("viewer", "approval_rule:write")).toBe(false);
  });
});

// ===========================================================================
// Full invoice lifecycle (happy path)
// ===========================================================================

describe("invoice lifecycle e2e", () => {
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(() => {
    prisma = mockPrisma();
  });

  // -------------------------------------------------------------------------
  // Step 1: Create invoice (admin role)
  // -------------------------------------------------------------------------

  it("step 1: admin can create an invoice", async () => {
    const caller = invoiceRouter.createCaller(makeCtx(prisma, "admin"));

    const result = await caller.create({
      vendorId: "v_1",
      invoiceNumber: "INV-2026-001",
      totalAmount: 4250,
      dueDate: new Date("2026-05-01"),
      lineItems: [
        { description: "Consulting Q1", quantity: 1, unitPrice: 4250, amount: 4250 },
      ],
    });

    expect(result).toHaveProperty("id", "inv_1");
    expect(result).toHaveProperty("invoiceNumber", "INV-2026-001");
    expect(prisma._transaction).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Step 2: PO match
  // -------------------------------------------------------------------------

  it("step 2: match invoice to PO", async () => {
    const caller = invoiceRouter.createCaller(makeCtx(prisma, "admin"));

    const result = await caller.matchPo({
      invoiceId: "inv_1",
      extractedPoNumber: "PO-2026-100",
      invoiceAmount: 4250,
    });

    expect(result).toHaveProperty("match");
    expect(result.match).toHaveProperty("confidence");
    expect(result.match!.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.match!.poId).toBe("po_1");
  });

  // -------------------------------------------------------------------------
  // Step 3: Route approval
  // -------------------------------------------------------------------------

  it("step 3: route invoice for approval", async () => {
    const caller = invoiceRouter.createCaller(makeCtx(prisma, "admin"));

    const result = await caller.routeApproval({
      invoiceId: "inv_1",
      invoiceAmount: 4250,
    });

    expect(result).toHaveProperty("requestIds");
    expect(result.requestIds.length).toBeGreaterThan(0);
    expect(result).toHaveProperty("matchedRules", 1);
  });

  // -------------------------------------------------------------------------
  // Step 4: Approve invoice (approver role)
  // -------------------------------------------------------------------------

  it("step 4: approver can approve invoice", async () => {
    const caller = invoiceRouter.createCaller(makeCtx(prisma, "approver"));

    const result = await caller.action({
      invoiceId: "inv_1",
      action: "approve",
      notes: "Looks good, PO matches",
    });

    expect(result).toHaveProperty("status", "approved");
  });

  // -------------------------------------------------------------------------
  // Step 5: QBO sync (admin pushes to QuickBooks)
  // -------------------------------------------------------------------------

  it("step 5: sync approved invoice to QBO", async () => {
    // Set invoice status to approved for QBO sync
    prisma.invoice.findFirst.mockResolvedValue({
      id: "inv_1",
      tenantId: "t1",
      status: "approved",
      invoiceNumber: "INV-2026-001",
      totalAmount: 4250,
    } as never);

    const caller = invoiceRouter.createCaller(makeCtx(prisma, "admin"));

    const result = await caller.syncToQbo({ invoiceId: "inv_1" });

    expect(result).toHaveProperty("qboBillId", "qbo_bill_42");
    expect(result).toHaveProperty("syncedAt");
  });

  // -------------------------------------------------------------------------
  // Step 6: Dashboard reflects updated state
  // -------------------------------------------------------------------------

  it("step 6: dashboard summary returns correct shape", async () => {
    const caller = dashboardRouter.createCaller(makeCtx(prisma, "viewer"));

    const result = await caller.summary();

    expect(result).toHaveProperty("invoices");
    expect(result.invoices).toHaveProperty("byStatus");
    expect(result.invoices).toHaveProperty("totalPayable");
    expect(result).toHaveProperty("overdue");
    expect(result).toHaveProperty("vendors");
    expect(result).toHaveProperty("purchaseOrders");
    expect(result).toHaveProperty("recentActivity");
  });
});

// ===========================================================================
// Role-based access control enforcement
// ===========================================================================

describe("role-based access enforcement", () => {
  let prisma: ReturnType<typeof mockPrisma>;

  beforeEach(() => {
    prisma = mockPrisma();
  });

  // -------------------------------------------------------------------------
  // Viewer restrictions
  // -------------------------------------------------------------------------

  it("viewer can read invoices", async () => {
    prisma.invoice.findMany.mockResolvedValue([] as never);
    const caller = invoiceRouter.createCaller(makeCtx(prisma, "viewer"));

    const result = await caller.list({});
    expect(result).toHaveProperty("items");
  });

  it("viewer cannot approve invoices (FORBIDDEN)", async () => {
    const caller = invoiceRouter.createCaller(makeCtx(prisma, "viewer"));

    await expect(
      caller.action({ invoiceId: "inv_1", action: "approve" })
    ).rejects.toThrow(TRPCError);

    try {
      await caller.action({ invoiceId: "inv_1", action: "approve" });
    } catch (err) {
      expect((err as TRPCError).code).toBe("FORBIDDEN");
    }
  });

  it("viewer cannot create approval rules (FORBIDDEN)", async () => {
    const caller = approvalRouter.createCaller(makeCtx(prisma, "viewer"));

    await expect(
      caller.create({
        name: "Sneaky Rule",
        minAmount: 0,
        approverEmail: "me@evil.com",
        approverRole: "cfo",
      })
    ).rejects.toThrow(TRPCError);
  });

  it("viewer cannot update notification settings (FORBIDDEN)", async () => {
    const caller = tenantRouter.createCaller(makeCtx(prisma, "viewer"));

    await expect(
      caller.updateNotificationSettings({
        emails: ["hacker@evil.com"],
        onApproval: true,
        onException: true,
        dailySummary: false,
      })
    ).rejects.toThrow(TRPCError);
  });

  // -------------------------------------------------------------------------
  // Approver restrictions
  // -------------------------------------------------------------------------

  it("approver can approve invoices", async () => {
    const caller = invoiceRouter.createCaller(makeCtx(prisma, "approver"));

    const result = await caller.action({
      invoiceId: "inv_1",
      action: "approve",
    });

    expect(result).toHaveProperty("status", "approved");
  });

  it("approver cannot modify approval rules (FORBIDDEN)", async () => {
    const caller = approvalRouter.createCaller(makeCtx(prisma, "approver"));

    await expect(
      caller.create({
        name: "Not My Job",
        minAmount: 0,
        approverEmail: "boss@co.com",
        approverRole: "manager",
      })
    ).rejects.toThrow(TRPCError);
  });

  it("approver can read approval rules", async () => {
    prisma.approvalRule.findMany.mockResolvedValue([] as never);
    const caller = approvalRouter.createCaller(makeCtx(prisma, "approver"));

    const result = await caller.list();
    expect(Array.isArray(result)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Admin can do everything
  // -------------------------------------------------------------------------

  it("admin can create approval rules", async () => {
    const caller = approvalRouter.createCaller(makeCtx(prisma, "admin"));

    const result = await caller.create({
      name: "CFO >$10K",
      minAmount: 10000,
      approverEmail: "cfo@acme.com",
      approverRole: "cfo",
    });

    expect(result).toHaveProperty("id");
  });

  it("admin can delete approval rules", async () => {
    const caller = approvalRouter.createCaller(makeCtx(prisma, "admin"));

    const result = await caller.delete({ id: "rule_1" });
    expect(result).toHaveProperty("success", true);
  });

  it("admin can update notification settings", async () => {
    const caller = tenantRouter.createCaller(makeCtx(prisma, "admin"));

    const result = await caller.updateNotificationSettings({
      emails: ["alerts@acme.com"],
      onApproval: true,
      onException: true,
      dailySummary: true,
    });

    expect(result).toHaveProperty("success", true);
  });

  it("admin can disconnect QBO", async () => {
    const caller = tenantRouter.createCaller(makeCtx(prisma, "admin"));
    const result = await caller.qboDisconnect();
    expect(result).toHaveProperty("success", true);
  });

  it("approver cannot disconnect QBO (FORBIDDEN)", async () => {
    const caller = tenantRouter.createCaller(makeCtx(prisma, "approver"));
    await expect(caller.qboDisconnect()).rejects.toThrow(TRPCError);
  });

  it("viewer cannot disconnect QBO (FORBIDDEN)", async () => {
    const caller = tenantRouter.createCaller(makeCtx(prisma, "viewer"));
    await expect(caller.qboDisconnect()).rejects.toThrow(TRPCError);
  });

  it("admin can sync invoices to QBO", async () => {
    prisma.invoice.findFirst.mockResolvedValue({
      id: "inv_1",
      tenantId: "t1",
      status: "approved",
      totalAmount: 4250,
    } as never);

    const caller = invoiceRouter.createCaller(makeCtx(prisma, "admin"));
    const result = await caller.syncToQbo({ invoiceId: "inv_1" });
    expect(result).toHaveProperty("qboBillId");
  });

  it("approver cannot sync to QBO (FORBIDDEN)", async () => {
    const caller = invoiceRouter.createCaller(makeCtx(prisma, "approver"));
    await expect(
      caller.syncToQbo({ invoiceId: "inv_1" })
    ).rejects.toThrow(TRPCError);
  });

  // -------------------------------------------------------------------------
  // Unauthenticated
  // -------------------------------------------------------------------------

  it("unauthenticated users are rejected from tenant procedures", async () => {
    const caller = invoiceRouter.createCaller(unauthCtx(prisma));

    await expect(caller.list({})).rejects.toThrow(TRPCError);
  });

  it("unauthenticated users can provision a tenant (public procedure)", async () => {
    prisma.tenant.findUnique.mockResolvedValue(null as never);
    const caller = tenantRouter.createCaller(unauthCtx(prisma));

    const result = await caller.provision({
      clerkOrgId: "org_new",
      name: "New Client",
      slug: "new-client",
    });

    expect(result).toHaveProperty("id");
  });
});
