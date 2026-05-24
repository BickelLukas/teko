import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { addDays, addWeeks } from "date-fns";
import { getNow } from "@/lib/clock";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { scheduleTask } from "@/lib/api";
import type { TaskResponse } from "@teko/shared";

export function SchedulePanel({ task, onDone }: { task: TaskResponse; onDone: () => void }) {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();

  const scheduleMutation = useMutation({
    mutationFn: ({ date }: { date: Date }) => scheduleTask(task.id, date),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      onDone();
    },
  });

  return (
    <div className="mt-2 rounded-md border border-border bg-muted/40 p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{t("schedule_panel.title")}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="xs"
          variant="outline"
          disabled={scheduleMutation.isPending}
          onClick={() => scheduleMutation.mutate({ date: addDays(getNow(), 1) })}
        >
          {t("schedule_panel.tomorrow")}
        </Button>
        <Button
          size="xs"
          variant="outline"
          disabled={scheduleMutation.isPending}
          onClick={() => scheduleMutation.mutate({ date: addDays(getNow(), 3) })}
        >
          {t("schedule_panel.in_3_days")}
        </Button>
        <Button
          size="xs"
          variant="outline"
          disabled={scheduleMutation.isPending}
          onClick={() => scheduleMutation.mutate({ date: addWeeks(getNow(), 1) })}
        >
          {t("schedule_panel.next_week")}
        </Button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <DatePicker
          value={null}
          onChange={(date) => {
            if (date)
              scheduleMutation.mutate({
                date: new Date(date.toISOString().split("T")[0] + "T12:00:00Z"),
              });
          }}
          min={getNow()}
          disabled={scheduleMutation.isPending}
          className="h-6 px-2 text-xs"
        />
        <Button size="xs" variant="ghost" onClick={onDone}>
          {t("actions.cancel")}
        </Button>
      </div>
    </div>
  );
}
