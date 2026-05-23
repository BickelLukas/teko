import { useTranslation } from "react-i18next";
import { isPast, addDays } from "date-fns";
import type { TaskResponse } from "@teko/shared";
import { useLocale, formatDateMedium, formatDistance } from "@/lib/locale";

export function TaskStateBadge({ task }: { task: TaskResponse }) {
  const { t } = useTranslation("common");
  const { locale } = useLocale();
  const nextDue = task.next_due_at ? new Date(task.next_due_at) : null;
  const plannedFor = task.planned_for ? new Date(task.planned_for) : null;

  if (task.state === "not_yet" && nextDue) {
    return (
      <span className="text-xs text-muted-foreground">
        {t("task.state_badge.due", { time: formatDistance(nextDue, locale, { addSuffix: true }) })}
      </span>
    );
  }
  if (task.state === "eligible") {
    if (task.completion_window_days && task.completion_window_days > 0 && nextDue) {
      const windowEnd = addDays(nextDue, task.completion_window_days);
      return (
        <span className="text-xs text-blue-500">
          {t("task.state_badge.do_until", { date: formatDateMedium(windowEnd, locale) })}
        </span>
      );
    }
    return <span className="text-xs text-blue-500">{t("task.state_badge.ready")}</span>;
  }
  if (task.state === "planned" && plannedFor) {
    return (
      <span className="text-xs text-violet-500">
        {t("task.state_badge.planned_for", { date: formatDateMedium(plannedFor, locale) })}
        {isPast(plannedFor) ? ` ${t("task.state_badge.plan_passed")}` : ""}
      </span>
    );
  }
  if (task.state === "overdue" && nextDue) {
    return (
      <span className="text-xs font-medium text-destructive">
        {t("task.state_badge.overdue_by", { time: formatDistance(nextDue, locale) })}
      </span>
    );
  }
  return null;
}
