"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/input";

export function OneTimeSecret({ secret, label, kind }: { secret: string; label: string; kind: "API key" | "signing secret" }) {
  const [copied, setCopied] = useState(false);
  return (
    <Notice tone="success" className="space-y-3">
      <p>
        <strong className="text-foreground">{kind} for {label}.</strong> Copy it now. It is shown once and cannot be retrieved again.
      </p>
      <div className="flex items-center gap-2">
        <code className="bg-background/60 min-w-0 flex-1 overflow-x-auto rounded-md border px-3 py-2 font-mono text-xs whitespace-nowrap">{secret}</code>
        <Button type="button" variant="outline" size="icon" aria-label="Copy to clipboard"
          onClick={async () => { await navigator.clipboard.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>
    </Notice>
  );
}
