import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { DateShortcutPicker } from "@/components/DateShortcutPicker";
import { scheduleTask } from "@/lib/api";
import type { TaskResponse } from "@teko/shared";

export function SchedulePanel({ task, onDone }: { task: TaskResponse; onDone: () => void }) {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();

  const scheduleMutation = useMutation({
    mutationFn: (date: Date) =>
      scheduleTask(task.id, new Date(date.toISOString().split("T")[0] + "T12:00:00Z")),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      onDone();
    },
  });

  return (
    <div className="mt-2 rounded-md border border-border bg-muted/40 p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{t("schedule_panel.title")}</p>
      <DateShortcutPicker
        value={null}
        onChange={(date) => {
          if (date) scheduleMutation.mutate(date);
        }}
        disabled={scheduleMutation.isPending}
      />
      <Button size="xs" variant="ghost" className="mt-2" onClick={onDone}>
        {t("actions.cancel")}
      </Button>
    </div>
  );
}
