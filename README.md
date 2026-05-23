# Teko

> A calm, household-shared task tracker for Home Assistant.

🚧 **Status: early development** — pre-alpha, no releases yet.

---

## What is Teko?

Teko is the central place for everything that needs doing in your household — recurring chores, one-off tasks, small projects, and long-term goals like renovations or planning a holiday. It lives inside Home Assistant, uses your existing HA users, exposes entities and services for automations, and sends notifications through HA's familiar channels.

It's built for households, not workplaces. The design favours quiet motivation over competition, gentle reminders over nagging, and shared progress over individual scores.

---

## Key Features

- 🏠 **Native Home Assistant integration** — HA users are Teko users, no separate accounts
- 🔁 **Flexible recurrence** — daily, weekly, "every N days after last completion", or full iCal RRULE for the weird cases
- 📋 **Unified model, two UX modes** — Chores (recurring, gamified) and Projects (hierarchical, ad-hoc) share one data model
- 🔥 **Streaks and household points** — personal motivation, collaborative totals, no leaderboards
- 🔔 **Actionable notifications** — tap "Done" directly from the push notification
- ⚡ **Two-way HA automations** — Teko emits events HA can react to, and HA can create or complete tasks via services
- 🌍 **Bilingual** — English and German from day one
- 📱 **Works on phone, tablet, and desktop** through HA's sidebar

---

## How It Works

Teko ships as **two installable artifacts** from a single repository:

1. **Teko add-on** — a Docker container managed by Home Assistant's Supervisor. Contains the backend (Node + Fastify + SQLite), the React UI, the recurrence engine, and the scheduler. This is where all the real work happens.

2. **Teko integration** — a small Home Assistant custom integration (installable via HACS). It connects to the add-on over HA's internal network, registers entities and services, fires events on the HA event bus, and adds Teko to the sidebar.

The add-on is fully functional on its own. The integration is what makes Teko feel like a first-class citizen of Home Assistant — exposing sensors, buttons, todo lists, and services that you can use in automations.

Authentication piggybacks on Home Assistant. When you open Teko through the HA sidebar, ingress passes your identity to the add-on automatically. **No login screens, no passwords, no separate user management.**

---

## Design Principles

These principles govern every product and engineering decision. They are not aspirational — they are doctrine. Contributions that conflict with them will be declined.

### 1. Self-motivation, never competition

Teko is used by people who live together. Anything that pits household members against each other — leaderboards, public rankings, "you did less than your partner" comparisons — breeds resentment and gets the product abandoned. Every fun or gamification feature must pass this test:

> *"Could this make two people in a household resent each other?"*
> If yes, it doesn't ship.

Streaks are personal. Points are collaborative (one household total). Comparison views are absent by default and never invite ranking.

### 2. The product disappears into the work

Teko is the sign on the door, not the vocabulary inside the house. The app talks about *your tasks*, *your chores*, *your household* — never about itself. You add a **task**, not a "teko." The product name appears in branding, never in microcopy.

### 3. Home Assistant is the foundation, not a target platform

Teko is not "an app that runs inside HA." It is built *for* HA. HA users are Teko users. HA notifications carry Teko reminders. HA automations create and complete Teko tasks. HA's event bus carries Teko events. If a feature would work the same whether HA existed or not, we're probably building it wrong.

### 4. Calm by default

Notifications are minimal and considered. The UI is dense with information but not noisy. Animations are subtle. Colours are restrained. A household tool should fade into routine, not demand attention.

### 5. Real-world recurrence

Chore software that only supports "every N days" doesn't survive contact with a real household. Teko supports both *fixed schedules* (rent is due on the 1st) and *interval-from-last-completion* schedules (vacuum every 7 days from when I last did it), and full iCal RRULE under the hood for anything else.

### 6. Multilingual from day one

English and German are both first-class. Strings are externalised from the start. No retrofitting i18n later.

---

## Installation

*Not yet available — under active development. Watch this repo for the first release.*

When ready, installation will be:

1. Add the Teko add-on repository to Home Assistant
2. Install the Teko add-on
3. Install the Teko integration via HACS
4. Add the integration from Settings → Devices & Services
5. Open Teko from the sidebar

Total time: under five minutes, no YAML.

---

## Screenshots

*Coming soon.*

---

## Documentation

- **[Product overview](docs/PRODUCT.md)** — what Teko does, user stories, non-goals
- **[Architecture](docs/ARCHITECTURE.md)** — technical design, auth, deployment, integration
- **[CLAUDE.md](CLAUDE.md)** — guidance for AI-assisted development on this repo

---

## Tech Stack

- **Backend**: Node, TypeScript (strict), Fastify, Drizzle ORM, SQLite
- **Frontend**: React, Vite, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query
- **Recurrence**: rrule.js (iCal RRULE)
- **Integration**: Python (Home Assistant custom integration)
- **Packaging**: Home Assistant add-on (Docker), HACS-compatible integration

---

## Contributing

This is currently a personal project in early development. Contributions, ideas, and feedback are welcome once the first release is out.

If you're considering contributing later: please read the design principles above. They're the heart of the project, and they govern what does and doesn't get accepted.

---

## Acknowledgements

Built on top of the wonderful work of the Home Assistant community.

The name **Teko** is Finnish for *a deed* or *an accomplishment* — small things, done over time, that build the home you want.