/**
 * QBO Sync — OAuth2 token management and bill push for QuickBooks Online.
 *
 * Token storage:
 *   - Access and refresh tokens are AES-256-GCM encrypted before writing to
 *     the tenant row. Key comes from QBO_ENCRYPTION_KEY (64 hex chars = 32 bytes).
 *   - Format on disk: "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
 *
 * Flow for syncBillToQbo:
 *   1. Load & decrypt tenant tokens.
 *   2. If access token is expired (or within 5-min buffer), refresh using
 *      intuit-oauth and persist updated tokens.
 *   3. POST to QBO Bills API mapping line items → AccountBasedExpenseLineDetail
 *      using the invoice's GL codes.
 *   4. Write qboBillId + qboSyncedAt back to the invoice row.
 *
 * Reviewer:
 *   - QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_ENVIRONMENT (sandbox|production)
 *     must be set in .env.
 *   - QBO_ENCRYPTION_KEY must be exactly 64 hex chars (openssl rand -hex 32).
 *   - intuit-oauth v4 is already in package.json.
 *   - The QBO Bill "AccountRef.value" is the glCode.code — confirm the tenant's
 *     QBO chart of accounts uses the same codes as the GlCode table.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
// intuit-oauth ships CJS; cast to any to avoid strict TS issues with the
// default export until @types/intuit-oauth lands.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const OAuthClient = require("intuit-oauth") as {
  new (opts: {
    clientId: string;
    clientSecret: string;
    environment: string;
    redirectUri: string;
  }): IntuitOAuthClient;
};

import type { PrismaClient } from "@prisma/client";

// ---------------------------------------------------------------------------
// Minimal shape of the intuit-oauth client we rely on
// ---------------------------------------------------------------------------

interface IntuitToken {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  token_type: string;
  x_refresh_token_expires_in: number;
}

interface IntuitAuthResponse {
  getJson(): IntuitToken;
}

interface IntuitOAuthClient {
  setToken(token: Partial<IntuitToken>): void;
  token: IntuitToken & { isAccessTokenValid(): boolean };
  refreshUsingToken(refreshToken: string): Promise<IntuitAuthResponse>;
}

// ---------------------------------------------------------------------------
// Encryption helpers
// ---------------------------------------------------------------------------

const ALGO = "aes-256-gcm" as const;

function encryptionKey(): Buffer {
  const hex = process.env.QBO_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "QBO_ENCRYPTION_KEY must be set to 64 hex chars (32 bytes). " +
        "Generate with: openssl rand -hex 32"
    );
  }
  return Buffer.from(hex, "hex");
}

export function encryptToken(plaintext: string): string {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptToken(ciphertext: string): string {
  const key = encryptionKey();
  const parts = ciphertext.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted token format");
  const [ivHex, authTagHex, encHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(encHex, "hex");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8"
  );
}

// ---------------------------------------------------------------------------
// OAuth client factory
// ---------------------------------------------------------------------------

function makeOAuthClient(): IntuitOAuthClient {
  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("QBO_CLIENT_ID and QBO_CLIENT_SECRET must be set");
  }
  return new OAuthClient({
    clientId,
    clientSecret,
    environment: process.env.QBO_ENVIRONMENT ?? "sandbox",
    redirectUri: process.env.QBO_REDIRECT_URI ?? "http://localhost:3000/api/qbo/callback",
  });
}

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

/** Load tenant tokens, refresh if expired, return a ready OAuthClient. */
export async function getQboClient(
  tenantId: string,
  prisma: PrismaClient
): Promise<{ client: IntuitOAuthClient; realmId: string }> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      qboRealmId: true,
      qboAccessToken: true,
      qboRefreshToken: true,
      qboTokenExpiry: true,
    },
  });

  if (
    !tenant?.qboRealmId ||
    !tenant.qboAccessToken ||
    !tenant.qboRefreshToken
  ) {
    throw new Error(
      "QBO not connected for this tenant. Complete OAuth flow first."
    );
  }

  const client = makeOAuthClient();
  const accessToken = decryptToken(tenant.qboAccessToken);
  const refreshToken = decryptToken(tenant.qboRefreshToken);

  client.setToken({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  // Refresh if within 5-minute buffer of expiry
  const expiryBuffer = 5 * 60 * 1000;
  const isExpired =
    !tenant.qboTokenExpiry ||
    tenant.qboTokenExpiry.getTime() - Date.now() < expiryBuffer;

  if (isExpired) {
    const authResponse = await client.refreshUsingToken(refreshToken);
    const newToken = authResponse.getJson();

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        qboAccessToken: encryptToken(newToken.access_token),
        qboRefreshToken: encryptToken(newToken.refresh_token),
        qboTokenExpiry: new Date(Date.now() + newToken.expires_in * 1000),
      },
    });

    client.setToken(newToken);
  }

  return { client, realmId: tenant.qboRealmId };
}

/** Store the initial tokens after the OAuth callback. */
export async function saveQboTokens(
  tenantId: string,
  realmId: string,
  accessToken: string,
  refreshToken: string,
  expiresInSeconds: number,
  prisma: PrismaClient
): Promise<void> {
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      qboRealmId: realmId,
      qboAccessToken: encryptToken(accessToken),
      qboRefreshToken: encryptToken(refreshToken),
      qboTokenExpiry: new Date(Date.now() + expiresInSeconds * 1000),
    },
  });
}

// ---------------------------------------------------------------------------
// QBO Bill creation
// ---------------------------------------------------------------------------

export interface QboSyncResult {
  qboBillId: string;
  syncedAt: Date;
}

export async function syncBillToQbo(
  tenantId: string,
  invoiceId: string,
  prisma: PrismaClient
): Promise<QboSyncResult> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, tenantId },
    include: {
      vendor: true,
      lineItems: { include: { glCode: true }, orderBy: { sortOrder: "asc" } },
    },
  });

  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found for tenant ${tenantId}`);
  }
  if (invoice.status !== "approved") {
    throw new Error(
      `Invoice ${invoiceId} must be approved before syncing to QBO (status: ${invoice.status})`
    );
  }
  if (invoice.qboBillId) {
    // Idempotent — return existing bill ID
    return { qboBillId: invoice.qboBillId, syncedAt: invoice.qboSyncedAt! };
  }

  const { client, realmId } = await getQboClient(tenantId, prisma);
  const accessToken: string = client.token.access_token;

  // Build QBO Bill payload
  // VendorRef.value should be the QBO internal vendor ID.
  // We use vendor.code as a best-effort mapping — tenants must ensure their
  // vendor codes match QBO vendor IDs or add a qboVendorId field to Vendor.
  const billPayload = {
    VendorRef: { value: invoice.vendor.code },
    TxnDate: invoice.dueDate.toISOString().split("T")[0],
    DueDate: invoice.dueDate.toISOString().split("T")[0],
    CurrencyRef: { value: invoice.currency },
    Line: invoice.lineItems.map((li) => ({
      Amount: Number(li.amount),
      DetailType: "AccountBasedExpenseLineDetail",
      Description: li.description,
      AccountBasedExpenseLineDetail: {
        AccountRef: {
          // Use GL code if present, fall back to a configurable default account
          value: li.glCode?.code ?? (process.env.QBO_DEFAULT_GL_CODE ?? "7"),
          name: li.glCode?.description ?? "Uncategorized Expense",
        },
        BillableStatus: "NotBillable",
      },
    })),
  };

  const baseUrl =
    process.env.QBO_ENVIRONMENT === "production"
      ? "https://quickbooks.api.intuit.com"
      : "https://sandbox-quickbooks.api.intuit.com";

  const resp = await fetch(
    `${baseUrl}/v3/company/${realmId}/bill?minorversion=65`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(billPayload),
    }
  );

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`QBO API error ${resp.status}: ${body}`);
  }

  const data = (await resp.json()) as { Bill: { Id: string } };
  const qboBillId = data.Bill.Id;
  const syncedAt = new Date();

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { qboBillId, qboSyncedAt: syncedAt },
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      entityType: "invoice",
      entityId: invoiceId,
      action: "qbo_synced",
      changes: { qboBillId, realmId },
    },
  });

  return { qboBillId, syncedAt };
}
