import { describe, it, expect } from "vitest";
import { RRule } from "rrule";
import { detectPreset, parseRuleParams, buildRule } from "./recurrence-form";

// The backend stores rules with an explicit DTSTART (added by normalizeRrule).
// rrule derives bymonthday/byweekday from that DTSTART, which previously made
// `detectPreset` misclassify "every N months" as a day-of-month rule and the
// picker reset the interval to its default — turning "every 3 months" into
// "every month" on the next save. These tests pin the round-trip.
function withDtstart(rule: string): string {
  return `DTSTART:20260115T000000Z\n${rule}`;
}

describe("detectPreset", () => {
  it("returns none for an empty rule", () => {
    expect(detectPreset(null)).toBe("none");
  });

  it("detects every-n-months even when a DTSTART is present", () => {
    expect(detectPreset(withDtstart("RRULE:FREQ=MONTHLY;INTERVAL=3"))).toBe("every-n-months");
  });

  it("detects an explicit day-of-month rule", () => {
    expect(detectPreset(withDtstart("RRULE:FREQ=MONTHLY;BYMONTHDAY=15"))).toBe("monthly-date");
  });

  it("detects the remaining presets with a DTSTART present", () => {
    expect(detectPreset(withDtstart("RRULE:FREQ=DAILY"))).toBe("daily");
    expect(detectPreset(withDtstart("RRULE:FREQ=DAILY;INTERVAL=14"))).toBe("every-n-days");
    expect(detectPreset(withDtstart("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR"))).toBe("weekly");
    expect(detectPreset(withDtstart("RRULE:FREQ=YEARLY"))).toBe("yearly");
  });

  it("falls back to custom for unparseable input", () => {
    expect(detectPreset("not a rule")).toBe("custom");
  });
});

describe("parseRuleParams", () => {
  it("extracts the month interval rather than defaulting to 3", () => {
    expect(parseRuleParams(withDtstart("RRULE:FREQ=MONTHLY;INTERVAL=6")).nMonths).toBe(6);
  });

  it("extracts the day interval", () => {
    expect(parseRuleParams(withDtstart("RRULE:FREQ=DAILY;INTERVAL=10")).nDays).toBe(10);
  });

  it("extracts the explicit day-of-month, not the DTSTART day", () => {
    expect(parseRuleParams(withDtstart("RRULE:FREQ=MONTHLY;BYMONTHDAY=22")).monthDay).toBe(22);
  });

  it("does not treat the DTSTART day as a day-of-month for interval rules", () => {
    // DTSTART is the 15th, but the rule has no explicit BYMONTHDAY.
    expect(parseRuleParams(withDtstart("RRULE:FREQ=MONTHLY;INTERVAL=3")).monthDay).toBe(1);
  });

  it("extracts the weekday set", () => {
    expect(parseRuleParams(withDtstart("RRULE:FREQ=WEEKLY;BYDAY=TU,TH")).weekdays).toEqual([
      "TU",
      "TH",
    ]);
  });

  it("returns defaults for an empty rule", () => {
    expect(parseRuleParams(null)).toEqual({
      nDays: 7,
      nMonths: 3,
      weekdays: ["MO"],
      monthDay: 1,
    });
  });
});

describe("round-trip: a stored rule rebuilds unchanged", () => {
  const cases: ReadonlyArray<string> = [
    "RRULE:FREQ=DAILY",
    "RRULE:FREQ=DAILY;INTERVAL=14",
    "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR",
    "RRULE:FREQ=MONTHLY;BYMONTHDAY=15",
    "RRULE:FREQ=MONTHLY;INTERVAL=3",
    "RRULE:FREQ=YEARLY",
  ];

  it.each(cases)("preserves %s through detect + parse + build", (rule) => {
    const stored = withDtstart(rule);
    const preset = detectPreset(stored);
    const params = parseRuleParams(stored);
    // Re-saving without touching the form must not mutate the rule.
    expect(buildRule(preset, params, "")).toBe(rule);
  });
});

describe("buildRule", () => {
  const defaults = { nDays: 7, nMonths: 3, weekdays: ["MO"], monthDay: 1 };

  it("emits every-n-months from the month interval", () => {
    expect(buildRule("every-n-months", { ...defaults, nMonths: 4 }, "")).toBe(
      "RRULE:FREQ=MONTHLY;INTERVAL=4",
    );
  });

  it("produces parseable output for each preset", () => {
    for (const preset of [
      "daily",
      "every-n-days",
      "weekly",
      "monthly-date",
      "every-n-months",
      "yearly",
    ] as const) {
      const rule = buildRule(preset, defaults, "");
      expect(rule).not.toBeNull();
      if (rule !== null) expect(() => RRule.fromString(rule)).not.toThrow();
    }
  });

  it("returns null for none", () => {
    expect(buildRule("none", defaults, "")).toBeNull();
  });
});
