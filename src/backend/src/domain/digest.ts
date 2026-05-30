import { translate } from "../i18n/index.js";

export type DigestTaskInfo = { title: string };

export type DigestData = {
  // Display name used in the greeting.
  name: string;
  locale: string;
  // The user's configured digest time ("HH:MM"). Drives the greeting wording.
  // Null is treated as the 08:00 default.
  notificationTime: string | null;
  // Tasks that are overdue.
  overdue: DigestTaskInfo[];
  // Tasks genuinely due today: strict due-today chores, due-today one-offs, and
  // anything the user planned for today.
  dueToday: DigestTaskInfo[];
  // Tasks whose eligibility window opened today — a soft mention,
  // not pressure. Excludes anything already in dueToday.
  newlyEligible: DigestTaskInfo[];
};

export type DigestMessage = { title: string; body: string };

const MAX_BODY_TASKS = 5;

type GreetingKey =
  | "notifications.digest.greeting.morning"
  | "notifications.digest.greeting.afternoon"
  | "notifications.digest.greeting.evening";

function greetingKeyForTime(notificationTime: string | null): GreetingKey {
  const hour = parseHour(notificationTime);
  if (hour < 12) return "notifications.digest.greeting.morning";
  if (hour <= 17) return "notifications.digest.greeting.afternoon";
  return "notifications.digest.greeting.evening";
}

function parseHour(notificationTime: string | null): number {
  if (!notificationTime) return 8;
  const match = /^(\d{1,2}):\d{2}$/.exec(notificationTime);
  if (!match || match[1] === undefined) return 8;
  const hour = Number(match[1]);
  return Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : 8;
}

type Section = "overdue" | "today" | "eligible";

const SECTION_BODY_KEY: Record<
  Section,
  | "notifications.digest.body.overdue"
  | "notifications.digest.body.today"
  | "notifications.digest.body.eligible"
> = {
  overdue: "notifications.digest.body.overdue",
  today: "notifications.digest.body.today",
  eligible: "notifications.digest.body.eligible",
};

/**
 * Builds the daily digest for a single user from pre-fetched, pre-categorized
 * task data. Pure: no DB access, no clock. Returns null when there is nothing
 * worth notifying about.
 */
export function buildDigest(data: DigestData): DigestMessage | null {
  const { overdue, dueToday, newlyEligible, locale } = data;

  if (overdue.length === 0 && dueToday.length === 0 && newlyEligible.length === 0) {
    return null;
  }

  const title = buildTitle(data);
  const body = buildBody(data, locale);

  return { title, body };
}

function buildTitle(data: DigestData): string {
  const { overdue, dueToday, newlyEligible, locale } = data;
  const total = overdue.length + dueToday.length + newlyEligible.length;

  // Exactly one overdue task and nothing else: name it directly.
  if (overdue.length === 1 && dueToday.length === 0 && newlyEligible.length === 0) {
    return translate(locale, "notifications.digest.title.single_overdue", {
      task: overdue[0]!.title,
    });
  }

  const key =
    total === 1
      ? "notifications.digest.title.things_today_one"
      : "notifications.digest.title.things_today_other";
  return translate(locale, key, { count: total });
}

function buildBody(data: DigestData, locale: string): string {
  const greeting = translate(locale, greetingKeyForTime(data.notificationTime), {
    name: data.name,
  });

  // Flatten into a single ordered list so the 5-item cap applies across all
  // sections, then regroup the shown items by section to render labelled
  // sentences.
  const ordered: { section: Section; title: string }[] = [
    ...data.overdue.map((t) => ({ section: "overdue" as const, title: t.title })),
    ...data.dueToday.map((t) => ({ section: "today" as const, title: t.title })),
    ...data.newlyEligible.map((t) => ({ section: "eligible" as const, title: t.title })),
  ];

  const shown = ordered.slice(0, MAX_BODY_TASKS);
  const overflow = ordered.length - shown.length;

  const order: Section[] = ["overdue", "today", "eligible"];
  const grouped = new Map<Section, string[]>();
  for (const item of shown) {
    const list = grouped.get(item.section) ?? [];
    list.push(item.title);
    grouped.set(item.section, list);
  }

  const presentSections = order.filter((s) => grouped.has(s));

  const segments = presentSections.map((section, index) => {
    const titles = [...grouped.get(section)!];
    // Append the "and N more" clause to the last rendered section.
    if (overflow > 0 && index === presentSections.length - 1) {
      titles.push(translate(locale, "notifications.digest.body.and_more", { count: overflow }));
    }
    return translate(locale, SECTION_BODY_KEY[section], { tasks: titles.join(", ") });
  });

  return [greeting, ...segments].join(" ");
}
