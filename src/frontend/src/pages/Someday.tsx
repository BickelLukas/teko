import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { IconPencil, IconCalendar, IconArchive, IconDots } from "@tabler/icons-react";
import { IconPlus } from "@tabler/icons-react";
import { fetchTasks, fetchMe, archiveTask } from "@/lib/api";
import { AddTaskModal } from "@/components/AddTaskModal";
import { EditTaskModal } from "@/components/EditTaskModal";
import { ReschedulePanel } from "@/components/ReschedulePanel";
import { TaskListSkeleton } from "@/components/TaskCardSkeleton";
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
import {
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { parseEnum } from "@/lib/utils";
import type { TaskResponse } from "@teko/shared";
import { useLocale, formatDateShort } from "@/lib/locale";

const ASSIGNEE_FILTERS = ["mine", "me", "unassigned", "all"] as const;
type AssigneeFilter = (typeof ASSIGNEE_FILTERS)[number];

// ── SomedayCard ───────────────────────────────────────────────────────────────
// Calm card — no completion circle, no urgency colours, no progress bars.

function SomedayCard({ task }: { task: TaskResponse }) {
  const { t } = useTranslation(["common", "pages"]);
  const { locale } = useLocale();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);

  const archiveMutation = useMutation({
    mutationFn: () => archiveTask(task.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const createdDate = formatDateShort(new Date(task.created_at), locale);

  return (
    <>
      <Card>
        <CardContent className="py-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{task.title}</p>
                  {task.description && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {task.description}
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {task.assignee_name && (
                      <span className="text-xs text-muted-foreground/70">{task.assignee_name}</span>
                    )}
                    <span className="text-xs text-muted-foreground/50">{createdDate}</span>
                  </div>
                </div>

                <DropdownMenuRoot>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="shrink-0 text-muted-foreground"
                      aria-label={t("common:task.actions_aria")}
                    >
                      <IconDots />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>{t("common:task.dropdown_label")}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setEditOpen(true)}>
                      <IconPencil className="mr-2 size-4" />
                      {t("common:actions.edit")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowSchedule((v) => !v)}>
                      <IconCalendar className="mr-2 size-4" />
                      {t("common:actions.reschedule")}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      disabled={archiveMutation.isPending}
                      onClick={() => archiveMutation.mutate()}
                    >
                      <IconArchive className="mr-2 size-4" />
                      {t("common:actions.archive")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenuRoot>
              </div>

              {showSchedule && (
                <ReschedulePanel task={task} onDone={() => setShowSchedule(false)} />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <EditTaskModal task={task} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}

// ── SomedayPage ───────────────────────────────────────────────────────────────

export function SomedayPage() {
  const { t } = useTranslation(["pages", "common"]);
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>("mine");
  const [addOpen, setAddOpen] = useState(false);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });

  const {
    data: tasks = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["tasks", assigneeFilter, "someday"],
    queryFn: () => fetchTasks(assigneeFilter, "someday"),
  });

  // Newest first
  const sorted = [...tasks].sort(
    (a: TaskResponse, b: TaskResponse) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const displayName = me?.display_name ?? me?.name ?? t("common:person.me_short");

  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("pages:someday.title")}</h1>
        <div className="flex items-center gap-2">
          <SelectRoot
            value={assigneeFilter}
            onValueChange={(v) => setAssigneeFilter(parseEnum(v, ASSIGNEE_FILTERS, "mine"))}
          >
            <SelectTrigger size="sm" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mine">{t("common:filters.mine")}</SelectItem>
              <SelectItem value="me">
                {t("common:filters.me_only", { name: displayName })}
              </SelectItem>
              <SelectItem value="unassigned">{t("common:filters.unassigned")}</SelectItem>
              <SelectItem value="all">{t("common:filters.all")}</SelectItem>
            </SelectContent>
          </SelectRoot>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <IconPlus className="mr-1 size-4" />
            {t("pages:someday.add_button")}
          </Button>
          <AddTaskModal defaultType="someday" open={addOpen} onOpenChange={setAddOpen} />
        </div>
      </div>

      {isLoading && <TaskListSkeleton />}

      {isError && (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">{t("common:error.load_failed")}</p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => void refetch()}>
            {t("common:error.retry")}
          </Button>
        </div>
      )}

      {!isLoading && !isError && tasks.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            {t("pages:someday.empty_title")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            {t("pages:someday.empty_description")}
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {sorted.map((task: TaskResponse) => (
          <li key={task.id}>
            <SomedayCard task={task} />
          </li>
        ))}
      </ul>
    </div>
  );
}
