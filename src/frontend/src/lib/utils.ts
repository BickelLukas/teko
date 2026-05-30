import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Sort ascending by due_at; null (Someday) last. */
export function sortByDueAt<T extends { due_at?: Date | string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ta = a.due_at ? new Date(a.due_at).getTime() : Infinity;
    const tb = b.due_at ? new Date(b.due_at).getTime() : Infinity;
    return ta - tb;
  });
}

/**
 * Narrow an untrusted string to a known enum, falling back to a default when
 * the value isn't in the allowed set. Replaces `as Enum` casts on user input.
 */
export function parseEnum<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return (allowed as readonly string[]).includes(value ?? "") ? (value as T) : fallback;
}
