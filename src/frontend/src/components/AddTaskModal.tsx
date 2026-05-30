import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { z } from "zod";
import { IconPlus } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateShortcutPicker } from "@/components/DateShortcutPicker";
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
import { TagSelector } from "@/components/TagPicker";
import { createTask, fetchMe, fetchUsers, setTaskTags } from "@/lib/api";
import type { TagResponse } from "@teko/shared";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TaskType = "someday" | "date" | "recurring";

const TASK_TYPES: TaskType[] = ["someday", "date", "recurring"];

// ── Form schema ───────────────────────────────────────────────────────────────

function buildFormSchema(titleRequired: string) {
  return z.object({
    title: z.string().min(1, titleRequired),
    description: z.string().optional(),
  });
}
type FormValues = z.infer<ReturnType<typeof buildFormSchema>>;

// ── Props ─────────────────────────────────────────────────────────────────────

type AddTaskModalProps = {
  /** Pre-select a task type when the modal opens. Defaults to "someday". */
  defaultType?: TaskType;
  /** Trigger button label override (only shown when uncontrolled). */
  triggerLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function AddTaskModal({
  defaultType = "someday",
  triggerLabel,
  open: controlledOpen,
  onOpenChange,
}: AddTaskModalProps = {}) {
  const { t } = useTranslation("common");
  const isControlled = controlledOpen !== undefined;
  const queryClient = useQueryClient();

  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? (v: boolean) => onOpenChange?.(v) : setInternalOpen;

  const [taskType, setTaskType] = useState<TaskType>(defaultType);
  const [assigneeId, setAssigneeId] = useState<string>("__me__");
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [windowDays, setWindowDays] = useState<number>(0);
  const [recurrence, setRecurrence] = useState<RecurrenceValue>({
    rule: null,
    mode: "fixed",
    windowDays: null,
  });
  const [selectedTags, setSelectedTags] = useState<TagResponse[]>([]);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: fetchUsers });

  const FormSchema = buildFormSchema(t("form.title_required"));
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(FormSchema) });

  function resetForm() {
    reset();
    setTaskType(defaultType);
    setAssigneeId("__me__");
    setStartDate(null);
    setWindowDays(0);
    setRecurrence({ rule: null, mode: "fixed", windowDays: null });
    setSelectedTags([]);
  }

  function handleTypeChange(type: TaskType) {
    setTaskType(type);
    if (type === "someday") {
      setStartDate(null);
      setRecurrence({ rule: null, mode: "fixed", windowDays: null });
    } else if (type === "date") {
      setRecurrence({ rule: null, mode: "fixed", windowDays: null });
    } else if (type === "recurring" && recurrence.rule === null) {
      // Default to daily so the picker starts in a valid state
      setRecurrence({ rule: "RRULE:FREQ=DAILY", mode: "fixed", windowDays: 0 });
    }
  }

  const createMutation = useMutation({
    mutationFn: (data: FormValues) => {
      const resolvedAssignee =
        assigneeId === "__me__" ? undefined : assigneeId === "__unassigned__" ? null : assigneeId;

      return createTask({
        title: data.title,
        description: data.description,
        assignee_id: resolvedAssignee,
        ...(taskType === "date" && startDate
          ? {
              start_date: format(startDate, "yyyy-MM-dd"),
              completion_window_days: windowDays > 0 ? windowDays : undefined,
            }
          : {}),
        ...(taskType === "recurring"
          ? {
              recurrence_rule: recurrence.rule ?? undefined,
              recurrence_mode: recurrence.rule ? recurrence.mode : undefined,
              completion_window_days: recurrence.windowDays ?? undefined,
              ...(startDate ? { start_date: format(startDate, "yyyy-MM-dd") } : {}),
            }
          : {}),
      });
    },
    onSuccess: async (task) => {
      if (selectedTags.length > 0) {
        await setTaskTags(
          task.id,
          selectedTags.map((t) => t.id),
        );
      }
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
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
            {triggerLabel ?? t("actions.add_task")}
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
          {/* ── Title ─────────────────────────────────────────────────────── */}
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

          {/* ── Description ───────────────────────────────────────────────── */}
          <Input placeholder={t("add_task.description_placeholder")} {...register("description")} />

          {/* ── Assignee ──────────────────────────────────────────────────── */}
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
                        {u.display_name ?? u.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </SelectRoot>
            </div>
          )}

          {/* ── Tags ──────────────────────────────────────────────────────── */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("tags.label")}
            </label>
            <TagSelector selected={selectedTags} onChange={setSelectedTags} />
          </div>

          {/* ── Type selector ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-3 rounded-lg bg-muted p-1">
            {TASK_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleTypeChange(type)}
                className={cn(
                  "rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
                  taskType === type
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`add_task.type.${type}`)}
              </button>
            ))}
          </div>

          {/* ── Date (on a date mode) ──────────────────────────────────────── */}
          {taskType === "date" && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("add_task.when")}
                </label>
                <DateShortcutPicker value={startDate} onChange={setStartDate} />
                {startDate === null && (
                  <p className="mt-1 text-xs text-muted-foreground/60">
                    {t("add_task.no_date_hint")}
                  </p>
                )}
              </div>
              {startDate !== null && (
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    {t("recurrence.window_label")}
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={365}
                      value={windowDays}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        setWindowDays(Number.isFinite(v) && v >= 0 ? v : 0);
                      }}
                      className="w-24"
                    />
                    <span className="text-sm">{t("recurrence.window_days")}</span>
                    {windowDays === 0 && (
                      <span className="text-xs text-muted-foreground">
                        {t("recurrence.window_zero_hint")}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Recurrence (recurring mode) ────────────────────────────────── */}
          {taskType === "recurring" && (
            <div className="space-y-3">
              <RecurrencePicker value={recurrence} onChange={setRecurrence} hideNone />
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  {t("add_task.starting")}
                </label>
                <DateShortcutPicker value={startDate} onChange={setStartDate} />
              </div>
            </div>
          )}

          {/* ── Actions ───────────────────────────────────────────────────── */}
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
