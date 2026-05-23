import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { IconPlus } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { createTask, fetchDevUsers, fetchMe, fetchProjects, isDevModeActive } from "@/lib/api";

const FormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
});
type FormValues = z.infer<typeof FormSchema>;

type AddTaskModalProps = {
  defaultParentId?: string | null;
  // Controlled mode — when provided, no trigger button is rendered
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function AddTaskModal({
  defaultParentId,
  open: controlledOpen,
  onOpenChange,
}: AddTaskModalProps = {}) {
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

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });

  const { data: devUsers = [] } = useQuery({
    queryKey: ["dev-users"],
    queryFn: fetchDevUsers,
    enabled: import.meta.env.DEV && isDevModeActive(),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", "all"],
    queryFn: () => fetchProjects("all"),
  });

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
            Add task
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((data) => createMutation.mutate(data))}
          className="mt-4 space-y-4"
        >
          <div>
            <Input
              placeholder="Task title"
              aria-label="Task title"
              autoFocus
              {...register("title")}
            />
            {errors.title && (
              <p className="mt-1 text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          <Input placeholder="Description (optional)" {...register("description")} />

          {/* Assignee — only show when dev users available */}
          {devUsers.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Assign to
              </label>
              <SelectRoot value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__me__">
                    Me ({me?.display_name ?? me?.name ?? "current user"})
                  </SelectItem>
                  <SelectItem value="__unassigned__">Anyone (unassigned)</SelectItem>
                  {devUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectRoot>
            </div>
          )}

          {/* Part of project — hidden when parent is set by context (controlled mode) */}
          {!isControlled && projects.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Part of project (optional)
              </label>
              <SelectRoot value={parentId} onValueChange={setParentId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectRoot>
            </div>
          )}

          {/* Recurrence — collapsed by default */}
          <div>
            <button
              type="button"
              className="mb-2 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={() => setShowRecurrence((v) => !v)}
            >
              {showRecurrence ? "Hide recurrence" : "+ Add recurrence"}
            </button>
            {showRecurrence && <RecurrencePicker value={recurrence} onChange={setRecurrence} />}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Adding…" : "Add task"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
