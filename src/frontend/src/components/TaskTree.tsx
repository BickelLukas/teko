import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { IconCheck, IconChevronDown, IconChevronRight, IconPlus } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { completeTask } from "@/lib/api";
import type { TaskResponse } from "@teko/shared";

type TreeNode = TaskResponse & { children: TreeNode[] };

export function buildTree(nodes: TaskResponse[], rootId: string): TreeNode[] {
  const byParent = new Map<string, TaskResponse[]>();
  for (const n of nodes) {
    const pid = n.parent_id ?? "__root__";
    const arr = byParent.get(pid) ?? [];
    arr.push(n);
    byParent.set(pid, arr);
  }

  function recurse(parentId: string): TreeNode[] {
    return (byParent.get(parentId) ?? []).map((n) => ({
      ...n,
      children: recurse(n.id),
    }));
  }

  return recurse(rootId);
}

type TaskTreeNodeProps = {
  node: TreeNode;
  depth: number;
  onAddChild: (parentId: string) => void;
};

function TaskTreeNodeRow({ node, depth, onAddChild }: TaskTreeNodeProps) {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isProject = node.child_count > 0;

  const completeMutation = useMutation({
    mutationFn: () => completeTask(node.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["task-tree"] }),
  });

  const isDone = node.state === "done";

  return (
    <li>
      <div
        className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex size-4 items-center justify-center rounded text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            aria-label={
              expanded
                ? t("task_tree.collapse", { title: node.title })
                : t("task_tree.expand", { title: node.title })
            }
            aria-expanded={expanded}
          >
            {expanded ? (
              <IconChevronDown className="size-3" />
            ) : (
              <IconChevronRight className="size-3" />
            )}
          </button>
        ) : (
          <span className="size-4" />
        )}

        {!isProject && (
          <button
            onClick={() => completeMutation.mutate()}
            disabled={isDone || completeMutation.isPending}
            className="flex size-4 shrink-0 items-center justify-center rounded-full border-2 border-border transition-colors hover:border-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-40"
            aria-label={t("task.mark_done_aria")}
          >
            {(isDone || completeMutation.isPending) && (
              <IconCheck className="size-2.5 text-primary" />
            )}
          </button>
        )}
        {isProject && <span className="size-4" />}

        <span
          className={[
            "flex-1 text-sm",
            isDone ? "text-muted-foreground line-through" : "",
            isProject ? "font-medium" : "",
          ].join(" ")}
        >
          {node.title}
        </span>

        {!isDone && !isProject && (
          <span
            className={[
              "shrink-0 text-xs",
              node.state === "overdue" ? "text-destructive" : "text-muted-foreground",
            ].join(" ")}
          >
            {node.state === "overdue" ? t("task_tree.overdue_badge") : ""}
          </span>
        )}

        <button
          onClick={() => onAddChild(node.id)}
          className="hidden size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 group-hover:flex"
          aria-label={t("task.add_subtask_aria")}
        >
          <IconPlus className="size-3" />
        </button>
      </div>

      {hasChildren && expanded && (
        <ul>
          {node.children.map((child) => (
            <TaskTreeNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              onAddChild={onAddChild}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

type TaskTreeProps = {
  nodes: TaskResponse[];
  rootId: string;
  onAddChild: (parentId: string) => void;
};

export function TaskTree({ nodes, rootId, onAddChild }: TaskTreeProps) {
  const { t } = useTranslation("common");
  const children = buildTree(nodes, rootId);

  if (children.length === 0) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-muted-foreground">{t("task_tree.no_tasks")}</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => onAddChild(rootId)}>
          <IconPlus className="mr-1 size-4" />
          {t("task_tree.add_first")}
        </Button>
      </div>
    );
  }

  return (
    <ul className="space-y-0.5">
      {children.map((node) => (
        <TaskTreeNodeRow key={node.id} node={node} depth={0} onAddChild={onAddChild} />
      ))}
    </ul>
  );
}
