import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { z } from "zod";
import { IconPlus } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import {
  DialogRoot,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { RecurrencePicker } from "@/components/RecurrencePicker";
import type { RecurrenceValue } from "@/components/RecurrencePicker";
import { createTask, fetchMe, fetchProjects, fetchUsers } from "@/lib/api";
import { getNow } from "@/lib/clock";

function buildFormSchema(titleRequired: string) {
  return z.object({
    title: z.string().min(1, titleRequired),
    description: z.string().optional(),
  });
}
type FormValues = z.infer<ReturnType<typeof buildFormSchema>>;

type AddTaskModalProps = {
  defaultParentId?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function AddTaskModal({
  defaultParentId,
  open: controlledOpen,
  onOpenChange,
}: AddTaskModalProps = {}) {
  const { t } = useTranslation("common");
  const isControlled = controlledOpen !== undefined;
  const queryClient = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? (v: boolean) => onOpenChange?.(v) : setInternalOpen;
  const [assigneeId, setAssigneeId] = useState<string>("__me__");
  const [parentId, setParentId] = useState<string>(defaultParentId ?? "__none__");

  useEffect(() => {
    setParentId(defaultParentId ?? "__none__");
  }, [defaultParentId]);

  const [recurrence, setRecurrence] = useState<RecurrenceValue>({
    rule: null,
    mode: "fixed",
    windowDays: null,
  });
  const [showRecurrence, setShowRecurrence] = useState(false);
  const [startDate, setStartDate] = useState<Date | null>(null);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", "all"],
    queryFn: () => fetchProjects("all"),
  });

  const FormSchema = buildFormSchema(t("form.title_required"));
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(FormSchema) });

  function resetForm() {
    reset();
    setAssigneeId("__me__");
    setParentId(defaultParentId ?? "__none__");
    setRecurrence({ rule: null, mode: "fixed", windowDays: null });
    setShowRecurrence(false);
    setStartDate(null);
  }

  const createMutation = useMutation({
    mutationFn: (data: FormValues) => {
      const resolvedAssignee =
        assigneeId === "__me__" ? undefined : assigneeId === "__unassigned__" ? null : assigneeId;
      const resolvedParent = parentId === "__none__" ? undefined : parentId;
      return createTask({
        title: data.title,
        description: data.description,
        assignee_id: resolvedAssignee,
        parent_id: resolvedParent,
        recurrence_rule: recurrence.rule ?? undefined,
        recurrence_mode: recurrence.rule ? recurrence.mode : undefined,
        completion_window_days: recurrence.windowDays ?? undefined,
        start_date: startDate ? format(startDate, "yyyy-MM-dd") : undefined,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["task-tree"] });
      resetForm();
      setOpen(false);
    },
  });

  return (
    <DialogRoot
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetForm();
      }}
    >
      {!isControlled && (
        <DialogTrigger asChild>
          <Button size="sm">
            <IconPlus className="mr-1 size-4" />
            {t("actions.add_task")}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("add_task.title")}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((data) => createMutation.mutate(data))}
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
                  <SelectItem value="__me__">
                    {t("assignee.me", {
                      name: me?.display_name ?? me?.name ?? t("person.current_user"),
                    })}
                  </SelectItem>
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

          {!isControlled && projects.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("add_task.project_optional")}
              </label>
              <SelectRoot value={parentId} onValueChange={setParentId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("add_task.none")}</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectRoot>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {showRecurrence ? t("add_task.starting") : t("add_task.when")}
            </label>
            <DatePicker value={startDate} onChange={setStartDate} min={getNow()} />
          </div>

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

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {t("actions.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={createMutation.isPending}>
              {createMutation.isPending ? t("actions.adding") : t("actions.add_task")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
