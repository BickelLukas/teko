import { translate } from "../i18n/index.js";

export type EveningReminderTask = { title: string };

export type EveningReminderInput = {
  locale: string;
  openTasks: EveningReminderTask[];
};

export type EveningReminderMessage = { title: string; body: string };

const MAX_BODY_TASKS = 5;

/**
 * Builds the evening reminder for a single user from pre-filtered open tasks.
 * Pure: no DB access, no clock. Returns null when there is nothing to nudge about.
 *
 * "Open" means overdue or due today — the scheduler is responsible for filtering.
 */
export function buildEveningReminder(input: EveningReminderInput): EveningReminderMessage | null {
  const { locale, openTasks } = input;

  if (openTasks.length === 0) return null;

  const title =
    openTasks.length === 1
      ? translate(locale, "notifications.evening_reminder.title.single")
      : translate(locale, "notifications.evening_reminder.title.multiple", {
          count: openTasks.length,
        });

  const shown = openTasks.slice(0, MAX_BODY_TASKS);
  const overflow = openTasks.length - shown.length;

  const taskTitles = shown.map((t) => t.title);
  if (overflow > 0) {
    taskTitles.push(
      translate(locale, "notifications.evening_reminder.and_more", { count: overflow }),
    );
  }

  const body = translate(locale, "notifications.evening_reminder.body", {
    tasks: taskTitles.join(", "),
  });

  return { title, body };
}
