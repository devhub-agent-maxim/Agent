/**
 * Notifier — sends Slack webhook or email for approval requests.
 *
 * Slack:  reads SLACK_WEBHOOK_URL from env. Silently skips if not set so
 *         dev environments without Slack still work.
 * Email:  placeholder — logs to console. Wire in SendGrid / SES / Resend
 *         when the email provider is chosen.
 */

export interface ApprovalNotification {
  invoiceId: string;
  invoiceNumber: string;
  vendorName: string;
  totalAmount: number;
  currency: string;
  approverEmail: string;
  approverRole: string;
  requestId: string;
}

// ---------------------------------------------------------------------------
// Slack
// ---------------------------------------------------------------------------

export async function sendSlackNotification(
  notification: ApprovalNotification
): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return; // not configured — skip gracefully

  const amountFormatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: notification.currency,
  }).format(notification.totalAmount);

  const payload = {
    text: `📋 *Approval Required*`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Invoice ${notification.invoiceNumber}* from *${notification.vendorName}* needs your approval.\n*Amount:* ${amountFormatted}\n*Approver:* ${notification.approverEmail} (${notification.approverRole})\n*Request ID:* \`${notification.requestId}\``,
        },
      },
    ],
  };

  const resp = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    // Log but don't throw — a failed notification must not block the AP workflow
    console.error(
      `[notifier] Slack webhook failed: ${resp.status} ${resp.statusText}`
    );
  }
}

// ---------------------------------------------------------------------------
// Email (stub — replace with SendGrid/SES/Resend)
// ---------------------------------------------------------------------------

export async function sendEmailNotification(
  notification: ApprovalNotification
): Promise<void> {
  const amountFormatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: notification.currency,
  }).format(notification.totalAmount);

  // TODO: replace console.log with actual email provider call
  console.info(
    `[notifier] EMAIL to=${notification.approverEmail} subject="Approval required: ${notification.invoiceNumber}" ` +
      `amount=${amountFormatted} requestId=${notification.requestId}`
  );
}

// ---------------------------------------------------------------------------
// Orchestrator — tries Slack, falls back to email log
// ---------------------------------------------------------------------------

export async function notifyApprover(
  notification: ApprovalNotification
): Promise<void> {
  await Promise.all([
    sendSlackNotification(notification),
    sendEmailNotification(notification),
  ]);
}
