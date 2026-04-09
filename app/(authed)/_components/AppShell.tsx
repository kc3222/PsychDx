"use client";

import { ReactNode, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ClipboardList,
  FileText,
  History,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
} from "lucide-react";

type NavItem = {
  key: "diagnose" | "patients" | "history" | "reports";
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number }>;
};

const NAV_ITEMS: NavItem[] = [
  { key: "diagnose", label: "Diagnose", href: "/home", icon: ClipboardList },
  { key: "patients", label: "Patients", href: "/patients", icon: Users },
  { key: "history", label: "History", href: "/history", icon: History },
  { key: "reports", label: "Reports", href: "/reports", icon: FileText },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const activeKey = useMemo(() => {
    const item = NAV_ITEMS.find((x) => isActive(pathname, x.href));
    return item?.key ?? "diagnose";
  }, [pathname]);

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <main className="ccc-main">
      <div className={`ccc-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        <aside className="ccc-sidebar">
          <div className="ccc-sidebar-top">
            <h1 className="sidebar-title">PsychDx</h1>
            <button
              type="button"
              className="sidebar-toggle"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <span className="icon-collapsed">
                <PanelLeftOpen size={20} />
              </span>
              <span className="icon-expanded">
                <PanelLeftClose size={20} />
              </span>
            </button>
          </div>

          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.key === activeKey;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`ccc-navlink ${active ? "active" : ""}`}
                aria-label={item.label}
                title={item.label}
              >
                <Icon size={20} />
                <span className="nav-label">{item.label}</span>
              </Link>
            );
          })}

          <button
            type="button"
            className="signout-btn"
            onClick={signOut}
            disabled={signingOut}
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={20} />
            <span className="nav-label">{signingOut ? "Signing out..." : "Sign out"}</span>
          </button>
        </aside>

        <section className="ccc-content">{children}</section>
      </div>
    </main>
  );
}

