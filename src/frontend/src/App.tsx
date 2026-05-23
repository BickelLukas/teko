import { useQuery } from "@tanstack/react-query";
import type { HealthResponse } from "@teko/shared";
import { Button } from "./components/ui/button";

async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch("/api/health");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await (res.json() as Promise<HealthResponse>);
}

export function App() {
  const { data, error, isPending, refetch } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
  });

  return (
    <main className="min-h-screen bg-background text-foreground p-8">
      {isPending && <p className="text-muted-foreground">Checking API...</p>}
      {error && <p className="text-destructive">{String(error)}</p>}
      {data && <pre className="font-mono text-sm">{JSON.stringify(data, null, 2)}</pre>}

      <Button onClick={() => refetch()}>Reload</Button>
    </main>
  );
}
