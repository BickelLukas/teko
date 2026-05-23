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
  notification_time: z.string().nullable(),
  is_admin: z.boolean(),
  is_active: z.boolean(),
  created_at: z.coerce.date(),
});
export type User = z.infer<typeof UserSchema>;

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

export const CreateTaskBodySchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  assignee_id: z.string().uuid().optional(),
});
export type CreateTaskBody = z.infer<typeof CreateTaskBodySchema>;

export const CompleteTaskParamsSchema = z.object({
  id: z.string().uuid("Invalid task ID"),
});
export type CompleteTaskParams = z.infer<typeof CompleteTaskParamsSchema>;

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
});
export type TaskResponse = z.infer<typeof TaskResponseSchema>;

export const TaskListResponseSchema = z.array(TaskResponseSchema);
export type TaskListResponse = z.infer<typeof TaskListResponseSchema>;
