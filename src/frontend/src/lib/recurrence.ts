import { RRule } from "rrule";
import type { RecurrenceMode } from "@teko/shared";

// German unit strings for after_completion descriptions
function afterCompletionUnit(freq: number, interval: number, locale: string): string {
  if (locale === "de") {
    if (freq === RRule.DAILY) return interval === 1 ? "1 Tag" : `${interval} Tage`;
    if (freq === RRule.WEEKLY) return interval === 1 ? "1 Woche" : `${interval} Wochen`;
    if (freq === RRule.MONTHLY) return interval === 1 ? "1 Monat" : `${interval} Monate`;
    if (freq === RRule.YEARLY) return interval === 1 ? "1 Jahr" : `${interval} Jahre`;
    return `${interval} Tage`;
  }
  if (freq === RRule.DAILY) return interval === 1 ? "day" : `${interval} days`;
  if (freq === RRule.WEEKLY) return interval === 1 ? "week" : `${interval} weeks`;
  if (freq === RRule.MONTHLY) return interval === 1 ? "month" : `${interval} months`;
  if (freq === RRule.YEARLY) return interval === 1 ? "year" : `${interval} years`;
  return `${interval} days`;
}

// Minimal German descriptions for fixed-schedule RRULEs
function toTextDe(rule: RRule): string {
  const { freq, interval = 1, byweekday, bymonthday } = rule.options;
  const DE_DAYS: Record<number, string> = {
    0: "Mo",
    1: "Di",
    2: "Mi",
    3: "Do",
    4: "Fr",
    5: "Sa",
    6: "So",
  };
  if (freq === RRule.DAILY && interval === 1) return "Täglich";
  if (freq === RRule.DAILY) return `Alle ${interval} Tage`;
  if (freq === RRule.WEEKLY && interval === 1 && byweekday?.length) {
    const days = byweekday
      .map((d) => DE_DAYS[typeof d === "number" ? d : (d as { weekday: number }).weekday] ?? "")
      .join(", ");
    return `Jeden ${days}`;
  }
  if (freq === RRule.WEEKLY && interval === 1) return "Jede Woche";
  if (freq === RRule.WEEKLY) return `Alle ${interval} Wochen`;
  if (freq === RRule.MONTHLY && bymonthday?.length) return `Am ${bymonthday[0]}. jeden Monat`;
  if (freq === RRule.MONTHLY && interval === 1) return "Jeden Monat";
  if (freq === RRule.MONTHLY) return `Alle ${interval} Monate`;
  if (freq === RRule.YEARLY && interval === 1) return "Jedes Jahr";
  if (freq === RRule.YEARLY) return `Alle ${interval} Jahre`;
  return rule.toText();
}

export function describeRecurrenceLocalized(
  ruleStr: string,
  mode: RecurrenceMode,
  locale: string,
): string {
  try {
    const rule = RRule.fromString(ruleStr);
    const interval = rule.options.interval ?? 1;

    if (mode === "after_completion") {
      const unit = afterCompletionUnit(rule.options.freq, interval, locale);
      return locale === "de"
        ? `Alle ${unit} nach letzter Erledigung`
        : `Every ${unit} after last completion`;
    }

    return locale === "de" ? toTextDe(rule) : rule.toText();
  } catch {
    return ruleStr;
  }
}

// Legacy export kept for any callers that haven't been updated yet
export function describeRecurrence(ruleStr: string, mode: RecurrenceMode): string {
  return describeRecurrenceLocalized(ruleStr, mode, "en");
}
