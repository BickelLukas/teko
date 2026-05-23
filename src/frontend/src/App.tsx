import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Card, CardContent } from "./components/ui/card";
import type { TaskListResponse, TaskResponse, CreateTaskBody } from "@teko/shared";
import { CreateTaskBodySchema } from "@teko/shared";

async function fetchTasks(): Promise<TaskListResponse> {
  const res = await fetch("/api/tasks");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<TaskListResponse>;
}

async function createTask(body: CreateTaskBody): Promise<TaskResponse> {
  const res = await fetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<TaskResponse>;
}

async function completeTask(id: string): Promise<void> {
  const res = await fetch(`/api/tasks/${id}/complete`, { method: "POST" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export function App() {
  const queryClient = useQueryClient();

  const {
    data: tasks = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["tasks"],
    queryFn: fetchTasks,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateTaskBody>({
    resolver: zodResolver(CreateTaskBodySchema),
  });

  const createMutation = useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      reset();
    },
  });

  const completeMutation = useMutation({
    mutationFn: completeTask,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      const prev = queryClient.getQueryData<TaskListResponse>(["tasks"]);
      queryClient.setQueryData<TaskListResponse>(
        ["tasks"],
        (old) => old?.filter((t) => t.id !== id) ?? [],
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(["tasks"], ctx.prev);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  return (
    <main className="min-h-screen bg-background text-foreground p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Tasks</h1>

      <form
        onSubmit={handleSubmit((data) => createMutation.mutate(data))}
        className="flex gap-2 mb-8"
      >
        <div className="flex-1">
          <Input placeholder="Add a task…" aria-label="Task title" {...register("title")} />
          {errors.title && <p className="mt-1 text-xs text-destructive">{errors.title.message}</p>}
        </div>
        <Button type="submit" disabled={createMutation.isPending}>
          Add
        </Button>
      </form>

      {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
      {error && <p className="text-destructive text-sm">{String(error)}</p>}

      {tasks.length === 0 && !isLoading && !error && (
        <p className="text-muted-foreground text-sm">No open tasks.</p>
      )}

      <ul className="space-y-2">
        {tasks.map((task) => (
          <li key={task.id}>
            <Card>
              <CardContent className="flex items-start justify-between gap-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{task.title}</p>
                  {task.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {task.description}
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => completeMutation.mutate(task.id)}
                  disabled={completeMutation.isPending}
                >
                  Done
                </Button>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </main>
  );
}
