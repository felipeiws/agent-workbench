import type { HTMLAttributes } from "react";

import { cn } from "../lib/utils";

export function Separator({
  className,
  orientation = "horizontal",
  ...props
}: HTMLAttributes<HTMLDivElement> & { orientation?: "horizontal" | "vertical" }) {
  return (
    <div
      className={cn(
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        "bg-white/10",
        className
      )}
      {...props}
    />
  );
}
