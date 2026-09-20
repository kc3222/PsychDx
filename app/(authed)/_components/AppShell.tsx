"use client";

import { ReactNode, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  BrainCircuit,
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
          <div className="sidebar-brand">
            <span className="sidebar-mark" aria-hidden="true">
              <BrainCircuit size={18} />
            </span>
            <span className="sidebar-wordmark">
              <span className="sidebar-title">PsychDx</span>
              <span className="sidebar-tagline">Clinical support</span>
            </span>
          </div>

          <nav className="sidebar-nav" aria-label="Primary">
            <p className="sidebar-section-label">Workspace</p>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = item.key === activeKey;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`ccc-navlink ${active ? "active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  title={item.label}
                >
                  <span className="navlink-icon" aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <span className="nav-label">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="sidebar-footer">
            <button
              type="button"
              className="ccc-navlink signout-btn"
              onClick={signOut}
              disabled={signingOut}
              title="Sign out"
            >
              <span className="navlink-icon" aria-hidden="true">
                <LogOut size={18} />
              </span>
              <span className="nav-label">{signingOut ? "Signing out…" : "Sign out"}</span>
            </button>

            <button
              type="button"
              className="ccc-navlink sidebar-toggle"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <span className="navlink-icon" aria-hidden="true">
                {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
              </span>
              <span className="nav-label">Collapse</span>
            </button>
          </div>
        </aside>

        <section className="ccc-content">{children}</section>
      </div>
    </main>
  );
}
