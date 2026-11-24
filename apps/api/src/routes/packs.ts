import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { Pack, PackRegistry } from "@briesa/packs";
import { ApiError } from "../errors.ts";
import { hasPackAccess } from "../keys.ts";
import { todayAU } from "../month.ts";

const summary = (p: Pack) => ({
  id: p.manifest.id, name: p.manifest.name, industry: p.manifest.industry,
  regulators: p.manifest.regulators, jurisdictions: p.manifest.jurisdictions,
  version: p.manifest.version, status: p.manifest.status, reviewer: p.manifest.reviewer ?? null,
  licence_tier: p.manifest.licence_tier,
});

/** 404 (not 403) for packs the key can't access, so unlicensed pack ids aren't enumerable. */
function accessiblePack(req: FastifyRequest, reg: PackRegistry, id: string): Pack {
  const p = reg.get(id);
  if (!p || !hasPackAccess(req.scopes, id)) throw new ApiError("not_found_error", "pack_not_found", "No such pack.");
  return p;
}

export const packRoutes: FastifyPluginAsync<{ packs: PackRegistry }> = async (app, { packs }) => {
  const visible = (req: FastifyRequest) => packs.list().filter((p) => hasPackAccess(req.scopes, p.manifest.id));

  app.get("/v1/packs", { config: { scope: "read", publishable: true } }, async (req) => ({ packs: visible(req).map(summary) }));

  app.get("/v1/packs/:id", { config: { scope: "read", publishable: true } }, async (req) => {
    const p = accessiblePack(req, packs, (req.params as { id: string }).id);
    return {
      ...summary(p),
      scenario_types: Object.fromEntries(
        Object.entries(p.manifest.scenario_types).map(([k, v]) => [
          k, { description: v.description, outcomes: v.outcome.order, input_schema: p.inputSchemas[k] },
        ]),
      ),
    };
  });

  const ruleView = (p: Pack, r: Pack["rules"][number]) => ({ pack: p.manifest.id, ...r });

  app.get("/v1/rules", { config: { scope: "read" } }, async (req) => {
    const q = req.query as { pack?: string; status?: string };
    const list = q.pack ? [accessiblePack(req, packs, q.pack)] : visible(req);
    return { rules: list.flatMap((p) => p.rules.filter((r) => !q.status || r.status === q.status).map((r) => ruleView(p, r))) };
  });

  app.get("/v1/rules/:id", { config: { scope: "read" } }, async (req) => {
    const { id } = req.params as { id: string };
    const found = visible(req).flatMap((p) => p.rules.filter((r) => r.id === id).map((r) => ruleView(p, r)));
    if (!found.length) throw new ApiError("not_found_error", "rule_not_found", "No such rule.");
    return { id, versions: found };
  });

  app.get("/v1/obligations", { config: { scope: "read" } }, async (req) => {
    const q = req.query as { pack?: string; activity?: string; jurisdiction?: string; as_of?: string };
    const asOf = q.as_of ?? todayAU();
    const list = q.pack ? [accessiblePack(req, packs, q.pack)] : visible(req);
    const out = list.flatMap((p) =>
      p.obligations
        .filter((o) => o.status !== "retired" && o.effective_from <= asOf && (!o.effective_to || asOf < o.effective_to))
        .filter((o) => !q.activity || o.applies_to.includes(q.activity))
        .filter((o) => !q.jurisdiction || o.jurisdictions.includes("AU") || o.jurisdictions.includes(q.jurisdiction as never))
        .map((o) => ({ pack: p.manifest.id, pack_status: p.manifest.status, ...o })),
    );
    return { as_of: asOf, obligations: out };
  });
};

