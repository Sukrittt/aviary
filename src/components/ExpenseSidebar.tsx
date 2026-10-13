import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence } from "motion/react";
import { HouseIcon, ChartLineIcon, SignOutIcon, EnvelopeSimpleIcon, ListIcon, MoonIcon, SidebarSimpleIcon, PlusIcon, InvoiceIcon, ScanIcon, GearIcon, SparkleIcon, SunIcon, ArrowUUpLeftIcon, XIcon, type PhosphorIcon } from "@/src/components/icons";
import { SignOutDialog } from "./ConfirmDialog";
import { useMoneyBrain } from "@/components/MoneyBrainProvider";
import { useAppearance } from "@/components/AppearanceProvider";
import { usePersistentState } from "../hooks/usePersistentState";
import { useAccessAllowed } from "../hooks/useBillingStatus";
import { useHiddenFeatures } from "../hooks/useUser";
import { BirdMark } from "./BirdMark";
import { LogExpenseModal } from "./LogExpenseModal";
import { ScanBillModal } from "../features/scan-bill/ScanBillModal";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";

interface Props {
  onBulkReturn?: () => void;
}

const NAV: Array<{ href: string; label: string; icon: PhosphorIcon }> = [
  { href: "/expense", label: "Home", icon: HouseIcon },
  { href: "/expense/transactions", label: "Activity", icon: InvoiceIcon },
  { href: "/expense/envelopes", label: "Categories", icon: EnvelopeSimpleIcon },
  { href: "/insights", label: "Insights", icon: ChartLineIcon },
];

const parseBool = (raw: string) => raw === "1";
const serializeBool = (v: boolean) => (v ? "1" : "0");

// Labels drop out in the collapsed (icon) rail; the tooltip carries them there.
const LABEL = "erd-side-label group-data-[collapsible=icon]:hidden";
// The app's nav-row look on top of shadcn's menu button. `!` where the
// unlayered app CSS or shadcn's own `!` sizing would otherwise win.
const ITEM =
  "h-10 gap-3 rounded-xl px-3 text-sm font-semibold text-(--erd-text2) [&_svg]:size-[18px]! " +
  "hover:bg-(--erd-border) hover:text-(--erd-text) [&:not([data-active]):not(:hover)_svg]:text-(--erd-text3) " +
  "data-active:bg-(--gold-soft) data-active:font-bold data-active:text-(--gold-ink) " +
  "group-data-[collapsible=icon]:h-10! group-data-[collapsible=icon]:w-full! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!";
const CTA = "erd-side-cta group-data-[collapsible=icon]:px-0!";

export function ExpenseSidebar(props: Props) {
  const [collapsed, setCollapsed] = usePersistentState("erd-sidebar-collapsed", false, parseBool, serializeBool);

  return (
    <SidebarProvider
      open={!collapsed}
      onOpenChange={(open) => setCollapsed(!open)}
      // Sits inside each page's .erd-main row, so it only takes the rail's width.
      className="min-h-0 w-auto flex-none"
      style={{ "--sidebar-width": "248px", "--sidebar-width-icon": "72px" } as CSSProperties}
    >
      <ExpenseSidebarNav {...props} />
    </SidebarProvider>
  );
}

function NavItem({ label, icon: Icon, active, href, onClick }: { label: string; icon: PhosphorIcon; active?: boolean; href?: string; onClick?: () => void }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className={ITEM}
        isActive={active}
        tooltip={label}
        aria-current={active ? "page" : undefined}
        onClick={onClick}
        render={href ? <Link href={href} /> : undefined}
      >
        <Icon />
        <span className={LABEL}>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function ExpenseSidebarNav({ onBulkReturn }: Props) {
  const pathname = usePathname() ?? "";
  const { openMoneyBrain } = useMoneyBrain();
  const { theme, setTheme } = useAppearance();
  const { open, toggleSidebar, isMobile, openMobile, setOpenMobile } = useSidebar();
  const hidden = useHiddenFeatures();
  const [showLog, setShowLog] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const router = useRouter();
  const allowed = useAccessAllowed();
  // A locked account gets the lock screen (SubscriptionGate on /expense)
  // instead of a dialog whose save or question would only come back 402.
  const runGated = (action: () => void) => (allowed ? action() : router.push("/expense"));
  const closeMobile = () => setOpenMobile(false);

  const currentPage =
    NAV.find(({ href }) => pathname === href)?.label ??
    (pathname.startsWith("/account")
      ? "Account"
      : pathname.startsWith("/investments")
        ? "Investments"
        : "Aviary");

  return (
    <>
      <header className="erd-mobile-topbar">
        <button
          type="button"
          className="erd-mobile-menu-btn"
          aria-label="Open navigation"
          aria-haspopup="dialog"
          aria-expanded={openMobile}
          onClick={() => setOpenMobile(true)}
        >
          <ListIcon size={21} />
        </button>
        <Link href="/expense" className="erd-mobile-brand" aria-label="Aviary home">
          <BirdMark size={29} />
          <span>Aviary</span>
        </Link>
        <span className="erd-mobile-page">{currentPage}</span>
      </header>

      <Sidebar
        collapsible="icon"
        // The mobile sheet portals into the page so it keeps the theme tokens,
        // the same way DatePicker's popover does.
        container={typeof document === "undefined" ? undefined : (document.querySelector<HTMLElement>(".expense-redesign") ?? undefined)}
      >
        {/* Sidebar renders a plain div (or a dialog on mobile); this keeps the
            primary navigation landmark the old <nav> provided. */}
        <nav aria-label="Primary" className="flex min-h-0 flex-1 flex-col">
        <SidebarHeader className="gap-[22px] px-3.5 pt-[22px] pb-0">
          <div className="erd-brand group-data-[collapsible=icon]:flex-col! group-data-[collapsible=icon]:gap-2.5! group-data-[collapsible=icon]:pl-0!">
            <Link href="/expense" className="erd-brand-link" aria-label="Aviary home" onClick={closeMobile}>
              <BirdMark size={34} />
              <span className={LABEL}>Aviary</span>
            </Link>
            {isMobile ? (
              <button type="button" className="erd-mobile-close-btn grid!" onClick={closeMobile} aria-label="Close navigation">
                <XIcon size={19} />
              </button>
            ) : (
              <button
                type="button"
                className="erd-collapse-btn"
                onClick={toggleSidebar}
                aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
                title={open ? "Collapse sidebar" : "Expand sidebar"}
              >
                <SidebarSimpleIcon size={18} />
              </button>
            )}
          </div>

          <div className="erd-side-actions">
            <button type="button" className={CTA} onClick={() => { closeMobile(); runGated(() => setShowLog(true)); }} title={open ? undefined : "Log expense"}>
              <PlusIcon size={18} weight="bold" />
              <span className={LABEL}>Log expense</span>
            </button>
            {!hidden.includes("billScan") && (
              <button type="button" className={`${CTA} is-secondary`} onClick={() => { closeMobile(); runGated(() => setShowScan(true)); }} title={open ? undefined : "Scan a bill"}>
                <ScanIcon size={18} />
                <span className={LABEL}>Scan a bill</span>
              </button>
            )}
          </div>
        </SidebarHeader>

        <SidebarContent className="gap-[22px] px-3.5 pt-[22px]">
          <SidebarGroup className="p-0">
            <SidebarMenu className="gap-0.5">
              {NAV.filter(({ href }) => !(href === "/insights" && hidden.includes("insights"))).map(({ href, label, icon }) => (
                <NavItem key={href} href={href} label={label} icon={icon} active={pathname === href} onClick={closeMobile} />
              ))}
              {!hidden.includes("askAviary") && (
                <NavItem label="Ask Aviary" icon={SparkleIcon} onClick={() => { closeMobile(); runGated(() => openMoneyBrain()); }} />
              )}
            </SidebarMenu>
          </SidebarGroup>

          {onBulkReturn && (
            <SidebarGroup className="p-0">
              <SidebarGroupLabel className="erd-nav-label">Budget</SidebarGroupLabel>
              <SidebarMenu className="gap-0.5">
                <NavItem label="Return all to RTA" icon={ArrowUUpLeftIcon} onClick={() => { closeMobile(); onBulkReturn(); }} />
              </SidebarMenu>
            </SidebarGroup>
          )}
        </SidebarContent>

        <SidebarFooter className="mx-3.5 mb-[18px] border-t border-sidebar-border px-0 pt-3 pb-0">
          <SidebarMenu className="gap-0.5">
            <NavItem href="/account" label="Account" icon={GearIcon} active={pathname.startsWith("/account")} onClick={closeMobile} />
            <NavItem
              label={theme === "light" ? "Dark mode" : "Light mode"}
              icon={theme === "light" ? MoonIcon : SunIcon}
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            />
            <NavItem label="Log out" icon={SignOutIcon} onClick={() => { closeMobile(); setConfirmSignOut(true); }} />
          </SidebarMenu>
        </SidebarFooter>
        </nav>
      </Sidebar>

      {/* Outside the sidebar: its fixed, transformed container would trap
          these position:fixed overlays inside it. */}
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
