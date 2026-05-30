# Teko — Product Overview

This document describes *what Teko is* from the user's perspective: who it's for, what it does, the concepts it's built around, and — equally important — what it deliberately doesn't do.

For technical design, see [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## Who Teko Is For

Households of two or more people who share a home and want a calm, shared place to track the things that need doing — from "take out the trash" to "renovate the kitchen."

Specifically, Teko is built for households where:

- Everyone has (or could have) a Home Assistant account
- Someone is already running Home Assistant as a smart-home hub
- People want to coordinate without nagging each other
- Chores, intentions, and long-term goals currently live scattered across whiteboards, sticky notes, shared notes apps, calendar reminders, and unspoken assumptions

Teko is **not** built for:

- Workplaces or teams
- Single-person productivity (it works, but it's overkill)
- Project management in the professional sense
- Households without Home Assistant

---

## What Teko Does

In one paragraph:

> Teko is the central inbox for everything that needs doing in your household. Recurring chores (vacuum every Sunday, take out trash every Tuesday), active one-off tasks (book a dentist appointment), and a Someday list for intentions without a date yet (renovate the bathroom, fix the squeaky hinge) all live in one place. It uses your existing Home Assistant users, sends notifications through HA's mobile apps, exposes entities and events for automations, and shows up as a panel in HA's sidebar. The fun mechanics — streaks, household points — are designed to motivate the individual without creating competition between household members.

---

## Core Concepts

Precise vocabulary matters. These are the words Teko uses internally and externally, and what they mean.

### Task

The atomic unit. Everything in Teko is a task. A task has:

- A **title** (required, short)
- An optional **description**
- An optional **assignee** (a household member)
- An optional **due date** (`due_at`; if set, the task is active and surfaces in Today around the due date)
- An optional **recurrence rule** (if set, the task is a *chore*; if not, it's a one-off)
- A **completion history** (every time it was completed, by whom, when)
- A **state**: not_yet, eligible, overdue, done, or archived (see ADR-0007)

The **type** of a task is derived from its fields:
- Recurring rule set → **Chore**
- No recurring rule, due_at set → **Active one-off** (appears in Today)
- No recurring rule, no due_at, not archived → **Someday item** (appears in Someday list)

Tasks may also have **tags** and a "household" vs "personal" flag for shared vs individual chores.

### Chore

A task with a recurrence rule. The defining characteristic is that completing it generates the next occurrence automatically. Chores accumulate streaks. Chores contribute to weekly household points.

> *Examples: take out trash, vacuum living room, water plants, change air filter, pay rent.*

### Someday

A flat list of intentions and ideas that don't have a date yet. Someday items never appear in Today and never trigger notifications — the whole point is that they're out of mind until you go looking.

> *Examples: renovate the basement, fix the squeaky hinge in the office, plant a vegetable garden, learn to make sourdough.*

Items can be vague or specific. If you later decide to plan something concrete, you add several precise items and archive the vague one. The system does not model this as a state transition; it's just editing the list.

**Activating a Someday item** ("scheduling" it) means setting a date — the item leaves Someday and appears in the normal task flow on that date. Clearing the date moves it back. No new state, no new entity — just a date field.

### Recurrence

Defines when a chore is due. Two modes:

- **Fixed schedule** — the chore is due on specific dates regardless of completion history. *"Rent is due on the 1st of every month."*
- **After completion** — the chore is due N days after it was last done. *"Vacuum every 7 days from when I last vacuumed."*

Internally stored as iCal RRULE strings for full flexibility. Exposed to users through a three-tier UI: simple presets, the fixed-vs-after-completion toggle, and an advanced mode for custom RRULEs.
### Completion Window

How long a chore stays eligible to be completed before it's considered overdue. A completion window acknowledges that not every chore needs to happen on a precise date — trimming the bushes every 6 months can happen any weekend within a month-long window.

A chore moves through three temporal states:

- **Not yet** — the next cycle hasn't started; the chore is invisible
- **Eligible** — within the completion window; the chore is visible but not urgent
- **Overdue** — past the window; the chore is now urgent

The window is set per chore. Defaults are inferred from the cadence (daily chores have a window of 0; six-monthly chores default to a month).

> *Example: "Trim the bushes" recurs every 6 months with a 1-month window. From April 1 to September 30, it's hidden. October 1–31, it's eligible — visible but not nagging. November 1, it becomes overdue.*

A window of zero days makes a chore strictly "due on the day," matching traditional chore-app behaviour. Most short-cadence chores use small or zero windows; most long-cadence chores benefit from larger ones.

### Scheduling

When a chore enters the eligible state, the user can optionally **schedule** it for a specific date within the window. This converts ambient availability into a committed plan.

- A scheduled chore shows a "Planned for [date]" badge
- The user gets a normal daily-digest notification on the planned date
- If the planned date passes without completion, the chore returns to *eligible* (if still within window) or *overdue* (if not)
- Scheduling never penalizes — pushing a planned date forward is just rescheduling

Scheduling is optional. Many users will simply complete eligible chores when they get to them. Scheduling exists for the people (and the chores) where committing to a date helps.

> *Example: The user sees "Trim the bushes" become eligible on October 1. They look at the weather forecast and schedule it for Saturday October 12. On Saturday morning, they get a normal reminder. They complete it. The next cycle becomes eligible six months later.*

### Streak

A personal counter on a per-chore basis. Counts consecutive on-time completions by a single user. Resets on a missed cycle. Visible primarily on the user's own view; never ranked across users.

### Points

A per-task point value (default: 1) that accumulates into:

- A **weekly household total** — collaborative, visible to all, resets Monday
- A **weekly personal contribution** — visible on the user's own stats page, never ranked

Points are designed to encourage participation, not to compare. There is no leaderboard.

### Household

The shared space. One Teko instance = one household. Everyone signed in via the same HA instance shares the same task universe.

### Tag

A small household-shared label with a name and a color. Tags group tasks across the unified task model — spanning chores, one-off tasks, and Someday items. The tag library is deliberately curated: tags are created and managed in Settings → Tags, not inline during task creation. This keeps the library small and meaningful. Applying existing tags to a task is always available from the task's create/edit forms and picker.

Tag filtering uses AND semantics: selecting multiple tags narrows the result to tasks that carry all selected tags. Filter state is per-view and clears when switching tabs.

### User

A Home Assistant user, mirrored into Teko on first contact. See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the auth model.

---

## User Stories

These are the user experiences Teko is built to deliver. They drive the prioritization of features.

### Daily use

1. **As a household member, I open Teko in the morning and immediately see what I need to do today.**
2. **As a household member, I want to quickly add a new task without filling out a long form** — title, maybe assignee, done.
3. **As a household member, I can mark a chore done from a push notification without opening the app.**
4. **As a household member, I can see my current streaks on the chores I care about** — they're a quiet pat on the back, not a competition.
5. **As a household member, I can reschedule a chore** — move the due date earlier or later — because life happens, without breaking my streak.

### Recurring chores

6. **As a household member, I can set up a chore that recurs on a fixed schedule** (rent on the 1st) or based on when it was last done (vacuum every 7 days).
7. **As a household member, I can set how many days before the due date a chore becomes visible**, so infrequent chores appear in my feed with enough lead time.
8. **As a household member, I can reschedule a chore to any date** — earlier or later — "I'll trim the bushes next Saturday instead."
9. **As a household member, I can assign a chore to a specific person, or leave it unassigned** so whoever picks it up gets credit.
10. **As a household member, I can rotate a chore between household members** so we take turns.

### Someday

11. **As a household member, I can quickly capture an intention** ("renovate the basement") without choosing a date, so it's out of my head but not cluttering Today.
12. **As a household member, I can browse my Someday list deliberately** — it's a destination I visit when I have space to think, not a source of daily pressure.
13. **As a household member, I can schedule a Someday item for a specific date** when I decide to act on it — it moves into the normal task flow on that date.
14. **As a household member, I can move a scheduled one-off task back to Someday** if the timing isn't right, without losing the task.

### Awareness

15. **As a household member, I can see what the household achieved this week** — a single shared number, framed as our collective progress.
16. **As a household member, I can glance at my personal stats** — my streaks, my completed tasks this week, my upcoming load — without comparing to anyone.
17. **As a household member, I can see other people's stats if I deliberately look for them** — to celebrate, not to judge — but never by default.

### Home Assistant integration

18. **As an HA user, when a task becomes overdue, I want HA to be able to react** — flash a light, send a TTS reminder, show it on a dashboard.
19. **As an HA user, when a physical event happens, I want HA to create a task in Teko** — washing machine finishes → "hang up laundry" appears.
20. **As an HA user, I can tap an NFC tag or press a dashboard button to mark a chore done** through HA, with Teko updating instantly.
21. **As an HA user, I want my mobile push notifications from Teko to come through the HA companion app** — same notification surface I'm already using.

### Coexistence

22. **As a household member, I never have to manage a separate Teko account** — if I'm in HA, I'm in Teko.
23. **As a household member, I see Teko's UI in the language I set in HA** — English or German for now.

---

## Key Screens

A first sketch of the screens Teko needs. Visual design happens in code; this is the functional inventory.

### Today

The default landing screen. Opinionated and minimal.

- A greeting with the user's name
- **Today**: due today, overdue, or scheduled for today
- **Eligible this period**: chores within their completion window, shown calmly — peripheral awareness, not pressure. Each eligible chore can be completed or scheduled from here.
- **Coming up**: due in the next 2 days
- A floating "+ Add task" button
- A small footer line: today's household points, the user's longest active streak

The visual distinction between *Today* and *Eligible* is important: Today items use stronger visual weight (the user should act on these); Eligible items use lighter weight (the user is aware, but not pushed).

### Tasks

All active tasks (due_at IS NOT NULL, not archived), organized for browsing and management.

- Filter: assignee; toggle for "Recurring only" (shows only tasks with a recurrence rule)
- State-styled cards: overdue (alert), eligible (soft accent), not yet (muted), done
- Sort: overdue → eligible → not yet → done; within state, by due_at ascending
- A "+ Add task" button is always available
- Someday items are not shown here; they live in the Someday tab

### Someday

Flat list of dateless intentions. Tags are the primary mechanism for grouping the Someday list — use them to surface items by room, theme, or energy level.

- Filter: assignee, tags (AND semantics)
- Sorted: newest first by default
- "+ Add to Someday" button (minimal form: title, description, assignee — no date, no recurrence)
- Per-item actions: Edit (title/description/assignee), Schedule (opens date picker; item moves to active), Archive
- Visually calm — no urgency cues, no overdue colours, no progress bars

### Stats

Personal and household progress.

- **You**: this week's contribution, active streaks, longest streaks ever, completion history (last 12 weeks as a small bar chart)
- **Household**: this week's total points, completions per day this week, longest household streak (consecutive weeks with > 0 points), other household members' stats (collapsed by default, expandable — no ranking)

### Settings

Per-user and per-household preferences.

- **You**: language, notification time for daily digest, notification preferences per category (chores, project deadlines, milestones)
- **Tags**: the household tag library. Create, rename, recolor, and delete tags. Usage count shown per tag. This is the only place where new tags can be created.
- **Household** (admin only): timezone, week start day, default point values, archive policy

### Task Detail / Edit

Modal or full-screen depending on device.

- Title, description
- Assignee (single-select dropdown of household members + "anyone")
- Scheduled date (optional; sets planned_for)
- Recurrence (the three-tier picker — simple presets, fixed-vs-after-completion toggle, advanced RRULE mode)
- Tags
- Points (defaults to 1)
- "Expose to Home Assistant" toggle (off by default)
- Activity / history at the bottom (all past completions)
- Completion window (how long the chore stays eligible after becoming due; defaults inferred from cadence)

---

## Notification Tone and Copy

Notifications are the most consequential UI surface — they reach users when they're not looking. They must be **calming, personal, and actionable**.

### Principles

- **First-person and household-level only.** Never reference other people's behaviour.
- **Specific and actionable.** Don't say "you have new tasks" — say what they are.
- **Quiet by default.** No emoji clutter. Occasional emoji for celebration.
- **The product is invisible.** Notifications don't say "Teko reminds you..." — they just remind you.

### Notification types

#### Daily morning digest

The planning frame. Tells you what's on your plate for the day: overdue tasks, tasks due today, and anything whose eligibility window opened today (a soft mention, not pressure). Fires once per day at the user's chosen time (default 08:00).

Enabled by default. Frame: looking ahead.

**English sample:**
> *"Good morning, Alice. Overdue: pay rent. Today: take out trash, water plants."*

**German sample:**
> *"Guten Morgen, Alice. Überfällig: Miete zahlen. Heute: Müll rausbringen, Pflanzen gießen."*

#### Evening reminder

The runway frame. A same-day nudge for tasks that are overdue or due today and still incomplete. Catches the case where you saw the morning digest, intended to act, got busy, and forgot. Fires once per day at the user's chosen time (default 19:00).

On by default. Only surfaces tasks whose deadline is today or already past — not tasks that are eligible but have a future deadline. Silent when everything is already done.

**English samples:**

With one open item:
> *"1 thing still open"*
> *"Still open: take out trash."*

With several open items (mix of overdue and due-today):
> *"3 things still open"*
> *"Still open: pay rent, take out trash, water plants."*

With more than 5 open items:
> *"8 things still open"*
> *"Still open: pay rent, take out trash, water plants, clean the kitchen, vacuum, and 3 more."*

**German samples:**

> *"1 Aufgabe noch offen"*
> *"Noch offen: Müll rausbringen."*

> *"3 Aufgaben noch offen"*
> *"Noch offen: Miete zahlen, Müll rausbringen, Pflanzen gießen."*

### Examples

**✅ Good**

- *"Good morning. You have 3 things today: take out trash, water plants, water the basil."*
- *"Nice — that's 7 days in a row on dishes 🔥"*
- *"Trash day. It's been 7 days."*
- *"This week the household earned 47 points 🎉"*
- *"You haven't done the plants in 9 days. Snooze or mark done?"*
- *"The bushes can be trimmed this month — no rush."* (eligible state, gentle)
- *"Reminder: you planned to trim the bushes today."* (planned date)
- *"3 things still open"* (evening reminder: overdue + due-today tasks still incomplete)

**❌ Bad**

- *"Teko reminds you that you have tasks pending."* (self-referential)
- *"Alice has completed 8 chores this week, you've completed 2."* (comparison)
- *"You're behind on your chores."* (judgmental)
- *"3 new tekos available!"* (treating the name as vocabulary)
- *"You have new notifications."* (vague)
- *"Good evening, Alice. You still have 3 tasks open."* (greeting in the evening reminder is unnecessarily formal for a nudge)

### Default notification rhythm

- **One daily morning digest** per user, at the user's chosen time (default 08:00). Includes overdue, due-today, and newly-eligible tasks. Enabled by default.
- **One evening reminder** per user, at the user's chosen time (default 19:00). Includes only overdue and due-today incomplete tasks. Enabled by default.
- **Actionable push** when a high-priority chore becomes overdue during waking hours (configurable per chore, off by default)
- **Streak milestone** push at 7, 30, 100, 365 consecutive completions
- **Weekly household summary** Sunday evening (default off, opt-in)

**Morning digest vs. evening reminder:**
The morning digest is a planning frame — it includes newly-eligible tasks (where the window just opened) so you can decide when to act. The evening reminder is a runway frame — it only surfaces tasks where the deadline is today or already past, so the framing is "act now or fall behind." Eligible tasks with a future deadline never appear in the evening reminder: they still have window flexibility and surfacing them would undermine the calm-by-default window design.

Everything else is silence. Users who want more aggressive nudges can build them in HA automations using Teko's events.

---

## Non-Goals

What Teko deliberately is not. These exist to prevent scope creep and to make values explicit.

### We are NOT building...

1. **A leaderboard or ranked competition.** Per the design principles, this is doctrine. No "who did the most chores this month" view. No badges that compare users. No notifications that reference others' performance.

2. **Photo proof of completion.** Adds friction, surveillance vibes, and storage cost. Trust your household.

3. **Built-in chat or comments.** Users have a chat app. Tasks don't need a comment thread. Maybe a short note field per task, never a conversation.

4. **A calendar replacement.** Tasks have due dates and recurrence. They are not calendar events. We don't render a week-view calendar.

5. **A native mobile app.** Teko runs in HA. The HA companion app is the mobile surface. Building a separate native app means duplicating auth, push, sync, and UI — for no real gain.

6. **A shopping list.** HA has a built-in shopping list. Teko exposes `todo.` entities that voice assistants can talk to, but we don't compete with HA's existing shopping list feature.

7. **A meal planner.** Adjacent, tempting, out of scope. Possible future integration via the same `todo.` mechanism, but not a built-in feature.

8. **Hierarchical projects with structured planning.** Teko does not model parent/child task relationships, project progress trees, or auto-completion cascades. The Someday list is deliberately flat. If you want to break a big intention into concrete steps, add several tasks and archive the vague one — the system does not model this transition. See ADR-0006.

9. **Real-time multi-user editing.** Tasks are owned by the household; concurrent edits are rare and resolved last-write-wins. No CRDTs, no operational transforms.

10. **Public sharing or social features.** Households are private. There is no "share this chore" or "follow another household."

11. **Payment, billing, or premium tiers.** Teko is free and open source. There is no commercial version.

12. **An AI assistant inside Teko.** Tempting, but adds dependencies, costs, and complexity for marginal user value. If users want AI help, they can use it elsewhere to compose tasks and paste them in.

13. **A web version that runs outside Home Assistant.** Teko is an HA add-on. Running standalone is technically possible but explicitly not supported as a product mode.

14. **Granular permissions and roles.** Everyone in the household is equal. The only role distinction is HA admin (for household settings) vs member, and even that is minimal.

15. **Time tracking, billable hours, or productivity analytics.** Wrong genre of product entirely.

16. **Strict "due today or you failed" semantics by default.** Chores have completion windows. A 6-month chore that gets done within a 1-month grace period is on time, not late. Strict-mode (window = 0) is available for things that genuinely have a hard date.

---

## Languages

English and German are supported from day one, as equal first-class languages.

- All UI strings are externalised
- All notification copy has both translations
- Recurrence and date formatting respect locale
- Per-user language preference (separate from HA's locale, but defaults to it)

Additional languages can be added later through community contributions. No language has special status above the user's chosen preference.

---

## Roadmap (Indicative)

Detailed phasing lives in [`ARCHITECTURE.md`](ARCHITECTURE.md). Product-level milestones:

- **v0.1** — Core: tasks, chores with recurrence, single-household, HA integration with entities and services, daily digest notifications, basic stats. English and German.
- **v0.2** — Someday list, streaks, household points, stats page, actionable notifications.
- **v0.3** — Polish: rotation between users, snooze flows, dashboard widgets, opt-in per-task entities.
- **v0.4+** — Community-driven: additional languages, automation recipes, calendar integration patterns, voice assistant flows.

Major design decisions for any version are guided by the principles in [`README.md`](../README.md). Features that conflict with them are not on the roadmap, regardless of demand.

---

## Open Questions

Decisions deliberately deferred until informed by real use:

- **Task rotation mechanics** — round-robin vs. who's-home vs. fair-share algorithms
- **Notification escalation** — should an ignored task escalate to another household member? Not in v1.
- **Project templates** — saving "plan a holiday" as a reusable template. Probably v0.3+.

These will be resolved through use, not upfront speculation.