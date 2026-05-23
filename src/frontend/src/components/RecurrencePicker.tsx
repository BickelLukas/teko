import { useState, useEffect } from "react";
import { RRule } from "rrule";
import { Input } from "./ui/input";
import { Button } from "./ui/button";

export type RecurrenceValue = {
  rule: string | null;
  mode: "fixed" | "after_completion";
  windowDays: number | null;
};

type Props = {
  value: RecurrenceValue;
  onChange: (v: RecurrenceValue) => void;
};

type Preset =
  | "none"
  | "daily"
  | "every-n-days"
  | "weekly"
  | "monthly-date"
  | "every-n-months"
  | "yearly"
  | "custom";

const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
const WEEKDAY_LABELS: Record<string, string> = {
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
  SU: "Sun",
};

function detectPreset(rule: string | null): Preset {
  if (!rule) return "none";
  try {
    const r = RRule.fromString(rule);
    const { freq, interval = 1, byweekday, bymonthday } = r.options;
    if (freq === RRule.DAILY && interval === 1) return "daily";
    if (freq === RRule.DAILY && interval > 1) return "every-n-days";
    if (freq === RRule.WEEKLY) return "weekly";
    if (freq === RRule.MONTHLY && bymonthday?.length && !byweekday?.length) return "monthly-date";
    if (freq === RRule.MONTHLY && interval > 1) return "every-n-months";
    if (freq === RRule.YEARLY) return "yearly";
    return "custom";
  } catch {
    return "custom";
  }
}

function buildRule(
  preset: Preset,
  nDays: number,
  nMonths: number,
  weekdays: string[],
  monthDay: number,
  rawRule: string,
): string | null {
  switch (preset) {
    case "none":
      return null;
    case "daily":
      return "RRULE:FREQ=DAILY";
    case "every-n-days":
      return `RRULE:FREQ=DAILY;INTERVAL=${nDays}`;
    case "weekly": {
      const days = weekdays.length ? weekdays.join(",") : "MO";
      return `RRULE:FREQ=WEEKLY;BYDAY=${days}`;
    }
    case "monthly-date":
      return `RRULE:FREQ=MONTHLY;BYMONTHDAY=${monthDay}`;
    case "every-n-months":
      return `RRULE:FREQ=MONTHLY;INTERVAL=${nMonths}`;
    case "yearly":
      return "RRULE:FREQ=YEARLY";
    case "custom":
      return rawRule || null;
  }
}

function humanDesc(rule: string | null, mode: "fixed" | "after_completion"): string | null {
  if (!rule) return null;
  try {
    const r = RRule.fromString(rule);
    if (mode === "after_completion") {
      const freq = r.options.freq;
      const interval = r.options.interval ?? 1;
      const unit =
        freq === RRule.DAILY
          ? interval === 1
            ? "day"
            : `${interval} days`
          : freq === RRule.WEEKLY
            ? interval === 1
              ? "week"
              : `${interval} weeks`
            : freq === RRule.MONTHLY
              ? interval === 1
                ? "month"
                : `${interval} months`
              : freq === RRule.YEARLY
                ? interval === 1
                  ? "year"
                  : `${interval} years`
                : `${interval} day${interval === 1 ? "" : "s"}`;
      return `Every ${unit} after last completion`;
    }
    return r.toText();
  } catch {
    return null;
  }
}

function validateRaw(raw: string): string | null {
  if (!raw) return null;
  try {
    RRule.fromString(raw);
    return null;
  } catch (e) {
    return String(e);
  }
}

export function RecurrencePicker({ value, onChange }: Props) {
  const [preset, setPreset] = useState<Preset>(() => detectPreset(value.rule));
  const [mode, setMode] = useState<"fixed" | "after_completion">(value.mode);
  const [nDays, setNDays] = useState(7);
  const [nMonths, setNMonths] = useState(3);
  const [weekdays, setWeekdays] = useState<string[]>(["MO"]);
  const [monthDay, setMonthDay] = useState(1);
  const [rawRule, setRawRule] = useState(value.rule ?? "");
  const [rawError, setRawError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [windowDays, setWindowDays] = useState<number>(value.windowDays ?? 0);

  // Sync outward whenever inputs change
  useEffect(() => {
    const rule = buildRule(preset, nDays, nMonths, weekdays, monthDay, rawRule);
    if (preset === "custom") {
      const err = rule ? validateRaw(rule) : null;
      setRawError(err);
      if (err) return;
    }
    onChange({ rule, mode, windowDays: preset === "none" ? null : windowDays });
  }, [preset, mode, nDays, nMonths, weekdays, monthDay, rawRule, windowDays]);

  const rule = buildRule(preset, nDays, nMonths, weekdays, monthDay, rawRule);
  const desc = rule ? humanDesc(rule, mode) : null;

  function toggleWeekday(day: string) {
    setWeekdays((prev) =>
      prev.includes(day)
        ? prev.length > 1
          ? prev.filter((d) => d !== day)
          : prev
        : [...prev, day],
    );
  }

  return (
    <div className="space-y-3">
      {/* Tier 1: Preset selector */}
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Recurrence</label>
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
          value={preset}
          onChange={(e) => setPreset(e.target.value as Preset)}
        >
          <option value="none">None</option>
          <option value="daily">Daily</option>
          <option value="every-n-days">Every N days</option>
          <option value="weekly">Weekly on specific days</option>
          <option value="monthly-date">Monthly on date</option>
          <option value="every-n-months">Every N months</option>
          <option value="yearly">Yearly</option>
          <option value="custom">Custom (RRULE)</option>
        </select>
      </div>

      {/* Preset-specific inputs */}
      {preset === "every-n-days" && (
        <div className="flex items-center gap-2">
          <span className="text-sm">Every</span>
          <Input
            type="number"
            min={2}
            max={365}
            value={nDays}
            onChange={(e) => setNDays(Math.max(2, parseInt(e.target.value) || 2))}
            className="w-20"
          />
          <span className="text-sm">days</span>
        </div>
      )}

      {preset === "weekly" && (
        <div className="flex flex-wrap gap-1">
          {WEEKDAYS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleWeekday(d)}
              className={`rounded px-2 py-1 text-xs font-medium border transition-colors ${
                weekdays.includes(d)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-input text-foreground"
              }`}
            >
              {WEEKDAY_LABELS[d]}
            </button>
          ))}
        </div>
      )}

      {preset === "monthly-date" && (
        <div className="flex items-center gap-2">
          <span className="text-sm">On the</span>
          <Input
            type="number"
            min={1}
            max={31}
            value={monthDay}
            onChange={(e) => setMonthDay(Math.min(31, Math.max(1, parseInt(e.target.value) || 1)))}
            className="w-20"
          />
          <span className="text-sm">of each month</span>
        </div>
      )}

      {preset === "every-n-months" && (
        <div className="flex items-center gap-2">
          <span className="text-sm">Every</span>
          <Input
            type="number"
            min={2}
            max={24}
            value={nMonths}
            onChange={(e) => setNMonths(Math.max(2, parseInt(e.target.value) || 2))}
            className="w-20"
          />
          <span className="text-sm">months</span>
        </div>
      )}

      {/* Tier 3: Advanced RRULE input */}
      {preset !== "none" && (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-xs"
          >
            {showAdvanced ? "Hide" : "Show"} advanced RRULE
          </Button>
          {showAdvanced && (
            <div className="mt-2">
              <Input
                value={preset === "custom" ? rawRule : (rule ?? "")}
                onChange={(e) => {
                  setPreset("custom");
                  setRawRule(e.target.value);
                }}
                placeholder="RRULE:FREQ=WEEKLY;BYDAY=MO"
                className="font-mono text-xs"
              />
              {rawError && <p className="mt-1 text-xs text-destructive">{rawError}</p>}
            </div>
          )}
        </div>
      )}

      {/* Tier 2: Mode toggle — visible when recurrence is set */}
      {preset !== "none" && (
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Schedule type</label>
          <div className="flex gap-2">
            {(["fixed", "after_completion"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm text-left transition-colors ${
                  mode === m
                    ? "border-primary bg-primary/10 font-medium"
                    : "border-input bg-background"
                }`}
              >
                <span className="font-medium block">
                  {m === "fixed" ? "Fixed schedule" : "After completion"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {m === "fixed"
                    ? "Due on specific dates regardless of when last done"
                    : "Due N days/months after it was last completed"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Human-readable description */}
      {desc && <p className="text-sm text-muted-foreground italic">{desc}</p>}

      {/* Completion window */}
      {preset !== "none" && (
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            Completion window — how long do you have once it&apos;s due?
          </label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={365}
              value={windowDays}
              onChange={(e) =>
                setWindowDays(Math.min(365, Math.max(0, parseInt(e.target.value) || 0)))
              }
              className="w-24"
            />
            <span className="text-sm">days</span>
            {windowDays === 0 && (
              <span className="text-xs text-muted-foreground">(due on the day only)</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
