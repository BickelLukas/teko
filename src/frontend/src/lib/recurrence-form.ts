import { RRule } from "rrule";

// Pure helpers for the recurrence form: translating between an RRULE string and
// the simplified preset + parameters the picker exposes. Kept separate from the
// component so the round-trip logic can be unit tested.

export const PRESETS = [
  "none",
  "daily",
  "every-n-days",
  "weekly",
  "monthly-date",
  "every-n-months",
  "yearly",
  "custom",
] as const;
export type Preset = (typeof PRESETS)[number];

export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
type WeekdayCode = (typeof WEEKDAYS)[number];

export type RuleParams = {
  nDays: number;
  nMonths: number;
  weekdays: string[];
  monthDay: number;
};

const DEFAULT_PARAMS: RuleParams = { nDays: 7, nMonths: 3, weekdays: ["MO"], monthDay: 1 };

export function detectPreset(rule: string | null): Preset {
  if (!rule) return "none";
  try {
    const r = RRule.fromString(rule);
    const { freq, interval } = r.options;
    // rrule derives bymonthday/byweekday from DTSTART in `options`, so read the
    // user's explicit choices from `origOptions` to tell "every N months" apart
    // from a DTSTART-anchored "day of month" rule.
    const hasMonthDay = r.origOptions.bymonthday != null;
    const hasWeekday = r.origOptions.byweekday != null;
    if (freq === RRule.DAILY && interval === 1) return "daily";
    if (freq === RRule.DAILY) return "every-n-days";
    if (freq === RRule.WEEKLY) return "weekly";
    if (freq === RRule.MONTHLY && hasMonthDay && !hasWeekday) return "monthly-date";
    if (freq === RRule.MONTHLY && interval > 1) return "every-n-months";
    if (freq === RRule.YEARLY) return "yearly";
    return "custom";
  } catch {
    return "custom";
  }
}

// Extracts the editable parameters (interval, weekday set, day-of-month) from an
// existing rule so the picker shows the saved values instead of resetting to
// defaults. Day-of-month is read from `origOptions` to ignore the DTSTART day
// that rrule injects into the normalized `options`.
export function parseRuleParams(rule: string | null): RuleParams {
  if (!rule) return { ...DEFAULT_PARAMS };
  try {
    const r = RRule.fromString(rule);
    const { freq, interval } = r.options;
    const params: RuleParams = { ...DEFAULT_PARAMS };

    if (freq === RRule.DAILY && interval > 1) params.nDays = interval;
    if (freq === RRule.MONTHLY && interval > 1) params.nMonths = interval;

    const explicitMonthDay = r.origOptions.bymonthday;
    const day = Array.isArray(explicitMonthDay) ? explicitMonthDay[0] : explicitMonthDay;
    if (typeof day === "number") params.monthDay = day;

    if (freq === RRule.WEEKLY) {
      const days = r.options.byweekday
        .map((n) => WEEKDAYS[n])
        .filter((code): code is WeekdayCode => code !== undefined);
      if (days.length) params.weekdays = [...days];
    }

    return params;
  } catch {
    return { ...DEFAULT_PARAMS };
  }
}

export function buildRule(preset: Preset, params: RuleParams, rawRule: string): string | null {
  switch (preset) {
    case "none":
      return null;
    case "daily":
      return "RRULE:FREQ=DAILY";
    case "every-n-days":
      return `RRULE:FREQ=DAILY;INTERVAL=${params.nDays}`;
    case "weekly": {
      const days = params.weekdays.length ? params.weekdays.join(",") : "MO";
      return `RRULE:FREQ=WEEKLY;BYDAY=${days}`;
    }
    case "monthly-date":
      return `RRULE:FREQ=MONTHLY;BYMONTHDAY=${params.monthDay}`;
    case "every-n-months":
      return `RRULE:FREQ=MONTHLY;INTERVAL=${params.nMonths}`;
    case "yearly":
      return "RRULE:FREQ=YEARLY";
    case "custom":
      return rawRule || null;
  }
}

export function validateRaw(raw: string): string | null {
  if (!raw) return null;
  try {
    RRule.fromString(raw);
    return null;
  } catch (e) {
    return String(e);
  }
}
