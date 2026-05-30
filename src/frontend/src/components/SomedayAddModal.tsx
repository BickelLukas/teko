import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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
import { createTask, fetchMe, fetchUsers } from "@/lib/api";

function buildFormSchema(titleRequired: string) {
  return z.object({
    title: z.string().min(1, titleRequired),
    description: z.string().optional(),
  });
}
type FormValues = z.infer<ReturnType<typeof buildFormSchema>>;

/**
 * Minimal add form for Someday items.
 * No date, no recurrence — those fields are intentionally absent.
 */
export function SomedayAddModal() {
  const { t } = useTranslation(["common", "pages"]);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState<string>("__unassigned__");

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: fetchUsers });

  const FormSchema = buildFormSchema(t("common:form.title_required"));
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(FormSchema) });

  function resetForm() {
    reset();
    setAssigneeId("__unassigned__");
  }

  const createMutation = useMutation({
    mutationFn: (data: FormValues) => {
      const resolvedAssignee = assigneeId === "__unassigned__" ? null : assigneeId;
      return createTask({
        title: data.title,
        description: data.description,
        assignee_id: resolvedAssignee,
        // No recurrence, no start_date → creates a Someday item
      });
    },
    onSuccess: () => {
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
      <DialogTrigger asChild>
        <Button size="sm">
          <IconPlus className="mr-1 size-4" />
          {t("pages:someday.add_button")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("pages:someday.add_title")}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((data) => createMutation.mutate(data))}
          className="mt-4 space-y-4"
        >
          <div>
            <Input
              placeholder={t("common:add_task.title_placeholder")}
              aria-label={t("common:add_task.title_placeholder")}
              autoFocus
              {...register("title")}
            />
            {errors.title && (
              <p className="mt-1 text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          <Input
            placeholder={t("common:add_task.description_placeholder")}
            {...register("description")}
          />

          {users.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t("common:assignee.assign_to")}
              </label>
              <SelectRoot value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned__">{t("common:assignee.anyone")}</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.id === me?.id
                        ? t("common:assignee.me", { name: u.display_name ?? u.name })
                        : (u.display_name ?? u.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </SelectRoot>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {t("common:actions.cancel")}
            </Button>
            <Button type="submit" size="sm" disabled={createMutation.isPending}>
              {createMutation.isPending
                ? t("common:actions.adding")
                : t("pages:someday.add_button")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}
