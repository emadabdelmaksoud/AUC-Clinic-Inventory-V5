import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { visibleSections } from "@/lib/permissions";
import { useQuery } from "@tanstack/react-query";
import { listExpiredBatches, listNearExpiryBatches } from "@/lib/fifo";
import { db } from "@/lib/db";
import {
  LayoutDashboard,
  Box,
  Warehouse,
  BarChart3,
  FileUp,
  Users,
  QrCode,
  ClipboardList,
  HardDrive,
  Settings,
  LogOut,
  Menu,
  X,
  Scale,
  BellRing,
  ShoppingCart,
  ChevronDown,
  Building2,
  Printer,
  ShieldCheck,
  Activity,
  PackageSearch,
  UserSquare2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import PWAInstallButton from "@/components/PWAInstallButton";

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  key?: string;
  badgeKey?: "expiry";
}

interface NavGroup {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    items: [
      { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Inventory",
    icon: PackageSearch,
    items: [
      { label: "Products",   path: "/products",   icon: Box,       key: "products" },
      { label: "Inventory",  path: "/inventory",  icon: Warehouse,  key: "inventory" },
      { label: "Warehouses", path: "/warehouses", icon: Building2,  key: "inventory" },
      { label: "Barcodes",   path: "/barcodes",   icon: QrCode,     key: "barcodes" },
    ],
  },
  {
    label: "Operations",
    icon: Activity,
    items: [
      { label: "Balance",           path: "/balance",          icon: Scale,        key: "reports" },
      { label: "Purchase Requests", path: "/purchase-request", icon: ShoppingCart, key: "inventory" },
      { label: "Print Orders",      path: "/print-order",      icon: Printer,      key: "inventory" },
    ],
  },
  {
    label: "Reports",
    icon: BarChart3,
    items: [
      { label: "Reports",      path: "/reports",      icon: BarChart3,    key: "reports" },
      { label: "Staff Report", path: "/staff-report", icon: UserSquare2,  key: "reports" },
      { label: "Audit Logs",   path: "/audit-logs",   icon: ClipboardList, key: "auditLogs" },
    ],
  },
  {
    label: "Administration",
    icon: ShieldCheck,
    items: [
      { label: "Users",           path: "/users",         icon: Users,     key: "users" },
      { label: "Import / Export", path: "/import-export", icon: FileUp,    key: "importExport" },
      { label: "Backups",         path: "/backups",       icon: HardDrive, key: "backups" },
      { label: "Expiry Alerts",   path: "/expiry",        icon: BellRing,  key: "reports", badgeKey: "expiry" },
      { label: "Settings",        path: "/settings",      icon: Settings,  key: "settings" },
    ],
  },
];

function getActiveGroupIndex(location: string): number {
  const path = location === "/" ? "/dashboard" : location;
  for (let i = 0; i < NAV_GROUPS.length; i++) {
    if (NAV_GROUPS[i].items.some(item =>
      item.path === path ||
      (path.startsWith(item.path + "/") && item.path !== "/")
    )) return i;
  }
  return 0;
}

function BadgeCount({ count, onActive }: { count: number; onActive?: boolean }) {
  if (count <= 0) return null;
  return (
    <span className={cn(
      "flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center leading-none",
      onActive
        ? "bg-white/25 text-white"
        : "bg-destructive text-white"
    )}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const sections = visibleSections(user?.role);

  const { data: nearExpiryDays = 90 } = useQuery({
    queryKey: ["settings", "nearExpiryDays"],
    queryFn: async () => {
      const row = await db.settings.get("nearExpiryDays");
      return Number(row?.value ?? "90");
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: expiryAlertCount = 0 } = useQuery({
    queryKey: ["nav_expiry_badge", nearExpiryDays],
    queryFn: async () => {
      const [expired, near] = await Promise.all([
        listExpiredBatches(),
        listNearExpiryBatches(nearExpiryDays),
      ]);
      return expired.length + near.length;
    },
    staleTime: 1000 * 60,
  });

  const badges: Record<string, number> = { expiry: expiryAlertCount };

  const isActive = (path: string) => {
    if (path === "/dashboard" && (location === "/" || location === "/dashboard")) return true;
    return location.startsWith(path) && path !== "/dashboard";
  };

  const activeGroupIndex = useMemo(() => getActiveGroupIndex(location), [location]);

  const [openGroups, setOpenGroups] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(NAV_GROUPS.map((_, i) => [i, i === activeGroupIndex]))
  );

  const toggleGroup = (index: number) =>
    setOpenGroups(prev => ({ ...prev, [index]: !prev[index] }));

  const isGroupOpen = (index: number) =>
    openGroups[index] ?? index === activeGroupIndex;

  const filterItems = (items: NavItem[]) =>
    items.filter(item => !item.key || sections[item.key as keyof typeof sections]);

  const visibleGroups = NAV_GROUPS
    .map((group, originalIndex) => ({ ...group, originalIndex, items: filterItems(group.items) }))
    .filter(g => g.items.length > 0);

  const Sidebar = () => (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      {/* Brand header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-sidebar-border flex-shrink-0">
        <div className="w-8 h-8 rounded-lg flex-shrink-0 overflow-hidden shadow-sm">
          <img src="/icon.png" alt="Clinic Inventory" className="w-full h-full object-cover" />
        </div>
        <div className="min-w-0">
          <h1 className="font-semibold text-sm text-sidebar-foreground leading-tight">Clinic Inventory</h1>
          <p className="text-[11px] text-sidebar-foreground/50 leading-tight">AUC Clinic System</p>
        </div>
      </div>

      {/* Grouped nav */}
      <nav className="flex-1 overflow-y-auto py-2 scrollbar-thin">
        {visibleGroups.map((group) => {
          const { originalIndex } = group;
          const open = isGroupOpen(originalIndex);
          const GroupIcon = group.icon;
          const hasActive = group.items.some(item => isActive(item.path));
          const groupBadge = group.items.reduce(
            (sum, item) => sum + (item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0), 0
          );

          return (
            <div key={group.label} className="mb-1">
              {/* Section header / toggle */}
              <button
                onClick={() => toggleGroup(originalIndex)}
                className={cn(
                  "w-full flex items-center gap-2 mx-1 px-3 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-wider transition-colors cursor-pointer select-none",
                  hasActive
                    ? "text-sidebar-foreground/70"
                    : "text-sidebar-foreground/35 hover:text-sidebar-foreground/60",
                  "hover:bg-sidebar-accent/40"
                )}
                style={{ width: "calc(100% - 8px)" }}
              >
                <GroupIcon className="w-3 h-3 flex-shrink-0" />
                <span className="flex-1 text-left">{group.label}</span>
                {!open && groupBadge > 0 && <BadgeCount count={groupBadge} />}
                <ChevronDown
                  className={cn(
                    "w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200",
                    open ? "rotate-0" : "-rotate-90"
                  )}
                />
              </button>

              {/* Items */}
              {open && (
                <div className="mt-0.5 space-y-0.5 px-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path);
                    const badge = item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0;

                    return (
                      <Link
                        key={item.path}
                        href={item.path}
                        onClick={() => setSidebarOpen(false)}
                        data-testid={`nav-${item.label.toLowerCase().replace(/[\s/]+/g, "-")}`}
                        className={cn(
                          "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer group",
                          active
                            ? "bg-primary text-white shadow-sm font-medium"
                            : "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground font-normal"
                        )}
                      >
                        <Icon className={cn(
                          "w-4 h-4 flex-shrink-0 transition-colors",
                          active ? "text-white" : "text-sidebar-foreground/45 group-hover:text-sidebar-foreground/80"
                        )} />
                        <span className="flex-1 truncate">{item.label}</span>
                        {badge > 0 && <BadgeCount count={badge} onActive={active} />}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <PWAInstallButton />

      {/* User footer */}
      <div className="flex-shrink-0 px-2 py-3 border-t border-sidebar-border space-y-1">
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-md bg-sidebar-accent/40">
          <div className="w-7 h-7 bg-primary/20 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-primary uppercase">
              {user?.fullName?.[0] ?? user?.username?.[0] ?? "U"}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-sidebar-foreground truncate leading-tight">
              {user?.fullName || user?.username}
            </p>
            <p className="text-[11px] text-sidebar-foreground/50 capitalize leading-tight">{user?.role}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-accent text-xs h-8"
          onClick={signOut}
          data-testid="button-signout"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex flex-col w-56 flex-shrink-0 border-r border-sidebar-border">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative flex flex-col w-64 bg-sidebar z-10 shadow-2xl">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3 text-sidebar-foreground/70 z-10"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-4 h-4" />
            </Button>
            <Sidebar />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b bg-card">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2 flex-1">
            <div className="w-6 h-6 rounded overflow-hidden flex-shrink-0">
              <img src="/icon.png" alt="Clinic Inventory" className="w-full h-full object-cover" />
            </div>
            <span className="font-semibold text-sm">Clinic Inventory</span>
          </div>
          {expiryAlertCount > 0 && (
            <BadgeCount count={expiryAlertCount} />
          )}
        </div>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>

        <div className="flex-shrink-0 border-t border-border bg-card px-4 py-1.5 text-center">
          <p className="text-xs text-muted-foreground">
            Created by <span className="font-medium text-foreground">Emad Ali</span>
          </p>
        </div>
      </div>
    </div>
  );
}
