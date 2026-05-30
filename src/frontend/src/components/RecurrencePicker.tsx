import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { describeRecurrenceLocalized } from "@/lib/recurrence";
import {
  PRESETS,
  WEEKDAYS,
  detectPreset,
  parseRuleParams,
  buildRule,
  validateRaw,
} from "@/lib/recurrence-form";
import type { Preset } from "@/lib/recurrence-form";
import { useLocale } from "@/lib/locale";
import { parseEnum } from "@/lib/utils";

export type RecurrenceValue = {
  rule: string | null;
  mode: "fixed" | "after_completion";
  windowDays: number | null;
};

type Props = {
  value: RecurrenceValue;
  onChange: (v: RecurrenceValue) => void;
  /** When true, hides the "None" option (use when a recurrence is required). */
  hideNone?: boolean;
};

type NumberFieldProps = {
  value: number;
  min: number;
  max: number;
  className?: string;
  onCommit: (value: number) => void;
};

// Holds a free-form draft while the user types so the field can be emptied or
// hold an out-of-range intermediate value. Clamping only runs on commit (blur
// or Enter), never on every keystroke.
function NumberField({ value, min, max, className, onCommit }: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  function commit() {
    const parsed = parseInt(draft, 10);
    const next = Number.isNaN(parsed) ? min : Math.min(max, Math.max(min, parsed));
    setDraft(String(next));
    onCommit(next);
  }

  return (
    <Input
      type="number"
      min={min}
      max={max}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
      className={className}
    />
  );
}

export function RecurrencePicker({ value, onChange, hideNone = false }: Props) {
  const { t } = useTranslation("common");
  const { locale } = useLocale();
  const [initialParams] = useState(() => parseRuleParams(value.rule));
  const [preset, setPreset] = useState<Preset>(() => detectPreset(value.rule));
  const [mode, setMode] = useState<"fixed" | "after_completion">(value.mode);
  const [nDays, setNDays] = useState(initialParams.nDays);
  const [nMonths, setNMonths] = useState(initialParams.nMonths);
  const [weekdays, setWeekdays] = useState<string[]>(initialParams.weekdays);
  const [monthDay, setMonthDay] = useState(initialParams.monthDay);
  const [rawRule, setRawRule] = useState(value.rule ?? "");
  const [rawError, setRawError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [windowDays, setWindowDays] = useState<number>(value.windowDays ?? 0);

  useEffect(() => {
    const rule = buildRule(preset, { nDays, nMonths, weekdays, monthDay }, rawRule);
    if (preset === "custom") {
      const err = rule ? validateRaw(rule) : null;
      setRawError(err);
      if (err) return;
    }
    onChange({ rule, mode, windowDays: preset === "none" ? null : windowDays });
  }, [preset, mode, nDays, nMonths, weekdays, monthDay, rawRule, windowDays]);

  const rule = buildRule(preset, { nDays, nMonths, weekdays, monthDay }, rawRule);
  const desc = rule ? describeRecurrenceLocalized(rule, mode, locale) : null;

  function toggleWeekday(day: string) {
    setWeekdays((prev) =>
      prev.includes(day)
        ? prev.length > 1
          ? prev.filter((d) => d !== day)
          : prev
        : [...prev, day],
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-muted-foreground">{t("recurrence.label")}</label>
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
          value={preset}
          onChange={(e) => setPreset(parseEnum(e.target.value, PRESETS, "none"))}
        >
          {!hideNone && <option value="none">{t("recurrence.none")}</option>}
          <option value="daily">{t("recurrence.daily")}</option>
          <option value="every-n-days">{t("recurrence.every_n_days")}</option>
          <option value="weekly">{t("recurrence.weekly")}</option>
          <option value="monthly-date">{t("recurrence.monthly_date")}</option>
          <option value="every-n-months">{t("recurrence.every_n_months")}</option>
          <option value="yearly">{t("recurrence.yearly")}</option>
          <option value="custom">{t("recurrence.custom")}</option>
        </select>
      </div>

      {preset === "every-n-days" && (
        <div className="flex items-center gap-2">
          <span className="text-sm">{t("recurrence.every")}</span>
          <NumberField value={nDays} min={2} max={365} onCommit={setNDays} className="w-20" />
          <span className="text-sm">{t("recurrence.days")}</span>
        </div>
      )}

      {preset === "weekly" && (
        <div className="flex flex-wrap gap-1">
          {WEEKDAYS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleWeekday(d)}
              className={`rounded px-2 py-1 text-xs font-medium border transition-colors ${
                weekdays.includes(d)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-input text-foreground"
              }`}
            >
              {t(`days.${d}`)}
            </button>
          ))}
        </div>
      )}

      {preset === "monthly-date" && (
        <div className="flex items-center gap-2">
          <span className="text-sm">{t("recurrence.on_the")}</span>
          <NumberField value={monthDay} min={1} max={31} onCommit={setMonthDay} className="w-20" />
          <span className="text-sm">{t("recurrence.of_each_month")}</span>
        </div>
      )}

      {preset === "every-n-months" && (
        <div className="flex items-center gap-2">
          <span className="text-sm">{t("recurrence.every")}</span>
          <NumberField value={nMonths} min={2} max={24} onCommit={setNMonths} className="w-20" />
          <span className="text-sm">{t("recurrence.months")}</span>
        </div>
      )}

      {preset !== "none" && (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-xs"
          >
            {showAdvanced ? t("recurrence.advanced_hide") : t("recurrence.advanced_show")}
          </Button>
          {showAdvanced && (
            <div className="mt-2">
              <Input
                value={preset === "custom" ? rawRule : (rule ?? "")}
                onChange={(e) => {
                  setPreset("custom");
                  setRawRule(e.target.value);
                }}
                placeholder="RRULE:FREQ=WEEKLY;BYDAY=MO"
                className="font-mono text-xs"
              />
              {rawError && <p className="mt-1 text-xs text-destructive">{rawError}</p>}
            </div>
          )}
        </div>
      )}

      {preset !== "none" && (
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t("recurrence.schedule_type")}
          </label>
          <div className="flex gap-2">
            {(["fixed", "after_completion"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm text-left transition-colors ${
                  mode === m
                    ? "border-primary bg-primary/10 font-medium"
                    : "border-input bg-background"
                }`}
              >
                <span className="block font-medium">
                  {m === "fixed"
                    ? t("recurrence.fixed_title")
                    : t("recurrence.after_completion_title")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {m === "fixed"
                    ? t("recurrence.fixed_description")
                    : t("recurrence.after_completion_description")}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {desc && <p className="text-sm text-muted-foreground italic">{desc}</p>}

      {preset !== "none" && (
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            {t("recurrence.window_label")}
          </label>
          <div className="flex items-center gap-2">
            <NumberField
              value={windowDays}
              min={0}
              max={365}
              onCommit={setWindowDays}
              className="w-24"
            />
            <span className="text-sm">{t("recurrence.window_days")}</span>
            {windowDays === 0 && (
              <span className="text-xs text-muted-foreground">
                {t("recurrence.window_zero_hint")}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
