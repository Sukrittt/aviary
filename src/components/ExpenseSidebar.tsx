import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence } from "motion/react";
import {
  House,
  LineChart,
  LogOut,
  Mail,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  ReceiptText,
  ScanLine,
  Settings,
  Sparkles,
  Sun,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { SignOutDialog } from "./ConfirmDialog";
import { useMoneyBrain } from "@/components/MoneyBrainProvider";
import { useAppearance } from "@/components/AppearanceProvider";
import { usePersistentState } from "../hooks/usePersistentState";
import { useAccessAllowed } from "../hooks/useBillingStatus";
import { BirdMark } from "./BirdMark";
import { LogExpenseModal } from "./LogExpenseModal";
import { ScanBillModal } from "../features/scan-bill/ScanBillModal";

interface Props {
  onBulkReturn?: () => void;
}

const NAV: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/expense", label: "Home", icon: House },
  { href: "/expense/transactions", label: "Activity", icon: ReceiptText },
  { href: "/expense/envelopes", label: "Envelopes", icon: Mail },
  { href: "/insights", label: "Insights", icon: LineChart },
];

const parseBool = (raw: string) => raw === "1";
const serializeBool = (v: boolean) => (v ? "1" : "0");

export function ExpenseSidebar({ onBulkReturn }: Props) {
  const pathname = usePathname();
  const { openMoneyBrain } = useMoneyBrain();
  const { theme, setTheme } = useAppearance();
  const [collapsed, setCollapsed] = usePersistentState("erd-sidebar-collapsed", false, parseBool, serializeBool);
  const [showLog, setShowLog] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileMenuButton = useRef<HTMLButtonElement>(null);
  const mobileCloseButton = useRef<HTMLButtonElement>(null);

  const router = useRouter();
  const allowed = useAccessAllowed();
  // A locked account gets the lock screen (SubscriptionGate on /expense)
  // instead of a dialog whose save or question would only come back 402.
  const runGated = (action: () => void) => (allowed ? action() : router.push("/expense"));

  // Collapsed rows show only their icon, so the label moves to a native tooltip.
  const tip = (label: string) => (collapsed ? label : undefined);

  const currentPage =
    NAV.find(({ href }) => pathname === href)?.label ??
    (pathname.startsWith("/account")
      ? "Account"
      : pathname.startsWith("/investments")
        ? "Investments"
        : "Aviary");

  function closeMobileMenu(restoreFocus = false) {
    setMobileOpen(false);
    if (restoreFocus) requestAnimationFrame(() => mobileMenuButton.current?.focus());
  }

  useEffect(() => {
    if (!mobileOpen) return;
    mobileCloseButton.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeMobileMenu(true);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  return (
    <>
      <header className="erd-mobile-topbar">
        <button
          ref={mobileMenuButton}
          type="button"
          className="erd-mobile-menu-btn"
          aria-label="Open navigation"
          aria-controls="expense-navigation"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
        >
          <Menu size={21} />
        </button>
        <Link href="/expense" className="erd-mobile-brand" aria-label="Aviary home">
          <BirdMark size={29} />
          <span>Aviary</span>
        </Link>
        <span className="erd-mobile-page">{currentPage}</span>
      </header>

      <button
        type="button"
        className={`erd-mobile-scrim ${mobileOpen ? "is-open" : ""}`}
        aria-label="Close navigation"
        tabIndex={mobileOpen ? 0 : -1}
        onClick={() => closeMobileMenu(true)}
      />

      <nav
        id="expense-navigation"
        className={`erd-sidebar ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "is-mobile-open" : ""}`}
        aria-label="Primary"
      >
        <div className="erd-brand">
          <Link href="/expense" className="erd-brand-link" aria-label="Aviary home" onClick={() => closeMobileMenu()}>
            <BirdMark size={34} />
            <span className="erd-side-label">Aviary</span>
          </Link>
          <button
            type="button"
            className="erd-collapse-btn"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <button
            ref={mobileCloseButton}
            type="button"
            className="erd-mobile-close-btn"
            onClick={() => closeMobileMenu(true)}
            aria-label="Close navigation"
          >
            <X size={19} />
          </button>
        </div>

        <div className="erd-side-actions">
          <button type="button" className="erd-side-cta" onClick={() => { closeMobileMenu(); runGated(() => setShowLog(true)); }} title={tip("Log expense")}>
            <Plus size={18} strokeWidth={2.5} />
            <span className="erd-side-label">Log expense</span>
          </button>
          <button type="button" className="erd-side-cta is-secondary" onClick={() => { closeMobileMenu(); runGated(() => setShowScan(true)); }} title={tip("Scan a bill")}>
            <ScanLine size={18} />
            <span className="erd-side-label">Scan a bill</span>
          </button>
        </div>

        <div className="erd-nav-group">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`erd-nav-item ${pathname === href ? "is-active" : ""}`}
              aria-current={pathname === href ? "page" : undefined}
              title={tip(label)}
              onClick={() => closeMobileMenu()}
            >
              <Icon size={18} />
              <span className="erd-side-label">{label}</span>
            </Link>
          ))}
          <button type="button" className="erd-nav-item" onClick={() => { closeMobileMenu(); runGated(() => openMoneyBrain()); }} title={tip("Ask Aviary")}>
            <Sparkles size={18} />
            <span className="erd-side-label">Ask Aviary</span>
          </button>
        </div>

        {onBulkReturn && (
          <div className="erd-nav-group">
            <div className="erd-nav-label erd-side-label">Budget</div>
            {onBulkReturn && (
              <button type="button" className="erd-nav-item" onClick={() => { closeMobileMenu(); onBulkReturn(); }} title={tip("Return all to RTA")}>
                <Undo2 size={18} />
                <span className="erd-side-label">Return all to RTA</span>
              </button>
            )}
          </div>
        )}

        <div className="erd-nav-group erd-sidebar-foot">
          <Link
            href="/account"
            className={`erd-nav-item ${pathname.startsWith("/account") ? "is-active" : ""}`}
            title={tip("Account")}
            onClick={() => closeMobileMenu()}
          >
            <Settings size={18} />
            <span className="erd-side-label">Account</span>
          </Link>
          <button
            type="button"
            className="erd-nav-item"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            title={tip(theme === "light" ? "Dark mode" : "Light mode")}
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            <span className="erd-side-label">{theme === "light" ? "Dark mode" : "Light mode"}</span>
          </button>
          <button type="button" className="erd-nav-item" onClick={() => { closeMobileMenu(); setConfirmSignOut(true); }} title={tip("Log out")}>
            <LogOut size={18} />
            <span className="erd-side-label">Log out</span>
          </button>
        </div>
      </nav>

      {/* Outside <nav>: its fade-in animation leaves a transform behind, which
          would trap these position:fixed overlays inside the sidebar. */}
      <AnimatePresence>
        {confirmSignOut && <SignOutDialog onCancel={() => setConfirmSignOut(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {showLog && <LogExpenseModal onClose={() => setShowLog(false)} onSaved={() => {}} />}
      </AnimatePresence>
      <AnimatePresence>
        {showScan && (
          <ScanBillModal
            onClose={() => setShowScan(false)}
            onEnterManually={() => {
              setShowScan(false);
              setShowLog(true);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
