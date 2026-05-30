import { describe, it, expect } from "vitest";
import { buildEveningReminder, type EveningReminderInput } from "./evening-reminder.js";

function base(overrides: Partial<EveningReminderInput> = {}): EveningReminderInput {
  return {
    locale: "en",
    openTasks: [],
    ...overrides,
  };
}

const tasks = (...titles: string[]) => titles.map((title) => ({ title }));

describe("buildEveningReminder", () => {
  it("returns null when there are no open tasks", () => {
    expect(buildEveningReminder(base())).toBeNull();
  });

  it("singular title for one open task", () => {
    const result = buildEveningReminder(base({ openTasks: tasks("take out trash") }));
    expect(result).not.toBeNull();
    expect(result!.title).toBe("1 thing still open");
    expect(result!.body).toBe("Still open: take out trash.");
  });

  it("plural title for multiple open tasks", () => {
    const result = buildEveningReminder(
      base({ openTasks: tasks("take out trash", "pay rent", "water plants") }),
    );
    expect(result!.title).toBe("3 things still open");
    expect(result!.body).toBe("Still open: take out trash, pay rent, water plants.");
  });

  it("caps the body at 5 tasks and appends 'and N more'", () => {
    const result = buildEveningReminder(
      base({ openTasks: tasks("t1", "t2", "t3", "t4", "t5", "t6", "t7") }),
    );
    expect(result!.title).toBe("7 things still open");
    expect(result!.body).toBe("Still open: t1, t2, t3, t4, t5, and 2 more.");
  });

  it("exactly 5 tasks: no truncation", () => {
    const result = buildEveningReminder(base({ openTasks: tasks("t1", "t2", "t3", "t4", "t5") }));
    expect(result!.body).toBe("Still open: t1, t2, t3, t4, t5.");
    expect(result!.body).not.toContain("more");
  });

  it("German locale: singular title", () => {
    const result = buildEveningReminder(
      base({ locale: "de", openTasks: tasks("Müll rausbringen") }),
    );
    expect(result!.title).toBe("1 Aufgabe noch offen");
    expect(result!.body).toBe("Noch offen: Müll rausbringen.");
  });

  it("German locale: plural title and correct body", () => {
    const result = buildEveningReminder(
      base({
        locale: "de",
        openTasks: tasks("Müll rausbringen", "Miete zahlen", "Pflanzen gießen"),
      }),
    );
    expect(result!.title).toBe("3 Aufgaben noch offen");
    expect(result!.body).toBe("Noch offen: Müll rausbringen, Miete zahlen, Pflanzen gießen.");
  });

  it("German locale: truncation suffix is correct", () => {
    const result = buildEveningReminder(
      base({ locale: "de", openTasks: tasks("t1", "t2", "t3", "t4", "t5", "t6") }),
    );
    expect(result!.body).toBe("Noch offen: t1, t2, t3, t4, t5, und 1 weitere.");
  });
});
