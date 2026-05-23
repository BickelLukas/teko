export type HealthResponse = {
  status: "ok";
  version: string;
  uptime: number;
};

export * from "./schemas";
