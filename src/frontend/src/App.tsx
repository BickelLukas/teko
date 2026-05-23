import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Nav } from "@/components/Nav";
import { DevUserSwitcher } from "@/components/DevUserSwitcher";
import { TodayPage } from "@/pages/Today";
import { ChoresPage } from "@/pages/Chores";
import { AllTasksPage } from "@/pages/AllTasks";
import { SettingsPage } from "@/pages/Settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-background text-foreground">
          <Nav />
          <Routes>
            <Route path="/" element={<TodayPage />} />
            <Route path="/chores" element={<ChoresPage />} />
            <Route path="/tasks" element={<AllTasksPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </div>
        <DevUserSwitcher />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
