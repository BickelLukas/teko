import * as React from "react";
import { Popover } from "radix-ui";
import { cn } from "@/lib/utils";

const PopoverRoot = Popover.Root;
const PopoverTrigger = Popover.Trigger;

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof Popover.Content>) {
  return (
    <Popover.Portal>
      <Popover.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-auto rounded-md border border-border bg-background p-0 shadow-md outline-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2",
          className,
        )}
        {...props}
      />
    </Popover.Portal>
  );
}

export { PopoverRoot, PopoverTrigger, PopoverContent };
