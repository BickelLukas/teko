import { useState, useEffect } from "react";
import type React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, isPast, addHours, addDays, addWeeks } from "date-fns";
import { IconCheck, IconDots, IconCalendar, IconZzz, IconFlame } from "@tabler/icons-react";
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
import confetti from "canvas-confetti";

// ── Milestone confetti ────────────────────────────────────────────────────────

function fireMilestoneConfetti() {
  void confetti({
    particleCount: 80,
    spread: 60,
    origin: { y: 0.6 },
    colors: ["#f59e0b", "#10b981", "#6366f1", "#f43f5e"],
    scalar: 0.9,
    ticks: 150,
  });
}

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
  breadcrumb?: React.ReactNode;
  streakLength?: number;
};

export function TaskCard({
  task,
  showAssignee,
  assigneeName,
  breadcrumb,
  streakLength = 0,
}: TaskCardProps) {
  const queryClient = useQueryClient();
  const [showSchedule, setShowSchedule] = useState(false);
  const [justDone, setJustDone] = useState(false);
  const [milestoneCaption, setMilestoneCaption] = useState<string | null>(null);

  useEffect(() => {
    if (!justDone) return;
    const t = setTimeout(() => setJustDone(false), 2000);
    return () => clearTimeout(t);
  }, [justDone]);

  const completeMutation = useMutation({
    mutationFn: () => completeTask(task.id),
    onSuccess: (result) => {
      setJustDone(true);

      if (result.streak.milestone_reached !== null && result.completion.was_on_time) {
        fireMilestoneConfetti();
        setMilestoneCaption(`${result.streak.milestone_reached}-day streak on ${task.title} 🔥`);
        setTimeout(() => setMilestoneCaption(null), 4000);
      }

      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ["tasks"] });
        void queryClient.invalidateQueries({ queryKey: ["stats"] });
        void queryClient.invalidateQueries({ queryKey: ["today-stats"] });
      }, 400);
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: (until: Date) => snoozeTask(task.id, until),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const isOverdue = task.state === "overdue";
  const showStreakBadge = streakLength >= 3;

  const recurrenceSummary =
    task.recurrence_rule && task.recurrence_mode
      ? describeRecurrence(task.recurrence_rule, task.recurrence_mode)
      : null;

  if (justDone) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="flex items-center gap-3 py-3">
          <div
            className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary"
            style={{ animation: "scale-in 200ms ease-out" }}
          >
            <IconCheck className="size-3 text-primary-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-muted-foreground line-through">
              {task.title}
            </p>
            {milestoneCaption && (
              <p className="mt-0.5 text-xs font-medium text-amber-500">{milestoneCaption}</p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={isOverdue ? "border-destructive/40" : ""}>
      <CardContent className="py-3">
        <div className="flex items-start gap-3">
          <button
            onClick={() => completeMutation.mutate()}
            disabled={completeMutation.isPending}
            className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-border transition-all duration-200 hover:border-primary hover:bg-primary/10 hover:scale-110 disabled:opacity-50"
            aria-label="Mark done"
          >
            {completeMutation.isPending && <IconCheck className="size-3 text-primary/50" />}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium">{task.title}</p>
                  {showStreakBadge && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-600">
                      <IconFlame className="size-3" />
                      {streakLength}
                    </span>
                  )}
                </div>
                {task.description && (
                  <p className="truncate text-xs text-muted-foreground">{task.description}</p>
                )}
                {recurrenceSummary && (
                  <p className="text-xs text-muted-foreground/70">{recurrenceSummary}</p>
                )}
                <StateBadge task={task} />
                {breadcrumb}
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
