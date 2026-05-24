import * as React from "react";
import { DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";

type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        root: "select-none",
        months: "flex flex-col",
        month: "space-y-4",
        month_caption: "flex items-center justify-center pt-1 pb-2",
        caption_label: "text-sm font-medium",
        nav: "flex items-center justify-between absolute left-1 right-1 top-4",
        button_previous: cn(
          "inline-flex size-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground",
          "hover:bg-muted hover:text-foreground transition-colors",
        ),
        button_next: cn(
          "inline-flex size-7 items-center justify-center rounded-md border border-border bg-background text-muted-foreground",
          "hover:bg-muted hover:text-foreground transition-colors",
        ),
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 text-center text-xs font-normal text-muted-foreground",
        weeks: "mt-2",
        week: "flex w-full mt-1",
        day: "relative w-9 text-center text-sm",
        day_button: cn(
          "inline-flex size-9 items-center justify-center rounded-md text-sm font-normal",
          "hover:bg-muted hover:text-foreground transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:hover:bg-primary/90",
          "aria-disabled:pointer-events-none aria-disabled:opacity-30",
        ),
        today: "[&>button]:font-semibold [&>button]:border [&>button]:border-primary/40",
        outside: "text-muted-foreground opacity-50",
        disabled: "text-muted-foreground opacity-30",
        hidden: "invisible",
        ...classNames,
      }}
      {...props}
    />
  );
}

export { Calendar, type CalendarProps };
