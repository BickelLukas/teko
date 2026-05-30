import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { fetchTasks, fetchMe } from "@/lib/api";
import { TaskCard } from "@/components/TaskCard";
import { TaskListSkeleton } from "@/components/TaskCardSkeleton";
import { TagChip } from "@/components/TagChip";
import { TagFilterPill } from "@/components/TagPicker";
import { Button } from "@/components/ui/button";
import {
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { parseEnum } from "@/lib/utils";
import type { TaskResponse, TagResponse } from "@teko/shared";

const ASSIGNEE_FILTERS = ["mine", "me", "unassigned", "all"] as const;
type AssigneeFilter = (typeof ASSIGNEE_FILTERS)[number];

const STATE_ORDER: Record<string, number> = {
  overdue: 0,
  eligible: 1,
  not_yet: 2,
  done: 3,
};

function sortTasks(tasks: TaskResponse[]): TaskResponse[] {
  return [...tasks].sort((a, b) => {
    const sd = (STATE_ORDER[a.state] ?? 9) - (STATE_ORDER[b.state] ?? 9);
    if (sd !== 0) return sd;
    const ta = a.due_at ? new Date(a.due_at).getTime() : Infinity;
    const tb = b.due_at ? new Date(b.due_at).getTime() : Infinity;
    return ta - tb;
  });
}

export function TasksPage() {
  const { t } = useTranslation(["pages", "common"]);
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>("all");
  const [recurringOnly, setRecurringOnly] = useState(false);
  const [tagFilter, setTagFilter] = useState<TagResponse[]>([]);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });

  const tagIds = tagFilter.map((t) => t.id);

  const {
    data: tasks = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["tasks", assigneeFilter, "active", tagIds],
    queryFn: () => fetchTasks(assigneeFilter, "active", tagIds),
  });

  const filtered = recurringOnly
    ? tasks.filter((t: TaskResponse) => t.recurrence_rule !== null)
    : tasks;
  const sorted = sortTasks(filtered);
  const hasFilter = tagFilter.length > 0 || recurringOnly;

  const displayName = me?.display_name ?? me?.name ?? t("common:person.me_short");

  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("pages:tasks.title")}</h1>
        <div className="flex items-center gap-2">
          <TagFilterPill selected={tagFilter} onChange={setTagFilter} />
          <SelectRoot
            value={assigneeFilter}
            onValueChange={(v) => setAssigneeFilter(parseEnum(v, ASSIGNEE_FILTERS, "all"))}
          >
            <SelectTrigger size="sm" className="w-auto">
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
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={recurringOnly}
            onChange={(e) => setRecurringOnly(e.target.checked)}
            className="size-3"
          />
          {t("pages:tasks.recurring_only")}
        </label>
        {tagFilter.map((tag) => (
          <TagChip
            key={tag.id}
            tag={tag}
            onRemove={() => setTagFilter((prev) => prev.filter((t) => t.id !== tag.id))}
          />
        ))}
        {hasFilter && tagFilter.length > 0 && (
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setTagFilter([])}
          >
            {t("common:tags.clear_filters")}
          </button>
        )}
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

      {!isLoading && !isError && sorted.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">
            {hasFilter ? t("common:tags.no_match_filter") : t("pages:tasks.no_tasks")}
          </p>
          {hasFilter && (
            <button
              type="button"
              className="mt-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => {
                setTagFilter([]);
                setRecurringOnly(false);
              }}
            >
              {t("common:tags.clear_filters")}
            </button>
          )}
        </div>
      )}

      <ul className="space-y-2">
        {sorted.map((task: TaskResponse) => (
          <li key={task.id}>
            <TaskCard
              task={task}
              showAssignee
              onTagClick={(id) => {
                const tag = task.tags.find((t) => t.id === id);
                if (tag && !tagFilter.some((f) => f.id === id)) {
                  setTagFilter((prev) => [...prev, tag]);
                }
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
