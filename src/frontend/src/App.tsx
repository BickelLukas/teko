import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { basePath } from "@/lib/basePath";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useHotkeys } from "react-hotkeys-hook";
import { Nav } from "@/components/Nav";
import { DevUserSwitcher } from "@/components/DevUserSwitcher";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AddTaskModal } from "@/components/AddTaskModal";
import { DialogRoot, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TodayPage } from "@/pages/Today";
import { ChoresPage } from "@/pages/Chores";
import { AllTasksPage } from "@/pages/AllTasks";
import { SettingsPage } from "@/pages/Settings";
import { SomedayPage } from "@/pages/Someday";
import { StatsPage } from "@/pages/Stats";
import { fetchMe } from "@/lib/api";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function KeyboardShortcuts() {
  const { t } = useTranslation("common");
  const [addOpen, setAddOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useHotkeys("/", () => setAddOpen(true), { preventDefault: true });
  useHotkeys("mod+k", () => setAddOpen(true), { preventDefault: true });
  useHotkeys("shift+/", () => setHelpOpen((v) => !v));

  return (
    <>
      <AddTaskModal open={addOpen} onOpenChange={setAddOpen} />
      <DialogRoot open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>{t("shortcuts.title")}</DialogTitle>
          </DialogHeader>
          <ul className="mt-4 space-y-3 text-sm">
            {[
              { label: t("shortcuts.add_task"), keys: ["/", "⌘K"] },
              { label: t("shortcuts.close"), keys: ["Esc"] },
              { label: t("shortcuts.help"), keys: ["?"] },
            ].map(({ label, keys }) => (
              <li key={label} className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">{label}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {keys.map((k, i) => (
                    <span key={k} className="flex items-center gap-1">
                      {i > 0 && (
                        <span className="text-xs text-muted-foreground">{t("shortcuts.or")}</span>
                      )}
                      <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-xs">
                        {k}
                      </kbd>
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </DialogRoot>
    </>
  );
}

// Syncs the user's locale preference from /api/me into i18next
function LocaleSync() {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const { i18n } = useTranslation();

  useEffect(() => {
    if (me?.locale && i18n.language !== me.locale) {
      void i18n.changeLanguage(me.locale);
    }
  }, [me?.locale, i18n]);

  return null;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={basePath}>
        <ThemeProvider>
          <LocaleSync />
          <KeyboardShortcuts />
          <div className="min-h-screen bg-background text-foreground">
            <Nav />
            <main className="pb-14 sm:pb-0">
              <Routes>
                <Route path="/" element={<TodayPage />} />
                <Route path="/chores" element={<ChoresPage />} />
                <Route path="/tasks" element={<AllTasksPage />} />
                <Route path="/someday" element={<SomedayPage />} />
                <Route path="/stats" element={<StatsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </main>
          </div>
          <DevUserSwitcher />
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
