import { readOpenApi } from "@/lib/docs";

export const dynamic = "force-static";
export const GET = () => new Response(readOpenApi(), { headers: { "content-type": "application/json", "cache-control": "public, max-age=300" } });
