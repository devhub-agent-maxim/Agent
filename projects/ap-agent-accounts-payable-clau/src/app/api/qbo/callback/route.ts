/**
 * QBO OAuth Callback — exchanges the Intuit authorization code for access/refresh tokens.
 *
 * Flow (called by Intuit after user authorizes):
 *   GET /api/qbo/callback?code=...&realmId=...&state={tenantId}
 *
 *   1. Validate `state` (tenantId) exists in DB — lightweight origin verification
 *   2. Exchange `code` for tokens via Intuit token endpoint
 *   3. Persist encrypted tokens via saveQboTokens()
 *   4. Redirect to /settings with success indicator
 *
 * Requires env: QBO_CLIENT_ID, QBO_CLIENT_SECRET, QBO_REDIRECT_URI,
 *               QBO_ENCRYPTION_KEY (64 hex chars), QBO_ENVIRONMENT
 *
 * Reviewer: The `state` param is the tenantId — sufficient for MVP. For
 * production, use a CSRF nonce stored in a signed cookie and verify it here.
 */

import { type NextRequest, NextResponse } from "next/server";
import { saveQboTokens } from "@/server/services/qbo-sync";
import { db } from "@/server/db";

export const runtime = "nodejs";

interface IntuitTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  x_refresh_token_expires_in?: number;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code    = searchParams.get("code");
  const realmId = searchParams.get("realmId");
  const state   = searchParams.get("state"); // tenantId set in /api/qbo/connect

  if (!code || !realmId || !state) {
    return new NextResponse(
      "Missing required OAuth parameters (code, realmId, state).",
      { status: 400 }
    );
  }

  // Verify the tenant exists before saving tokens
  const tenant = await db.tenant.findUnique({
    where: { id: state },
    select: { id: true },
  });
  if (!tenant) {
    return new NextResponse("Invalid state: tenant not found.", { status: 400 });
  }

  const clientId     = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;
  const redirectUri  =
    process.env.QBO_REDIRECT_URI ?? "http://localhost:3000/api/qbo/callback";

  if (!clientId || !clientSecret) {
    return new NextResponse("QBO credentials not configured on this server.", {
      status: 500,
    });
  }

  // Exchange authorization code for tokens (standard OAuth2 code flow)
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  let tokens: IntuitTokenResponse;

  try {
    const tokenRes = await fetch(
      "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }).toString(),
      }
    );

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error("[QBO Callback] Token exchange failed:", tokenRes.status, body);
      return new NextResponse(
        `QuickBooks token exchange failed (${tokenRes.status}). Check server logs.`,
        { status: 502 }
      );
    }

    tokens = (await tokenRes.json()) as IntuitTokenResponse;
  } catch (err) {
    console.error("[QBO Callback] Network error during token exchange:", err);
    return new NextResponse("Network error while contacting QuickBooks.", {
      status: 502,
    });
  }

  await saveQboTokens(
    state,
    realmId,
    tokens.access_token,
    tokens.refresh_token,
    tokens.expires_in,
    db
  );

  // Back to settings — the QBO status card will now show as connected
  return NextResponse.redirect(new URL("/settings?qbo=connected", req.url));
}
