import { AlertTriangle, ArrowRight, ExternalLink, UserCheck } from "lucide-react";
import { OutcomeSpectrum } from "@/components/charts/OutcomeSpectrum";
import { CodeTabs, snippetsFor } from "@/components/dashboard/CodeTabs";
import { CodeBlock } from "@/components/site/CodePanel";
import { Badge } from "@/components/ui/badge";
import { API_BASE_URL } from "@/lib/site";

export interface Core {
  as_of?: string;
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
export interface PlaygroundRequest { pack: string; scenario_type: string; jurisdiction: string; inputs: Record<string, unknown>; as_of?: string; reference?: string }

const humanize = (s: string) => s.replace(/_/g, " ");
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const key = (r: { rule_id: string; rule_version: string }) => `${r.rule_id}@${r.rule_version}`;

/**
 * One assessment, explained: where the outcome sits on its scale, what to do, and the chain of rules that led there
 * (and the rules that did not apply). `request` is omitted for stored audit records, which keep only a hash of the inputs.
 */
export function AssessmentResult({ core, request, outcomes, notTriggered, compare }: {
  core: Core; request?: PlaygroundRequest; outcomes: string[]; notTriggered?: { id: string; title: string }[]; compare?: Core | null;
}) {
  const diff = compare ? {
    added: compare.reasons.filter((r) => !core.reasons.some((x) => key(x) === key(r))),
    removed: core.reasons.filter((r) => !compare.reasons.some((x) => key(x) === key(r))),
  } : null;

  return (
    <div className="space-y-6">
      <section className="bg-card rounded-xl border p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground font-mono text-[0.625rem] tracking-wider uppercase">Outcome</p>
          <p className="text-muted-foreground text-xs">{core.pack.id} v{core.pack.version} <Badge variant="outline" size="sm" className="ml-1">{core.pack.status}</Badge>{core.as_of && <> · rules as of {core.as_of}</>}</p>
        </div>
        <p className="font-display mt-3 text-3xl tracking-tight">{sentence(humanize(core.outcome))}</p>
        <div className="mt-5"><OutcomeSpectrum outcomes={outcomes} active={core.outcome} /></div>
        <div className="mt-5 flex flex-col gap-2 text-sm">
          {core.escalation_recommended && <p className="flex items-center gap-2"><AlertTriangle className="text-warning size-4 shrink-0" aria-hidden />Escalation to a person is recommended.</p>}
          {core.human_review_recommended && <p className="text-muted-foreground flex items-center gap-2"><UserCheck className="size-4 shrink-0" aria-hidden />Human review recommended{core.pack.status !== "verified" ? ` (this pack is ${core.pack.status})` : ""}.</p>}
        </div>
      </section>

      {compare && diff && (
        <section className="rounded-xl border border-dashed p-5">
          <h3 className="font-display text-base">Compared with {compare.as_of}</h3>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <Badge variant="outline">{humanize(core.outcome)} <span className="text-muted-foreground ml-1">on {core.as_of}</span></Badge><ArrowRight className="text-muted-foreground size-4" aria-hidden />
            <Badge variant={compare.outcome === core.outcome ? "outline" : "amber"}>{humanize(compare.outcome)} <span className="text-muted-foreground ml-1">on {compare.as_of}</span></Badge>
          </div>
          {diff.added.length + diff.removed.length === 0 ? <p className="text-muted-foreground mt-3 text-sm">The same rules applied on both dates, so nothing changed for these facts.</p> : (
            <ul className="mt-3 space-y-1 font-mono text-xs">
              {diff.removed.map((r) => <li key={key(r)} className="text-muted-foreground">only on {core.as_of}: {key(r)} {r.title}</li>)}
              {diff.added.map((r) => <li key={key(r)} className="text-foreground">only on {compare.as_of}: {key(r)} {r.title}</li>)}
            </ul>
          )}
        </section>
      )}

      <Section title="What to do" empty="No actions required for these facts." count={core.required_actions.length}>
        <ol className="space-y-px">
          {core.required_actions.map((a, i) => (
            <li key={a.id} className="flex gap-3 py-3 text-sm">
              <span className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-xs">{i + 1}</span>
              <span><span className="block">{a.description}</span><span className="text-muted-foreground mt-1 block font-mono text-xs">{a.id} from {a.rule_id}</span></span>
            </li>
          ))}
        </ol>
      </Section>

      {core.missing_information.length > 0 && (
        <Section title="Missing information" count={core.missing_information.length}>
          <ul className="divide-y divide-dashed">
            {core.missing_information.map((m) => (<li key={m.path} className="py-3 text-sm">{m.description}<span className="text-muted-foreground ml-2 font-mono text-xs">{m.path}</span></li>))}
          </ul>
        </Section>
      )}

      <Section title="How it decided" empty="No rule matched, so the pack's default outcome applies." count={core.reasons.length}>
        <ol className="relative ml-3 border-l border-dashed pt-2">
          {core.reasons.map((r) => (
            <li key={r.rule_id} className="relative pb-5 pl-6">
              <span className="bg-accent absolute top-1.5 -left-[5px] size-2.5 rounded-full" aria-hidden />
              <p className="text-sm font-medium">{r.title}</p>
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{r.explanation}</p>
              <p className="text-muted-foreground mt-1.5 font-mono text-xs">{key(r)} · effective {r.effective_from}{r.effective_to ? ` to ${r.effective_to}` : ""}</p>
              {r.source && (
                <p className="mt-1 text-xs">
                  {r.source.url ? <a href={r.source.url} target="_blank" rel="noopener noreferrer" className="text-accent-hover inline-flex items-center gap-1 underline underline-offset-4">{r.source.instrument}{r.source.section ? `, ${r.source.section}` : ""}<ExternalLink className="size-3" aria-hidden /></a> : <span>{r.source.instrument}{r.source.section ? `, ${r.source.section}` : ""}</span>}
                  {r.source.retrieved && <span className="text-muted-foreground"> (retrieved {r.source.retrieved})</span>}
                </p>
              )}
            </li>
          ))}
          <li className="relative pl-6"><span className="absolute top-1.5 -left-[5px] size-2.5 rounded-full border-2" style={{ borderColor: "var(--series-1)", background: "var(--card)" }} aria-hidden /><p className="text-sm">Result: <b className="font-medium">{humanize(core.outcome)}</b></p></li>
        </ol>
        {notTriggered && notTriggered.length > 0 && (
          <details className="mt-4">
            <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm">{notTriggered.length} rule{notTriggered.length === 1 ? "" : "s"} considered but not triggered</summary>
            <ul className="text-muted-foreground mt-2 space-y-1 text-xs">{notTriggered.map((r) => <li key={r.id}><span className="font-mono">{r.id}</span> {r.title}</li>)}</ul>
          </details>
        )}
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
        <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-sm">{request ? "Use this in your code" : "Show the stored response"}</summary>
        <div className="mt-3 space-y-3">
          {request && <CodeTabs snippets={snippetsFor(API_BASE_URL, request)} />}
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
