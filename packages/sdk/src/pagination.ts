/**
 * One page of a list, which is also an async iterable over every item on this and all later pages:
 *
 *   for await (const record of briesa.audit.list({ pack: "x" })) { ... }
 */
export class Page<T> implements AsyncIterable<T> {
  readonly data: T[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
  private readonly fetchNext: (cursor: string) => Promise<Page<T>>;

  constructor(data: T[], hasMore: boolean, nextCursor: string | null, fetchNext: (cursor: string) => Promise<Page<T>>) {
    this.data = data; this.hasMore = hasMore; this.nextCursor = nextCursor; this.fetchNext = fetchNext;
  }

  /** The next page, or null on the last one. */
  async nextPage(): Promise<Page<T> | null> {
    return this.hasMore && this.nextCursor ? this.fetchNext(this.nextCursor) : null;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    let page: Page<T> | null = this;
    while (page) { yield* page.data; page = await page.nextPage(); }
  }

  /** Collects items across pages. Set `limit` for a bound: an account can hold a lot of records. */
  async toArray(opts: { limit?: number } = {}): Promise<T[]> {
    const out: T[] = [];
    for await (const item of this) { out.push(item); if (opts.limit !== undefined && out.length >= opts.limit) break; }
    return out;
  }
}
