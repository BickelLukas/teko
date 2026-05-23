import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IconPlus } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProjectCard } from "@/components/ProjectCard";
import {
  DialogRoot,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchProjects, createTask } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { parseEnum } from "@/lib/utils";
import type { ProjectResponse } from "@teko/shared";

const SORT_KEYS = ["activity", "alpha", "progress_asc", "progress_desc"] as const;
type SortKey = (typeof SORT_KEYS)[number];

function sortProjects(projects: ProjectResponse[], key: SortKey): ProjectResponse[] {
  return [...projects].sort((a, b) => {
    switch (key) {
      case "activity": {
        const aTime = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
        const bTime = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
        return bTime - aTime;
      }
      case "alpha":
        return a.title.localeCompare(b.title);
      case "progress_asc":
        return a.progress.percent - b.progress.percent;
      case "progress_desc":
        return b.progress.percent - a.progress.percent;
    }
  });
}

function NewProjectModal() {
  const { t } = useTranslation("pages");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [firstTask, setFirstTask] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const project = await createTask({ title, assignee_id: undefined });
      if (firstTask.trim()) {
        await createTask({ title: firstTask.trim(), parent_id: project.id });
      }
      return project;
    },
    onSuccess: async (project) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["tasks"] }),
      ]);
      setOpen(false);
      setTitle("");
      setFirstTask("");
      navigate(`/projects/${project.id}`);
    },
  });

  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <IconPlus className="mr-1 size-4" />
          {t("projects.new_project")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("projects.new_project_title")}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) createMutation.mutate();
          }}
          className="mt-4 space-y-4"
        >
          <div>
            <Input
              placeholder={t("projects.project_name_placeholder")}
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              {t("projects.first_task_label")}
            </label>
            <Input
              placeholder={t("projects.first_task_placeholder")}
              value={firstTask}
              onChange={(e) => setFirstTask(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {t("common:actions.cancel", { ns: "common" })}
            </Button>
            <Button type="submit" size="sm" disabled={!title.trim() || createMutation.isPending}>
              {createMutation.isPending
                ? t("common:actions.creating", { ns: "common" })
                : t("common:actions.create_project", { ns: "common" })}
            </Button>
          </div>
        </form>
      </DialogContent>
    </DialogRoot>
  );
}

export function ProjectsPage() {
  const { t } = useTranslation(["pages", "common"]);
  const [sort, setSort] = useState<SortKey>("activity");

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects", "all"],
    queryFn: () => fetchProjects("all"),
  });

  const sorted = sortProjects(projects, sort);
  const active = sorted.filter((p) => p.state !== "done");
  const completed = sorted.filter((p) => p.state === "done");

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("pages:projects.title")}</h1>
        <div className="flex items-center gap-2">
          <select
            className="rounded border border-input bg-background px-2 py-1 text-xs text-foreground"
            value={sort}
            onChange={(e) => setSort(parseEnum(e.target.value, SORT_KEYS, "activity"))}
          >
            <option value="activity">{t("pages:projects.sort.activity")}</option>
            <option value="alpha">{t("pages:projects.sort.alpha")}</option>
            <option value="progress_desc">{t("pages:projects.sort.progress_desc")}</option>
            <option value="progress_asc">{t("pages:projects.sort.progress_asc")}</option>
          </select>
          <NewProjectModal />
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && projects.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-base font-medium">{t("pages:projects.no_projects_title")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("pages:projects.no_projects_description")}
          </p>
          <div className="mt-4">
            <NewProjectModal />
          </div>
        </div>
      )}

      {active.length > 0 && (
        <section className="space-y-2">
          {completed.length > 0 && (
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("pages:projects.sections.active")}
            </h2>
          )}
          {active.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </section>
      )}

      {completed.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("pages:projects.sections.completed")}
          </h2>
          {completed.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </section>
      )}
    </div>
  );
}
