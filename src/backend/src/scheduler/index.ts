import cron from "node-cron";
import type { Db } from "../db/client.js";
import { runTick } from "./tick.js";

type Logger = {
  info: (obj: object, msg?: string) => void;
  error: (obj: object, msg?: string) => void;
};

export function startScheduler(db: Db, logger?: Logger): void {
  cron.schedule("* * * * *", () => {
    void runTick(db, undefined, logger).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      if (logger) logger.error({ err: message }, "scheduler.tick-failed");
      else console.error("Scheduler tick failed:", err);
    });
  });
}
