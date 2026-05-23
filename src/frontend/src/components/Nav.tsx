import { NavLink } from "react-router-dom";
import {
  IconHome,
  IconRepeat,
  IconList,
  IconSettings,
  IconStack2,
  IconChartBar,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";

const links = [
  { to: "/", label: "Today", icon: IconHome, end: true },
  { to: "/chores", label: "Chores", icon: IconRepeat, end: false },
  { to: "/tasks", label: "All tasks", icon: IconList, end: false },
  { to: "/projects", label: "Projects", icon: IconStack2, end: false },
  { to: "/stats", label: "Stats", icon: IconChartBar, end: false },
  { to: "/settings", label: "Settings", icon: IconSettings, end: false },
];

export function Nav() {
  return (
    <nav className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
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
            <span className="hidden sm:inline">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
