import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { IconArrowLeft, IconPlus, IconSettings } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  DialogRoot,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AddTaskModal } from "@/components/AddTaskModal";
import { TaskTree } from "@/components/TaskTree";
import { fetchTaskTree, updateTask } from "@/lib/api";
import { computeProjectProgress } from "@/lib/projectUtils";
import type { TaskResponse } from "@teko/shared";

function ProjectSettingsModal({ project, onDone }: { project: TaskResponse; onDone: () => void }) {
  const { t } = useTranslation("pages");
  const queryClient = useQueryClient();
  const [autoComplete, setAutoComplete] = useState(project.auto_complete_when_children_done);

  const updateMutation = useMutation({
    mutationFn: () => updateTask(project.id, { auto_complete_when_children_done: autoComplete }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["task-tree", project.id] });
      onDone();
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        updateMutation.mutate();
      }}
      className="mt-4 space-y-4"
    >
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={autoComplete}
          onChange={(e) => setAutoComplete(e.target.checked)}
          className="size-4"
        />
        <span className="text-sm">{t("project_detail.auto_complete_label")}</span>
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          {t("common:actions.cancel", { ns: "common" })}
        </Button>
        <Button type="submit" size="sm" disabled={updateMutation.isPending}>
          {t("common:actions.save", { ns: "common" })}
        </Button>
      </div>
    </form>
  );
}

export function ProjectDetailPage() {
  const { t } = useTranslation(["pages", "common"]);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [addChildParentId, setAddChildParentId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);

  const { data: nodes = [], isLoading } = useQuery({
    queryKey: ["task-tree", id],
    queryFn: () => fetchTaskTree(id!),
    enabled: !!id,
  });

  const root = nodes.find((n) => n.id === id);
  const descendants = nodes.filter((n) => n.id !== id);

  const progress = computeProjectProgress(
    descendants.map((d) => ({
      id: d.id,
      parent_id: d.parent_id,
      state: d.state,
      archived_at: d.archived_at,
      auto_complete_when_children_done: d.auto_complete_when_children_done,
    })),
  );

  function handleAddChild(parentId: string) {
    setAddChildParentId(parentId);
    setAddModalOpen(true);
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-xl px-4 py-6">
        <p className="text-sm text-muted-foreground">{t("common:loading")}</p>
      </div>
    );
  }

  if (!root) {
    return (
      <div className="mx-auto max-w-xl px-4 py-6">
        <p className="text-sm text-muted-foreground">{t("pages:project_detail.not_found")}</p>
        <Link to="/projects" className="mt-2 inline-block text-sm text-primary underline">
          {t("pages:project_detail.back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-6">
      <button
        onClick={() => navigate("/projects")}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <IconArrowLeft className="size-4" />
        {t("pages:project_detail.back")}
      </button>

      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-xl font-semibold">{root.title}</h1>
          <div className="flex shrink-0 gap-1">
            <DialogRoot open={settingsOpen} onOpenChange={setSettingsOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("pages:project_detail.settings_title")}
                >
                  <IconSettings className="size-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>{t("pages:project_detail.settings_title")}</DialogTitle>
                </DialogHeader>
                <ProjectSettingsModal project={root} onDone={() => setSettingsOpen(false)} />
              </DialogContent>
            </DialogRoot>
          </div>
        </div>

        {root.description && <p className="text-sm text-muted-foreground">{root.description}</p>}

        {descendants.length > 0 && (
          <div className="space-y-1">
            <Progress value={progress.percent} className="h-3" />
            <p className="text-xs text-muted-foreground">
              {t("pages:project_detail.tasks_progress", {
                completed: progress.completedLeaves,
                total: progress.totalLeaves,
                percent: progress.percent,
              })}
            </p>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">
            {t("pages:project_detail.tasks_label")}
          </span>
          <Button size="sm" variant="ghost" onClick={() => handleAddChild(id!)}>
            <IconPlus className="mr-1 size-3" />
            {t("pages:project_detail.add_task")}
          </Button>
        </div>
        <div className="p-2">
          <TaskTree
            nodes={nodes.filter((n) => n.id !== id)}
            rootId={id!}
            onAddChild={handleAddChild}
          />
        </div>
      </div>

      <AddTaskModal
        open={addModalOpen}
        onOpenChange={(open) => {
          setAddModalOpen(open);
          if (!open) setAddChildParentId(null);
        }}
        defaultParentId={addChildParentId}
      />
    </div>
  );
}
