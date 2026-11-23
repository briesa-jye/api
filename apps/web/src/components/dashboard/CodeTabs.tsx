"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { CodeBlock } from "@/components/site/CodePanel";

export interface Snippet { id: string; label: string; code: string }

/** The same request in several languages, with a copy button. Snippets are built by the caller from the request, never from untrusted markup. */
export function CodeTabs({ snippets }: { snippets: Snippet[] }) {
  const [tab, setTab] = useState(snippets[0]!.id);
  const [copied, setCopied] = useState(false);
  const cur = snippets.find((s) => s.id === tab) ?? snippets[0]!;
  const copy = async () => {
    try { await navigator.clipboard.writeText(cur.code.replace(/^\$ /gm, "")); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked: the text is still selectable */ }
  };
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div role="tablist" className="flex gap-1">
          {snippets.map((s) => <button key={s.id} role="tab" type="button" aria-selected={s.id === tab} onClick={() => setTab(s.id)} className={`rounded-md px-2.5 py-1 text-xs ${s.id === tab ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{s.label}</button>)}
        </div>
        <button type="button" onClick={copy} className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs">{copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}{copied ? "Copied" : "Copy"}</button>
      </div>
      <CodeBlock code={cur.code} />
    </div>
  );
}

export function snippetsFor(baseUrl: string, request: object): Snippet[] {
  const body = JSON.stringify(request, null, 2);
  const indent = (s: string, n: number) => s.split("\n").map((l, i) => (i ? " ".repeat(n) + l : l)).join("\n");
  return [
    { id: "curl", label: "curl", code: `$ curl ${baseUrl}/v1/assess \\\n  -H "Authorization: Bearer $BRIESA_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(request)}'` },
    { id: "ts", label: "TypeScript", code: `const res = await fetch("${baseUrl}/v1/assess", {\n  method: "POST",\n  headers: {\n    Authorization: \`Bearer \${process.env.BRIESA_KEY}\`,\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify(${indent(body, 2)}),\n});\nconst assessment = await res.json();` },
    { id: "py", label: "Python", code: `import os, requests\n\nres = requests.post(\n    "${baseUrl}/v1/assess",\n    headers={"Authorization": f"Bearer {os.environ['BRIESA_KEY']}"},\n    json=${indent(body.replace(/\btrue\b/g, "True").replace(/\bfalse\b/g, "False").replace(/\bnull\b/g, "None"), 4)},\n)\nassessment = res.json()` },
  ];
}
