import { describe, it, expect } from "vitest";
import { buildDigest, type DigestData } from "./digest.js";

function base(overrides: Partial<DigestData> = {}): DigestData {
  return {
    name: "Alice",
    locale: "en",
    notificationTime: "08:00",
    overdue: [],
    dueToday: [],
    newlyEligible: [],
    ...overrides,
  };
}

const titles = (...ts: string[]) => ts.map((title) => ({ title }));

describe("buildDigest", () => {
  it("returns null when there is nothing to notify about", () => {
    expect(buildDigest(base())).toBeNull();
  });

  it("one overdue and nothing else: names the task in the title", () => {
    const result = buildDigest(base({ overdue: titles("take out trash") }));
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Overdue: take out trash");
    expect(result!.body).toBe("Good morning, Alice. Overdue: take out trash.");
  });

  it("multiple due today: counts them and lists them", () => {
    const result = buildDigest(
      base({ dueToday: titles("take out trash", "water plants", "water the basil") }),
    );
    expect(result!.title).toBe("3 things today");
    expect(result!.body).toBe(
      "Good morning, Alice. Today: take out trash, water plants, water the basil.",
    );
  });

  it("single due today uses singular wording", () => {
    const result = buildDigest(base({ dueToday: titles("take out trash") }));
    expect(result!.title).toBe("1 thing today");
    expect(result!.body).toBe("Good morning, Alice. Today: take out trash.");
  });

  it("mix of overdue and due today: surfaces both, overdue first", () => {
    const result = buildDigest(
      base({ overdue: titles("pay rent"), dueToday: titles("take out trash") }),
    );
    expect(result!.title).toBe("2 things today");
    expect(result!.body).toBe("Good morning, Alice. Overdue: pay rent. Today: take out trash.");
  });

  it("only newly-eligible: eligible-focused body, no due-today section", () => {
    const result = buildDigest(base({ newlyEligible: titles("trim the bushes") }));
    expect(result!.body).toBe("Good morning, Alice. Eligible this period: trim the bushes.");
    expect(result!.body).not.toContain("Today:");
  });

  it("caps the body at 5 task titles and appends 'and N more'", () => {
    const result = buildDigest(
      base({
        dueToday: titles("t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"),
      }),
    );
    expect(result!.title).toBe("8 things today");
    expect(result!.body).toBe("Good morning, Alice. Today: t1, t2, t3, t4, t5, and 3 more.");
  });

  it("cap spans sections: remaining overflow attaches to the last shown section", () => {
    const result = buildDigest(
      base({
        overdue: titles("o1", "o2", "o3"),
        dueToday: titles("d1", "d2", "d3", "d4"),
      }),
    );
    // 3 overdue + first 2 due-today shown; 2 more overflow.
    expect(result!.body).toBe(
      "Good morning, Alice. Overdue: o1, o2, o3. Today: d1, d2, and 2 more.",
    );
  });

  it("greeting follows the configured notification time", () => {
    expect(buildDigest(base({ notificationTime: "08:00", dueToday: titles("x") }))!.body).toContain(
      "Good morning",
    );
    expect(buildDigest(base({ notificationTime: "14:30", dueToday: titles("x") }))!.body).toContain(
      "Good afternoon",
    );
    expect(buildDigest(base({ notificationTime: "20:00", dueToday: titles("x") }))!.body).toContain(
      "Good evening",
    );
  });

  it("null notification time defaults to a morning greeting", () => {
    const result = buildDigest(base({ notificationTime: null, dueToday: titles("x") }));
    expect(result!.body).toContain("Good morning");
  });

  it("localizes into German", () => {
    const result = buildDigest(
      base({
        locale: "de",
        overdue: titles("Miete zahlen"),
        dueToday: titles("Müll rausbringen"),
      }),
    );
    expect(result!.title).toBe("2 Aufgaben heute");
    expect(result!.body).toBe(
      "Guten Morgen, Alice. Überfällig: Miete zahlen. Heute: Müll rausbringen.",
    );
  });

  it("no filler when there is a single overdue task", () => {
    const result = buildDigest(base({ overdue: titles("pay rent") }));
    expect(result!.body).toBe("Good morning, Alice. Overdue: pay rent.");
    expect(result!.body).not.toContain("Today");
    expect(result!.body).not.toContain("Eligible");
  });
});
