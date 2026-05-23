import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchTasks, fetchMe } from "@/lib/api";
import { TaskCard } from "@/components/TaskCard";
import { AddTaskModal } from "@/components/AddTaskModal";
import {
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import type { TaskResponse } from "@teko/shared";

type AssigneeFilter = "mine" | "me" | "unassigned" | "all";

const STATE_ORDER: Record<string, number> = {
  overdue: 0,
  eligible: 1,
  planned: 2,
  not_yet: 3,
  done: 4,
};

export function AllTasksPage() {
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>("all");

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks", assigneeFilter],
    queryFn: () => fetchTasks(assigneeFilter),
  });

  const sorted = [...tasks].sort(
    (a: TaskResponse, b: TaskResponse) =>
      (STATE_ORDER[a.state] ?? 9) - (STATE_ORDER[b.state] ?? 9),
  );

  const displayName = me?.display_name ?? me?.name ?? "Me";

  return (
    <div className="mx-auto max-w-xl space-y-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">All tasks</h1>
        <div className="flex items-center gap-2">
          <SelectRoot
            value={assigneeFilter}
            onValueChange={(v) => setAssigneeFilter(v as AssigneeFilter)}
          >
            <SelectTrigger size="sm" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mine">Mine + unassigned</SelectItem>
              <SelectItem value="me">{displayName} only</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              <SelectItem value="all">Everyone</SelectItem>
            </SelectContent>
          </SelectRoot>
          <AddTaskModal />
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && tasks.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">No tasks found.</p>
      )}

      <ul className="space-y-2">
        {sorted.map((task: TaskResponse) => (
          <li key={task.id}>
            <TaskCard task={task} showAssignee />
          </li>
        ))}
      </ul>
    </div>
  );
}
