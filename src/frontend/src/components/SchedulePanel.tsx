import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { addDays, addWeeks } from "date-fns";
import { getNow } from "@/lib/clock";
import { Button } from "@/components/ui/button";
import { scheduleTask } from "@/lib/api";
import type { TaskResponse } from "@teko/shared";

export function SchedulePanel({ task, onDone }: { task: TaskResponse; onDone: () => void }) {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const [customDate, setCustomDate] = useState("");

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
        <input
          type="date"
          className="rounded border border-input bg-background px-2 py-1 text-xs"
          value={customDate}
          onChange={(e) => setCustomDate(e.target.value)}
          min={getNow().toISOString().split("T")[0]}
        />
        <Button
          size="xs"
          disabled={!customDate || scheduleMutation.isPending}
          onClick={() => {
            if (customDate) {
              scheduleMutation.mutate({ date: new Date(customDate + "T12:00:00") });
            }
          }}
        >
          {t("actions.confirm")}
        </Button>
        <Button size="xs" variant="ghost" onClick={onDone}>
          {t("actions.cancel")}
        </Button>
      </div>
    </div>
  );
}
