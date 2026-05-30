export type HealthResponse = {
  status: "ok";
  version: string;
  uptime: number;
  supervisor_reachable: boolean;
  last_user_sync_at: string | null;
  active_user_count: number;
};

export * from "./schemas";
export * from "./palette";
