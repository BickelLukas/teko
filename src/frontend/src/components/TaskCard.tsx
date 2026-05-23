import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, isPast, addHours, addDays, addWeeks } from "date-fns";
import { IconCheck, IconDots, IconCalendar, IconZzz } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { completeTask, snoozeTask, scheduleTask } from "@/lib/api";
import type { TaskResponse } from "@teko/shared";
import { describeRecurrence } from "@/lib/recurrence";

// ── State badge ───────────────────────────────────────────────────────────────

function StateBadge({ task }: { task: TaskResponse }) {
  const nextDue = task.next_due_at ? new Date(task.next_due_at) : null;
  const plannedFor = task.planned_for ? new Date(task.planned_for) : null;

  if (task.state === "not_yet" && nextDue) {
    return (
      <span className="text-xs text-muted-foreground">
        Due {formatDistanceToNow(nextDue, { addSuffix: true })}
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
          Do any time until {windowEnd.toLocaleDateString()}
        </span>
      );
    }
    return <span className="text-xs text-blue-500">Ready to do</span>;
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
      <span className="text-xs font-medium text-destructive">
        Overdue by {formatDistanceToNow(nextDue)}
      </span>
    );
  }
  return null;
}

// ── Snooze/schedule panel ─────────────────────────────────────────────────────

function SchedulePanel({ task, onDone }: { task: TaskResponse; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [customDate, setCustomDate] = useState("");

  const scheduleMutation = useMutation({
    mutationFn: ({ date }: { date: Date }) => scheduleTask(task.id, date),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      onDone();
    },
  });

  return (
    <div className="mt-2 rounded-md border border-border bg-muted/40 p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">Schedule for:</p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="xs"
          variant="outline"
          disabled={scheduleMutation.isPending}
          onClick={() => scheduleMutation.mutate({ date: addDays(new Date(), 1) })}
        >
          Tomorrow
        </Button>
        <Button
          size="xs"
          variant="outline"
          disabled={scheduleMutation.isPending}
          onClick={() => scheduleMutation.mutate({ date: addDays(new Date(), 3) })}
        >
          In 3 days
        </Button>
        <Button
          size="xs"
          variant="outline"
          disabled={scheduleMutation.isPending}
          onClick={() => scheduleMutation.mutate({ date: addWeeks(new Date(), 1) })}
        >
          Next week
        </Button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="date"
          className="rounded border border-input bg-background px-2 py-1 text-xs"
          value={customDate}
          onChange={(e) => setCustomDate(e.target.value)}
          min={new Date().toISOString().split("T")[0]}
        />
        <Button
          size="xs"
          disabled={!customDate || scheduleMutation.isPending}
          onClick={() => {
            if (customDate) {
              scheduleMutation.mutate({ date: new Date(customDate + "T12:00:00") });
            }
          }}
        >
          Confirm
        </Button>
        <Button size="xs" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── TaskCard ──────────────────────────────────────────────────────────────────

type TaskCardProps = {
  task: TaskResponse;
  showAssignee?: boolean;
  assigneeName?: string;
};

export function TaskCard({ task, showAssignee, assigneeName }: TaskCardProps) {
  const queryClient = useQueryClient();
  const [showSchedule, setShowSchedule] = useState(false);

  const completeMutation = useMutation({
    mutationFn: () => completeTask(task.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const snoozeMutation = useMutation({
    mutationFn: (until: Date) => snoozeTask(task.id, until),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const isOverdue = task.state === "overdue";

  const recurrenceSummary =
    task.recurrence_rule && task.recurrence_mode
      ? describeRecurrence(task.recurrence_rule, task.recurrence_mode)
      : null;

  return (
    <Card className={isOverdue ? "border-destructive/40" : ""}>
      <CardContent className="py-3">
        <div className="flex items-start gap-3">
          <button
            onClick={() => completeMutation.mutate()}
            disabled={completeMutation.isPending}
            className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-border transition-colors hover:border-primary hover:bg-primary/10 disabled:opacity-50"
            aria-label="Mark done"
          >
            {completeMutation.isPending && <IconCheck className="size-3 text-primary/50" />}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{task.title}</p>
                {task.description && (
                  <p className="truncate text-xs text-muted-foreground">{task.description}</p>
                )}
                {recurrenceSummary && (
                  <p className="text-xs text-muted-foreground/70">{recurrenceSummary}</p>
                )}
                <StateBadge task={task} />
                {showAssignee && (
                  <span className="mt-0.5 inline-block text-xs text-muted-foreground/60">
                    {assigneeName ?? "Unassigned"}
                  </span>
                )}
              </div>

              <DropdownMenuRoot>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="shrink-0 text-muted-foreground"
                    aria-label="Task actions"
                  >
                    <IconDots />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => completeMutation.mutate()}
                    disabled={completeMutation.isPending}
                  >
                    <IconCheck className="mr-2 size-4" />
                    Mark done
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Snooze</DropdownMenuLabel>
                  <DropdownMenuItem
                    disabled={snoozeMutation.isPending}
                    onClick={() => snoozeMutation.mutate(addHours(new Date(), 1))}
                  >
                    <IconZzz className="mr-2 size-4" />1 hour
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={snoozeMutation.isPending}
                    onClick={() => snoozeMutation.mutate(addDays(new Date(), 1))}
                  >
                    <IconZzz className="mr-2 size-4" />
                    Until tomorrow
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={snoozeMutation.isPending}
                    onClick={() => snoozeMutation.mutate(addWeeks(new Date(), 1))}
                  >
                    <IconZzz className="mr-2 size-4" />
                    Until next week
                  </DropdownMenuItem>
                  {(task.state === "eligible" || task.state === "overdue") && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setShowSchedule((v) => !v)}>
                        <IconCalendar className="mr-2 size-4" />
                        Schedule
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenuRoot>
            </div>

            {showSchedule && <SchedulePanel task={task} onDone={() => setShowSchedule(false)} />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
