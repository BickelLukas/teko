import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { ProjectResponse } from "@teko/shared";

type ProjectCardProps = {
  project: ProjectResponse;
  assigneeName?: string;
};

export function ProjectCard({ project, assigneeName }: ProjectCardProps) {
  const navigate = useNavigate();
  const { totalLeaves, completedLeaves, percent } = project.progress;

  const pendingCount = totalLeaves - completedLeaves;

  const lastActivity = project.last_activity_at ? new Date(project.last_activity_at) : null;

  return (
    <button className="w-full text-left" onClick={() => navigate(`/projects/${project.id}`)}>
      <Card className="transition-colors hover:bg-muted/40">
        <CardContent className="py-4">
          <div className="space-y-3">
            {/* Title row */}
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

            {/* Progress bar */}
            <div className="space-y-1">
              <Progress value={percent} />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {completedLeaves} / {totalLeaves} done
                </span>
                <span>{percent}%</span>
              </div>
            </div>

            {/* Footer stats */}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {pendingCount > 0 && <span>{pendingCount} pending</span>}
              {totalLeaves === 0 && <span className="italic">No tasks yet</span>}
              {lastActivity && (
                <span className="ml-auto">
                  Active {formatDistanceToNow(lastActivity, { addSuffix: true })}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}
