import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatDistanceToNow, isPast } from "date-fns";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Card, CardContent } from "./components/ui/card";
import { RecurrencePicker } from "./components/RecurrencePicker";
import type { RecurrenceValue } from "./components/RecurrencePicker";
import type { TaskListResponse, TaskResponse } from "@teko/shared";
import { CreateTaskBodySchema } from "@teko/shared";

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchTasks(): Promise<TaskListResponse> {
  const res = await fetch("/api/tasks");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<TaskListResponse>;
}

type CreatePayload = z.infer<typeof CreateTaskBodySchema>;

async function createTask(body: CreatePayload): Promise<TaskResponse> {
  const res = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<TaskResponse>;
}

async function completeTask(id: string): Promise<void> {
  const res = await fetch(`/api/tasks/${id}/complete`, { method: "POST" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function scheduleTask(id: string, plannedFor: Date): Promise<void> {
  const res = await fetch(`/api/tasks/${id}/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planned_for: plannedFor.toISOString() }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function snoozeTask(id: string, until: Date): Promise<void> {
  const res = await fetch(`/api/tasks/${id}/snooze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ until: until.toISOString() }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// ── State badge ───────────────────────────────────────────────────────────────

function StateBadge({ task }: { task: TaskResponse }) {
  const nextDue = task.next_due_at ? new Date(task.next_due_at) : null;
  const plannedFor = task.planned_for ? new Date(task.planned_for) : null;

  if (task.state === "not_yet" && nextDue) {
    return (
      <span className="text-xs text-muted-foreground">
        Next due {formatDistanceToNow(nextDue, { addSuffix: true })}
      </span>
    );
  }
  if (task.state === "eligible") {
    if (task.completion_window_days && task.completion_window_days > 0 && nextDue) {
      const windowEnd = new Date(
        nextDue.getTime() + task.completion_window_days * 24 * 60 * 60 * 1000,
      );
      return (
        <span className="text-xs text-blue-500">
          Eligible — do any time until {windowEnd.toLocaleDateString()}
        </span>
      );
    }
    return <span className="text-xs text-blue-500">Eligible — do today</span>;
  }
  if (task.state === "planned" && plannedFor) {
    return (
      <span className="text-xs text-violet-500">
        Planned for {plannedFor.toLocaleDateString()}
        {isPast(plannedFor) ? " (plan date passed)" : ""}
      </span>
    );
  }
  if (task.state === "overdue" && nextDue) {
    return (
      <span className="text-xs text-destructive font-medium">
        Overdue by {formatDistanceToNow(nextDue)}
      </span>
    );
  }
  return null;
}

// ── Group helpers ─────────────────────────────────────────────────────────────

const GROUP_ORDER: Record<string, number> = {
  overdue: 0,
  eligible: 1,
  planned: 2,
  not_yet: 3,
  done: 4,
};

function groupLabel(state: string): string {
  switch (state) {
    case "overdue":
      return "Overdue";
    case "eligible":
      return "Eligible this period";
    case "planned":
      return "Planned";
    case "not_yet":
      return "Coming up";
    default:
      return "";
  }
}

// ── Form schema ───────────────────────────────────────────────────────────────

const FormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
});
type FormValues = z.infer<typeof FormSchema>;

// ── App ───────────────────────────────────────────────────────────────────────

export function App() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrenceValue>({
    rule: null,
    mode: "fixed",
    windowDays: null,
  });
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [scheduledDate, setScheduledDate] = useState("");

  const {
    data: tasks = [],
    isLoading,
    error,
  } = useQuery({ queryKey: ["tasks"], queryFn: fetchTasks });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(FormSchema) });

  const createMutation = useMutation({
    mutationFn: (data: FormValues) =>
      createTask({
        title: data.title,
        description: data.description,
        recurrence_rule: recurrence.rule ?? undefined,
        recurrence_mode: recurrence.rule ? recurrence.mode : undefined,
        completion_window_days: recurrence.windowDays ?? undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      reset();
      setRecurrence({ rule: null, mode: "fixed", windowDays: null });
      setShowForm(false);
    },
  });

  const completeMutation = useMutation({
    mutationFn: completeTask,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const scheduleMutation = useMutation({
    mutationFn: ({ id, date }: { id: string; date: Date }) => scheduleTask(id, date),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setSchedulingId(null);
      setScheduledDate("");
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: ({ id, until }: { id: string; until: Date }) => snoozeTask(id, until),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  // Group tasks by state
  const sorted = [...tasks].sort(
    (a, b) => (GROUP_ORDER[a.state] ?? 9) - (GROUP_ORDER[b.state] ?? 9),
  );
  const groups = sorted.reduce<Record<string, TaskResponse[]>>((acc, t) => {
    acc[t.state] ??= [];
    acc[t.state]?.push(t);
    return acc;
  }, {});

  return (
    <main className="min-h-screen bg-background text-foreground p-8 max-w-xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Tasks</h1>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cancel" : "+ Add task"}
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardContent className="pt-4">
            <form
              onSubmit={handleSubmit((data) => createMutation.mutate(data))}
              className="space-y-4"
            >
              <div>
                <Input placeholder="Task title" aria-label="Task title" {...register("title")} />
                {errors.title && (
                  <p className="mt-1 text-xs text-destructive">{errors.title.message}</p>
                )}
              </div>
              <Input placeholder="Description (optional)" {...register("description")} />
              <RecurrencePicker value={recurrence} onChange={setRecurrence} />
              <Button type="submit" disabled={createMutation.isPending} className="w-full">
                {createMutation.isPending ? "Adding…" : "Add task"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {error && <p className="text-destructive text-sm">{String(error)}</p>}

      {tasks.length === 0 && !isLoading && !error && (
        <p className="text-muted-foreground text-sm">No open tasks.</p>
      )}

      {(["overdue", "eligible", "planned", "not_yet"] as const).map((group) => {
        const items = groups[group];
        if (!items?.length) return null;
        return (
          <section key={group} className="mb-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {groupLabel(group)}
            </h2>
            <ul className="space-y-2">
              {items.map((task) => (
                <li key={task.id}>
                  <Card className={task.state === "overdue" ? "border-destructive/50" : ""}>
                    <CardContent className="py-3 space-y-2">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{task.title}</p>
                          {task.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {task.description}
                            </p>
                          )}
                          <StateBadge task={task} />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => completeMutation.mutate(task.id)}
                          disabled={completeMutation.isPending}
                        >
                          Done
                        </Button>
                      </div>

                      {(task.state === "eligible" || task.state === "overdue") && (
                        <div className="flex gap-2 flex-wrap">
                          {schedulingId === task.id ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              <input
                                type="datetime-local"
                                className="rounded border border-input bg-background px-2 py-1 text-xs"
                                value={scheduledDate}
                                onChange={(e) => setScheduledDate(e.target.value)}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs"
                                disabled={!scheduledDate || scheduleMutation.isPending}
                                onClick={() => {
                                  if (scheduledDate) {
                                    scheduleMutation.mutate({
                                      id: task.id,
                                      date: new Date(scheduledDate),
                                    });
                                  }
                                }}
                              >
                                Confirm
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs"
                                onClick={() => setSchedulingId(null)}
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs"
                              onClick={() => setSchedulingId(task.id)}
                            >
                              Schedule
                            </Button>
                          )}
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs"
                              disabled={snoozeMutation.isPending}
                              onClick={() =>
                                snoozeMutation.mutate({
                                  id: task.id,
                                  until: new Date(Date.now() + 24 * 60 * 60 * 1000),
                                })
                              }
                            >
                              Snooze 1d
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs"
                              disabled={snoozeMutation.isPending}
                              onClick={() =>
                                snoozeMutation.mutate({
                                  id: task.id,
                                  until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                                })
                              }
                            >
                              Snooze 1w
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </main>
  );
}
