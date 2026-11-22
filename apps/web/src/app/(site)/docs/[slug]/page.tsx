import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DOCS, isDocSlug, renderDoc } from "@/lib/docs";

export const dynamicParams = false;
export const generateStaticParams = () => DOCS.map((d) => ({ slug: d.slug }));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const d = DOCS.find((x) => x.slug === slug);
  return d ? { title: d.title, description: d.blurb } : {};
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isDocSlug(slug)) notFound();
  // Content comes from this repository's own docs/*.md, not from users.
  return <article className="docs-prose" dangerouslySetInnerHTML={{ __html: renderDoc(slug) }} />;
}
