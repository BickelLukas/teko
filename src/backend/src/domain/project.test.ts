import { describe, it, expect } from "vitest";
import {
  isProject,
  computeProjectProgress,
  isProjectComplete,
  shouldAutoCompleteProject,
} from "./project.js";
import type { TaskForProject } from "./project.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function leaf(
  id: string,
  parentId: string | null,
  state: TaskForProject["state"] = "eligible",
  archived = false,
): TaskForProject {
  return {
    id,
    parent_id: parentId,
    state,
    archived_at: archived ? new Date() : null,
    auto_complete_when_children_done: true,
  };
}

function project(id: string, parentId: string | null, autoComplete = true): TaskForProject {
  return {
    id,
    parent_id: parentId,
    state: "eligible",
    archived_at: null,
    auto_complete_when_children_done: autoComplete,
  };
}

// ── isProject ─────────────────────────────────────────────────────────────────

describe("isProject", () => {
  it("returns false for zero children", () => {
    expect(isProject(0)).toBe(false);
  });

  it("returns true for one child", () => {
    expect(isProject(1)).toBe(true);
  });

  it("returns true for many children", () => {
    expect(isProject(5)).toBe(true);
  });
});

// ── computeProjectProgress ────────────────────────────────────────────────────

describe("computeProjectProgress", () => {
  it("empty project — no descendants", () => {
    const result = computeProjectProgress([]);
    expect(result).toEqual({ totalLeaves: 0, completedLeaves: 0, percent: 0 });
  });

  it("flat project: 3 leaves, none done", () => {
    const descendants = [leaf("t1", "p"), leaf("t2", "p"), leaf("t3", "p")];
    const result = computeProjectProgress(descendants);
    expect(result).toEqual({ totalLeaves: 3, completedLeaves: 0, percent: 0 });
  });

  it("flat project: 3 leaves, 1 done", () => {
    const descendants = [leaf("t1", "p", "done"), leaf("t2", "p"), leaf("t3", "p")];
    const result = computeProjectProgress(descendants);
    expect(result).toEqual({ totalLeaves: 3, completedLeaves: 1, percent: 33 });
  });

  it("flat project: all leaves done", () => {
    const descendants = [leaf("t1", "p", "done"), leaf("t2", "p", "done")];
    const result = computeProjectProgress(descendants);
    expect(result).toEqual({ totalLeaves: 2, completedLeaves: 2, percent: 100 });
  });

  it("archived leaf counts as completed", () => {
    const descendants = [leaf("t1", "p", "eligible", true), leaf("t2", "p")];
    const result = computeProjectProgress(descendants);
    expect(result.completedLeaves).toBe(1);
  });

  it("nested sub-project: sub-project itself is not a leaf", () => {
    // Project p → sub-project sp → leaf t1, leaf t2
    const descendants = [project("sp", "p"), leaf("t1", "sp", "done"), leaf("t2", "sp")];
    // sp has children so it's not a leaf; only t1 and t2 count
    const result = computeProjectProgress(descendants);
    expect(result).toEqual({ totalLeaves: 2, completedLeaves: 1, percent: 50 });
  });

  it("mixed: leaf + sub-project children", () => {
    // Project p → leaf t1 (done), sub-project sp → leaf t2, leaf t3 (done)
    const descendants = [
      leaf("t1", "p", "done"),
      project("sp", "p"),
      leaf("t2", "sp"),
      leaf("t3", "sp", "done"),
    ];
    // leaves: t1, t2, t3 (sp is not a leaf)
    const result = computeProjectProgress(descendants);
    expect(result).toEqual({ totalLeaves: 3, completedLeaves: 2, percent: 67 });
  });

  it("deeply nested: only real leaves count", () => {
    // p → sp1 → sp2 → leaf t1 (done), leaf t2
    const descendants = [
      project("sp1", "p"),
      project("sp2", "sp1"),
      leaf("t1", "sp2", "done"),
      leaf("t2", "sp2"),
    ];
    const result = computeProjectProgress(descendants);
    expect(result).toEqual({ totalLeaves: 2, completedLeaves: 1, percent: 50 });
  });

  it("percent rounds correctly at 1/3", () => {
    const descendants = [leaf("t1", "p", "done"), leaf("t2", "p"), leaf("t3", "p")];
    expect(computeProjectProgress(descendants).percent).toBe(33);
  });

  it("percent rounds correctly at 2/3", () => {
    const descendants = [leaf("t1", "p", "done"), leaf("t2", "p", "done"), leaf("t3", "p")];
    expect(computeProjectProgress(descendants).percent).toBe(67);
  });
});

// ── isProjectComplete ─────────────────────────────────────────────────────────

describe("isProjectComplete", () => {
  it("empty project is not complete", () => {
    expect(isProjectComplete([])).toBe(false);
  });

  it("some leaves pending → not complete", () => {
    const descendants = [leaf("t1", "p", "done"), leaf("t2", "p")];
    expect(isProjectComplete(descendants)).toBe(false);
  });

  it("all leaves done → complete", () => {
    const descendants = [leaf("t1", "p", "done"), leaf("t2", "p", "done")];
    expect(isProjectComplete(descendants)).toBe(true);
  });

  it("all leaves archived → complete", () => {
    const descendants = [leaf("t1", "p", "eligible", true), leaf("t2", "p", "eligible", true)];
    expect(isProjectComplete(descendants)).toBe(true);
  });

  it("mix of done and archived leaves → complete", () => {
    const descendants = [leaf("t1", "p", "done"), leaf("t2", "p", "eligible", true)];
    expect(isProjectComplete(descendants)).toBe(true);
  });

  it("nested: all leaves done → complete", () => {
    const descendants = [project("sp", "p"), leaf("t1", "sp", "done"), leaf("t2", "sp", "done")];
    expect(isProjectComplete(descendants)).toBe(true);
  });
});

// ── shouldAutoCompleteProject ─────────────────────────────────────────────────

describe("shouldAutoCompleteProject", () => {
  it("returns false when auto_complete is off", () => {
    const p = project("p", null, false);
    const descendants = [leaf("t1", "p", "done")];
    expect(shouldAutoCompleteProject(p, descendants)).toBe(false);
  });

  it("returns false when there are no direct children in descendants", () => {
    const p = project("p", null, true);
    expect(shouldAutoCompleteProject(p, [])).toBe(false);
  });

  it("returns false when some direct children are not done", () => {
    const p = project("p", null, true);
    const descendants = [leaf("t1", "p", "done"), leaf("t2", "p", "eligible")];
    expect(shouldAutoCompleteProject(p, descendants)).toBe(false);
  });

  it("returns true when all direct children are done", () => {
    const p = project("p", null, true);
    const descendants = [leaf("t1", "p", "done"), leaf("t2", "p", "done")];
    expect(shouldAutoCompleteProject(p, descendants)).toBe(true);
  });

  it("returns true when all direct children are archived", () => {
    const p = project("p", null, true);
    const descendants = [leaf("t1", "p", "eligible", true), leaf("t2", "p", "eligible", true)];
    expect(shouldAutoCompleteProject(p, descendants)).toBe(true);
  });

  it("only checks direct children, not grandchildren", () => {
    // Project p → sub-project sp (eligible), sp → leaf t1 (done)
    // sp is not done yet; p should NOT auto-complete
    const p = project("p", null, true);
    const sp = project("sp", "p");
    const descendants = [{ ...sp, state: "eligible" as const }, leaf("t1", "sp", "done")];
    expect(shouldAutoCompleteProject(p, descendants)).toBe(false);
  });

  it("returns true when direct child sub-project is done", () => {
    // Project p → sub-project sp (done)
    const p = project("p", null, true);
    const descendants = [{ ...project("sp", "p"), state: "done" as const }];
    expect(shouldAutoCompleteProject(p, descendants)).toBe(true);
  });
});
