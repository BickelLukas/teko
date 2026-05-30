import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { IconTag, IconPlus } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PopoverRoot, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { TagChip } from "@/components/TagChip";
import { tagClasses } from "@/lib/tagColors";
import { fetchTags } from "@/lib/api";
import type { TagResponse, TagWithCount } from "@teko/shared";
import { cn } from "@/lib/utils";

// ── TagSelector ───────────────────────────────────────────────────────────────
// Used inside task create / edit forms.

type TagSelectorProps = {
  selected: TagResponse[];
  onChange: (tags: TagResponse[]) => void;
};

export function TagSelector({ selected, onChange }: TagSelectorProps) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: allTags = [] } = useQuery<TagWithCount[]>({
    queryKey: ["tags"],
    queryFn: fetchTags,
  });

  const selectedIds = new Set(selected.map((t) => t.id));

  const filtered = allTags.filter((tag) => tag.name.toLowerCase().includes(search.toLowerCase()));

  function toggle(tag: TagWithCount) {
    if (selectedIds.has(tag.id)) {
      onChange(selected.filter((s) => s.id !== tag.id));
    } else {
      onChange([...selected, { id: tag.id, name: tag.name, color: tag.color }]);
    }
  }

  function remove(id: number) {
    onChange(selected.filter((s) => s.id !== id));
  }

  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setSearch("");
    }
  }, [open]);

  return (
    <div>
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {selected.map((tag) => (
            <TagChip key={tag.id} tag={tag} onRemove={() => remove(tag.id)} />
          ))}
        </div>
      )}

      <PopoverRoot open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
            <IconPlus className="size-3" />
            {t("tags.add_tag")}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-60 p-2">
          <Input
            ref={searchRef}
            placeholder={t("tags.search_placeholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-2 h-7 text-xs"
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "Enter") e.preventDefault();
            }}
          />

          {allTags.length === 0 ? (
            <div className="py-3 text-center">
              <p className="text-xs text-muted-foreground">{t("tags.no_tags_picker")}</p>
              <a
                href="/settings"
                className="mt-1 block text-xs text-primary underline-offset-2 hover:underline"
                onClick={() => setOpen(false)}
              >
                {t("tags.create_in_settings")}
              </a>
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">{t("tags.no_match")}</p>
          ) : (
            <ul role="listbox" aria-multiselectable="true" className="max-h-52 overflow-y-auto">
              {filtered.map((tag) => {
                const isSelected = selectedIds.has(tag.id);
                const { bg, text, border } = tagClasses(tag.color);
                return (
                  <li key={tag.id} role="option" aria-selected={isSelected}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors hover:bg-accent",
                        isSelected && "bg-accent/60",
                      )}
                      onClick={() => toggle(tag)}
                    >
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium leading-none",
                          bg,
                          text,
                          border,
                        )}
                      >
                        {tag.name}
                      </span>
                      {tag.count > 0 && (
                        <span className="ml-auto text-muted-foreground">{tag.count}</span>
                      )}
                      {isSelected && <span className="ml-auto text-primary text-xs">✓</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </PopoverContent>
      </PopoverRoot>
    </div>
  );
}

// ── TagFilterPill ─────────────────────────────────────────────────────────────
// Used in list views (Today, Tasks, Someday) to filter by tags.

type TagFilterPillProps = {
  selected: TagResponse[];
  onChange: (tags: TagResponse[]) => void;
};

export function TagFilterPill({ selected, onChange }: TagFilterPillProps) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: allTags = [] } = useQuery<TagWithCount[]>({
    queryKey: ["tags"],
    queryFn: fetchTags,
  });

  const selectedIds = new Set(selected.map((t) => t.id));

  const filtered = allTags.filter((tag) => tag.name.toLowerCase().includes(search.toLowerCase()));

  function toggle(tag: TagWithCount) {
    if (selectedIds.has(tag.id)) {
      onChange(selected.filter((s) => s.id !== tag.id));
    } else {
      onChange([...selected, { id: tag.id, name: tag.name, color: tag.color }]);
    }
  }

  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setSearch("");
    }
  }, [open]);

  const hasFilter = selected.length > 0;

  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={hasFilter ? "secondary" : "outline"}
          size="sm"
          className={cn("h-7 gap-1.5 text-xs", hasFilter && "font-medium")}
        >
          <IconTag className="size-3" />
          {t("tags.filter_label")}
          {hasFilter && (
            <span className="ml-0.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              {selected.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-2">
        <Input
          ref={searchRef}
          placeholder={t("tags.search_placeholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2 h-7 text-xs"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter") e.preventDefault();
          }}
        />

        {allTags.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground">
            {t("tags.no_tags_filter")}
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground">{t("tags.no_match")}</p>
        ) : (
          <ul role="listbox" aria-multiselectable="true" className="max-h-52 overflow-y-auto">
            {filtered.map((tag) => {
              const isSelected = selectedIds.has(tag.id);
              const { bg, text, border } = tagClasses(tag.color);
              return (
                <li key={tag.id} role="option" aria-selected={isSelected}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors hover:bg-accent",
                      isSelected && "bg-accent/60",
                    )}
                    onClick={() => toggle(tag)}
                  >
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium leading-none",
                        bg,
                        text,
                        border,
                      )}
                    >
                      {tag.name}
                    </span>
                    {isSelected && <span className="ml-auto text-primary text-xs">✓</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </PopoverRoot>
  );
}
