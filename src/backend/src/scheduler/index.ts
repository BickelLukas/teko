import cron from "node-cron";
import type { Db } from "../db/client.js";
import { runTick } from "./tick.js";

export function startScheduler(db: Db): void {
  cron.schedule("* * * * *", () => {
    void runTick(db).catch((err: unknown) => {
      console.error("Scheduler tick failed:", err);
    });
  });
}
