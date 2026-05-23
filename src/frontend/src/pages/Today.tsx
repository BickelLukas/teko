import { useQuery } from "@tanstack/react-query";
import { isSameDay, isWithinInterval, addDays, startOfDay } from "date-fns";
import { useNavigate } from "react-router-dom";
import { fetchTasks, fetchMe, fetchTodayStats } from "@/lib/api";
import { TaskCard } from "@/components/TaskCard";
import { AddTaskModal } from "@/components/AddTaskModal";
import type { TaskResponse } from "@teko/shared";

function greeting(name: string): string {
  const h = new Date().getHours();
  const part = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  return `Good ${part}, ${name}`;
}

type Sections = {
  overdue: TaskResponse[];
  today: TaskResponse[];
  eligible: TaskResponse[];
  comingUp: TaskResponse[];
};

function bucketTasks(tasks: TaskResponse[], now: Date): Sections {
  const today = startOfDay(now);
  const inTwoDays = addDays(today, 2);

  const overdue: TaskResponse[] = [];
  const todayTasks: TaskResponse[] = [];
  const eligible: TaskResponse[] = [];
  const comingUp: TaskResponse[] = [];

  for (const t of tasks) {
    const nextDue = t.next_due_at ? new Date(t.next_due_at) : null;
    const plannedFor = t.planned_for ? new Date(t.planned_for) : null;

    if (t.state === "overdue") {
      overdue.push(t);
    } else if (t.state === "planned") {
      if (plannedFor && isSameDay(plannedFor, now)) {
        todayTasks.push(t);
      } else if (plannedFor && isWithinInterval(plannedFor, { start: today, end: inTwoDays })) {
        comingUp.push(t);
      } else {
        eligible.push(t);
      }
    } else if (t.state === "eligible") {
      if (!nextDue || isSameDay(nextDue, now) || nextDue <= now) {
        todayTasks.push(t);
      } else {
        eligible.push(t);
      }
    } else if (t.state === "not_yet") {
      if (nextDue && isWithinInterval(nextDue, { start: today, end: inTwoDays })) {
        comingUp.push(t);
      }
    }
  }

  return { overdue, today: todayTasks, eligible, comingUp };
}

// Breadcrumb shown beneath a task title when the task belongs to a project
function ProjectBreadcrumb({ task }: { task: TaskResponse }) {
  const navigate = useNavigate();
  if (!task.parent_id || !task.parent_title) return null;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/projects/${task.parent_id}`);
      }}
      className="mt-0.5 block text-left text-xs text-muted-foreground/70 hover:text-primary"
    >
      ↳ {task.parent_title}
    </button>
  );
}

export function TodayPage() {
  const now = new Date();

  // scope=leaves: projects don't appear as line items, only their leaf tasks do
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks", "mine", "leaves"],
    queryFn: () => fetchTasks("mine", "leaves"),
  });

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
  });

  const { data: stats } = useQuery({
    queryKey: ["today-stats"],
    queryFn: fetchTodayStats,
  });

  const sections = bucketTasks(tasks, now);
  const hasAny =
    sections.overdue.length > 0 ||
    sections.today.length > 0 ||
    sections.eligible.length > 0 ||
    sections.comingUp.length > 0;

  const displayName = me?.display_name ?? me?.name ?? "there";

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{greeting(displayName)}</h1>
          <p className="text-sm text-muted-foreground">
            {now.toLocaleDateString("en", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <AddTaskModal />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && !hasAny && (
        <div className="py-12 text-center">
          <p className="text-base text-muted-foreground">All caught up.</p>
        </div>
      )}

      {sections.overdue.length > 0 && (
        <Section title="Overdue" accent="text-destructive" tasks={sections.overdue} />
      )}

      {sections.today.length > 0 && <Section title="Today" tasks={sections.today} />}

      {sections.eligible.length > 0 && (
        <Section
          title="Eligible this period"
          subtitle="Ready when you are"
          muted
          tasks={sections.eligible}
        />
      )}

      {sections.comingUp.length > 0 && (
        <Section title="Coming up" muted tasks={sections.comingUp} />
      )}

      {stats !== undefined && stats.completions_today > 0 && (
        <p className="pt-2 text-center text-xs text-muted-foreground/60">
          {stats.completions_today === 1
            ? "1 task completed today"
            : `${stats.completions_today} tasks completed today`}
        </p>
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  tasks,
  accent,
  muted,
}: {
  title: string;
  subtitle?: string;
  tasks: TaskResponse[];
  accent?: string;
  muted?: boolean;
}) {
  return (
    <section>
      <div className="mb-2">
        <h2
          className={[
            "text-xs font-semibold uppercase tracking-wide",
            accent ?? (muted ? "text-muted-foreground/60" : "text-muted-foreground"),
          ].join(" ")}
        >
          {title}
        </h2>
        {subtitle && <p className="text-xs text-muted-foreground/50">{subtitle}</p>}
      </div>
      <ul className="space-y-2">
        {tasks.map((t) => (
          <li key={t.id}>
            <TaskCard task={t} breadcrumb={<ProjectBreadcrumb task={t} />} />
          </li>
        ))}
      </ul>
    </section>
  );
}
