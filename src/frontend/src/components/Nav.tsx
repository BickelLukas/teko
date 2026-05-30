import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IconHome, IconList, IconSettings, IconBookmark, IconChartBar } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export function Nav() {
  const { t } = useTranslation("common");

  const links = [
    { to: "/", label: t("nav.today"), icon: IconHome, end: true },
    { to: "/tasks", label: t("nav.tasks"), icon: IconList, end: false },
    { to: "/someday", label: t("nav.someday"), icon: IconBookmark, end: false },
    { to: "/stats", label: t("nav.stats"), icon: IconChartBar, end: false },
    { to: "/settings", label: t("nav.settings"), icon: IconSettings, end: false },
  ];

  return (
    <>
      {/* Top nav — tablet and above */}
      <nav
        className="sticky top-0 z-40 hidden border-b border-border bg-background/95 backdrop-blur sm:block"
        aria-label="Main navigation"
      >
        <div className="mx-auto flex max-w-xl items-center gap-1 px-4">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-3 text-sm transition-colors",
                  isActive
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              <Icon className="size-4 shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Bottom tab bar — mobile only */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur sm:hidden"
        aria-label="Mobile navigation"
      >
        <div className="flex items-stretch">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] transition-colors",
                  isActive ? "font-medium text-foreground" : "text-muted-foreground",
                )
              }
            >
              <Icon className="size-5 shrink-0" />
              <span className="truncate">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}
