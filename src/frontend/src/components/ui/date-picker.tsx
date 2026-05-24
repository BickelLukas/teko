import * as React from "react";
import { format } from "date-fns";
import { IconCalendar } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { PopoverRoot, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type DatePickerProps = {
  value: Date | null;
  onChange: (date: Date | null) => void;
  min?: Date;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

function DatePicker({ value, onChange, min, placeholder, className, disabled }: DatePickerProps) {
  const { t } = useTranslation("common");
  const [open, setOpen] = React.useState(false);

  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <IconCalendar className="mr-2 size-4 shrink-0" />
          {value ? format(value, "PP") : (placeholder ?? t("date_picker.pick_date"))}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={value ?? undefined}
          onSelect={(date) => {
            onChange(date ?? null);
            setOpen(false);
          }}
          disabled={min ? { before: min } : undefined}
          autoFocus
        />
        {value && (
          <div className="border-t border-border p-2">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="w-full"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              {t("date_picker.clear")}
            </Button>
          </div>
        )}
      </PopoverContent>
    </PopoverRoot>
  );
}

export { DatePicker };
