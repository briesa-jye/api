import type { Store } from "@briesa/db";

/** Runs the retention job hourly. Logs counts only. Returns a stop function. */
export function startRetentionJob(store: Store, log: { info: (o: object, m: string) => void; error: (o: object, m: string) => void }, intervalMs = 3_600_000) {
  const run = async () => {
    try { log.info(await store.purgeExpired(new Date()), "retention purge"); }
    catch (e) { log.error({ err: { name: (e as Error).name } }, "retention purge failed"); }
  };
  void run();
  const t = setInterval(run, intervalMs);
  t.unref();
  return () => clearInterval(t);
}
