import { cn } from "@/lib/utils";

/** Tiny JSON/curl highlighter for static, trusted snippets (no user content ever passes through here). */
function tokens(text: string) {
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?\b)|(^\$ .*$|\\$)/gm;
  const out: { t: string; c?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push({ t: text.slice(last, m.index) });
    if (m[1] && m[2]) { out.push({ t: m[1], c: "text-foreground" }, { t: m[2] }); }
    else if (m[1]) out.push({ t: m[1], c: "text-accent-hover" });
    else if (m[3]) out.push({ t: m[3], c: "text-warning" });
    else if (m[4]) out.push({ t: m[4], c: "text-success" });
    else out.push({ t: m[0], c: "text-muted-foreground" });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last) });
  return out;
}

export function CodeBlock({ code, label, className }: { code: string; label?: string; className?: string }) {
  return (
    <div className={cn("bg-[oklch(0.17_0_0)] overflow-hidden rounded-xl border", className)}>
      {label && <div className="text-muted-foreground border-b px-4 py-2 font-mono text-[0.6875rem] tracking-wide">{label}</div>}
      <pre className="text-muted-foreground overflow-x-auto p-4 font-mono text-[0.78rem] leading-relaxed" tabIndex={0}>
        <code>{tokens(code).map((s, i) => (s.c ? <span key={i} className={s.c}>{s.t}</span> : s.t))}</code>
      </pre>
    </div>
  );
}
