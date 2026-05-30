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

export function ChoresPage() {
  const { t } = useTranslation(["pages", "common"]);
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>("all");

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });

  const {
    data: allTasks = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["tasks", assigneeFilter],
    queryFn: () => fetchTasks(assigneeFilter),
  });

  const chores = allTasks.filter((t: TaskResponse) => t.recurrence_rule !== null);

  const overdue = chores.filter((t) => t.state === "overdue");
  const eligible = chores.filter((t) => t.state === "eligible");
  const notYet = chores.filter((t) => t.state === "not_yet");

  const displayName = me?.display_name ?? me?.name ?? t("common:person.me_short");

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("pages:chores.title")}</h1>
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

      {isLoading && <TaskListSkeleton />}

      {isError && (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">{t("common:error.load_failed")}</p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => void refetch()}>
            {t("common:error.retry")}
          </Button>
        </div>
      )}

      {!isLoading && !isError && chores.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("pages:chores.no_chores")}
        </p>
      )}

      {overdue.length > 0 && (
        <ChoreSection
          title={t("pages:chores.sections.overdue")}
          tasks={overdue}
          accent="text-destructive"
        />
      )}
      {eligible.length > 0 && (
        <ChoreSection title={t("pages:chores.sections.eligible")} tasks={eligible} />
      )}
      {notYet.length > 0 && (
        <ChoreSection title={t("pages:chores.sections.coming_up")} tasks={notYet} muted />
      )}
    </div>
  );
}

function ChoreSection({
  title,
  tasks,
  accent,
  muted,
}: {
  title: string;
  tasks: TaskResponse[];
  accent?: string;
  muted?: boolean;
}) {
  return (
    <section>
      <h2
        className={[
          "mb-2 text-xs font-semibold uppercase tracking-wide",
          accent ?? (muted ? "text-muted-foreground/60" : "text-muted-foreground"),
        ].join(" ")}
      >
        {title}
      </h2>
      <ul className="space-y-2">
        {tasks.map((t) => (
          <li key={t.id}>
            <TaskCard task={t} showAssignee />
          </li>
        ))}
      </ul>
    </section>
  );
}
