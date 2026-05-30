# Changelog

## [Unreleased]

### Changed

- **Navigation consolidated from 6 to 5 entries**: Removed the "Chores" top-level nav entry. "All tasks" renamed to "Tasks". Nav order: Today / Tasks / Someday / Stats / Settings.
- **Tasks view** now shows active tasks only (due_at IS NOT NULL, not archived). The "Include Someday items" checkbox has been removed — Someday items live exclusively in the Someday tab.
- **Tasks view** gains a "Recurring only" filter toggle alongside the existing assignee filter, for users who want to see just the rhythm of recurring tasks.
- `/chores` redirects to `/tasks` so existing bookmarks continue to work.
