import type { FastifyPluginAsync } from "fastify";
import { eq, and, gte, lt, gt, inArray } from "drizzle-orm";
import {
  startOfWeek,
  addWeeks,
  subWeeks,
  startOfDay,
  differenceInDays,
  differenceInCalendarWeeks,
} from "date-fns";
import { getNow } from "../domain/clock.js";
import * as schema from "../db/schema.js";
import { TaskIdParamsSchema } from "@teko/shared";
import { computeTaskState } from "../domain/recurrence.js";
import { isStreakActive } from "../domain/streaks.js";
import "../types.js";

type CompletionRow = typeof schema.completions.$inferSelect;

// Aggregate completions into N consecutive week buckets (oldest first, current last).
function bucketByWeek(
  completions: CompletionRow[],
  weeksAgoStart: Date,
  weekCount: number,
  weekStartsOn: 0 | 1,
): number[] {
  const buckets = new Array<number>(weekCount).fill(0);
  for (const c of completions) {
    const idx = differenceInCalendarWeeks(c.completed_at, weeksAgoStart, { weekStartsOn });
    if (idx >= 0 && idx < weekCount) {
      buckets[idx]! += c.points_awarded ?? 0;
    }
  }
  return buckets;
}

// Longest run of consecutive weeks (ending at currentWeekIdx) with > 0 completions.
// counts is indexed oldest→newest; consecutive run extends backward from the end.
function trailingStreak(counts: number[]): number {
  let streak = 0;
  for (let i = counts.length - 1; i >= 0; i--) {
    if ((counts[i] ?? 0) > 0) streak++;
    else break;
  }
  return streak;
}

const stats: FastifyPluginAsync = async (fastify) => {
  const db = fastify.db;

  // ── GET /api/me/stats ─────────────────────────────────────────────────────

  fastify.get("/api/me/stats", async (request, reply) => {
    const user = db.select().from(schema.users).where(eq(schema.users.id, request.user.id)).get();
    if (!user) return reply.code(404).send({ error: "User not found" });

    const weekStartsOn = (user.week_start_day ?? 1) as 0 | 1;
    const now = getNow();
    const weekStart = startOfWeek(now, { weekStartsOn });
    const weekEnd = addWeeks(weekStart, 1);
    const history12Start = subWeeks(weekStart, 11);

    // Single query covers both current-week stats and 12-week history.
    const rangeCompletions = db
      .select()
      .from(schema.completions)
      .where(
        and(
          eq(schema.completions.completed_by, request.user.id),
          gte(schema.completions.completed_at, history12Start),
          lt(schema.completions.completed_at, weekEnd),
        ),
      )
      .all();

    const weekCompletions = rangeCompletions.filter(
      (c) => c.completed_at >= weekStart && c.completed_at < weekEnd,
    );
    const weekPoints = weekCompletions.reduce((sum, c) => sum + (c.points_awarded ?? 0), 0);

    const completionsByDay = new Array<number>(7).fill(0);
    for (const c of weekCompletions) {
      const dayIndex = differenceInDays(startOfDay(c.completed_at), startOfDay(weekStart));
      if (dayIndex >= 0 && dayIndex < 7) completionsByDay[dayIndex]!++;
    }

    const history = bucketByWeek(rangeCompletions, history12Start, 12, weekStartsOn);

    // Active streaks for this user — fetch all streaks once, derive both active
    // and longest_ever from the same dataset.
    const allUserStreaks = db
      .select()
      .from(schema.streaks)
      .where(eq(schema.streaks.user_id, request.user.id))
      .all();

    const allTaskIds = [...new Set(allUserStreaks.map((s) => s.task_id))];
    const tasks =
      allTaskIds.length > 0
        ? db.select().from(schema.tasks).where(inArray(schema.tasks.id, allTaskIds)).all()
        : [];
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    const activeStreaks = allUserStreaks
      .filter((s) => s.current_length > 0)
      .map((s) => {
        const task = taskMap.get(s.task_id);
        if (!task) return null;
        const state = computeTaskState(task, now);
        const normalizedState =
          state === "archived" || state === "done" ? ("eligible" as const) : state;
        const { at_risk } = isStreakActive(s.current_length, normalizedState);
        return {
          task_id: s.task_id,
          task_title: task.title,
          current_length: s.current_length,
          longest_length: s.longest_length,
          at_risk,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .sort((a, b) => b.current_length - a.current_length);

    const longestEverStreak = allUserStreaks.reduce<(typeof allUserStreaks)[0] | null>(
      (best, s) => (!best || s.longest_length > best.longest_length ? s : best),
      null,
    );
    const longestEverTask = longestEverStreak ? taskMap.get(longestEverStreak.task_id) : null;

    return reply.code(200).send({
      week: {
        points: weekPoints,
        completions: weekCompletions.length,
        completions_by_day: completionsByDay,
      },
      streaks: {
        active: activeStreaks,
        longest_ever: longestEverStreak
          ? {
              task_id: longestEverStreak.task_id,
              task_title: longestEverTask?.title ?? null,
              length: longestEverStreak.longest_length,
            }
          : null,
      },
      history: { last_12_weeks: history },
    });
  });

  // ── GET /api/household/stats ──────────────────────────────────────────────

  fastify.get("/api/household/stats", async (request, reply) => {
    const user = db.select().from(schema.users).where(eq(schema.users.id, request.user.id)).get();
    const weekStartsOn = (user?.week_start_day ?? 1) as 0 | 1;

    const now = getNow();
    const weekStart = startOfWeek(now, { weekStartsOn });
    const weekEnd = addWeeks(weekStart, 1);
    const streakWindowStart = subWeeks(weekStart, 51);

    // Single query covers the full 52-week window — used for the current-week
    // breakdown, household streak, and 12-week history.
    const rangeCompletions = db
      .select()
      .from(schema.completions)
      .where(
        and(
          gte(schema.completions.completed_at, streakWindowStart),
          lt(schema.completions.completed_at, weekEnd),
        ),
      )
      .all();

    const weekCompletions = rangeCompletions.filter(
      (c) => c.completed_at >= weekStart && c.completed_at < weekEnd,
    );
    const weekPoints = weekCompletions.reduce((sum, c) => sum + (c.points_awarded ?? 0), 0);

    const completionsByDay = new Array<number>(7).fill(0);
    for (const c of weekCompletions) {
      const dayIndex = differenceInDays(startOfDay(c.completed_at), startOfDay(weekStart));
      if (dayIndex >= 0 && dayIndex < 7) completionsByDay[dayIndex]!++;
    }

    // Per-user contributions — alphabetical only, never sorted by points
    const allUsers = db.select().from(schema.users).where(eq(schema.users.is_active, true)).all();

    const contributions = allUsers
      .map((u) => ({
        user_id: u.id,
        name: u.display_name ?? u.name,
        points: weekCompletions
          .filter((c) => c.completed_by === u.id)
          .reduce((sum, c) => sum + (c.points_awarded ?? 0), 0),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)); // alphabetical ONLY

    // Bucket the 52-week range; trailing run with > 0 is the household streak.
    const streakBuckets = bucketByWeek(rangeCompletions, streakWindowStart, 52, weekStartsOn);
    const householdStreak = trailingStreak(streakBuckets);
    const history = streakBuckets.slice(-12);

    return reply.code(200).send({
      week: { points: weekPoints, completions_by_day: completionsByDay, contributions },
      longest_household_streak: householdStreak,
      history: { last_12_weeks: history },
    });
  });

  // ── GET /api/tasks/:id/streak ─────────────────────────────────────────────

  fastify.get("/api/tasks/:id/streak", async (request, reply) => {
    const params = TaskIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: params.error.flatten() });

    const task = db.select().from(schema.tasks).where(eq(schema.tasks.id, params.data.id)).get();
    if (!task) return reply.code(404).send({ error: "Task not found" });

    const taskStreaks = db
      .select()
      .from(schema.streaks)
      .where(and(eq(schema.streaks.task_id, params.data.id), gt(schema.streaks.current_length, 0)))
      .all();

    return reply.code(200).send(
      taskStreaks.map((s) => ({
        user_id: s.user_id,
        current_length: s.current_length,
        longest_length: s.longest_length,
        last_completed_at: s.last_completed_at,
      })),
    );
  });
};

export default stats;
