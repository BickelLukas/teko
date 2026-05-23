type NodeForProgress = {
  id: string;
  parent_id: string | null;
  state: string;
  archived_at: Date | null;
  auto_complete_when_children_done: boolean;
};

export type ProjectProgress = {
  totalLeaves: number;
  completedLeaves: number;
  percent: number;
};

export function computeProjectProgress(descendants: NodeForProgress[]): ProjectProgress {
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
