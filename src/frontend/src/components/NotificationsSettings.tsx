import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { bareNotifyServiceName } from "@teko/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  fetchMe,
  fetchNotifyServices,
  updatePreferences,
  sendTestNotification,
  type TestNotificationResult,
} from "@/lib/api";

const NONE = "none";
const HA_MOBILE_APP_DOCS = "https://companion.home-assistant.io/";

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function timeToMinutes(time: string): number {
  const parts = time.split(":");
  const h = Number(parts[0] ?? "0");
  const m = Number(parts[1] ?? "0");
  return h * 60 + m;
}

type TestStatus = { ok: boolean; text: string } | null;

export function NotificationsSettings() {
  const { t } = useTranslation("pages");
  const queryClient = useQueryClient();

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const {
    data: services,
    isLoading: servicesLoading,
    refetch: refetchServices,
  } = useQuery({ queryKey: ["notify-services"], queryFn: () => fetchNotifyServices(false) });

  const [selected, setSelected] = useState<string>(NONE);
  const [digestEnabled, setDigestEnabled] = useState(true);
  const [digestTime, setDigestTime] = useState("08:00");
  const [eveningEnabled, setEveningEnabled] = useState(true);
  const [eveningTime, setEveningTime] = useState("19:00");
  const [testStatus, setTestStatus] = useState<TestStatus>(null);
  const [refreshing, setRefreshing] = useState(false);
  const touchedRef = useRef(false);

  // Initialize controls from the saved user record.
  useEffect(() => {
    if (!me) return;
    touchedRef.current = false;
    setSelected(me.notification_service ?? NONE);
    setDigestEnabled(me.notify_digest_enabled);
    setDigestTime(me.notification_time ?? "08:00");
    setEveningEnabled(me.notify_evening_reminder_enabled);
    setEveningTime(me.evening_reminder_time ?? "19:00");
  }, [me]);

  const storedId = me?.notification_service ?? null;

  // First-load suggestion: only when nothing is saved and the user hasn't
  // touched the dropdown yet. Never saved automatically — consent is explicit.
  const suggestionId = useMemo(() => {
    if (!me || me.notification_service || !services) return null;
    const slug = slugify(me.name);
    if (!slug) return null;
    const match = services.find((s) => s.service_name.toLowerCase().includes(slug));
    return match ? `notify.${match.service_name}` : null;
  }, [me, services]);

  useEffect(() => {
    if (touchedRef.current) return;
    if (suggestionId) setSelected(suggestionId);
  }, [suggestionId]);

  const availableIds = useMemo(
    () => new Set((services ?? []).map((s) => `notify.${s.service_name}`)),
    [services],
  );

  const isBroken = !!storedId && !!services && !availableIds.has(storedId);
  const showSuggestionHint = !storedId && suggestionId !== null && selected === suggestionId;
  const isEmpty = !!services && services.length === 0;

  const notifControlsDisabled = selected === NONE;

  // Warn when evening time would fire before the morning digest.
  const showBeforeMorningWarning =
    eveningEnabled &&
    !notifControlsDisabled &&
    timeToMinutes(eveningTime) <= timeToMinutes(digestTime);

  const saveMutation = useMutation({
    mutationFn: () =>
      updatePreferences({
        notification_service: selected === NONE ? null : selected,
        notify_digest_enabled: digestEnabled,
        notification_time: digestTime,
        notify_evening_reminder_enabled: eveningEnabled,
        evening_reminder_time: eveningTime,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  const testMutation = useMutation({
    mutationFn: sendTestNotification,
    onSuccess: (result: TestNotificationResult) => {
      if (result.ok) {
        setTestStatus({ ok: true, text: t("settings.notif_test_success") });
        return;
      }
      setTestStatus({ ok: false, text: testErrorText(result.error, result.message) });
      // The backend clears a 404 target; reflect that in the UI.
      if (result.error === "service_not_found") {
        void queryClient.invalidateQueries({ queryKey: ["me"] });
      }
    },
    onError: () => {
      setTestStatus({ ok: false, text: t("common:error.load_failed", { ns: "common" }) });
    },
  });

  function testErrorText(error: string, message: string): string {
    switch (error) {
      case "no_target":
        return t("settings.notif_test_no_target");
      case "service_not_found":
        return t("settings.notif_test_service_not_found");
      case "supervisor_unavailable":
        return t("settings.notif_test_unavailable");
      case "rate_limited":
        return t("settings.notif_test_rate_limited");
      default:
        return t("settings.notif_test_ha_error", { detail: message });
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await fetchNotifyServices(true);
      await refetchServices();
    } finally {
      setRefreshing(false);
    }
  }

  function handleSelect(value: string) {
    touchedRef.current = true;
    setSelected(value);
    setTestStatus(null);
  }

  const testDisabled = !storedId || testMutation.isPending;

  return (
    <div className="space-y-4">
      {isBroken && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {t("settings.notif_broken_banner")}
        </p>
      )}

      {isEmpty ? (
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("settings.notif_empty_title")}</p>
          <p className="text-xs text-muted-foreground">{t("settings.notif_empty_body")}</p>
          <a
            href={HA_MOBILE_APP_DOCS}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary underline-offset-2 hover:underline"
          >
            {t("settings.notif_empty_link")}
          </a>
        </div>
      ) : (
        <div>
          <label className="mb-1 block text-xs font-medium">
            {t("settings.notif_target_label")}
          </label>
          <div className="flex items-center gap-2">
            <SelectRoot value={selected} onValueChange={handleSelect} disabled={servicesLoading}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("settings.notif_target_none")}</SelectItem>
                {isBroken && storedId && (
                  <SelectItem value={storedId}>
                    {bareNotifyServiceName(storedId)} {t("settings.notif_unavailable_suffix")}
                  </SelectItem>
                )}
                {(services ?? []).map((s) => (
                  <SelectItem key={s.service_name} value={`notify.${s.service_name}`}>
                    {s.service_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectRoot>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
            >
              {refreshing ? t("settings.notif_refreshing") : t("settings.notif_refresh")}
            </Button>
          </div>
          {showSuggestionHint && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("settings.notif_suggested_hint")}
            </p>
          )}
        </div>
      )}

      {/* Daily digest toggle */}
      <div
        className="flex items-center justify-between gap-3"
        title={notifControlsDisabled ? t("settings.digest_toggle_disabled_hint") : undefined}
      >
        <div>
          <p className="text-sm font-medium">{t("settings.digest_toggle_label")}</p>
          <p className="text-xs text-muted-foreground">
            {notifControlsDisabled
              ? t("settings.digest_toggle_disabled_hint")
              : t("settings.digest_toggle_hint")}
          </p>
        </div>
        <Switch
          checked={digestEnabled && !notifControlsDisabled}
          onCheckedChange={setDigestEnabled}
          disabled={notifControlsDisabled}
          aria-label={t("settings.digest_toggle_label")}
        />
      </div>

      {/* Digest time */}
      <div>
        <label htmlFor="digest-time" className="mb-1 block text-xs font-medium">
          {t("settings.digest_time_label")}
        </label>
        <Input
          id="digest-time"
          type="time"
          value={digestTime}
          onChange={(e) => setDigestTime(e.target.value)}
          disabled={notifControlsDisabled || !digestEnabled}
          className="w-32"
        />
      </div>

      {/* Evening reminder toggle */}
      <div
        className="flex items-center justify-between gap-3"
        title={notifControlsDisabled ? t("settings.evening_reminder_disabled_hint") : undefined}
      >
        <div>
          <p className="text-sm font-medium">{t("settings.evening_reminder_label")}</p>
          <p className="text-xs text-muted-foreground">
            {notifControlsDisabled
              ? t("settings.evening_reminder_disabled_hint")
              : t("settings.evening_reminder_hint")}
          </p>
        </div>
        <Switch
          checked={eveningEnabled && !notifControlsDisabled}
          onCheckedChange={setEveningEnabled}
          disabled={notifControlsDisabled}
          aria-label={t("settings.evening_reminder_label")}
        />
      </div>

      {/* Evening reminder time */}
      <div>
        <label htmlFor="evening-reminder-time" className="mb-1 block text-xs font-medium">
          {t("settings.evening_reminder_time_label")}
        </label>
        <Input
          id="evening-reminder-time"
          type="time"
          value={eveningTime}
          onChange={(e) => setEveningTime(e.target.value)}
          disabled={notifControlsDisabled || !eveningEnabled}
          className="w-32"
        />
        {showBeforeMorningWarning && (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("settings.evening_reminder_warning_before_morning")}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="sm"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending
            ? t("common:actions.saving", { ns: "common" })
            : t("common:actions.save", { ns: "common" })}
        </Button>
        {saveMutation.isSuccess && (
          <span className="text-xs text-muted-foreground">
            {t("common:actions.saved", { ns: "common" })}
          </span>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => testMutation.mutate()}
          disabled={testDisabled}
        >
          {testMutation.isPending
            ? t("settings.notif_test_sending")
            : t("settings.notif_test_button")}
        </Button>
      </div>

      {testStatus && (
        <p className={testStatus.ok ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>
          {testStatus.text}
        </p>
      )}
    </div>
  );
}
