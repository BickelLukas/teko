import { useTranslation } from "react-i18next";
import type { TaskResponse } from "@teko/shared";
import { useLocale, formatDateMedium, formatDistance } from "@/lib/locale";

export function TaskStateBadge({ task }: { task: TaskResponse }) {
  const { t } = useTranslation("common");
  const { locale } = useLocale();
  const dueAt = task.due_at ? new Date(task.due_at) : null;

  if (task.state === "not_yet" && dueAt) {
    return (
      <span className="text-xs text-muted-foreground">
        {t("task.state_badge.due", { time: formatDistance(dueAt, locale, { addSuffix: true }) })}
      </span>
    );
  }
  if (task.state === "eligible") {
    if (dueAt) {
      return (
        <span className="text-xs text-blue-500">
          {t("task.state_badge.due", { time: formatDateMedium(dueAt, locale) })}
        </span>
      );
    }
    return <span className="text-xs text-blue-500">{t("task.state_badge.ready")}</span>;
  }
  if (task.state === "overdue" && dueAt) {
    return (
      <span className="text-xs font-medium text-destructive">
        {t("task.state_badge.overdue_by", { time: formatDistance(dueAt, locale) })}
      </span>
    );
  }
  return null;
}
