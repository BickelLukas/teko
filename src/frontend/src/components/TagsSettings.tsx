import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { IconPencil, IconTrash, IconCheck, IconX, IconPlus } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TagChip } from "@/components/TagChip";
import { tagClasses } from "@/lib/tagColors";
import { fetchTags, createTag, updateTag, deleteTag } from "@/lib/api";
import type { TagWithCount } from "@teko/shared";
import { TAG_PALETTE_KEYS } from "@teko/shared";
import type { TagPaletteKey } from "@teko/shared";
import { cn } from "@/lib/utils";

// ── Color swatch picker ────────────────────────────────────────────────────

function ColorPicker({
  value,
  onChange,
}: {
  value: TagPaletteKey;
  onChange: (key: TagPaletteKey) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TAG_PALETTE_KEYS.map((key) => {
        const { bg, border } = tagClasses(key);
        return (
          <button
            key={key}
            type="button"
            aria-label={key}
            onClick={() => onChange(key)}
            className={cn(
              "size-5 rounded-full border-2 transition-transform hover:scale-110",
              bg,
              value === key ? "ring-2 ring-primary ring-offset-1 scale-110" : border,
            )}
          />
        );
      })}
    </div>
  );
}

// ── Inline edit row ────────────────────────────────────────────────────────

function EditRow({ tag, onDone }: { tag: TagWithCount; onDone: () => void }) {
  const { t } = useTranslation("pages");
  const queryClient = useQueryClient();
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState<TagPaletteKey>(tag.color as TagPaletteKey);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const saveMutation = useMutation({
    mutationFn: () => updateTag(tag.id, { name, color }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
      onDone();
    },
  });

  return (
    <div className="space-y-2 rounded-md border border-border p-2">
      <Input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={50}
        className="h-7 text-sm"
        onKeyDown={(e) => {
          if (e.key === "Enter") saveMutation.mutate();
          if (e.key === "Escape") onDone();
        }}
      />
      <ColorPicker value={color} onChange={setColor} />
      {saveMutation.isError && (
        <p className="text-xs text-destructive">{t("settings.tags_save_error")}</p>
      )}
      <div className="flex gap-1">
        <Button
          size="sm"
          className="h-6 text-xs"
          disabled={saveMutation.isPending || name.trim().length === 0}
          onClick={() => saveMutation.mutate()}
        >
          <IconCheck className="mr-1 size-3" />
          {t("settings.tags_save")}
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={onDone}>
          <IconX className="mr-1 size-3" />
          {t("settings.tags_cancel")}
        </Button>
      </div>
    </div>
  );
}

// ── Add form ────────────────────────────────────────────────────────────────

function AddTagForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation("pages");
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [color, setColor] = useState<TagPaletteKey>("blue");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const createMutation = useMutation({
    mutationFn: () => createTag({ name: name.trim(), color }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
      onDone();
    },
  });

  return (
    <div className="space-y-2 rounded-md border border-border p-2">
      <Input
        ref={inputRef}
        placeholder={t("settings.tags_name_placeholder")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={50}
        className="h-7 text-sm"
        onKeyDown={(e) => {
          if (e.key === "Enter" && name.trim()) createMutation.mutate();
          if (e.key === "Escape") onDone();
        }}
      />
      <ColorPicker value={color} onChange={setColor} />
      {createMutation.isError && (
        <p className="text-xs text-destructive">{t("settings.tags_save_error")}</p>
      )}
      <div className="flex gap-1">
        <Button
          size="sm"
          className="h-6 text-xs"
          disabled={createMutation.isPending || name.trim().length === 0}
          onClick={() => createMutation.mutate()}
        >
          <IconPlus className="mr-1 size-3" />
          {t("settings.tags_create")}
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={onDone}>
          <IconX className="mr-1 size-3" />
          {t("settings.tags_cancel")}
        </Button>
      </div>
    </div>
  );
}

// ── Delete confirm ──────────────────────────────────────────────────────────

function DeleteConfirm({ tag, onCancel }: { tag: TagWithCount; onCancel: () => void }) {
  const { t } = useTranslation("pages");
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => deleteTag(tag.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  return (
    <div className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">
      <p className="font-medium text-destructive">
        {t("settings.tags_delete_confirm", { name: tag.name, count: tag.count })}
      </p>
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="destructive"
          className="h-6 text-xs"
          disabled={deleteMutation.isPending}
          onClick={() => deleteMutation.mutate()}
        >
          {t("settings.tags_delete_confirm_action")}
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={onCancel}>
          {t("settings.tags_cancel")}
        </Button>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function TagsSettings() {
  const { t } = useTranslation("pages");
  const { data: tags = [], isLoading } = useQuery<TagWithCount[]>({
    queryKey: ["tags"],
    queryFn: fetchTags,
  });

  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">{t("settings.tags_loading")}</p>;
  }

  return (
    <div className="space-y-3">
      {tags.length === 0 && !addOpen ? (
        <div className="rounded-md border border-dashed border-border p-4 text-center">
          <p className="text-sm text-muted-foreground">{t("settings.tags_empty_title")}</p>
          <p className="mt-1 text-xs text-muted-foreground/70">{t("settings.tags_empty_body")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {tags.map((tag) => {
            if (editingId === tag.id) {
              return (
                <li key={tag.id}>
                  <EditRow tag={tag} onDone={() => setEditingId(null)} />
                </li>
              );
            }
            if (deletingId === tag.id) {
              return (
                <li key={tag.id}>
                  <DeleteConfirm tag={tag} onCancel={() => setDeletingId(null)} />
                </li>
              );
            }
            return (
              <li
                key={tag.id}
                className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5"
              >
                <TagChip tag={tag} />
                <span className="ml-1 text-xs text-muted-foreground">
                  {t("settings.tags_count", { count: tag.count })}
                </span>
                <div className="ml-auto flex gap-1">
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="size-6 text-muted-foreground"
                    aria-label={t("settings.tags_edit_aria", { name: tag.name })}
                    onClick={() => {
                      setDeletingId(null);
                      setEditingId(tag.id);
                    }}
                  >
                    <IconPencil className="size-3" />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="size-6 text-muted-foreground hover:text-destructive"
                    aria-label={t("settings.tags_delete_aria", { name: tag.name })}
                    onClick={() => {
                      setEditingId(null);
                      setDeletingId(tag.id);
                    }}
                  >
                    <IconTrash className="size-3" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {addOpen ? (
        <AddTagForm onDone={() => setAddOpen(false)} />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setAddOpen(true)}
        >
          <IconPlus className="size-3" />
          {t("settings.tags_add_button")}
        </Button>
      )}
    </div>
  );
}
