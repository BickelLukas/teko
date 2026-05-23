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

export function ChoresPage() {
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>("all");

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });

  const { data: allTasks = [], isLoading } = useQuery({
    queryKey: ["tasks", assigneeFilter],
    queryFn: () => fetchTasks(assigneeFilter),
  });

  const chores = allTasks.filter((t: TaskResponse) => t.recurrence_rule !== null);

  // Group by state for display
  const overdue = chores.filter((t) => t.state === "overdue");
  const eligible = chores.filter((t) => t.state === "eligible");
  const planned = chores.filter((t) => t.state === "planned");
  const notYet = chores.filter((t) => t.state === "not_yet");

  const displayName = me?.display_name ?? me?.name ?? "Me";

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Chores</h1>
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

      {!isLoading && chores.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">No recurring chores found.</p>
      )}

      {overdue.length > 0 && (
        <ChoreSection title="Overdue" tasks={overdue} accent="text-destructive" />
      )}
      {eligible.length > 0 && <ChoreSection title="Eligible now" tasks={eligible} />}
      {planned.length > 0 && <ChoreSection title="Planned" tasks={planned} />}
      {notYet.length > 0 && <ChoreSection title="Coming up" tasks={notYet} muted />}
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
