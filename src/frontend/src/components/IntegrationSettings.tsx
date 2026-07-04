import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import { IconTrash, IconPlus, IconCopy, IconCheck } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchIntegrationTokens, createIntegrationToken, revokeIntegrationToken } from "@/lib/api";
import type { IntegrationToken } from "@teko/shared";

// ── Newly-created token — shown once, never retrievable again ─────────────────

function TokenCreatedCard({ token, onDone }: { token: string; onDone: () => void }) {
  const { t } = useTranslation("pages");
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-2">
      <p className="text-xs font-medium">{t("settings.integration_token_created_title")}</p>
      <p className="text-xs text-muted-foreground">
        {t("settings.integration_token_created_warning")}
      </p>
      <Input
        readOnly
        value={token}
        className="h-7 font-mono text-xs"
        onFocus={(e) => e.target.select()}
      />
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="outline"
          className="h-6 text-xs"
          onClick={() => {
            void navigator.clipboard.writeText(token).then(() => {
              setCopied(true);
            });
          }}
        >
          {copied ? <IconCheck className="mr-1 size-3" /> : <IconCopy className="mr-1 size-3" />}
          {copied ? t("settings.integration_copied") : t("settings.integration_copy_button")}
        </Button>
        <Button size="sm" className="h-6 text-xs" onClick={onDone}>
          {t("settings.integration_done")}
        </Button>
      </div>
    </div>
  );
}

// ── Add form ────────────────────────────────────────────────────────────────

function AddTokenForm({
  onCreated,
  onCancel,
}: {
  onCreated: (token: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("pages");
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");

  const createMutation = useMutation({
    mutationFn: () => createIntegrationToken({ label: label.trim() }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["integration-tokens"] });
      onCreated(created.token);
    },
  });

  return (
    <div className="space-y-2 rounded-md border border-border p-2">
      <Input
        autoFocus
        placeholder={t("settings.integration_label_placeholder")}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="h-7 text-sm"
        onKeyDown={(e) => {
          if (e.key === "Enter" && label.trim()) createMutation.mutate();
          if (e.key === "Escape") onCancel();
        }}
      />
      {createMutation.isError && (
        <p className="text-xs text-destructive">{t("settings.integration_save_error")}</p>
      )}
      <div className="flex gap-1">
        <Button
          size="sm"
          className="h-6 text-xs"
          disabled={createMutation.isPending || label.trim().length === 0}
          onClick={() => createMutation.mutate()}
        >
          <IconPlus className="mr-1 size-3" />
          {t("settings.integration_create")}
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={onCancel}>
          {t("settings.integration_cancel")}
        </Button>
      </div>
    </div>
  );
}

// ── Revoke confirm ──────────────────────────────────────────────────────────

function RevokeConfirm({ token, onCancel }: { token: IntegrationToken; onCancel: () => void }) {
  const { t } = useTranslation("pages");
  const queryClient = useQueryClient();

  const revokeMutation = useMutation({
    mutationFn: () => revokeIntegrationToken(token.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["integration-tokens"] });
    },
  });

  return (
    <div className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">
      <p className="font-medium text-destructive">
        {t("settings.integration_revoke_confirm", { label: token.label })}
      </p>
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="destructive"
          className="h-6 text-xs"
          disabled={revokeMutation.isPending}
          onClick={() => revokeMutation.mutate()}
        >
          {t("settings.integration_revoke_confirm_action")}
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={onCancel}>
          {t("settings.integration_cancel")}
        </Button>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function IntegrationSettings() {
  const { t } = useTranslation("pages");
  const { data: tokens = [], isLoading } = useQuery<IntegrationToken[]>({
    queryKey: ["integration-tokens"],
    queryFn: fetchIntegrationTokens,
  });

  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">{t("settings.integration_loading")}</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("settings.integration_description")}</p>

      {createdToken && (
        <TokenCreatedCard token={createdToken} onDone={() => setCreatedToken(null)} />
      )}

      {tokens.length === 0 && !addOpen ? (
        <p className="text-xs text-muted-foreground">{t("settings.integration_empty")}</p>
      ) : (
        <ul className="space-y-2">
          {tokens.map((token) => {
            if (revokingId === token.id) {
              return (
                <li key={token.id}>
                  <RevokeConfirm token={token} onCancel={() => setRevokingId(null)} />
                </li>
              );
            }
            return (
              <li
                key={token.id}
                className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{token.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {token.last_used_at
                      ? t("settings.integration_last_used", {
                          time: formatDistanceToNow(new Date(token.last_used_at), {
                            addSuffix: true,
                          }),
                        })
                      : t("settings.integration_never_used")}
                  </p>
                </div>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={t("settings.integration_revoke_aria", { label: token.label })}
                  onClick={() => setRevokingId(token.id)}
                >
                  <IconTrash className="size-3" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {addOpen ? (
        <AddTokenForm
          onCreated={(token) => {
            setCreatedToken(token);
            setAddOpen(false);
          }}
          onCancel={() => setAddOpen(false)}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setAddOpen(true)}
        >
          <IconPlus className="size-3" />
          {t("settings.integration_add_button")}
        </Button>
      )}
    </div>
  );
}
