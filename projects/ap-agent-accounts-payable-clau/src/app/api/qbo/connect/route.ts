/**
 * QBO OAuth Connect — redirects the user to the Intuit authorization page.
 *
 * Flow:
 *   1. Verify Clerk session → resolve tenantId from clerkOrgId
 *   2. Build the Intuit OAuth2 authorization URL
 *   3. Redirect the user's browser to Intuit
 *   4. Intuit calls back to /api/qbo/callback with code + realmId
 *
 * Requires env: QBO_CLIENT_ID, QBO_REDIRECT_URI (defaults to localhost)
 *
 * Reviewer: the `state` param is set to tenantId for lightweight origin
 * verification in the callback. For production, replace with a signed nonce
 * stored in a short-lived cookie to prevent CSRF.
 */

import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { db } from "@/server/db";

export const runtime = "nodejs";

export async function GET() {
  const { orgId } = auth();

  if (!orgId) {
    return NextResponse.redirect("/sign-in");
  }

  const tenant = await db.tenant.findUnique({
    where: { clerkOrgId: orgId },
    select: { id: true },
  });

  if (!tenant) {
    return new NextResponse("Tenant not provisioned. Complete onboarding first.", {
      status: 400,
    });
  }

  const clientId = process.env.QBO_CLIENT_ID;
  const redirectUri =
    process.env.QBO_REDIRECT_URI ?? "http://localhost:3000/api/qbo/callback";

  if (!clientId) {
    return new NextResponse("QBO_CLIENT_ID is not configured on this server.", {
      status: 500,
    });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    scope: "com.intuit.quickbooks.accounting",
    redirect_uri: redirectUri,
    response_type: "code",
    state: tenant.id, // tenantId — verified in callback to scope token save
  });

  return NextResponse.redirect(
    `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`
  );
}
