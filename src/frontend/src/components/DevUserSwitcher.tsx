import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  isDevModeActive,
  onDevModeChange,
  fetchUsers,
  switchDevUser,
  setDevClock,
} from "@/lib/api";
import { getNow, getOffsetMs, onClockOffsetChange } from "@/lib/clock";
import type { UserResponse } from "@teko/shared";

const H = 3_600_000;
const D = 86_400_000;
const W = 604_800_000;

function formatOffset(ms: number): string {
  if (ms === 0) return "real time";
  const abs = Math.abs(ms);
  const sign = ms > 0 ? "+" : "-";
  const days = Math.floor(abs / D);
  const hours = Math.floor((abs % D) / H);
  const mins = Math.floor((abs % H) / 60_000);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  return parts.length > 0 ? `${sign}${parts.join(" ")}` : `${sign}0m`;
}

export function DevUserSwitcher() {
  const queryClient = useQueryClient();
  const [devMode, setDevMode] = useState(isDevModeActive());
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [currentHaId, setCurrentHaId] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [virtualNow, setVirtualNow] = useState(() => getNow());
  const [offsetMs, setOffsetMsState] = useState(() => getOffsetMs());
  const [jumpTarget, setJumpTarget] = useState("");
  const [clockBusy, setClockBusy] = useState(false);

  // Track when dev mode becomes active (first response with X-Teko-Dev-Mode header)
  useEffect(() => {
    return onDevModeChange((active) => setDevMode(active));
  }, []);

  // Load users once dev mode is confirmed active
  useEffect(() => {
    if (!devMode) return;
    void fetchUsers().then((list) => {
      setUsers(list);
    });
    // Read the current user from the cookie if set
    const cookieVal = document.cookie
      .split("; ")
      .find((r) => r.startsWith("dev_user_id="))
      ?.split("=")[1];
    setCurrentHaId(cookieVal ?? null);
  }, [devMode]);

  // Sync badge when clock offset changes (from API response header)
  useEffect(() => {
    return onClockOffsetChange((ms) => {
      setOffsetMsState(ms);
      setVirtualNow(getNow());
    });
  }, []);

  // Tick the badge display every 30s while idle
  useEffect(() => {
    const id = setInterval(() => setVirtualNow(getNow()), 30_000);
    return () => clearInterval(id);
  }, []);

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

  async function handleClock(action: Parameters<typeof setDevClock>[0]) {
    if (clockBusy) return;
    setClockBusy(true);
    try {
      const result = await setDevClock(action);
      setOffsetMsState(result.offsetMs);
      setVirtualNow(new Date(result.virtualNow));
      await queryClient.invalidateQueries();
    } finally {
      setClockBusy(false);
    }
  }

  async function handleJump() {
    if (!jumpTarget) return;
    await handleClock({ action: "set", target: new Date(jumpTarget).toISOString() });
    setJumpTarget("");
  }

  return (
    <div className="fixed bottom-18 left-4 z-50 sm:bottom-4">
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

        {/* Clock section */}
        <div className="mt-2 border-t border-amber-400/20 pt-2">
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="text-xs text-amber-200/70">clock</span>
            <span className="ml-auto text-[10px] tabular-nums text-amber-400">
              {format(virtualNow, "yyyy-MM-dd HH:mm")}
            </span>
            {offsetMs !== 0 && (
              <span className="text-[10px] text-amber-500/70">{formatOffset(offsetMs)}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {(["+1h", "+1d", "+1w"] as const).map((label) => {
              const ms = label === "+1h" ? H : label === "+1d" ? D : W;
              return (
                <button
                  key={label}
                  onClick={() => void handleClock({ action: "advance", ms })}
                  disabled={clockBusy}
                  className="rounded bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-300 hover:bg-amber-400/20 disabled:opacity-50"
                >
                  {label}
                </button>
              );
            })}
            {offsetMs !== 0 && (
              <button
                onClick={() => void handleClock({ action: "reset" })}
                disabled={clockBusy}
                className="rounded bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-500 hover:bg-amber-400/20 disabled:opacity-50"
              >
                reset
              </button>
            )}
          </div>
          <div className="mt-1 flex gap-1">
            <input
              type="datetime-local"
              value={jumpTarget}
              onChange={(e) => setJumpTarget(e.target.value)}
              className="w-full rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-200 focus:outline-none"
            />
            <button
              onClick={() => void handleJump()}
              disabled={clockBusy || !jumpTarget}
              className="rounded bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-300 hover:bg-amber-400/20 disabled:opacity-50"
            >
              jump
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
