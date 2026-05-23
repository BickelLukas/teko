import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isSameDay, isWithinInterval, addDays, startOfDay } from "date-fns";
import { useNavigate } from "react-router-dom";
import { fetchTasks, fetchMe, fetchTodayStats, fetchMeStats } from "@/lib/api";
import { TaskCard } from "@/components/TaskCard";
import { TaskListSkeleton } from "@/components/TaskCardSkeleton";
import { AddTaskModal } from "@/components/AddTaskModal";
import { Button } from "@/components/ui/button";
import { useLocale, formatDateLong } from "@/lib/locale";
import { getNow } from "@/lib/clock";
import type { TaskResponse } from "@teko/shared";

function useGreeting(name: string): string {
  const { t } = useTranslation("pages");
  const h = getNow().getHours();
  const key = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
  return t(`today.greeting.${key}`, { name });
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

function ProjectBreadcrumb({ task }: { task: TaskResponse }) {
  const navigate = useNavigate();
  if (!task.parent_id || !task.parent_title) return null;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/projects/${task.parent_id}`);
      }}
      className="mt-0.5 block text-left text-xs text-muted-foreground/70 hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      aria-label={task.parent_title}
    >
      ↳ {task.parent_title}
    </button>
  );
}

export function TodayPage() {
  const { t } = useTranslation("pages");
  const { locale } = useLocale();
  const now = getNow();

  const {
    data: tasks = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
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

  const { data: meStats } = useQuery({
    queryKey: ["stats", "me"],
    queryFn: fetchMeStats,
    staleTime: 60_000,
  });

  const sections = bucketTasks(tasks, now);
  const hasAny =
    sections.overdue.length > 0 ||
    sections.today.length > 0 ||
    sections.eligible.length > 0 ||
    sections.comingUp.length > 0;

  const displayName = me?.display_name ?? me?.name ?? "there";
  const greeting = useGreeting(displayName);

  const streakByTask = new Map<string, number>();
  if (meStats) {
    for (const s of meStats.streaks.active) {
      streakByTask.set(s.task_id, s.current_length);
    }
  }

  const longestActive = meStats?.streaks.active[0] ?? null;

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{greeting}</h1>
          <p className="text-sm text-muted-foreground">{formatDateLong(now, locale)}</p>
        </div>
        <AddTaskModal />
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

      {!isLoading && !isError && !hasAny && (
        <div className="py-12 text-center">
          <p className="text-base text-muted-foreground">{t("today.all_caught_up")}</p>
        </div>
      )}

      {sections.overdue.length > 0 && (
        <Section
          title={t("today.sections.overdue")}
          accent="text-destructive"
          tasks={sections.overdue}
          streakByTask={streakByTask}
        />
      )}

      {sections.today.length > 0 && (
        <Section
          title={t("today.sections.today")}
          tasks={sections.today}
          streakByTask={streakByTask}
        />
      )}

      {sections.eligible.length > 0 && (
        <Section
          title={t("today.sections.eligible")}
          subtitle={t("today.sections.eligible_subtitle")}
          muted
          tasks={sections.eligible}
          streakByTask={streakByTask}
        />
      )}

      {sections.comingUp.length > 0 && (
        <Section
          title={t("today.sections.coming_up")}
          muted
          tasks={sections.comingUp}
          streakByTask={streakByTask}
        />
      )}

      <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground/60">
        {stats !== undefined && stats.completions_today > 0 ? (
          <p className="text-center">
            {t("today.footer.completed", { count: stats.completions_today })}
          </p>
        ) : (
          <span />
        )}
        {longestActive && (
          <p className="text-right">
            {t("today.footer.streak", {
              count: longestActive.current_length,
              title: longestActive.task_title,
            })}
          </p>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  tasks,
  accent,
  muted,
  streakByTask,
}: {
  title: string;
  subtitle?: string;
  tasks: TaskResponse[];
  accent?: string;
  muted?: boolean;
  streakByTask: Map<string, number>;
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
            <TaskCard
              task={t}
              streakLength={streakByTask.get(t.id) ?? 0}
              breadcrumb={<ProjectBreadcrumb task={t} />}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
