import type { TagPaletteKey } from "@teko/shared";

/** Tailwind classes for each palette key. Classes are spelled out in full so
 *  Tailwind's content scanner can detect them statically. */
export const TAG_COLOR_CLASSES: Record<
  TagPaletteKey,
  { bg: string; text: string; border: string }
> = {
  slate: {
    bg: "bg-slate-100  dark:bg-slate-700",
    text: "text-slate-700  dark:text-slate-200",
    border: "border-slate-300  dark:border-slate-500",
  },
  blue: {
    bg: "bg-blue-100   dark:bg-blue-900",
    text: "text-blue-700   dark:text-blue-200",
    border: "border-blue-300   dark:border-blue-700",
  },
  green: {
    bg: "bg-green-100  dark:bg-green-900",
    text: "text-green-700  dark:text-green-200",
    border: "border-green-300  dark:border-green-700",
  },
  amber: {
    bg: "bg-amber-100  dark:bg-amber-900",
    text: "text-amber-700  dark:text-amber-200",
    border: "border-amber-300  dark:border-amber-700",
  },
  rose: {
    bg: "bg-rose-100   dark:bg-rose-900",
    text: "text-rose-700   dark:text-rose-200",
    border: "border-rose-300   dark:border-rose-700",
  },
  purple: {
    bg: "bg-purple-100 dark:bg-purple-900",
    text: "text-purple-700 dark:text-purple-200",
    border: "border-purple-300 dark:border-purple-700",
  },
  pink: {
    bg: "bg-pink-100   dark:bg-pink-900",
    text: "text-pink-700   dark:text-pink-200",
    border: "border-pink-300   dark:border-pink-700",
  },
  teal: {
    bg: "bg-teal-100   dark:bg-teal-900",
    text: "text-teal-700   dark:text-teal-200",
    border: "border-teal-300   dark:border-teal-700",
  },
  orange: {
    bg: "bg-orange-100 dark:bg-orange-900",
    text: "text-orange-700 dark:text-orange-200",
    border: "border-orange-300 dark:border-orange-700",
  },
  lime: {
    bg: "bg-lime-100   dark:bg-lime-900",
    text: "text-lime-700   dark:text-lime-200",
    border: "border-lime-300   dark:border-lime-700",
  },
};

export function tagClasses(color: string): { bg: string; text: string; border: string } {
  return TAG_COLOR_CLASSES[color as TagPaletteKey] ?? TAG_COLOR_CLASSES.slate;
}
