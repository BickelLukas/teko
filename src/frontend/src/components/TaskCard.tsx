import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  IconCheck,
  IconDots,
  IconCalendar,
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
import { completeTask, rescheduleTask, archiveTask } from "@/lib/api";
import type { TaskResponse } from "@teko/shared";
import { EditTaskModal } from "@/components/EditTaskModal";
import { ArchiveConfirmDialog } from "@/components/ArchiveConfirmDialog";
import { TaskStateBadge } from "@/components/TaskStateBadge";
import { ReschedulePanel } from "@/components/ReschedulePanel";
import { TagChip, OverflowChip } from "@/components/TagChip";
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
  /** When provided, tapping a tag chip calls this to set it as a filter. */
  onTagClick?: (tagId: number) => void;
};

export function TaskCard({
  task,
  showAssignee,
  streakLength = 0,
  somedayBadge,
  onTagClick,
}: TaskCardProps) {
  const { t } = useTranslation("common");
  const { locale } = useLocale();
  const queryClient = useQueryClient();
  const [showReschedule, setShowReschedule] = useState(false);
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

  const archiveMutation = useMutation({
    mutationFn: () => archiveTask(task.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
      void queryClient.invalidateQueries({ queryKey: ["today-stats"] });
      setArchiveOpen(false);
    },
  });

  // "Move to Someday" — only for tasks that already have a due_at set.
  // Clears due_at, which moves the task back to the Someday list.
  const moveToSomedayMutation = useMutation({
    mutationFn: () => rescheduleTask(task.id, null),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const canMoveToSomeday =
    task.recurrence_rule === null &&
    task.due_at !== null &&
    task.archived_at === null &&
    task.state !== "done";

  const isOverdue = task.state === "overdue";
  const canComplete = task.state !== "not_yet" && task.state !== "done";
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
            {canComplete && (
              <button
                onClick={() => completeMutation.mutate()}
                disabled={completeMutation.isPending}
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-border transition-all duration-200 hover:scale-110 hover:border-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50"
                aria-label={t("task.mark_done_aria")}
              >
                {completeMutation.isPending && <IconCheck className="size-3 text-primary/50" />}
              </button>
            )}

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
                  {task.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {task.tags.slice(0, 2).map((tag) => (
                        <TagChip
                          key={tag.id}
                          tag={tag}
                          {...(onTagClick ? { onClick: () => onTagClick(tag.id) } : {})}
                        />
                      ))}
                      {task.tags.length > 2 && <OverflowChip count={task.tags.length - 2} />}
                    </div>
                  )}
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
                      disabled={completeMutation.isPending || !canComplete}
                    >
                      <IconCheck className="mr-2 size-4" />
                      {t("actions.mark_done")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setEditOpen(true)}>
                      <IconPencil className="mr-2 size-4" />
                      {t("actions.edit")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setShowReschedule((v) => !v)}>
                      <IconCalendar className="mr-2 size-4" />
                      {t("actions.reschedule")}
                    </DropdownMenuItem>
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

              {showReschedule && (
                <ReschedulePanel task={task} onDone={() => setShowReschedule(false)} />
              )}
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
