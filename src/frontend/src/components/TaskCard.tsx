import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { addHours, addDays, addWeeks } from "date-fns";
import { getNow } from "@/lib/clock";
import {
  IconCheck,
  IconDots,
  IconCalendar,
  IconZzz,
  IconFlame,
  IconPencil,
  IconArchive,
  IconBookmark,
} from "@tabler/icons-react";
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
import { completeTask, snoozeTask, archiveTask, unscheduleTask } from "@/lib/api";
import type { TaskResponse } from "@teko/shared";
import { EditTaskModal } from "@/components/EditTaskModal";
import { ArchiveConfirmDialog } from "@/components/ArchiveConfirmDialog";
import { TaskStateBadge } from "@/components/TaskStateBadge";
import { SchedulePanel } from "@/components/SchedulePanel";
import { describeRecurrenceLocalized } from "@/lib/recurrence";
import { useLocale } from "@/lib/locale";
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

// ── TaskCard ──────────────────────────────────────────────────────────────────

type TaskCardProps = {
  task: TaskResponse;
  showAssignee?: boolean;
  streakLength?: number;
  /** When provided, renders a small "Someday" badge next to the title. */
  somedayBadge?: string | undefined;
};

export function TaskCard({ task, showAssignee, streakLength = 0, somedayBadge }: TaskCardProps) {
  const { t } = useTranslation("common");
  const { locale } = useLocale();
  const queryClient = useQueryClient();
  const [showSchedule, setShowSchedule] = useState(false);
  const [justDone, setJustDone] = useState(false);
  const [milestoneCaption, setMilestoneCaption] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  useEffect(() => {
    if (!justDone) return;
    const timer = setTimeout(() => setJustDone(false), 2000);
    return () => clearTimeout(timer);
  }, [justDone]);

  const completeMutation = useMutation({
    mutationFn: () => completeTask(task.id),
    onSuccess: (result) => {
      setJustDone(true);

      if (result.streak.milestone_reached !== null && result.completion.was_on_time) {
        fireMilestoneConfetti();
        setMilestoneCaption(
          t("task.milestone", { count: result.streak.milestone_reached, title: task.title }),
        );
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

  const archiveMutation = useMutation({
    mutationFn: () => archiveTask(task.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
      void queryClient.invalidateQueries({ queryKey: ["today-stats"] });
      setArchiveOpen(false);
    },
  });

  // "Move to Someday" — only for non-recurring tasks that have a planned date.
  // Clears planned_for, which moves the task back to the Someday list.
  const moveToSomedayMutation = useMutation({
    mutationFn: () => unscheduleTask(task.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const canMoveToSomeday =
    task.recurrence_rule === null &&
    task.planned_for !== null &&
    task.archived_at === null &&
    task.state !== "done";

  const isOverdue = task.state === "overdue";
  const showStreakBadge = streakLength >= 3;

  const recurrenceSummary =
    task.recurrence_rule && task.recurrence_mode
      ? describeRecurrenceLocalized(task.recurrence_rule, task.recurrence_mode, locale)
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
    <>
      <Card className={isOverdue ? "border-destructive/40" : ""}>
        <CardContent className="py-3">
          <div className="flex items-start gap-3">
            <button
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending}
              className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-border transition-all duration-200 hover:scale-110 hover:border-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50"
              aria-label={t("task.mark_done_aria")}
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
                    {somedayBadge && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                        <IconBookmark className="size-3" />
                        {somedayBadge}
                      </span>
                    )}
                  </div>
                  {task.description && (
                    <p className="truncate text-xs text-muted-foreground">{task.description}</p>
                  )}
                  {recurrenceSummary && (
                    <p className="text-xs text-muted-foreground/70">{recurrenceSummary}</p>
                  )}
                  <TaskStateBadge task={task} />
                  {showAssignee && (
                    <span className="mt-0.5 ml-1 inline-block text-xs text-muted-foreground/60">
                      {task.assignee_name ?? t("filters.unassigned")}
                    </span>
                  )}
                </div>

                <DropdownMenuRoot>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="shrink-0 text-muted-foreground"
                      aria-label={t("task.actions_aria")}
                    >
                      <IconDots />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>{t("task.dropdown_label")}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => completeMutation.mutate()}
                      disabled={completeMutation.isPending}
                    >
                      <IconCheck className="mr-2 size-4" />
                      {t("actions.mark_done")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setEditOpen(true)}>
                      <IconPencil className="mr-2 size-4" />
                      {t("actions.edit")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>{t("actions.snooze")}</DropdownMenuLabel>
                    <DropdownMenuItem
                      disabled={snoozeMutation.isPending}
                      onClick={() => snoozeMutation.mutate(addHours(getNow(), 1))}
                    >
                      <IconZzz className="mr-2 size-4" />
                      {t("snooze_options.one_hour")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={snoozeMutation.isPending}
                      onClick={() => snoozeMutation.mutate(addDays(getNow(), 1))}
                    >
                      <IconZzz className="mr-2 size-4" />
                      {t("snooze_options.tomorrow")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={snoozeMutation.isPending}
                      onClick={() => snoozeMutation.mutate(addWeeks(getNow(), 1))}
                    >
                      <IconZzz className="mr-2 size-4" />
                      {t("snooze_options.next_week")}
                    </DropdownMenuItem>
                    {(task.state === "eligible" || task.state === "overdue") && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setShowSchedule((v) => !v)}>
                          <IconCalendar className="mr-2 size-4" />
                          {t("actions.schedule")}
                        </DropdownMenuItem>
                      </>
                    )}
                    {canMoveToSomeday && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={moveToSomedayMutation.isPending}
                          onClick={() => moveToSomedayMutation.mutate()}
                        >
                          <IconBookmark className="mr-2 size-4" />
                          {t("actions.move_to_someday")}
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setArchiveOpen(true)}
                    >
                      <IconArchive className="mr-2 size-4" />
                      {t("actions.archive")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenuRoot>
              </div>

              {showSchedule && <SchedulePanel task={task} onDone={() => setShowSchedule(false)} />}
            </div>
          </div>
        </CardContent>
      </Card>

      <EditTaskModal task={task} open={editOpen} onOpenChange={setEditOpen} />
      <ArchiveConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={task.title}
        hasChildren={false}
        isPending={archiveMutation.isPending}
        onConfirm={() => archiveMutation.mutate()}
      />
    </>
  );
}
