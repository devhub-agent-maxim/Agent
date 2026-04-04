import Link from "next/link";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import { clerkRoleToAppRole } from "@/server/services/auth";

const allNavLinks = [
  { href: "/invoices", label: "Invoices", icon: "📄", minRole: "viewer" as const },
  { href: "/exceptions", label: "Exceptions", icon: "⚠️", minRole: "viewer" as const },
  { href: "/settings", label: "Settings", icon: "⚙️", minRole: "admin" as const },
];

const roleBadgeColors: Record<string, string> = {
  admin: "bg-indigo-500",
  approver: "bg-emerald-500",
  viewer: "bg-gray-500",
};

const roleHierarchy = { admin: 3, approver: 2, viewer: 1 } as const;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { orgRole } = auth();
  const role = clerkRoleToAppRole(orgRole);
  const roleLevel = roleHierarchy[role];

  const visibleLinks = allNavLinks.filter(
    (link) => roleLevel >= roleHierarchy[link.minRole]
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-gray-900 text-gray-100 flex flex-col">
        {/* Brand */}
        <div className="px-4 py-5 border-b border-gray-700">
          <span className="text-sm font-semibold tracking-wide text-white">AP Agent</span>
          <p className="text-xs text-gray-400 mt-0.5">Accounts Payable</p>
        </div>

        {/* Tenant / org switcher */}
        <div className="px-3 py-3 border-b border-gray-700">
          <p className="text-xs text-gray-400 mb-2 uppercase tracking-wider">Client</p>
          <OrganizationSwitcher
            hidePersonal
            appearance={{
              elements: {
                rootBox: "w-full",
                organizationSwitcherTrigger:
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-sm text-gray-100",
              },
            }}
          />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-0.5">
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
            >
              <span>{link.icon}</span>
              {link.label}
            </Link>
          ))}
        </nav>

        {/* User + role badge */}
        <div className="px-4 py-4 border-t border-gray-700 flex items-center gap-2">
          <UserButton afterSignOutUrl="/" />
          <div className="flex flex-col min-w-0">
            <span className="text-xs text-gray-400 truncate">Account</span>
            <span
              className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-white ${roleBadgeColors[role]}`}
            >
              {role}
            </span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
