import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
        {/* Expand/collapse toggle for sub-projects */}
        {hasChildren ? (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex size-4 items-center justify-center text-muted-foreground"
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

        {/* Complete button */}
        {!isProject && (
          <button
            onClick={() => completeMutation.mutate()}
            disabled={isDone || completeMutation.isPending}
            className="flex size-4 shrink-0 items-center justify-center rounded-full border-2 border-border transition-colors hover:border-primary hover:bg-primary/10 disabled:opacity-40"
            aria-label="Mark done"
          >
            {(isDone || completeMutation.isPending) && (
              <IconCheck className="size-2.5 text-primary" />
            )}
          </button>
        )}
        {isProject && <span className="size-4" />}

        {/* Task title */}
        <span
          className={[
            "flex-1 text-sm",
            isDone ? "text-muted-foreground line-through" : "",
            isProject ? "font-medium" : "",
          ].join(" ")}
        >
          {node.title}
        </span>

        {/* State badge */}
        {!isDone && !isProject && (
          <span
            className={[
              "shrink-0 text-xs",
              node.state === "overdue" ? "text-destructive" : "text-muted-foreground",
            ].join(" ")}
          >
            {node.state === "overdue" ? "Overdue" : node.state === "eligible" ? "" : node.state}
          </span>
        )}

        {/* Add child button */}
        <button
          onClick={() => onAddChild(node.id)}
          className="hidden size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground group-hover:flex"
          aria-label="Add sub-task"
        >
          <IconPlus className="size-3" />
        </button>
      </div>

      {/* Children */}
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
  const children = buildTree(nodes, rootId);

  if (children.length === 0) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-muted-foreground">No tasks yet.</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => onAddChild(rootId)}>
          <IconPlus className="mr-1 size-4" />
          Add first task
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
