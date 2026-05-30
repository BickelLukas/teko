import { differenceInCalendarDays, isToday, isTomorrow } from "date-fns";
import { useTranslation } from "react-i18next";
import type { TaskResponse } from "@teko/shared";
import { useLocale, formatDateMedium } from "@/lib/locale";
import { getNow } from "@/lib/clock";

export function TaskStateBadge({ task }: { task: TaskResponse }) {
  const { t } = useTranslation("common");
  const { locale } = useLocale();
  const now = getNow();
  const dueAt = task.due_at ? new Date(task.due_at) : null;

  if (task.state === "not_yet" && dueAt) {
    const days = Math.max(1, differenceInCalendarDays(dueAt, now));
    return (
      <span className="text-xs text-muted-foreground">
        {t("task.state_badge.due_in_days", { count: days })}
      </span>
    );
  }
  if (task.state === "eligible") {
    if (dueAt) {
      const label = isToday(dueAt)
        ? t("schedule_panel.today")
        : isTomorrow(dueAt)
          ? t("schedule_panel.tomorrow")
          : formatDateMedium(dueAt, locale);
      return <span className="text-xs text-blue-500">{label}</span>;
    }
    return <span className="text-xs text-blue-500">{t("task.state_badge.ready")}</span>;
  }
  if (task.state === "overdue" && dueAt) {
    const days = Math.max(1, differenceInCalendarDays(now, dueAt));
    return (
      <span className="text-xs font-medium text-destructive">
        {t("task.state_badge.overdue_by_days", { count: days })}
      </span>
    );
  }
  return null;
}
