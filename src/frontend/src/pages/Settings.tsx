import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { z } from "zod";
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
import { fetchMe, updatePreferences } from "@/lib/api";
import { parseEnum } from "@/lib/utils";

function buildFormSchema(timeFormatMsg: string) {
  return z.object({
    display_name: z.string().optional(),
    notification_time: z
      .string()
      .regex(/^$|^(?:[01]\d|2[0-3]):[0-5]\d$/, timeFormatMsg)
      .optional(),
  });
}
type FormValues = z.infer<ReturnType<typeof buildFormSchema>>;

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

  const FormSchema = buildFormSchema(t("common:form.time_format", { ns: "common" }));
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
        notification_time: me.notification_time ?? "",
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
        notification_time: data.notification_time ? data.notification_time : null,
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
          <CardContent className="space-y-4 pt-5">
            <p className="text-xs text-muted-foreground">{t("settings.notifications_disabled")}</p>
            <div>
              <label
                htmlFor="notification-time"
                className="mb-1 block text-xs font-medium text-muted-foreground"
              >
                {t("settings.digest_time_label")}
              </label>
              <Input
                id="notification-time"
                placeholder="08:00"
                disabled
                className="opacity-50"
                value={me?.notification_time ?? ""}
                readOnly
              />
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
