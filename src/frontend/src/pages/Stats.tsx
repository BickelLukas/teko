import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { fetchMe, fetchMeStats, fetchHouseholdStats } from "@/lib/api";
import type { MeStats, HouseholdStats } from "@teko/shared";

// ── Mini charts ───────────────────────────────────────────────────────────────

const DAY_LABELS_MON = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_LABELS_SUN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function WeekBars({ data, weekStartsOnMonday }: { data: number[]; weekStartsOnMonday: boolean }) {
  const labels = weekStartsOnMonday ? DAY_LABELS_MON : DAY_LABELS_SUN;
  const today = new Date().getDay(); // 0=Sun
  // Convert to weekStart-relative index
  const todayIdx = weekStartsOnMonday ? (today === 0 ? 6 : today - 1) : today;
  const chartData = data.map((v, i) => ({ day: labels[i]!, value: v, isToday: i === todayIdx }));
  return (
    <ResponsiveContainer width="100%" height={60}>
      <BarChart data={chartData} margin={{ top: 4, right: 0, left: -32, bottom: 0 }}>
        <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis hide allowDecimals={false} />
        <Tooltip
          cursor={{ fill: "transparent" }}
          contentStyle={{ fontSize: 11, padding: "2px 8px" }}
          formatter={(v) => [v ?? 0, "completed"]}
        />
        <Bar dataKey="value" radius={[3, 3, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.isToday ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / 0.3)"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function HistoryBars({ data }: { data: number[] }) {
  const chartData = data.map((v, i) => ({ week: `W${i + 1}`, value: v }));
  return (
    <ResponsiveContainer width="100%" height={52}>
      <BarChart data={chartData} margin={{ top: 4, right: 0, left: -32, bottom: 0 }}>
        <XAxis dataKey="week" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
        <YAxis hide allowDecimals={false} />
        <Tooltip
          cursor={{ fill: "transparent" }}
          contentStyle={{ fontSize: 11, padding: "2px 8px" }}
          formatter={(v) => [v ?? 0, "points"]}
        />
        <Bar dataKey="value" fill="hsl(var(--muted-foreground) / 0.3)" radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Sub-sections ──────────────────────────────────────────────────────────────

function PersonalSection({ stats, weekStartsOnMonday }: { stats: MeStats; weekStartsOnMonday: boolean }) {

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">You</h1>

      {/* This week */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold tabular-nums">{stats.week.points}</span>
            <span className="text-sm text-muted-foreground">
              pts · {stats.week.completions} completed this week
            </span>
          </div>
          <div className="mt-3">
            <WeekBars
              data={stats.week.completions_by_day}
              weekStartsOnMonday={weekStartsOnMonday}
            />
          </div>
        </CardContent>
      </Card>

      {/* Active streaks */}
      {stats.streaks.active.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Active streaks
            </p>
            <ul className="divide-y divide-border">
              {stats.streaks.active.map((s) => (
                <li key={s.task_id} className="flex items-center justify-between py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.task_title}</p>
                    <p className="text-xs text-muted-foreground">
                      longest ever: {s.longest_length} days
                    </p>
                  </div>
                  <div className="ml-4 shrink-0 text-right">
                    <span
                      className={[
                        "text-sm font-semibold",
                        s.at_risk ? "text-amber-500" : "text-foreground",
                      ].join(" ")}
                    >
                      🔥 {s.current_length} days
                    </span>
                    {s.at_risk && <p className="text-xs text-amber-500/80">at risk</p>}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Personal best */}
      {stats.streaks.longest_ever && stats.streaks.longest_ever.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Personal best
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              🔥 {stats.streaks.longest_ever.length} days
            </p>
            {stats.streaks.longest_ever.task_title && (
              <p className="text-xs text-muted-foreground">
                on {stats.streaks.longest_ever.task_title}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* 12-week history */}
      <Card>
        <CardContent className="pt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Last 12 weeks
          </p>
          <HistoryBars data={stats.history.last_12_weeks} />
        </CardContent>
      </Card>
    </section>
  );
}

function HouseholdSection({ stats, weekStartsOnMonday }: { stats: HouseholdStats; weekStartsOnMonday: boolean }) {
  const [showContributions, setShowContributions] = useState(false);

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-muted-foreground">Household</h2>

      {/* This week */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums">{stats.week.points}</span>
            <span className="text-sm text-muted-foreground">pts this week</span>
          </div>
          <div className="mt-3">
            <WeekBars
              data={stats.week.completions_by_day}
              weekStartsOnMonday={weekStartsOnMonday}
            />
          </div>
        </CardContent>
      </Card>

      {/* Household streak */}
      {stats.longest_household_streak > 0 && (
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Household streak
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {stats.longest_household_streak}{" "}
              <span className="text-base font-normal text-muted-foreground">
                consecutive week{stats.longest_household_streak !== 1 ? "s" : ""}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">with at least one task completed</p>
          </CardContent>
        </Card>
      )}

      {/* 12-week history */}
      <Card>
        <CardContent className="pt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Last 12 weeks
          </p>
          <HistoryBars data={stats.history.last_12_weeks} />
        </CardContent>
      </Card>

      {/* Contributions — collapsed by default */}
      <div>
        <button
          onClick={() => setShowContributions((v) => !v)}
          className="flex w-full items-center justify-between rounded-md border border-border px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <span>Contributions this week</span>
          <span className="text-xs">{showContributions ? "▲ Hide" : "▼ Show"}</span>
        </button>

        {showContributions && (
          <Card className="mt-2">
            <CardContent className="pt-5">
              <p className="mb-3 text-xs text-muted-foreground/70">
                Contributions, not rankings — alphabetical order.
              </p>
              <ul className="space-y-3">
                {stats.week.contributions.map((c) => {
                  const maxPoints = Math.max(1, ...stats.week.contributions.map((x) => x.points));
                  const pct = Math.round((c.points / maxPoints) * 100);
                  return (
                    <li key={c.user_id}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate font-medium">{c.name}</span>
                        <span className="ml-2 shrink-0 tabular-nums text-muted-foreground">
                          {c.points} pts
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary/50 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function StatsPage() {
  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
  });

  const { data: meStats, isLoading: statsLoading } = useQuery({
    queryKey: ["stats", "me"],
    queryFn: fetchMeStats,
  });

  const { data: householdStats, isLoading: householdLoading } = useQuery({
    queryKey: ["stats", "household"],
    queryFn: fetchHouseholdStats,
  });

  if (meLoading || statsLoading || householdLoading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }

  const weekStartsOnMonday = (me?.week_start_day ?? 1) === 1;

  return (
    <div className="mx-auto max-w-xl space-y-10 px-4 py-6">
      {meStats && <PersonalSection stats={meStats} weekStartsOnMonday={weekStartsOnMonday} />}
      <div className="border-t border-border" />
      {householdStats && <HouseholdSection stats={householdStats} weekStartsOnMonday={weekStartsOnMonday} />}
    </div>
  );
}
