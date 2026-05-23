import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isDevModeActive, onDevModeChange, fetchDevUsers, switchDevUser } from "@/lib/api";
import type { DevUser } from "@teko/shared";

export function DevUserSwitcher() {
  const queryClient = useQueryClient();
  const [devMode, setDevMode] = useState(isDevModeActive());
  const [users, setUsers] = useState<DevUser[]>([]);
  const [currentHaId, setCurrentHaId] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  // Track when dev mode becomes active (first response with X-Teko-Dev-Mode header)
  useEffect(() => {
    return onDevModeChange((active) => setDevMode(active));
  }, []);

  // Load users once dev mode is confirmed active
  useEffect(() => {
    if (!devMode) return;
    void fetchDevUsers().then((list) => {
      setUsers(list);
    });
    // Read the current user from the cookie if set
    const cookieVal = document.cookie
      .split("; ")
      .find((r) => r.startsWith("dev_user_id="))
      ?.split("=")[1];
    setCurrentHaId(cookieVal ?? null);
  }, [devMode]);

  // Only renders when both import.meta.env.DEV AND backend reports dev mode
  if (!import.meta.env.DEV || !devMode) return null;

  const currentUser = users.find((u) => u.ha_user_id === currentHaId) ?? users[0];

  async function handleSwitch(ha_user_id: string) {
    if (switching) return;
    setSwitching(true);
    try {
      const switched = await switchDevUser(ha_user_id);
      setCurrentHaId(switched.ha_user_id);
      await queryClient.invalidateQueries();
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="fixed bottom-18 right-4 z-50 sm:bottom-4">
      <div className="rounded-lg border border-amber-400/50 bg-amber-950/90 px-3 py-2 shadow-lg backdrop-blur-sm">
        <div className="mb-1.5 flex items-center gap-1.5">
          <span className="rounded bg-amber-400/20 px-1 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400">
            DEV
          </span>
          <span className="text-xs text-amber-200/70">user switcher</span>
        </div>
        <div className="flex flex-col gap-1">
          {users.map((u) => (
            <button
              key={u.ha_user_id}
              onClick={() => void handleSwitch(u.ha_user_id)}
              disabled={switching}
              className={[
                "flex items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors disabled:opacity-50",
                currentUser?.ha_user_id === u.ha_user_id
                  ? "bg-amber-400/20 text-amber-200 font-medium"
                  : "text-amber-200/60 hover:bg-amber-400/10 hover:text-amber-200",
              ].join(" ")}
            >
              <span
                className={[
                  "size-1.5 rounded-full",
                  currentUser?.ha_user_id === u.ha_user_id ? "bg-amber-400" : "bg-amber-800",
                ].join(" ")}
              />
              {u.name}
              <span className="text-amber-500/50">{u.locale}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
