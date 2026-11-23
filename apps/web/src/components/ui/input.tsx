import type * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "bg-input/30 border-input placeholder:text-muted-foreground h-10 w-full min-w-0 rounded-lg border px-3 text-sm transition-colors outline-none",
        "focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label data-slot="label" className={cn("text-foreground block text-sm font-medium", className)} {...props} />;
}

export function Notice({ tone = "info", className, ...props }: React.ComponentProps<"div"> & { tone?: "info" | "error" | "success" }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-lg border px-4 py-3 text-sm leading-relaxed",
        tone === "error" && "border-destructive/40 bg-destructive/10 text-foreground",
        tone === "success" && "border-success/40 bg-success/10 text-foreground",
        tone === "info" && "bg-muted/40 text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
