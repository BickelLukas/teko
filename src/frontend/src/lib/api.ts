import type {
  TaskListResponse,
  TaskResponse,
  UserResponse,
  TodayStats,
  DevUser,
  ClockAction,
  CreateTaskBody,
  UpdateTaskBody,
  CompleteTaskResult,
  MeStats,
  HouseholdStats,
  TaskStreak,
  SyncResult,
  HealthResponse,
  NotifyService,
  NotifyServicesResponse,
} from "@teko/shared";
import { setOffsetMs } from "./clock.js";
import { basePath } from "./basePath.js";

// Tracks whether the backend reported dev mode via response header.
// Set on first response that carries X-Teko-Dev-Mode: true.
let _devModeActive = false;
const _devModeListeners: Array<(active: boolean) => void> = [];

export function isDevModeActive(): boolean {
  return _devModeActive;
}

export function onDevModeChange(cb: (active: boolean) => void): () => void {
  _devModeListeners.push(cb);
  return () => {
    const idx = _devModeListeners.indexOf(cb);
    if (idx !== -1) _devModeListeners.splice(idx, 1);
  };
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${basePath}${path}`, init);
  const devModeHeader = res.headers.get("X-Teko-Dev-Mode");
  if (devModeHeader?.toLowerCase() === "true" && !_devModeActive) {
    _devModeActive = true;
    _devModeListeners.forEach((cb) => cb(true));
  }
  const offsetHeader = res.headers.get("X-Teko-Clock-Offset");
  if (offsetHeader !== null) {
    setOffsetMs(parseInt(offsetHeader, 10) || 0);
  }
  return res;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function throwIfNotOk(res: Response): Promise<void> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function fetchTasks(
  assignee?: string,
  scope?: "active" | "someday" | "all",
): Promise<TaskListResponse> {
  const params = new URLSearchParams();
  if (assignee) params.set("assignee", assignee);
  if (scope) params.set("scope", scope);
  const qs = params.toString();
  return json(await apiFetch(`/api/tasks${qs ? `?${qs}` : ""}`));
}

export async function createTask(body: CreateTaskBody): Promise<TaskResponse> {
  return json(
    await apiFetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function updateTask(id: string, body: UpdateTaskBody): Promise<TaskResponse> {
  return json(
    await apiFetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function completeTask(id: string): Promise<CompleteTaskResult> {
  return json(await apiFetch(`/api/tasks/${id}/complete`, { method: "POST" }));
}

/** Sets due_at to a new date, or null to move the task to Someday. */
export async function rescheduleTask(id: string, dueAt: Date | null): Promise<void> {
  await throwIfNotOk(
    await apiFetch(`/api/tasks/${id}/reschedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ due_at: dueAt ? dueAt.toISOString() : null }),
    }),
  );
}

export async function archiveTask(id: string): Promise<void> {
  await throwIfNotOk(await apiFetch(`/api/tasks/${id}/archive`, { method: "POST" }));
}

export async function unarchiveTask(id: string): Promise<void> {
  await throwIfNotOk(await apiFetch(`/api/tasks/${id}/unarchive`, { method: "POST" }));
}

// ── Me ────────────────────────────────────────────────────────────────────────

export async function fetchMe(): Promise<UserResponse> {
  return json(await apiFetch("/api/me"));
}

export async function updatePreferences(
  prefs: Partial<{
    locale: string;
    theme: "light" | "dark" | "system";
    notification_time: string | null;
    notification_service: string | null;
    notify_digest_enabled: boolean;
    display_name: string | null;
    week_start_day: 0 | 1;
  }>,
): Promise<UserResponse> {
  return json(
    await apiFetch("/api/me/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    }),
  );
}

export async function fetchTodayStats(): Promise<TodayStats> {
  return json(await apiFetch("/api/me/today-stats"));
}

export async function fetchMeStats(): Promise<MeStats> {
  return json(await apiFetch("/api/me/stats"));
}

export async function fetchHouseholdStats(): Promise<HouseholdStats> {
  return json(await apiFetch("/api/household/stats"));
}

export async function fetchTaskStreak(taskId: string): Promise<TaskStreak[]> {
  return json(await apiFetch(`/api/tasks/${taskId}/streak`));
}

// ── Users (household) ────────────────────────────────────────────────────────

export async function fetchUsers(): Promise<UserResponse[]> {
  return json(await apiFetch("/api/users"));
}

export async function triggerUserSync(): Promise<SyncResult> {
  return json(await apiFetch("/api/users/sync", { method: "POST" }));
}

// ── Notifications ──────────────────────────────────────────────────────────────

export async function fetchNotifyServices(refresh = false): Promise<NotifyService[]> {
  const data = await json<NotifyServicesResponse>(
    await apiFetch(`/api/ha/notify-services?refresh=${refresh ? "true" : "false"}`),
  );
  return data.services;
}

export type TestNotificationResult =
  | { ok: true; sent_to: string }
  | { ok: false; error: string; message: string };

export async function sendTestNotification(): Promise<TestNotificationResult> {
  const res = await apiFetch("/api/me/test-notification", { method: "POST" });
  const body = (await res.json().catch(() => ({}))) as {
    sent_to?: string;
    error?: string;
    message?: string;
  };
  if (res.ok) return { ok: true, sent_to: body.sent_to ?? "" };
  return { ok: false, error: body.error ?? "unknown", message: body.message ?? "" };
}

// ── Health ────────────────────────────────────────────────────────────────────

export async function fetchHealth(): Promise<HealthResponse> {
  return json(await apiFetch("/api/health"));
}

// ── Dev ───────────────────────────────────────────────────────────────────────

export async function switchDevUser(ha_user_id: string): Promise<DevUser> {
  return json(
    await apiFetch("/api/_dev/switch-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ha_user_id }),
    }),
  );
}

export type DevClockResponse = {
  offsetMs: number;
  virtualNow: string;
  realNow: string;
  ticked?: number;
};

export async function setDevClock(action: ClockAction): Promise<DevClockResponse> {
  return json(
    await apiFetch("/api/_dev/clock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action),
    }),
  );
}
