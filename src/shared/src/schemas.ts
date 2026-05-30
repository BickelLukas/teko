import { z } from "zod";
import { TAG_PALETTE_KEYS } from "./palette.js";

// ── Domain types ─────────────────────────────────────────────────────────────

export const TaskStateSchema = z.enum(["not_yet", "eligible", "overdue", "done"]);
export type TaskState = z.infer<typeof TaskStateSchema>;

export const RecurrenceModeSchema = z.enum(["fixed", "after_completion"]);
export type RecurrenceMode = z.infer<typeof RecurrenceModeSchema>;

// ── User ─────────────────────────────────────────────────────────────────────

// Fully-qualified HA notify service id, e.g. "notify.mobile_app_alices_phone".
// The existence of the service is checked at send time, not here — this is a
// shape check only.
export const NOTIFY_SERVICE_REGEX = /^notify\.[a-z0-9_]+$/;

/** Strips the "notify." domain prefix to get the bare HA service name. */
export function bareNotifyServiceName(serviceId: string): string {
  return serviceId.startsWith("notify.") ? serviceId.slice("notify.".length) : serviceId;
}

export const UserSchema = z.object({
  id: z.string().uuid(),
  ha_user_id: z.string().min(1),
  name: z.string().min(1),
  display_name: z.string().nullable(),
  locale: z.string().min(2),
  theme: z.enum(["light", "dark", "system"]).default("system"),
  notification_time: z.string().nullable(),
  notification_service: z.string().nullable(),
  notify_digest_enabled: z.boolean(),
  notify_evening_reminder_enabled: z.boolean(),
  evening_reminder_time: z.string().nullable(),
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
  notification_service: true,
  notify_digest_enabled: true,
  notify_evening_reminder_enabled: true,
  evening_reminder_time: true,
  is_admin: true,
  is_active: true,
  week_start_day: true,
});
export type UserResponse = z.infer<typeof UserResponseSchema>;

export const UpdatePreferencesBodySchema = z.object({
  locale: z.string().min(2).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  notification_time: z.string().nullable().optional(),
  notification_service: z
    .union([z.string().regex(NOTIFY_SERVICE_REGEX, "Invalid notify service id"), z.null()])
    .optional(),
  notify_digest_enabled: z.boolean().optional(),
  notify_evening_reminder_enabled: z.boolean().optional(),
  evening_reminder_time: z.string().nullable().optional(),
  display_name: z.string().nullable().optional(),
  week_start_day: z.union([z.literal(0), z.literal(1)]).optional(),
});
export type UpdatePreferencesBody = z.infer<typeof UpdatePreferencesBodySchema>;

// ── Notify services ────────────────────────────────────────────────────────────

export const NotifyServiceSchema = z.object({
  service_name: z.string(),
  description: z.string().nullable(),
});
export type NotifyService = z.infer<typeof NotifyServiceSchema>;

export const NotifyServicesResponseSchema = z.object({
  services: z.array(NotifyServiceSchema),
});
export type NotifyServicesResponse = z.infer<typeof NotifyServicesResponseSchema>;

export const TestNotificationResponseSchema = z.object({
  sent_to: z.string(),
});
export type TestNotificationResponse = z.infer<typeof TestNotificationResponseSchema>;

// ── Tag ──────────────────────────────────────────────────────────────────────

export const TagPaletteKeySchema = z.enum(TAG_PALETTE_KEYS);
// TagPaletteKey type lives in palette.ts and is re-exported via index.ts

export const TagSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1).max(50),
  color: TagPaletteKeySchema,
  created_at: z.coerce.date(),
  created_by: z.string().uuid(),
});
export type Tag = z.infer<typeof TagSchema>;

export const TagResponseSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  color: TagPaletteKeySchema,
});
export type TagResponse = z.infer<typeof TagResponseSchema>;

export const TagWithCountSchema = TagResponseSchema.extend({
  count: z.number().int().nonnegative(),
});
export type TagWithCount = z.infer<typeof TagWithCountSchema>;

export const TagIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});
export type TagIdParams = z.infer<typeof TagIdParamsSchema>;

export const CreateTagBodySchema = z.object({
  name: z
    .string()
    .min(1)
    .max(50)
    .transform((v) => v.trim())
    .refine((v) => v.length > 0, "Name cannot be empty after trimming"),
  color: TagPaletteKeySchema,
});
export type CreateTagBody = z.infer<typeof CreateTagBodySchema>;

export const UpdateTagBodySchema = z.object({
  name: z
    .string()
    .min(1)
    .max(50)
    .transform((v) => v.trim())
    .refine((v) => v.length > 0, "Name cannot be empty after trimming")
    .optional(),
  color: TagPaletteKeySchema.optional(),
});
export type UpdateTagBody = z.infer<typeof UpdateTagBodySchema>;

export const SetTaskTagsBodySchema = z.object({
  tag_ids: z.array(z.number().int().positive()),
});
export type SetTaskTagsBody = z.infer<typeof SetTaskTagsBodySchema>;

// ── Task ─────────────────────────────────────────────────────────────────────

export const TaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().nullable(),
  assignee_id: z.string().uuid().nullable(),
  state: TaskStateSchema,
  created_at: z.coerce.date(),
  created_by: z.string().uuid(),
  archived_at: z.coerce.date().nullable(),
  recurrence_rule: z.string().nullable(),
  recurrence_mode: RecurrenceModeSchema.nullable(),
  completion_window_days: z.number().int().nullable(),
  due_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "due_at must be YYYY-MM-DD")
    .nullable(),
  points: z.number().int().nullable(),
  exposed_to_ha: z.boolean(),
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
  cycle_due_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "cycle_due_at must be YYYY-MM-DD")
    .nullable(),
  notes: z.string().nullable(),
});
export type Completion = z.infer<typeof CompletionSchema>;

// ── API request schemas ───────────────────────────────────────────────────────

export const TaskIdParamsSchema = z.object({
  id: z.string().uuid("Invalid task ID"),
});
export type TaskIdParams = z.infer<typeof TaskIdParamsSchema>;

export const CreateTaskBodySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  assignee_id: z.string().uuid().nullable().optional(),
  recurrence_rule: z.string().optional(),
  recurrence_mode: RecurrenceModeSchema.optional(),
  completion_window_days: z.number().int().nonnegative().optional(),
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type CreateTaskBody = z.infer<typeof CreateTaskBodySchema>;

export const UpdateTaskBodySchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  assignee_id: z.string().uuid().nullable().optional(),
  due_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "due_at must be YYYY-MM-DD")
    .nullable()
    .optional(),
  recurrence_rule: z.string().nullable().optional(),
  recurrence_mode: RecurrenceModeSchema.nullable().optional(),
  completion_window_days: z.number().int().nonnegative().nullable().optional(),
});
export type UpdateTaskBody = z.infer<typeof UpdateTaskBodySchema>;

export const CompleteTaskParamsSchema = z.object({
  id: z.string().uuid("Invalid task ID"),
});
export type CompleteTaskParams = z.infer<typeof CompleteTaskParamsSchema>;

export const RescheduleTaskBodySchema = z.object({
  due_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "due_at must be YYYY-MM-DD")
    .nullable(),
});
export type RescheduleTaskBody = z.infer<typeof RescheduleTaskBodySchema>;

export const GetTasksQuerySchema = z.object({
  assignee: z.enum(["mine", "me", "unassigned", "all"]).or(z.string().uuid()).optional(),
  // active (default): tasks with a recurrence rule or a due_at set
  // someday: non-recurring tasks with no due_at (recurrence_rule IS NULL AND due_at IS NULL)
  // all: no scope filter (includes someday items)
  scope: z.enum(["active", "someday", "all"]).optional(),
  // AND filter: comma-separated tag IDs; returns tasks that have ALL specified tags
  tags: z.string().optional(),
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

export const ClockActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("advance"), ms: z.number().int() }),
  z.object({ action: z.literal("set"), target: z.string().datetime() }),
  z.object({ action: z.literal("reset") }),
]);
export type ClockAction = z.infer<typeof ClockActionSchema>;

// ── API response schemas ──────────────────────────────────────────────────────

export const TaskResponseSchema = TaskSchema.pick({
  id: true,
  title: true,
  description: true,
  assignee_id: true,
  state: true,
  created_at: true,
  created_by: true,
  points: true,
  recurrence_rule: true,
  recurrence_mode: true,
  completion_window_days: true,
  due_at: true,
  archived_at: true,
}).extend({
  assignee_name: z.string().nullable(),
  // Resolved tag objects for this task (joined at response time).
  tags: z.array(TagResponseSchema),
  // True when the task is a Someday item: non-recurring, no date set, not archived.
  // Derived server-side so the frontend doesn't need to re-compute the predicate.
  is_someday: z.boolean(),
});
export type TaskResponse = z.infer<typeof TaskResponseSchema>;

export const TaskListResponseSchema = z.array(TaskResponseSchema);
export type TaskListResponse = z.infer<typeof TaskListResponseSchema>;

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

// ── User sync ─────────────────────────────────────────────────────────────────

export const SyncResultSchema = z.object({
  added: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  deactivated: z.number().int().nonnegative(),
  reactivated: z.number().int().nonnegative(),
  synced_at: z.string().datetime(),
});
export type SyncResult = z.infer<typeof SyncResultSchema>;

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
