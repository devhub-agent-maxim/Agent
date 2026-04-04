/**
 * Unit tests for the three new AP services:
 *   - po-matcher   (pure logic + Prisma mock)
 *   - approval-router  (Prisma mock + notifier mock)
 *   - qbo-sync     (crypto helpers + Prisma mock + fetch mock)
 *
 * All Prisma calls are mocked — no DB required.
 * fetch is mocked globally for QBO API calls.
 */

import { describe, it, expect, beforeEach, jest, afterEach } from "@jest/globals";

// ---------------------------------------------------------------------------
// Mock fetch globally before importing service modules
// ---------------------------------------------------------------------------

const mockFetch = jest.fn();
(global as unknown as Record<string, unknown>).fetch = mockFetch;

// ---------------------------------------------------------------------------
// PO Matcher — pure unit tests (no Prisma needed for Levenshtein)
// ---------------------------------------------------------------------------

import {
  levenshtein,
  stringSimilarity,
  amountScore,
  matchPo,
} from "../server/services/po-matcher";

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("PO-001", "PO-001")).toBe(0);
  });

  it("returns length of other string when one is empty", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });

  it("correctly computes distance for known pair", () => {
    // kitten → sitting = 3 edits
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });

  it("is symmetric", () => {
    expect(levenshtein("PO-100", "PO-1000")).toBe(
      levenshtein("PO-1000", "PO-100")
    );
  });
});

describe("stringSimilarity", () => {
  it("returns 1 for identical strings (case-insensitive, spacing-normalised)", () => {
    expect(stringSimilarity("PO-001", "po-001")).toBe(1);
    expect(stringSimilarity("PO 001", "PO-001")).toBe(1);
  });

  it("returns >= 0.8 for one-character difference", () => {
    // PO001 vs PO002 — only last digit differs (1 edit / 5 chars = 0.8)
    expect(stringSimilarity("PO001", "PO002")).toBeGreaterThanOrEqual(0.8);
  });

  it("returns low score for completely different strings", () => {
    expect(stringSimilarity("PO001", "ZZZZZZ")).toBeLessThan(0.3);
  });
});

describe("amountScore", () => {
  it("returns 1 when amounts are equal", () => {
    expect(amountScore(1000, 1000)).toBe(1);
  });

  it("returns 1 when within 5% tolerance", () => {
    expect(amountScore(1040, 1000)).toBe(1); // 4% diff
    expect(amountScore(960, 1000)).toBe(1);  // 4% diff
  });

  it("returns < 1 when outside 5% tolerance", () => {
    expect(amountScore(1100, 1000)).toBeLessThan(1); // 10% diff
  });

  it("returns 0 for poAmount=0 to avoid division by zero", () => {
    expect(amountScore(100, 0)).toBe(0);
  });
});

describe("matchPo (with mocked Prisma)", () => {
  const mockPrisma = {
    purchaseOrder: {
      findMany: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns null when no PO number is extracted", async () => {
    const result = await matchPo(
      "t1",
      null,
      1000,
      mockPrisma as never
    );
    expect(result).toBeNull();
    expect(mockPrisma.purchaseOrder.findMany).not.toHaveBeenCalled();
  });

  it("returns null when no open POs exist", async () => {
    mockPrisma.purchaseOrder.findMany.mockResolvedValue([] as never);
    const result = await matchPo("t1", "PO-001", 1000, mockPrisma as never);
    expect(result).toBeNull();
  });

  it("returns high-confidence match for exact PO number + matching amount", async () => {
    mockPrisma.purchaseOrder.findMany.mockResolvedValue([
      { id: "po_1", poNumber: "PO-001", totalAmount: { toNumber: () => 1000 }, toString: () => "1000" },
    ] as never);

    // Simulate Decimal — po-matcher uses Number(po.totalAmount)
    mockPrisma.purchaseOrder.findMany.mockResolvedValue([
      { id: "po_1", poNumber: "PO-001", totalAmount: 1000 },
    ] as never);

    const result = await matchPo("t1", "PO-001", 1000, mockPrisma as never);
    expect(result).not.toBeNull();
    expect(result!.poId).toBe("po_1");
    expect(result!.confidence).toBeGreaterThan(0.9);
    expect(result!.autoApproved).toBe(true);
  });

  it("returns lower confidence for similar but not exact PO + amount mismatch", async () => {
    mockPrisma.purchaseOrder.findMany.mockResolvedValue([
      { id: "po_2", poNumber: "PO-001", totalAmount: 1500 },
    ] as never);

    const result = await matchPo("t1", "PO-001", 800, mockPrisma as never);
    // String similarity is high but amount is off
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeLessThan(0.9);
    expect(result!.autoApproved).toBe(false);
  });

  it("returns null when string similarity is below 50% threshold", async () => {
    mockPrisma.purchaseOrder.findMany.mockResolvedValue([
      { id: "po_3", poNumber: "ZZZZZZZZ", totalAmount: 1000 },
    ] as never);

    const result = await matchPo("t1", "PO-001", 1000, mockPrisma as never);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Approval Router
// ---------------------------------------------------------------------------

import { routeApproval } from "../server/services/approval-router";

// Mock notifier so it doesn't try to POST to Slack
jest.mock("../server/services/notifier", () => ({
  notifyApprover: jest.fn().mockResolvedValue(undefined as never),
}));

function makeApprovalPrisma(overrides: Record<string, unknown> = {}) {
  return {
    approvalRule: {
      findMany: jest.fn().mockResolvedValue([] as never),
    },
    approvalRequest: {
      create: jest.fn().mockResolvedValue({ id: "req_1" } as never),
      update: jest.fn().mockResolvedValue({ id: "req_1" } as never),
    },
    invoice: {
      findFirst: jest.fn().mockResolvedValue({
        id: "inv_1",
        invoiceNumber: "INV-001",
        currency: "USD",
        dueDate: new Date(),
        vendor: { name: "ACME Corp" },
      } as never),
      update: jest.fn().mockResolvedValue({ id: "inv_1" } as never),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({ id: "al_1" } as never),
    },
    ...overrides,
  };
}

describe("routeApproval", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates an unassigned request when no rules match", async () => {
    const prisma = makeApprovalPrisma();
    const result = await routeApproval(
      "t1",
      "inv_1",
      500,
      "user_1",
      "user@test.com",
      prisma as never
    );

    expect(result.matchedRules).toBe(0);
    expect(result.autoApproved).toBe(false);
    expect(result.requestIds).toHaveLength(1);
    expect(prisma.approvalRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "pending" }),
      })
    );
  });

  it("auto-approves and updates invoice when all rules have autoApprove=true", async () => {
    const prisma = makeApprovalPrisma({
      approvalRule: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "rule_1",
            approverEmail: "ap@co.com",
            approverRole: "ap_clerk",
            autoApprove: true,
          },
        ] as never),
      },
    });

    const result = await routeApproval(
      "t1",
      "inv_1",
      200,
      "user_1",
      "user@test.com",
      prisma as never
    );

    expect(result.autoApproved).toBe(true);
    expect(prisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "approved" }),
      })
    );
  });

  it("does NOT auto-approve when at least one rule requires manual review", async () => {
    const prisma = makeApprovalPrisma({
      approvalRule: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "rule_1",
            approverEmail: "manager@co.com",
            approverRole: "manager",
            autoApprove: false,
          },
        ] as never),
      },
    });

    const result = await routeApproval(
      "t1",
      "inv_1",
      5000,
      "user_1",
      "user@test.com",
      prisma as never
    );

    expect(result.autoApproved).toBe(false);
    expect(prisma.invoice.update).not.toHaveBeenCalled();
  });

  it("creates one request per matched rule", async () => {
    const prisma = makeApprovalPrisma({
      approvalRule: {
        findMany: jest.fn().mockResolvedValue([
          { id: "rule_1", approverEmail: "ap@co.com", approverRole: "ap_clerk", autoApprove: false },
          { id: "rule_2", approverEmail: "cfo@co.com", approverRole: "cfo", autoApprove: false },
        ] as never),
      },
    });

    const result = await routeApproval(
      "t1",
      "inv_1",
      50000,
      "user_1",
      null,
      prisma as never
    );

    expect(result.requestIds).toHaveLength(2);
    expect(result.matchedRules).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// QBO Sync — crypto helpers
// ---------------------------------------------------------------------------

import { encryptToken, decryptToken } from "../server/services/qbo-sync";

describe("encryptToken / decryptToken", () => {
  beforeEach(() => {
    // Set a valid 64-hex-char key for tests
    process.env.QBO_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });

  afterEach(() => {
    delete process.env.QBO_ENCRYPTION_KEY;
  });

  it("round-trips an access token", () => {
    const token = "ya29.some_oauth_access_token_value";
    expect(decryptToken(encryptToken(token))).toBe(token);
  });

  it("produces different ciphertext each call (random IV)", () => {
    const token = "same_token";
    const ct1 = encryptToken(token);
    const ct2 = encryptToken(token);
    expect(ct1).not.toBe(ct2);
    // But both decrypt correctly
    expect(decryptToken(ct1)).toBe(token);
    expect(decryptToken(ct2)).toBe(token);
  });

  it("throws on missing key", () => {
    delete process.env.QBO_ENCRYPTION_KEY;
    expect(() => encryptToken("x")).toThrow("QBO_ENCRYPTION_KEY");
  });

  it("throws on tampered ciphertext (auth tag mismatch)", () => {
    const ct = encryptToken("token");
    const [iv, tag, enc] = ct.split(":");
    // Flip first byte of ciphertext
    const tampered = `${iv}:${tag}:ff${enc.slice(2)}`;
    expect(() => decryptToken(tampered)).toThrow();
  });
});
