import "server-only";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { marked } from "marked";

const DOCS_DIR = process.env.DOCS_DIR ?? resolve(process.cwd(), "../../docs");

export const DOCS = [
  { slug: "quickstart", title: "Quickstart", blurb: "Get a key and make your first assessment." },
  { slug: "reference", title: "API reference", blurb: "Every endpoint, parameter and error." },
  { slug: "versioning", title: "Versioning and deprecation", blurb: "What can change, and how much notice you get." },
  { slug: "pack-authoring", title: "Authoring packs", blurb: "How a subject-matter expert adds or changes rules." },
] as const;

export type DocSlug = (typeof DOCS)[number]["slug"];
export const isDocSlug = (s: string): s is DocSlug => DOCS.some((d) => d.slug === s);

/** Renders one of the repo's own docs/*.md files. Trusted content: it ships in the same repository. */
export function renderDoc(slug: DocSlug): string {
  const md = readFileSync(resolve(DOCS_DIR, `${slug}.md`), "utf8")
    .replace(/\]\((quickstart|reference|versioning|pack-authoring)\.md\)/g, "](/docs/$1)")
    .replace(/\]\(openapi\.json\)/g, "](/docs/openapi.json)");
  return marked.parse(md, { gfm: true, async: false }) as string;
}

export const readOpenApi = () => readFileSync(resolve(DOCS_DIR, "openapi.json"), "utf8");
