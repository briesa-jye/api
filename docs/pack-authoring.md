# Pack authoring guide

For subject-matter experts. You do not need to write code: a pack is a folder of YAML and JSON files.

```bash
pnpm pack:new my-industry        # creates packs/my-industry, empty but valid
pnpm pack:validate my-industry   # checks structure, sources, dates and scenarios
```

## Golden rules
1. **Cite or flag.** Every rule and obligation needs a `source` (instrument + section). If you can't cite one, set `status: needs_review` and add it to `RULES_TO_VERIFY.md`. Never guess a threshold, date or section number.
2. **needs_review rules are never applied.** The API reports them under `rules_pending_review`, but they cannot change an outcome.
3. **Decision support only.** Rules say what the law requires of the caller's facts; a human decides.

## Folder layout
```
pack.yaml        id, name, regulators, jurisdictions, version, status, maintainers, scenario types
schemas/         JSON Schema for each scenario type's inputs (use "additionalProperties": false)
rules/           one rule per file (or a list in one file)
obligations/     the catalogue of obligations
scenarios/       synthetic test cases: inputs -> expected result
SOURCES.md       every authoritative source, with the date you retrieved it
```

## pack.yaml
`status` is `draft`, `beta` or `verified`. `verified` requires a `reviewer` (name, verified_on, source_version) and **zero** `needs_review` items. Each `scenario_types` entry names its input schema and its outcome vocabulary: `order` lists outcomes lowest to highest, `default` applies when no rule matches. The assessment outcome is the highest outcome of any matching rule.

## A rule
```yaml
id: large-batch                 # lowercase, stable across versions
version: 1.0.0
title: Large batch needs review
description: Batches over 100 units need a second inspector.
jurisdictions: [AU]             # AU = all; or e.g. [NSW, VIC]
scenario_types: [inspect]       # optional; default = all
when:                           # the condition (see below)
  path: count
  op: gt
  value: 100
then:
  outcome: review               # must be in the scenario type's order
  required_actions: [{ id: second-inspector, description: Arrange a second inspector }]
  missing_information: [{ path: supplier, description: Supplier name }]
  escalate: false               # recommend human escalation
  reason: Batch size exceeds 100.
source: { instrument: Example Act 2000, section: s 12, url: "https://…", retrieved: "2026-11-01" }
effective_from: "2026-01-01"
effective_to: null              # exclusive end date, or leave out
status: active                  # active | needs_review | retired
```

### Conditions
`path` is a dot path into the caller's inputs (`party.type`). Operators: `eq neq in not_in gt gte lt lte contains exists missing`. Combine with `all`, `any`, `not`. Missing inputs never cause errors; comparisons against them are simply false (use `missing` to trigger a request for information).

### Changing a rule when the law changes
Don't edit the old rule. Give the old one an `effective_to`, and add a new file with the same `id`, a higher `version`, and `effective_from` equal to that date. The validator rejects overlapping windows. Past assessments stay reproducible because audit records store rule versions.

## Scenarios
Fixtures are regression tests and must say `synthetic: true`. They declare `as_of` (the date to evaluate at), inputs, and expected outcome, actions, reasons and missing information. `pack:validate` runs them all.
