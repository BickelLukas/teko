import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { fetchMe, updatePreferences, fetchUsers, fetchHealth, triggerUserSync } from "@/lib/api";
import { parseEnum } from "@/lib/utils";
import { NotificationsSettings } from "@/components/NotificationsSettings";
import { TagsSettings } from "@/components/TagsSettings";
import { IntegrationSettings } from "@/components/IntegrationSettings";

const FormSchema = z.object({
  display_name: z.string().optional(),
});
type FormValues = z.infer<typeof FormSchema>;

const THEMES = ["light", "dark", "system"] as const;
type Theme = (typeof THEMES)[number];

export function SettingsPage() {
  const { t, i18n } = useTranslation("pages");
  const queryClient = useQueryClient();
  const [locale, setLocale] = useState("en");
  const [theme, setTheme] = useState<Theme>("system");
  const [weekStartDay, setWeekStartDay] = useState<0 | 1>(1);

  // Track initial locale so we can revert the preview if the user navigates away without saving
  const initialLocaleRef = useRef(i18n.language);
  const savedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (!savedRef.current && i18n.language !== initialLocaleRef.current) {
        void i18n.changeLanguage(initialLocaleRef.current);
      }
    };
    // i18n is a stable singleton; initialLocaleRef/savedRef are refs — intentionally excluded
  }, []);

  const { data: me, isLoading } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const { data: householdUsers } = useQuery({ queryKey: ["users"], queryFn: fetchUsers });
  const { data: healthData } = useQuery({ queryKey: ["health"], queryFn: fetchHealth });

  const syncMutation = useMutation({
    mutationFn: triggerUserSync,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["health"] });
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(FormSchema) });

  useEffect(() => {
    if (me) {
      reset({
        display_name: me.display_name ?? "",
      });
      setLocale(me.locale ?? "en");
      setTheme(parseEnum(me.theme, THEMES, "system"));
      setWeekStartDay(me.week_start_day === 0 ? 0 : 1);
    }
  }, [me, reset]);

  const saveMutation = useMutation({
    mutationFn: (data: FormValues) =>
      updatePreferences({
        locale,
        theme,
        week_start_day: weekStartDay,
        display_name: data.display_name ? data.display_name : null,
      }),
    onSuccess: (updated) => {
      savedRef.current = true;
      initialLocaleRef.current = updated.locale;
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
      void i18n.changeLanguage(updated.locale);
    },
  });

  // Apply locale change immediately when selector changes
  function handleLocaleChange(v: string) {
    setLocale(v);
    void i18n.changeLanguage(v);
  }

  if (isLoading) {
    return (
      <p className="p-6 text-sm text-muted-foreground">{t("common:loading", { ns: "common" })}</p>
    );
  }

  const appVersion = __APP_VERSION__;

  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-6">
      <h1 className="text-xl font-semibold">{t("settings.title")}</h1>

      {/* ── Profile ── */}
      <section aria-labelledby="profile-heading">
        <h2
          id="profile-heading"
          className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {t("settings.profile_section")}
        </h2>
        <Card>
          <CardContent className="space-y-5 pt-5">
            <div>
              <p className="mb-0.5 text-xs font-medium text-muted-foreground">
                {t("settings.signed_in_as")}
              </p>
              <p className="text-sm font-medium">{me?.name}</p>
              <p className="text-xs text-muted-foreground">{me?.ha_user_id}</p>
            </div>

            <form
              onSubmit={handleSubmit((data) => saveMutation.mutate(data))}
              className="space-y-4"
            >
              <div>
                <label htmlFor="display-name" className="mb-1 block text-xs font-medium">
                  {t("settings.display_name_label")}
                  <span className="ml-1 text-muted-foreground">
                    {t("settings.display_name_hint")}
                  </span>
                </label>
                <Input
                  id="display-name"
                  placeholder={me?.name ?? ""}
                  {...register("display_name")}
                />
                {errors.display_name && (
                  <p className="mt-1 text-xs text-destructive">{errors.display_name.message}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium">
                  {t("settings.language_label")}
                </label>
                <SelectRoot value={locale} onValueChange={handleLocaleChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="de">Deutsch</SelectItem>
                  </SelectContent>
                </SelectRoot>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium">
                  {t("settings.theme_label")}
                </label>
                <SelectRoot
                  value={theme}
                  onValueChange={(v) => setTheme(parseEnum(v, THEMES, "system"))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">{t("settings.theme_system")}</SelectItem>
                    <SelectItem value="light">{t("settings.theme_light")}</SelectItem>
                    <SelectItem value="dark">{t("settings.theme_dark")}</SelectItem>
                  </SelectContent>
                </SelectRoot>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium">
                  {t("settings.week_starts_label")}
                </label>
                <SelectRoot
                  value={String(weekStartDay)}
                  onValueChange={(v) => setWeekStartDay(Number(v) as 0 | 1)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t("settings.week_monday")}</SelectItem>
                    <SelectItem value="0">{t("settings.week_sunday")}</SelectItem>
                  </SelectContent>
                </SelectRoot>
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" size="sm" disabled={saveMutation.isPending}>
                  {saveMutation.isPending
                    ? t("common:actions.saving", { ns: "common" })
                    : t("common:actions.save", { ns: "common" })}
                </Button>
                {saveMutation.isSuccess && (
                  <p className="text-xs text-muted-foreground">
                    {t("common:actions.saved", { ns: "common" })}
                  </p>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </section>

      {/* ── Notifications ── */}
      <section aria-labelledby="notifications-heading">
        <h2
          id="notifications-heading"
          className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {t("settings.notifications_section")}
        </h2>
        <Card>
          <CardContent className="pt-5">
            <NotificationsSettings />
          </CardContent>
        </Card>
      </section>

      {/* ── Tags ── */}
      <section aria-labelledby="tags-heading">
        <h2
          id="tags-heading"
          className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {t("settings.tags_section")}
        </h2>
        <Card>
          <CardContent className="pt-5">
            <TagsSettings />
          </CardContent>
        </Card>
      </section>

      {/* ── Home Assistant integration ── */}
      <section aria-labelledby="integration-heading">
        <h2
          id="integration-heading"
          className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {t("settings.integration_section")}
        </h2>
        <Card>
          <CardContent className="pt-5">
            <IntegrationSettings />
          </CardContent>
        </Card>
      </section>

      {/* ── Household members ── */}
      <section aria-labelledby="household-heading">
        <h2
          id="household-heading"
          className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {t("settings.household_section")}
        </h2>
        <Card>
          <CardContent className="space-y-4 pt-5">
            {householdUsers && householdUsers.length > 0 ? (
              <ul className="space-y-1">
                {householdUsers.map((u) => (
                  <li key={u.id} className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{u.display_name ?? u.name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">{t("settings.household_empty")}</p>
            )}

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={syncMutation.isPending}
                onClick={() => syncMutation.mutate()}
              >
                {syncMutation.isPending
                  ? t("settings.household_syncing")
                  : t("settings.household_refresh")}
              </Button>

              {healthData?.last_user_sync_at && (
                <p className="text-xs text-muted-foreground">
                  {t("settings.household_last_synced", {
                    time: formatDistanceToNow(new Date(healthData.last_user_sync_at), {
                      addSuffix: true,
                    }),
                  })}
                </p>
              )}

              {syncMutation.isSuccess &&
                syncMutation.data &&
                (() => {
                  const { added, updated, deactivated, reactivated } = syncMutation.data;
                  const changes = added + updated + deactivated + reactivated;
                  return (
                    <p className="text-xs text-muted-foreground">
                      {changes === 0
                        ? t("settings.household_sync_uptodate")
                        : t("settings.household_sync_result", {
                            added,
                            updated,
                            deactivated,
                            reactivated,
                          })}
                    </p>
                  );
                })()}

              {syncMutation.isError && (
                <p className="text-xs text-destructive">
                  {t("common:error.load_failed", { ns: "common" })}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ── About ── */}
      <section aria-labelledby="about-heading">
        <h2
          id="about-heading"
          className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {t("settings.about_section")}
        </h2>
        <Card>
          <CardContent className="space-y-2 pt-5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {t("settings.about_version", { version: appVersion })}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <a
                href="https://github.com/BickelLukas/teko"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-2 hover:underline"
              >
                {t("settings.about_github")}
              </a>
              <span className="text-xs text-muted-foreground">{t("settings.about_license")}</span>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
