import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { IconDots, IconPencil, IconArchive } from "@tabler/icons-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenuRoot,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { formatDistance } from "@/lib/locale";
import { useLocale } from "@/lib/locale";
import { archiveTask } from "@/lib/api";
import type { ProjectResponse } from "@teko/shared";
import { EditTaskModal } from "@/components/EditTaskModal";
import { ArchiveConfirmDialog } from "@/components/ArchiveConfirmDialog";

type ProjectCardProps = {
  project: ProjectResponse;
};

export function ProjectCard({ project }: ProjectCardProps) {
  const { t } = useTranslation("common");
  const { locale } = useLocale();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const { totalLeaves, completedLeaves, percent } = project.progress;

  const archiveMutation = useMutation({
    mutationFn: () => archiveTask(project.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      void queryClient.invalidateQueries({ queryKey: ["task-tree"] });
      setArchiveOpen(false);
    },
  });

  const pendingCount = totalLeaves - completedLeaves;
  const lastActivity = project.last_activity_at ? new Date(project.last_activity_at) : null;

  return (
    <>
      <div className="relative w-full">
        <button
          className="w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={project.title}
          onClick={() => navigate(`/projects/${project.id}`)}
        >
          <Card className="transition-colors hover:bg-muted/40">
            <CardContent className="py-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 pr-8">
                    <p className="truncate font-medium">{project.title}</p>
                    {project.description && (
                      <p className="truncate text-xs text-muted-foreground">
                        {project.description}
                      </p>
                    )}
                  </div>
                  {project.assignee_name && (
                    <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {project.assignee_name}
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  <Progress value={percent} />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {t("project_card.done_progress", {
                        completed: completedLeaves,
                        total: totalLeaves,
                      })}
                    </span>
                    <span>{percent}%</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {pendingCount > 0 && (
                    <span>{t("project_card.pending_one", { count: pendingCount })}</span>
                  )}
                  {totalLeaves === 0 && (
                    <span className="italic">{t("project_card.no_tasks")}</span>
                  )}
                  {lastActivity && (
                    <span className="ml-auto">
                      {t("project_card.active", {
                        time: formatDistance(lastActivity, locale, { addSuffix: true }),
                      })}
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </button>

        <div className="absolute right-3 top-3">
          <DropdownMenuRoot>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground"
                aria-label={t("task.actions_aria")}
                onClick={(e) => e.stopPropagation()}
              >
                <IconDots />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <IconPencil className="mr-2 size-4" />
                {t("actions.edit")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setArchiveOpen(true)}
              >
                <IconArchive className="mr-2 size-4" />
                {t("actions.archive")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuRoot>
        </div>
      </div>

      <EditTaskModal task={project} open={editOpen} onOpenChange={setEditOpen} />
      <ArchiveConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={project.title}
        hasChildren={project.child_count > 0}
        isPending={archiveMutation.isPending}
        onConfirm={() => archiveMutation.mutate()}
      />
    </>
  );
}
