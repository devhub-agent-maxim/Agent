/**
 * PO Matcher — fuzzy-matches an extracted invoice PO number against open
 * PurchaseOrders in the DB, returning a confidence score.
 *
 * Confidence is a weighted blend:
 *   - String similarity (Levenshtein) — 70 %
 *   - Amount tolerance within ±5 %     — 30 %
 *
 * Auto-approve when confidence > 0.9.
 *
 * Reviewer: the 0.7/0.3 weights and 0.9 threshold are configurable — if
 * tenants want stricter matching, surface these as ApprovalRule fields later.
 */

import type { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// Levenshtein distance (iterative, O(n*m) time, O(min(n,m)) space)
// ---------------------------------------------------------------------------

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Keep a and b so that a is always the shorter string
  if (a.length > b.length) [a, b] = [b, a];

  let prev = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    const curr: number[] = [j];
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(prev[i] + 1, curr[i - 1] + 1, prev[i - 1] + cost);
    }
    prev = curr;
  }
  return prev[a.length];
}

// ---------------------------------------------------------------------------
// String similarity: 0 = completely different, 1 = identical
// ---------------------------------------------------------------------------

export function stringSimilarity(a: string, b: string): number {
  const normA = a.trim().toUpperCase().replace(/[\s-]+/g, "");
  const normB = b.trim().toUpperCase().replace(/[\s-]+/g, "");
  if (normA === normB) return 1;
  const dist = levenshtein(normA, normB);
  const maxLen = Math.max(normA.length, normB.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

// ---------------------------------------------------------------------------
// Amount tolerance score: 1.0 if within ±5 %, decays linearly to 0 beyond
// ---------------------------------------------------------------------------

export function amountScore(invoiceAmount: number, poAmount: number): number {
  if (poAmount === 0) return 0;
  const diff = Math.abs(invoiceAmount - poAmount) / poAmount;
  const TOLERANCE = 0.05;
  if (diff <= TOLERANCE) return 1;
  // Linear decay: 0 at 3× tolerance
  return Math.max(0, 1 - (diff - TOLERANCE) / (TOLERANCE * 2));
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PoMatchResult {
  poId: string;
  poNumber: string;
  confidence: number; // 0–1
  autoApproved: boolean;
}

const AUTO_APPROVE_THRESHOLD = 0.9;
const STRING_WEIGHT = 0.7;
const AMOUNT_WEIGHT = 0.3;

// ---------------------------------------------------------------------------
// Main match function
// ---------------------------------------------------------------------------

export async function matchPo(
  tenantId: string,
  extractedPoNumber: string | null | undefined,
  invoiceAmount: number,
  prisma: PrismaClient
): Promise<PoMatchResult | null> {
  if (!extractedPoNumber?.trim()) return null;

  const openPos = await prisma.purchaseOrder.findMany({
    where: { tenantId, status: { in: ["open", "partially_matched"] } },
    select: { id: true, poNumber: true, totalAmount: true },
  });

  if (openPos.length === 0) return null;

  let best: PoMatchResult | null = null;

  for (const po of openPos) {
    const strScore = stringSimilarity(extractedPoNumber, po.poNumber);
    const amtScore = amountScore(invoiceAmount, Number(po.totalAmount));
    const confidence = strScore * STRING_WEIGHT + amtScore * AMOUNT_WEIGHT;

    if (best === null || confidence > best.confidence) {
      best = {
        poId: po.id,
        poNumber: po.poNumber,
        confidence,
        autoApproved: confidence >= AUTO_APPROVE_THRESHOLD,
      };
    }
  }

  // Only return a match if string similarity is at least 50 % —
  // prevents amount-only coincidences from matching unrelated POs
  if (best && stringSimilarity(extractedPoNumber, best.poNumber) < 0.5) {
    return null;
  }

  return best;
}
