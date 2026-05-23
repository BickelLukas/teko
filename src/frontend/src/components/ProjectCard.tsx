import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatDistance } from "@/lib/locale";
import { useLocale } from "@/lib/locale";
import type { ProjectResponse } from "@teko/shared";

type ProjectCardProps = {
  project: ProjectResponse;
  assigneeName?: string;
};

export function ProjectCard({ project, assigneeName }: ProjectCardProps) {
  const { t } = useTranslation("common");
  const { locale } = useLocale();
  const navigate = useNavigate();
  const { totalLeaves, completedLeaves, percent } = project.progress;

  const pendingCount = totalLeaves - completedLeaves;
  const lastActivity = project.last_activity_at ? new Date(project.last_activity_at) : null;

  return (
    <button
      className="w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label={project.title}
      onClick={() => navigate(`/projects/${project.id}`)}
    >
      <Card className="transition-colors hover:bg-muted/40">
        <CardContent className="py-4">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{project.title}</p>
                {project.description && (
                  <p className="truncate text-xs text-muted-foreground">{project.description}</p>
                )}
              </div>
              {assigneeName && (
                <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {assigneeName}
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
              {totalLeaves === 0 && <span className="italic">{t("project_card.no_tasks")}</span>}
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
  );
}
