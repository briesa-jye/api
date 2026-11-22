import { AlertTriangle, ExternalLink, UserCheck } from "lucide-react";
import { CodeBlock } from "@/components/site/CodePanel";
import { Badge } from "@/components/ui/badge";
import { API_BASE_URL } from "@/lib/site";

interface Core {
  outcome: string;
  required_actions: { id: string; description: string; rule_id: string }[];
  missing_information: { path: string; description: string; rule_id: string }[];
  escalation_recommended: boolean;
  reasons: { rule_id: string; rule_version: string; title: string; explanation: string; source: { instrument: string; section?: string; url?: string; retrieved?: string } | null; effective_from: string; effective_to: string | null }[];
  rules_pending_review: { rule_id: string; rule_version: string; title: string }[];
  pack: { id: string; version: string; status: string };
  disclaimer: string;
  human_review_recommended: boolean;
}
export interface PlaygroundRequest { pack: string; scenario_type: string; jurisdiction: string; inputs: Record<string, unknown> }

const humanize = (s: string) => s.replace(/_/g, " ");

export function AssessmentResult({ core, request, outcomes }: { core: Core; request: PlaygroundRequest; outcomes: string[] }) {
  const rank = outcomes.indexOf(core.outcome);
  const variant = rank <= 0 ? "outline" : rank === outcomes.length - 1 ? "amber" : "subtle";
  const curl = `curl ${API_BASE_URL}/v1/assess \\\n  -H "Authorization: Bearer $BRIESA_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(request)}'`;

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-xl border p-5">
        <p className="text-muted-foreground font-mono text-[0.625rem] tracking-wider uppercase">Outcome</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Badge variant={variant} size="lg" className="text-sm">{humanize(core.outcome)}</Badge>
          <span className="text-muted-foreground text-xs">
            {core.pack.id} v{core.pack.version} <Badge variant="outline" size="sm" className="ml-1">{core.pack.status}</Badge>
          </span>
        </div>
        <div className="mt-4 flex flex-col gap-2 text-sm">
          {core.escalation_recommended && <p className="flex items-center gap-2"><AlertTriangle className="text-warning size-4 shrink-0" aria-hidden />Escalation to a person is recommended.</p>}
          {core.human_review_recommended && <p className="text-muted-foreground flex items-center gap-2"><UserCheck className="size-4 shrink-0" aria-hidden />Human review recommended{core.pack.status !== "verified" ? ` (this pack is ${core.pack.status}, not verified).` : "."}</p>}
        </div>
      </div>

      <Section title="Required actions" empty="No actions required for these facts." count={core.required_actions.length}>
        <ul className="divide-y divide-dashed">
          {core.required_actions.map((a) => (
            <li key={a.id} className="py-3 text-sm"><p>{a.description}</p><p className="text-muted-foreground mt-1 font-mono text-xs">{a.id} from {a.rule_id}</p></li>
          ))}
        </ul>
      </Section>

      {core.missing_information.length > 0 && (
        <Section title="Missing information" count={core.missing_information.length}>
          <ul className="divide-y divide-dashed">
            {core.missing_information.map((m) => (<li key={m.path} className="py-3 text-sm">{m.description}<span className="text-muted-foreground ml-2 font-mono text-xs">{m.path}</span></li>))}
          </ul>
        </Section>
      )}

      <Section title="Why: reasons with sources" empty="No rule matched, so the pack's default outcome applies." count={core.reasons.length}>
        <ul className="divide-y divide-dashed">
          {core.reasons.map((r) => (
            <li key={r.rule_id} className="space-y-1.5 py-4 text-sm">
              <p className="font-medium">{r.title}</p>
              <p className="text-muted-foreground leading-relaxed">{r.explanation}</p>
              <p className="text-muted-foreground font-mono text-xs">{r.rule_id}@{r.rule_version} · effective {r.effective_from}{r.effective_to ? ` to ${r.effective_to}` : ""}</p>
              {r.source && (
                <p className="text-xs">
                  {r.source.url ? <a href={r.source.url} target="_blank" rel="noopener noreferrer" className="text-accent-hover inline-flex items-center gap-1 underline underline-offset-4">{r.source.instrument}{r.source.section ? `, ${r.source.section}` : ""}<ExternalLink className="size-3" aria-hidden /></a> : <span>{r.source.instrument}{r.source.section ? `, ${r.source.section}` : ""}</span>}
                  {r.source.retrieved && <span className="text-muted-foreground"> (retrieved {r.source.retrieved})</span>}
                </p>
              )}
            </li>
          ))}
        </ul>
      </Section>

      {core.rules_pending_review.length > 0 && (
        <div className="border-warning/40 bg-warning/10 rounded-xl border p-4 text-sm">
          <p className="font-medium">Matched but not applied: awaiting review</p>
          <p className="text-muted-foreground mt-1">These rules have no verified source yet, so they do not affect the outcome. They are why human review is recommended.</p>
          <ul className="mt-2 space-y-1 font-mono text-xs">{core.rules_pending_review.map((r) => <li key={r.rule_id}>{r.rule_id}@{r.rule_version}: {r.title}</li>)}</ul>
        </div>
      )}

      <p className="text-muted-foreground text-xs leading-relaxed">{core.disclaimer}</p>

      <details className="group">
        <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm">Show the API request and response</summary>
        <div className="mt-3 space-y-3">
          <CodeBlock label="Equivalent request" code={`$ ${curl}`} />
          <CodeBlock label="Response (without request_id and test_mode, which the API adds)" code={JSON.stringify(core, null, 2)} />
        </div>
      </details>
    </div>
  );
}

function Section({ title, count, empty, children }: { title: string; count: number; empty?: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="font-display text-base">{title} <span className="text-muted-foreground text-sm font-normal">({count})</span></h3>
      <div className="mt-2 border-t border-dashed">{count === 0 ? <p className="text-muted-foreground py-4 text-sm">{empty}</p> : children}</div>
    </section>
  );
}
