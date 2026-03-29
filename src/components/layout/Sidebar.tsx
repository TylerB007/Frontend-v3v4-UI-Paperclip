"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { WalletButton } from "@/components/wallet/WalletButton";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

function BarChartIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1" y="8" width="3" height="7" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="6" y="5" width="3" height="10" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="11" y="2" width="3" height="13" rx="1" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1" y="3" width="14" height="2" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="1" y="7" width="14" height="2" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="1" y="11" width="9" height="2" rx="1" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

function HookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 2C5.24 2 3 4.24 3 7v1c0 1.1.9 2 2 2h1v4h4v-4h1c1.1 0 2-.9 2-2V7c0-2.76-2.24-5-5-5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}

function ZapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M9 2L3 9h5l-1 5 6-7H8l1-5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: <BarChartIcon /> },
  { label: "Position Log", href: "/positions", icon: <ListIcon /> },
  { label: "Hooks Browser", href: "/hooks", icon: <HookIcon /> },
  { label: "Actions", href: "/actions", icon: <ZapIcon /> },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-60 flex-col border-r border-white/8 bg-[#0a0a0c]">
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-white/8 px-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600">
            <span className="text-xs font-bold text-white">LP</span>
          </div>
          <span className="text-sm font-semibold tracking-tight text-white">LP Mastery</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-violet-600/20 text-violet-300"
                      : "text-white/50 hover:bg-white/5 hover:text-white/80",
                  )}
                >
                  {item.icon}
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Wallet button */}
      <div className="border-t border-white/8 p-3">
        <WalletButton />
      </div>
    </aside>
  );
}
