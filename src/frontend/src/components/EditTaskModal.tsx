import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DialogRoot, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { RecurrencePicker } from "@/components/RecurrencePicker";
import type { RecurrenceValue } from "@/components/RecurrencePicker";
import { updateTask, fetchMe, fetchUsers } from "@/lib/api";
import type { TaskResponse } from "@teko/shared";

function buildFormSchema(titleRequired: string) {
  return z.object({
    title: z.string().min(1, titleRequired),
    description: z.string().optional(),
  });
}
type FormValues = z.infer<ReturnType<typeof buildFormSchema>>;

type EditTaskModalProps = {
  task: TaskResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function recurrenceFromTask(task: TaskResponse): RecurrenceValue {
  return {
    rule: task.recurrence_rule,
    mode: task.recurrence_mode ?? "fixed",
    windowDays: task.completion_window_days,
  };
}

export function EditTaskModal({ task, open, onOpenChange }: EditTaskModalProps) {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();

  const [assigneeId, setAssigneeId] = useState<string>(task.assignee_id ?? "__unassigned__");
  const [recurrence, setRecurrence] = useState<RecurrenceValue>(recurrenceFromTask(task));
  const [showRecurrence, setShowRecurrence] = useState(task.recurrence_rule !== null);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
  });

  const FormSchema = buildFormSchema(t("form.title_required"));
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { title: task.title, description: task.description ?? "" },
  });

  useEffect(() => {
    if (open) {
      reset({ title: task.title, description: task.description ?? "" });
      setAssigneeId(task.assignee_id ?? "__unassigned__");
      setRecurrence(recurrenceFromTask(task));
      setShowRecurrence(task.recurrence_rule !== null);
    }
  }, [open, task, reset]);

  const saveMutation = useMutation({
    mutationFn: (data: FormValues) => {
      const resolvedAssignee = assigneeId === "__unassigned__" ? null : assigneeId;

      return updateTask(task.id, {
        title: data.title,
        description: data.description ?? null,
        assignee_id: resolvedAssignee,
        recurrence_rule: recurrence.rule,
        recurrence_mode: recurrence.rule ? recurrence.mode : null,
        completion_window_days: recurrence.rule ? (recurrence.windowDays ?? null) : null,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      onOpenChange(false);
    },
  });

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("edit_task.title")}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((data) => saveMutation.mutate(data))}
          className="mt-4 space-y-4"
        >
          <div>
            <Input
              placeholder={t("add_task.title_placeholder")}
              aria-label={t("add_task.title_placeholder")}
              autoFocus
              {...register("title")}
            />
            {errors.title && (
              <p className="mt-1 text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          <Input placeholder={t("add_task.description_placeholder")} {...register("description")} />

          {users.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("assignee.assign_to")}
              </label>
              <SelectRoot value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {me && (
                    <SelectItem value={me.id}>
                      {t("assignee.me", { name: me.display_name ?? me.name })}
                    </SelectItem>
                  )}
                  <SelectItem value="__unassigned__">{t("assignee.anyone")}</SelectItem>
                  {users
                    .filter((u) => u.id !== me?.id)
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </SelectRoot>
            </div>
          )}

          <div>
            <button
              type="button"
              className="mb-2 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={() => setShowRecurrence((v) => !v)}
            >
              {showRecurrence ? t("add_task.hide_recurrence") : t("add_task.add_recurrence")}
            </button>
            {showRecurrence && <RecurrencePicker value={recurrence} onChange={setRecurrence} />}
          </div>

          {saveMutation.isError && (
            <p className="text-xs text-destructive">{t("error.load_failed")}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              {t("actions.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? t("edit_task.saving") : t("edit_task.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
