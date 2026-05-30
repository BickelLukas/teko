import { IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { tagClasses } from "@/lib/tagColors";
import type { TagResponse } from "@teko/shared";

type TagChipProps = {
  tag: TagResponse;
  /** When provided, renders an × button that calls this handler. */
  onRemove?: () => void;
  /** When provided, clicking the chip calls this handler (e.g. filter by tag). */
  onClick?: () => void;
  /** Additional className. */
  className?: string;
};

export function TagChip({ tag, onRemove, onClick, className }: TagChipProps) {
  const { bg, text, border } = tagClasses(tag.color);

  const chipClass = cn(
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium leading-none",
    bg,
    text,
    border,
    onClick && "cursor-pointer hover:brightness-95 transition-[filter]",
    className,
  );

  if (onClick) {
    return (
      <button type="button" className={chipClass} onClick={onClick}>
        {tag.name}
        {onRemove && (
          <span
            role="button"
            aria-label={`Remove ${tag.name}`}
            className="ml-0.5 rounded-full hover:brightness-90"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
          >
            <IconX className="size-2.5" />
          </span>
        )}
      </button>
    );
  }

  return (
    <span className={chipClass}>
      {tag.name}
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${tag.name}`}
          className="ml-0.5 rounded-full hover:brightness-90"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <IconX className="size-2.5" />
        </button>
      )}
    </span>
  );
}

// ── Overflow chip ("+N more") ─────────────────────────────────────────────────

type OverflowChipProps = {
  count: number;
  onClick?: () => void;
  className?: string;
};

export function OverflowChip({ count, onClick, className }: OverflowChipProps) {
  const base = cn(
    "inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground leading-none",
    onClick && "cursor-pointer hover:bg-muted/80 transition-colors",
    className,
  );
  if (onClick) {
    return (
      <button type="button" className={base} onClick={onClick}>
        +{count}
      </button>
    );
  }
  return <span className={base}>+{count}</span>;
}
