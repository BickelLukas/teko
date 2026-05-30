import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { fetchTasks, fetchMe } from "@/lib/api";
import { TaskCard } from "@/components/TaskCard";
import { TaskListSkeleton } from "@/components/TaskCardSkeleton";
import { AddTaskModal } from "@/components/AddTaskModal";
import { Button } from "@/components/ui/button";
import {
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { parseEnum } from "@/lib/utils";
import type { TaskResponse } from "@teko/shared";

const ASSIGNEE_FILTERS = ["mine", "me", "unassigned", "all"] as const;
type AssigneeFilter = (typeof ASSIGNEE_FILTERS)[number];

const STATE_ORDER: Record<string, number> = {
  overdue: 0,
  eligible: 1,
  not_yet: 2,
  done: 3,
};

export function AllTasksPage() {
  const { t } = useTranslation(["pages", "common"]);
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>("all");
  const [includeSomeday, setIncludeSomeday] = useState(false);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });

  const scope = includeSomeday ? "all" : "active";

  const {
    data: tasks = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["tasks", assigneeFilter, scope],
    queryFn: () => fetchTasks(assigneeFilter, scope),
  });

  const sorted = [...tasks].sort(
    (a: TaskResponse, b: TaskResponse) => (STATE_ORDER[a.state] ?? 9) - (STATE_ORDER[b.state] ?? 9),
  );

  const displayName = me?.display_name ?? me?.name ?? t("common:person.me_short");

  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("pages:all_tasks.title")}</h1>
        <div className="flex items-center gap-2">
          <SelectRoot
            value={assigneeFilter}
            onValueChange={(v) => setAssigneeFilter(parseEnum(v, ASSIGNEE_FILTERS, "all"))}
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
          <AddTaskModal />
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={includeSomeday}
          onChange={(e) => setIncludeSomeday(e.target.checked)}
          className="size-3"
        />
        {t("pages:all_tasks.include_someday")}
      </label>

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
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("pages:all_tasks.no_tasks")}
        </p>
      )}

      <ul className="space-y-2">
        {sorted.map((task: TaskResponse) => (
          <li key={task.id}>
            <TaskCard
              task={task}
              showAssignee
              {...(task.is_someday ? { somedayBadge: t("common:someday_badge") } : {})}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
