/**
 * Role-based access control for the AP Agent.
 *
 * Roles map to Clerk organization membership roles:
 *   - admin:    configure approval rules, connect QBO, full CRUD
 *   - approver: approve/reject invoices, view dashboard
 *   - viewer:   read-only dashboard access
 *
 * Clerk stores the role on the organization membership. We read it from
 * the Clerk session claims via `auth().orgRole`. Clerk prefixes custom
 * roles with "org:" — e.g. "org:admin", "org:approver", "org:viewer".
 *
 * The default Clerk org role is "org:member" — we map that to "viewer"
 * so new users get read-only access until explicitly promoted.
 */

// ---------------------------------------------------------------------------
// Role definitions
// ---------------------------------------------------------------------------

export type AppRole = "admin" | "approver" | "viewer";

/** Map Clerk's org role string to our internal role. */
export function clerkRoleToAppRole(clerkRole: string | null | undefined): AppRole {
  if (!clerkRole) return "viewer";
  const normalized = clerkRole.replace(/^org:/, "");
  if (normalized === "admin") return "admin";
  if (normalized === "approver") return "approver";
  return "viewer";
}

// ---------------------------------------------------------------------------
// Permission definitions
// ---------------------------------------------------------------------------

export type Permission =
  | "invoice:read"
  | "invoice:create"
  | "invoice:approve"
  | "invoice:reject"
  | "invoice:void"
  | "invoice:mark_paid"
  | "vendor:read"
  | "vendor:write"
  | "po:read"
  | "po:write"
  | "approval_rule:read"
  | "approval_rule:write"
  | "dashboard:read"
  | "settings:read"
  | "settings:write"
  | "qbo:connect"
  | "tenant:read"
  | "tenant:write";

const ROLE_PERMISSIONS: Record<AppRole, Set<Permission>> = {
  admin: new Set([
    "invoice:read",
    "invoice:create",
    "invoice:approve",
    "invoice:reject",
    "invoice:void",
    "invoice:mark_paid",
    "vendor:read",
    "vendor:write",
    "po:read",
    "po:write",
    "approval_rule:read",
    "approval_rule:write",
    "dashboard:read",
    "settings:read",
    "settings:write",
    "qbo:connect",
    "tenant:read",
    "tenant:write",
  ]),
  approver: new Set([
    "invoice:read",
    "invoice:create",
    "invoice:approve",
    "invoice:reject",
    "vendor:read",
    "po:read",
    "approval_rule:read",
    "dashboard:read",
    "settings:read",
    "tenant:read",
  ]),
  viewer: new Set([
    "invoice:read",
    "vendor:read",
    "po:read",
    "approval_rule:read",
    "dashboard:read",
    "tenant:read",
  ]),
};

// ---------------------------------------------------------------------------
// Permission checks
// ---------------------------------------------------------------------------

export function hasPermission(role: AppRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function hasAllPermissions(role: AppRole, permissions: Permission[]): boolean {
  return permissions.every((p) => hasPermission(role, p));
}

export function hasAnyPermission(role: AppRole, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

/**
 * Assert a permission or throw. Used in tRPC middleware.
 * Returns void on success, throws TRPCError-shaped error on failure.
 */
export function assertPermission(role: AppRole, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new PermissionDeniedError(role, permission);
  }
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class PermissionDeniedError extends Error {
  public readonly role: AppRole;
  public readonly permission: Permission;

  constructor(role: AppRole, permission: Permission) {
    super(`Role "${role}" lacks permission "${permission}"`);
    this.name = "PermissionDeniedError";
    this.role = role;
    this.permission = permission;
  }
}
