"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";

// ────────────────────────────────────────────────────────────────────────────
// Tab: Approval Thresholds
// ────────────────────────────────────────────────────────────────────────────

function ApprovalThresholdsTab() {
  const utils = trpc.useUtils();
  const rules = trpc.approval.list.useQuery();

  const createMut = trpc.approval.create.useMutation({
    onSuccess: () => utils.approval.list.invalidate(),
  });
  const deleteMut = trpc.approval.delete.useMutation({
    onSuccess: () => utils.approval.list.invalidate(),
  });

  const [form, setForm] = useState({
    name: "",
    minAmount: "",
    maxAmount: "",
    approverEmail: "",
    approverRole: "manager" as "ap_clerk" | "manager" | "cfo",
    autoApprove: false,
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    createMut.mutate({
      name: form.name,
      minAmount: parseFloat(form.minAmount) || 0,
      maxAmount: form.maxAmount ? parseFloat(form.maxAmount) : undefined,
      approverEmail: form.approverEmail,
      approverRole: form.approverRole,
      autoApprove: form.autoApprove,
    });
    setForm({
      name: "",
      minAmount: "",
      maxAmount: "",
      approverEmail: "",
      approverRole: "manager",
      autoApprove: false,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Approval Rules</h3>
        <p className="text-xs text-gray-500">
          Invoices are routed to approvers based on amount. Rules apply in priority order.
        </p>
      </div>

      {/* Existing rules */}
      {rules.isLoading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : rules.data?.length === 0 ? (
        <p className="text-sm text-gray-400">No approval rules configured.</p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Rule</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Amount Range</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Approver</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Role</th>
                <th className="px-4 py-2 text-xs font-medium text-gray-500">Auto</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rules.data?.map((rule) => (
                <tr key={rule.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-800">{rule.name}</td>
                  <td className="px-4 py-2.5 text-gray-600">
                    ${Number(rule.minAmount).toLocaleString()}
                    {rule.maxAmount ? ` – $${Number(rule.maxAmount).toLocaleString()}` : "+"}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{rule.approverEmail}</td>
                  <td className="px-4 py-2.5">
                    <span className="badge bg-blue-50 text-blue-700">{rule.approverRole}</span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {rule.autoApprove ? (
                      <span className="text-green-600 font-bold">✓</span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => deleteMut.mutate({ id: rule.id })}
                      disabled={deleteMut.isPending}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add rule form */}
      <div className="card p-5">
        <h4 className="text-sm font-semibold text-gray-700 mb-4">Add Approval Rule</h4>
        <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="text-xs font-medium text-gray-600 block mb-1">Rule Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Manager approval > $1,000"
              required
              className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Min Amount ($)</label>
            <input
              type="number"
              value={form.minAmount}
              onChange={(e) => setForm((f) => ({ ...f, minAmount: e.target.value }))}
              placeholder="0"
              required
              min={0}
              className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Max Amount ($, blank = unlimited)</label>
            <input
              type="number"
              value={form.maxAmount}
              onChange={(e) => setForm((f) => ({ ...f, maxAmount: e.target.value }))}
              placeholder="No limit"
              min={0}
              className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Approver Email</label>
            <input
              type="email"
              value={form.approverEmail}
              onChange={(e) => setForm((f) => ({ ...f, approverEmail: e.target.value }))}
              placeholder="approver@firm.com"
              required
              className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Role</label>
            <select
              value={form.approverRole}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  approverRole: e.target.value as "ap_clerk" | "manager" | "cfo",
                }))
              }
              className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="ap_clerk">AP Clerk</option>
              <option value="manager">Manager</option>
              <option value="cfo">CFO</option>
            </select>
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <input
              type="checkbox"
              id="autoApprove"
              checked={form.autoApprove}
              onChange={(e) => setForm((f) => ({ ...f, autoApprove: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            <label htmlFor="autoApprove" className="text-sm text-gray-700">
              Auto-approve (no human review needed for this range)
            </label>
          </div>
          <div className="col-span-2">
            <button
              type="submit"
              disabled={createMut.isPending}
              className="btn-primary"
            >
              {createMut.isPending ? "Saving…" : "Add Rule"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tab: QBO Connection
// ────────────────────────────────────────────────────────────────────────────

function QboConnectionTab() {
  const status = trpc.tenant.qboStatus.useQuery();

  const connected = status.data?.connected;
  const expired = status.data?.expired;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">QuickBooks Online</h3>
        <p className="text-xs text-gray-500">
          Connect your QBO account to automatically sync approved invoices as bills.
        </p>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-3 h-3 rounded-full ${
                connected && !expired ? "bg-green-500" : "bg-gray-300"
              }`}
            />
            <div>
              <p className="text-sm font-medium text-gray-800">
                {status.isLoading
                  ? "Checking…"
                  : connected && !expired
                  ? "Connected"
                  : connected && expired
                  ? "Connected (token expired)"
                  : "Not connected"}
              </p>
              {connected && status.data?.realmId && (
                <p className="text-xs text-gray-500 mt-0.5">Realm ID: {status.data.realmId}</p>
              )}
            </div>
          </div>

          {/* Clicking this triggers the OAuth flow — the actual /api/qbo/connect route
              initiates the Intuit OAuth redirect. */}
          <a
            href="/api/qbo/connect"
            className="btn-primary text-sm"
          >
            {connected ? "Reconnect QBO" : "Connect QuickBooks"}
          </a>
        </div>

        {connected && !expired && (
          <div className="mt-4 bg-green-50 border border-green-200 rounded p-3 text-sm text-green-800">
            ✓ Approved invoices will automatically sync to QBO as bills when marked paid.
          </div>
        )}
      </div>

      <div className="card p-5 space-y-2">
        <h4 className="text-sm font-semibold text-gray-700">How it works</h4>
        <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
          <li>Click "Connect QuickBooks" and authorize AP Agent in Intuit.</li>
          <li>Approved invoices are pushed to QBO as Bills, matched to existing vendors.</li>
          <li>GL codes selected in AP Agent map to QBO expense accounts by code.</li>
          <li>Paid invoices mark the Bill as paid in QBO automatically.</li>
        </ol>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tab: Notification Preferences
// ────────────────────────────────────────────────────────────────────────────

function NotificationsTab() {
  const utils = trpc.useUtils();
  const settingsQ = trpc.tenant.getNotificationSettings.useQuery();
  const updateMut = trpc.tenant.updateNotificationSettings.useMutation({
    onSuccess: () => utils.tenant.getNotificationSettings.invalidate(),
  });

  const [emails, setEmails] = useState("");
  const [onApproval, setOnApproval] = useState(true);
  const [onException, setOnException] = useState(true);
  const [dailySummary, setDailySummary] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settingsQ.data) {
      setEmails(settingsQ.data.emails.join(", "));
      setOnApproval(settingsQ.data.onApproval);
      setOnException(settingsQ.data.onException);
      setDailySummary(settingsQ.data.dailySummary);
    }
  }, [settingsQ.data]);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const emailList = emails
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    updateMut.mutate(
      { emails: emailList, onApproval, onException, dailySummary },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 3000);
        },
      }
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Notification Preferences</h3>
        <p className="text-xs text-gray-500">Configure who gets notified and when.</p>
      </div>

      <form onSubmit={handleSave} className="card p-5 space-y-4">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">
            Notification Emails (comma-separated)
          </label>
          <input
            type="text"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="ap@firm.com, cfo@firm.com"
            className="w-full text-sm border border-gray-200 rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-600 block">Notify on</label>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="onApproval"
              checked={onApproval}
              onChange={(e) => setOnApproval(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            <label htmlFor="onApproval" className="text-sm text-gray-700">
              Invoice approved or rejected
            </label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="onException"
              checked={onException}
              onChange={(e) => setOnException(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            <label htmlFor="onException" className="text-sm text-gray-700">
              New exception added to queue
            </label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="dailySummary"
              checked={dailySummary}
              onChange={(e) => setDailySummary(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            <label htmlFor="dailySummary" className="text-sm text-gray-700">
              Daily AP summary email (9 AM)
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={updateMut.isPending} className="btn-primary">
            {updateMut.isPending ? "Saving…" : "Save Preferences"}
          </button>
          {saved && <span className="text-sm text-green-600">✓ Saved</span>}
        </div>
      </form>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────

type Tab = "thresholds" | "qbo" | "notifications";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("thresholds");

  const tabs: { id: Tab; label: string }[] = [
    { id: "thresholds", label: "Approval Thresholds" },
    { id: "qbo", label: "QBO Connection" },
    { id: "notifications", label: "Notifications" },
  ];

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Settings</h1>

      {/* Tab nav */}
      <div className="flex border-b border-gray-200 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "thresholds" && <ApprovalThresholdsTab />}
      {activeTab === "qbo" && <QboConnectionTab />}
      {activeTab === "notifications" && <NotificationsTab />}
    </div>
  );
}
