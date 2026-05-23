// ── Shared project progress logic ─────────────────────────────────────────────
// Same shape used on backend and frontend. Single source of truth so a leaf
// counts the same way in API responses and in optimistic UI updates.

import type { ProjectProgress } from "./schemas.js";

export type TaskForProject = {
  id: string;
  parent_id: string | null;
  state: "not_yet" | "eligible" | "planned" | "overdue" | "done";
  archived_at: Date | null;
  auto_complete_when_children_done: boolean;
};

export function isProject(childCount: number): boolean {
  return childCount > 0;
}

/**
 * Computes progress by counting only leaf tasks — tasks with no children of
 * their own within the given descendants list.
 * A sub-project is not counted as one item; its leaves count individually.
 */
export function computeProjectProgress(descendants: TaskForProject[]): ProjectProgress {
  const parentIdSet = new Set(
    descendants.filter((d) => d.parent_id !== null).map((d) => d.parent_id as string),
  );

  const leaves = descendants.filter((d) => !parentIdSet.has(d.id));
  const completedLeaves = leaves.filter((d) => d.state === "done" || d.archived_at !== null).length;

  return {
    totalLeaves: leaves.length,
    completedLeaves,
    percent: leaves.length === 0 ? 0 : Math.round((completedLeaves / leaves.length) * 100),
  };
}

/**
 * Returns true when every leaf descendant is completed or archived.
 * An empty project (no descendants) is not considered complete.
 */
export function isProjectComplete(descendants: TaskForProject[]): boolean {
  const { totalLeaves, completedLeaves } = computeProjectProgress(descendants);
  return totalLeaves > 0 && completedLeaves === totalLeaves;
}

/**
 * Returns true if the project should auto-complete based on its setting and
 * the state of its direct children.
 */
export function shouldAutoCompleteProject(
  project: { id: string; auto_complete_when_children_done: boolean },
  descendants: TaskForProject[],
): boolean {
  if (!project.auto_complete_when_children_done) return false;

  const directChildren = descendants.filter((d) => d.parent_id === project.id);
  if (directChildren.length === 0) return false;

  return directChildren.every((d) => d.state === "done" || d.archived_at !== null);
}
