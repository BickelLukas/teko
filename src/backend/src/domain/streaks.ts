export const STREAK_MILESTONES = [7, 30, 100, 365] as const;
export type StreakMilestone = (typeof STREAK_MILESTONES)[number];

type CurrentStreak = { current_length: number; longest_length: number };

type StreakUpdate = { current_length: number; longest_length: number };

export function computeStreakUpdate(current: CurrentStreak, wasOnTime: boolean): StreakUpdate {
  const newLength = wasOnTime ? current.current_length + 1 : 0;
  return {
    current_length: newLength,
    longest_length: Math.max(current.longest_length, newLength),
  };
}

type OverdueTask = { id: string };
type StreakRef = { task_id: string; user_id: string; current_length: number };

export function detectBrokenStreaks(
  overdueTasks: OverdueTask[],
  streaks: StreakRef[],
): StreakRef[] {
  const overdueIds = new Set(overdueTasks.map((t) => t.id));
  return streaks.filter((s) => overdueIds.has(s.task_id) && s.current_length > 0);
}

export function awardPoints(task: { points: number | null }): number {
  return task.points ?? 1;
}

type CompletionForPoints = { completed_at: Date; points_awarded: number | null };

export function computeWeeklyPoints(
  completions: CompletionForPoints[],
  weekStart: Date,
  now: Date,
): number {
  return completions
    .filter((c) => c.completed_at >= weekStart && c.completed_at < now)
    .reduce((sum, c) => sum + (c.points_awarded ?? 0), 0);
}

type CompletionWithUser = CompletionForPoints & { completed_by: string };

export function computeUserContribution(
  completions: CompletionWithUser[],
  weekStart: Date,
  userId: string,
  now: Date,
): number {
  return completions
    .filter((c) => c.completed_at >= weekStart && c.completed_at < now && c.completed_by === userId)
    .reduce((sum, c) => sum + (c.points_awarded ?? 0), 0);
}

export function detectStreakMilestone(
  oldStreak: number,
  newStreak: number,
): StreakMilestone | null {
  for (const milestone of STREAK_MILESTONES) {
    if (oldStreak < milestone && newStreak >= milestone) return milestone;
  }
  return null;
}

type StreakStatus = { active: boolean; at_risk: boolean };

export function isStreakActive(
  currentLength: number,
  taskState: "not_yet" | "eligible" | "planned" | "overdue" | "done" | "archived",
): StreakStatus {
  if (currentLength === 0) return { active: false, at_risk: false };
  return { active: true, at_risk: taskState === "overdue" };
}
