import { describe, it, expect } from "vitest";
import {
  computeStreakUpdate,
  detectBrokenStreaks,
  awardPoints,
  computeWeeklyPoints,
  computeUserContribution,
  detectStreakMilestone,
  isStreakActive,
} from "./streaks.js";

describe("computeStreakUpdate", () => {
  it("first-ever completion: streak goes 0 → 1", () => {
    const result = computeStreakUpdate({ current_length: 0, longest_length: 0 }, true);
    expect(result.current_length).toBe(1);
    expect(result.longest_length).toBe(1);
  });

  it("on-time when streak was 5: → 6", () => {
    const result = computeStreakUpdate({ current_length: 5, longest_length: 5 }, true);
    expect(result.current_length).toBe(6);
    expect(result.longest_length).toBe(6);
  });

  it("late completion when streak was 5: → 0 (reset)", () => {
    const result = computeStreakUpdate({ current_length: 5, longest_length: 5 }, false);
    expect(result.current_length).toBe(0);
    expect(result.longest_length).toBe(5); // preserved
  });

  it("longest_length not reduced on reset", () => {
    const result = computeStreakUpdate({ current_length: 3, longest_length: 10 }, false);
    expect(result.current_length).toBe(0);
    expect(result.longest_length).toBe(10);
  });

  it("longest_length updated when new streak exceeds it", () => {
    const result = computeStreakUpdate({ current_length: 10, longest_length: 10 }, true);
    expect(result.current_length).toBe(11);
    expect(result.longest_length).toBe(11);
  });

  it("streak across multiple cycles of a 7-day recurring chore", () => {
    let streak = { current_length: 0, longest_length: 0 };
    for (let i = 0; i < 7; i++) {
      streak = computeStreakUpdate(streak, true);
    }
    expect(streak.current_length).toBe(7);
    expect(streak.longest_length).toBe(7);
  });

  it("late completion resets even after long streak", () => {
    let streak = { current_length: 0, longest_length: 0 };
    for (let i = 0; i < 10; i++) {
      streak = computeStreakUpdate(streak, true);
    }
    streak = computeStreakUpdate(streak, false); // miss one
    expect(streak.current_length).toBe(0);
    expect(streak.longest_length).toBe(10);
  });
});

describe("detectBrokenStreaks", () => {
  it("returns streaks for tasks that went overdue", () => {
    const overdueTasks = [{ id: "task-1" }];
    const streaks = [
      { task_id: "task-1", user_id: "user-a", current_length: 5 },
      { task_id: "task-2", user_id: "user-a", current_length: 3 },
    ];
    const result = detectBrokenStreaks(overdueTasks, streaks);
    expect(result).toHaveLength(1);
    expect(result[0]!.task_id).toBe("task-1");
    expect(result[0]!.user_id).toBe("user-a");
  });

  it("skips streaks already at 0", () => {
    const overdueTasks = [{ id: "task-1" }];
    const streaks = [{ task_id: "task-1", user_id: "user-a", current_length: 0 }];
    const result = detectBrokenStreaks(overdueTasks, streaks);
    expect(result).toHaveLength(0);
  });

  it("resets streaks for all users on the same overdue task", () => {
    const overdueTasks = [{ id: "task-1" }];
    const streaks = [
      { task_id: "task-1", user_id: "user-a", current_length: 5 },
      { task_id: "task-1", user_id: "user-b", current_length: 3 },
    ];
    const result = detectBrokenStreaks(overdueTasks, streaks);
    expect(result).toHaveLength(2);
  });

  it("user B completing task does not affect user A streak — no overdue = no reset", () => {
    const overdueTasks: { id: string }[] = [];
    const streaks = [
      { task_id: "task-1", user_id: "user-a", current_length: 5 },
      { task_id: "task-1", user_id: "user-b", current_length: 3 },
    ];
    const result = detectBrokenStreaks(overdueTasks, streaks);
    expect(result).toHaveLength(0);
  });

  it("empty overdue list returns empty", () => {
    const result = detectBrokenStreaks(
      [],
      [{ task_id: "task-1", user_id: "user-a", current_length: 5 }],
    );
    expect(result).toHaveLength(0);
  });

  it("streak broken when user misses a fixed-schedule cycle entirely", () => {
    // Window closes → task goes overdue → streak detected as broken
    const overdueTasks = [{ id: "dishes" }];
    const streaks = [{ task_id: "dishes", user_id: "user-a", current_length: 14 }];
    const result = detectBrokenStreaks(overdueTasks, streaks);
    expect(result).toHaveLength(1);
    expect(result[0]!.current_length).toBe(14);
  });
});

describe("awardPoints", () => {
  it("returns task.points when set", () => {
    expect(awardPoints({ points: 3 })).toBe(3);
  });

  it("defaults to 1 when points is null", () => {
    expect(awardPoints({ points: null })).toBe(1);
  });

  it("returns 0 when explicitly set to 0", () => {
    expect(awardPoints({ points: 0 })).toBe(0);
  });
});

describe("computeWeeklyPoints", () => {
  const weekStart = new Date("2026-01-05T00:00:00Z");
  const now = new Date("2026-01-10T12:00:00Z");

  it("sums points within the week", () => {
    const completions = [
      { completed_at: new Date("2026-01-06T10:00:00Z"), points_awarded: 2 },
      { completed_at: new Date("2026-01-07T10:00:00Z"), points_awarded: 3 },
    ];
    expect(computeWeeklyPoints(completions, weekStart, now)).toBe(5);
  });

  it("excludes completions before week start", () => {
    const completions = [{ completed_at: new Date("2026-01-04T10:00:00Z"), points_awarded: 5 }];
    expect(computeWeeklyPoints(completions, weekStart, now)).toBe(0);
  });

  it("excludes completions at or after now", () => {
    const completions = [
      { completed_at: new Date("2026-01-10T12:00:00Z"), points_awarded: 5 },
      { completed_at: new Date("2026-01-11T10:00:00Z"), points_awarded: 5 },
    ];
    expect(computeWeeklyPoints(completions, weekStart, now)).toBe(0);
  });

  it("handles null points_awarded as 0", () => {
    const completions = [{ completed_at: new Date("2026-01-06T10:00:00Z"), points_awarded: null }];
    expect(computeWeeklyPoints(completions, weekStart, now)).toBe(0);
  });

  it("empty completions returns 0", () => {
    expect(computeWeeklyPoints([], weekStart, now)).toBe(0);
  });
});

describe("computeUserContribution", () => {
  const weekStart = new Date("2026-01-05T00:00:00Z");
  const now = new Date("2026-01-10T12:00:00Z");

  it("sums only the specified user's points", () => {
    const completions = [
      { completed_at: new Date("2026-01-06T10:00:00Z"), completed_by: "user-a", points_awarded: 2 },
      { completed_at: new Date("2026-01-07T10:00:00Z"), completed_by: "user-b", points_awarded: 3 },
    ];
    expect(computeUserContribution(completions, weekStart, "user-a", now)).toBe(2);
    expect(computeUserContribution(completions, weekStart, "user-b", now)).toBe(3);
  });

  it("returns 0 for user with no completions this week", () => {
    const completions = [
      { completed_at: new Date("2026-01-06T10:00:00Z"), completed_by: "user-a", points_awarded: 5 },
    ];
    expect(computeUserContribution(completions, weekStart, "user-b", now)).toBe(0);
  });
});

describe("detectStreakMilestone", () => {
  it("detects milestone at exactly 7", () => {
    expect(detectStreakMilestone(6, 7)).toBe(7);
  });

  it("detects milestone at exactly 30", () => {
    expect(detectStreakMilestone(29, 30)).toBe(30);
  });

  it("detects milestone at exactly 100", () => {
    expect(detectStreakMilestone(99, 100)).toBe(100);
  });

  it("detects milestone at exactly 365", () => {
    expect(detectStreakMilestone(364, 365)).toBe(365);
  });

  it("no milestone at 6", () => {
    expect(detectStreakMilestone(5, 6)).toBeNull();
  });

  it("no milestone at 8 (already past 7)", () => {
    expect(detectStreakMilestone(7, 8)).toBeNull();
  });

  it("no milestone when streak resets to 0", () => {
    expect(detectStreakMilestone(5, 0)).toBeNull();
  });

  it("detects first milestone when jumping past it", () => {
    expect(detectStreakMilestone(5, 10)).toBe(7);
  });

  it("no false positive at streak 1", () => {
    expect(detectStreakMilestone(0, 1)).toBeNull();
  });
});

describe("isStreakActive", () => {
  it("active when task is eligible", () => {
    const result = isStreakActive(5, "eligible");
    expect(result.active).toBe(true);
    expect(result.at_risk).toBe(false);
  });

  it("active when task is not_yet", () => {
    const result = isStreakActive(5, "not_yet");
    expect(result.active).toBe(true);
    expect(result.at_risk).toBe(false);
  });

  it("active when task is planned", () => {
    const result = isStreakActive(5, "planned");
    expect(result.active).toBe(true);
    expect(result.at_risk).toBe(false);
  });

  it("at_risk when task is overdue", () => {
    const result = isStreakActive(5, "overdue");
    expect(result.active).toBe(true);
    expect(result.at_risk).toBe(true);
  });

  it("not active when streak is 0", () => {
    const result = isStreakActive(0, "eligible");
    expect(result.active).toBe(false);
    expect(result.at_risk).toBe(false);
  });

  it("not active when streak is 0 even if overdue", () => {
    const result = isStreakActive(0, "overdue");
    expect(result.active).toBe(false);
    expect(result.at_risk).toBe(false);
  });
});
