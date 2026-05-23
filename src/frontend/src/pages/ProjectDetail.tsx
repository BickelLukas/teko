import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

// ── Settings modal ────────────────────────────────────────────────────────────

function ProjectSettingsModal({ project, onDone }: { project: TaskResponse; onDone: () => void }) {
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
        <span className="text-sm">Auto-complete when all tasks are done</span>
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={updateMutation.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ProjectDetailPage() {
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
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!root) {
    return (
      <div className="mx-auto max-w-xl px-4 py-6">
        <p className="text-sm text-muted-foreground">Project not found.</p>
        <Link to="/projects" className="mt-2 inline-block text-sm text-primary underline">
          Back to projects
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-6">
      {/* Back nav */}
      <button
        onClick={() => navigate("/projects")}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <IconArrowLeft className="size-4" />
        Projects
      </button>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-xl font-semibold">{root.title}</h1>
          <div className="flex shrink-0 gap-1">
            <DialogRoot open={settingsOpen} onOpenChange={setSettingsOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label="Project settings">
                  <IconSettings className="size-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>Project settings</DialogTitle>
                </DialogHeader>
                <ProjectSettingsModal project={root} onDone={() => setSettingsOpen(false)} />
              </DialogContent>
            </DialogRoot>
          </div>
        </div>

        {root.description && <p className="text-sm text-muted-foreground">{root.description}</p>}

        {/* Progress */}
        {descendants.length > 0 && (
          <div className="space-y-1">
            <Progress value={progress.percent} className="h-3" />
            <p className="text-xs text-muted-foreground">
              {progress.completedLeaves} of {progress.totalLeaves} tasks done ({progress.percent}%)
            </p>
          </div>
        )}
      </div>

      {/* Task tree */}
      <div className="rounded-lg border border-border">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">Tasks</span>
          <Button size="sm" variant="ghost" onClick={() => handleAddChild(id!)}>
            <IconPlus className="mr-1 size-3" />
            Add task
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
