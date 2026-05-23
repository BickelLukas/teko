import { z } from "zod";

// ── Domain types ─────────────────────────────────────────────────────────────

export const TaskStateSchema = z.enum(["not_yet", "eligible", "planned", "overdue", "done"]);
export type TaskState = z.infer<typeof TaskStateSchema>;

export const RecurrenceModeSchema = z.enum(["fixed", "after_completion"]);
export type RecurrenceMode = z.infer<typeof RecurrenceModeSchema>;

// ── User ─────────────────────────────────────────────────────────────────────

export const UserSchema = z.object({
  id: z.string().uuid(),
  ha_user_id: z.string().min(1),
  name: z.string().min(1),
  display_name: z.string().nullable(),
  locale: z.string().min(2),
  theme: z.enum(["light", "dark", "system"]).default("system"),
  notification_time: z.string().nullable(),
  is_admin: z.boolean(),
  is_active: z.boolean(),
  week_start_day: z.union([z.literal(0), z.literal(1)]),
  created_at: z.coerce.date(),
});
export type User = z.infer<typeof UserSchema>;

export const UserResponseSchema = UserSchema.pick({
  id: true,
  ha_user_id: true,
  name: true,
  display_name: true,
  locale: true,
  theme: true,
  notification_time: true,
  is_admin: true,
  is_active: true,
  week_start_day: true,
});
export type UserResponse = z.infer<typeof UserResponseSchema>;

export const UpdatePreferencesBodySchema = z.object({
  locale: z.string().min(2).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  notification_time: z.string().nullable().optional(),
  display_name: z.string().nullable().optional(),
  week_start_day: z.union([z.literal(0), z.literal(1)]).optional(),
});
export type UpdatePreferencesBody = z.infer<typeof UpdatePreferencesBodySchema>;

// ── Task ─────────────────────────────────────────────────────────────────────

export const TaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().nullable(),
  assignee_id: z.string().uuid().nullable(),
  parent_id: z.string().uuid().nullable(),
  state: TaskStateSchema,
  created_at: z.coerce.date(),
  created_by: z.string().uuid(),
  archived_at: z.coerce.date().nullable(),
  recurrence_rule: z.string().nullable(),
  recurrence_mode: RecurrenceModeSchema.nullable(),
  completion_window_days: z.number().int().nullable(),
  next_due_at: z.coerce.date().nullable(),
  planned_for: z.coerce.date().nullable(),
  points: z.number().int().nullable(),
  tags: z.string().nullable(),
  exposed_to_ha: z.boolean(),
  is_household: z.boolean(),
  auto_complete_when_children_done: z.boolean(),
});
export type Task = z.infer<typeof TaskSchema>;

// ── Completion ────────────────────────────────────────────────────────────────

export const CompletionSchema = z.object({
  id: z.string().uuid(),
  task_id: z.string().uuid(),
  completed_by: z.string().uuid(),
  completed_at: z.coerce.date(),
  was_on_time: z.boolean().nullable(),
  points_awarded: z.number().int().nullable(),
  cycle_due_at: z.coerce.date().nullable(),
  notes: z.string().nullable(),
});
export type Completion = z.infer<typeof CompletionSchema>;

// ── API request schemas ───────────────────────────────────────────────────────

export const TaskIdParamsSchema = z.object({
  id: z.string().uuid("Invalid task ID"),
});
export type TaskIdParams = z.infer<typeof TaskIdParamsSchema>;

export const CreateTaskBodySchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  assignee_id: z.string().uuid().nullable().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  recurrence_rule: z.string().optional(),
  recurrence_mode: RecurrenceModeSchema.optional(),
  completion_window_days: z.number().int().nonnegative().optional(),
});
export type CreateTaskBody = z.infer<typeof CreateTaskBodySchema>;

export const UpdateTaskBodySchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  assignee_id: z.string().uuid().nullable().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  auto_complete_when_children_done: z.boolean().optional(),
  recurrence_rule: z.string().nullable().optional(),
  recurrence_mode: RecurrenceModeSchema.nullable().optional(),
  completion_window_days: z.number().int().nonnegative().nullable().optional(),
});
export type UpdateTaskBody = z.infer<typeof UpdateTaskBodySchema>;

export const CompleteTaskParamsSchema = z.object({
  id: z.string().uuid("Invalid task ID"),
});
export type CompleteTaskParams = z.infer<typeof CompleteTaskParamsSchema>;

export const ScheduleTaskBodySchema = z.object({
  planned_for: z.string().datetime({ message: "planned_for must be an ISO datetime" }),
});
export type ScheduleTaskBody = z.infer<typeof ScheduleTaskBodySchema>;

export const SnoozeTaskBodySchema = z.object({
  until: z.string().datetime({ message: "until must be an ISO datetime" }),
});
export type SnoozeTaskBody = z.infer<typeof SnoozeTaskBodySchema>;

export const GetTasksQuerySchema = z.object({
  assignee: z.enum(["mine", "me", "unassigned", "all"]).or(z.string().uuid()).optional(),
  scope: z.enum(["leaves", "all", "top_level"]).optional(),
});
export type GetTasksQuery = z.infer<typeof GetTasksQuerySchema>;

// ── Dev endpoints ─────────────────────────────────────────────────────────────

export const SwitchUserBodySchema = z.object({
  ha_user_id: z.string().min(1),
});
export type SwitchUserBody = z.infer<typeof SwitchUserBodySchema>;

export const DevUserSchema = z.object({
  id: z.string().uuid(),
  ha_user_id: z.string(),
  name: z.string(),
  locale: z.string(),
  is_admin: z.boolean(),
});
export type DevUser = z.infer<typeof DevUserSchema>;

// ── API response schemas ──────────────────────────────────────────────────────

export const TaskResponseSchema = TaskSchema.pick({
  id: true,
  title: true,
  description: true,
  assignee_id: true,
  parent_id: true,
  state: true,
  created_at: true,
  created_by: true,
  points: true,
  tags: true,
  recurrence_rule: true,
  recurrence_mode: true,
  completion_window_days: true,
  next_due_at: true,
  planned_for: true,
  auto_complete_when_children_done: true,
  archived_at: true,
}).extend({
  child_count: z.number().int().nonnegative(),
  parent_title: z.string().nullable(),
});
export type TaskResponse = z.infer<typeof TaskResponseSchema>;

export const TaskListResponseSchema = z.array(TaskResponseSchema);
export type TaskListResponse = z.infer<typeof TaskListResponseSchema>;

// ── Project response schemas ──────────────────────────────────────────────────

export const ProjectProgressSchema = z.object({
  totalLeaves: z.number().int().nonnegative(),
  completedLeaves: z.number().int().nonnegative(),
  percent: z.number().int().min(0).max(100),
});
export type ProjectProgress = z.infer<typeof ProjectProgressSchema>;

export const ProjectResponseSchema = TaskResponseSchema.extend({
  progress: ProjectProgressSchema,
  last_activity_at: z.coerce.date().nullable(),
});
export type ProjectResponse = z.infer<typeof ProjectResponseSchema>;

export const ProjectListResponseSchema = z.array(ProjectResponseSchema);
export type ProjectListResponse = z.infer<typeof ProjectListResponseSchema>;

export const TodayStatsSchema = z.object({
  completions_today: z.number().int(),
});
export type TodayStats = z.infer<typeof TodayStatsSchema>;

// ── Streak schemas ────────────────────────────────────────────────────────────

export const StreakRecordSchema = z.object({
  task_id: z.string().uuid(),
  task_title: z.string(),
  current_length: z.number().int().nonnegative(),
  longest_length: z.number().int().nonnegative(),
  at_risk: z.boolean(),
});
export type StreakRecord = z.infer<typeof StreakRecordSchema>;

export const TaskStreakSchema = z.object({
  user_id: z.string().uuid(),
  current_length: z.number().int().nonnegative(),
  longest_length: z.number().int().nonnegative(),
  last_completed_at: z.coerce.date().nullable(),
});
export type TaskStreak = z.infer<typeof TaskStreakSchema>;

export const CompleteTaskResultSchema = z.object({
  task: TaskResponseSchema.nullable(),
  completion: z.object({
    was_on_time: z.boolean(),
    points_awarded: z.number().int(),
  }),
  streak: z.object({
    current: z.number().int().nonnegative(),
    longest: z.number().int().nonnegative(),
    milestone_reached: z.number().int().nullable(),
  }),
  points_awarded: z.number().int(),
});
export type CompleteTaskResult = z.infer<typeof CompleteTaskResultSchema>;

// ── Stats schemas ─────────────────────────────────────────────────────────────

export const MeStatsSchema = z.object({
  week: z.object({
    points: z.number().int(),
    completions: z.number().int(),
    completions_by_day: z.array(z.number().int()),
  }),
  streaks: z.object({
    active: z.array(StreakRecordSchema),
    longest_ever: z
      .object({
        task_id: z.string().uuid(),
        task_title: z.string().nullable(),
        length: z.number().int(),
      })
      .nullable(),
  }),
  history: z.object({
    last_12_weeks: z.array(z.number().int()),
  }),
});
export type MeStats = z.infer<typeof MeStatsSchema>;

export const HouseholdStatsSchema = z.object({
  week: z.object({
    points: z.number().int(),
    completions_by_day: z.array(z.number().int()),
    contributions: z.array(
      z.object({ user_id: z.string().uuid(), name: z.string(), points: z.number().int() }),
    ),
  }),
  longest_household_streak: z.number().int(),
  history: z.object({
    last_12_weeks: z.array(z.number().int()),
  }),
});
export type HouseholdStats = z.infer<typeof HouseholdStatsSchema>;
