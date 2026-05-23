import { RRule } from "rrule";
import type { RecurrenceMode } from "@teko/shared";

export function describeRecurrence(ruleStr: string, mode: RecurrenceMode): string {
  try {
    const rule = RRule.fromString(ruleStr);
    const base = rule.toText();
    return mode === "after_completion" ? `${base} after completion` : base;
  } catch {
    return ruleStr;
  }
}
