import { describe, it, expect } from "vitest";
import { describeRecurrenceLocalized } from "./recurrence";

// Stored rules carry an explicit DTSTART; the German describer must not mistake
// the DTSTART day for a day-of-month and report "every N months" as monthly.
function withDtstart(rule: string): string {
  return `DTSTART:20260115T000000Z\n${rule}`;
}

describe("describeRecurrenceLocalized (de, fixed)", () => {
  it("describes every-3-months correctly despite a DTSTART", () => {
    expect(
      describeRecurrenceLocalized(withDtstart("RRULE:FREQ=MONTHLY;INTERVAL=3"), "fixed", "de"),
    ).toBe("Alle 3 Monate");
  });

  it("still describes an explicit day-of-month rule", () => {
    expect(
      describeRecurrenceLocalized(withDtstart("RRULE:FREQ=MONTHLY;BYMONTHDAY=15"), "fixed", "de"),
    ).toBe("Am 15. jeden Monat");
  });

  it("describes a plain monthly rule", () => {
    expect(describeRecurrenceLocalized(withDtstart("RRULE:FREQ=MONTHLY"), "fixed", "de")).toBe(
      "Jeden Monat",
    );
  });
});

describe("describeRecurrenceLocalized (de, after_completion)", () => {
  it("uses the month interval", () => {
    expect(
      describeRecurrenceLocalized(
        withDtstart("RRULE:FREQ=MONTHLY;INTERVAL=3"),
        "after_completion",
        "de",
      ),
    ).toBe("Alle 3 Monate nach letzter Erledigung");
  });
});
