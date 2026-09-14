/**
 * Cursor-free page/limit paging for the list endpoints.
 *
 * Every list previously returned every row. That is fine for a new account
 * and quietly stops being fine as a mentor accumulates meetings, so the
 * bound is applied in SQL rather than after the rows have already been read
 * and sent across the wire.
 *
 * Offset paging is chosen deliberately: these lists are small, ordered by
 * creation time, and the UI wants page numbers. Keyset paging would be the
 * right answer for a feed with millions of rows and neither applies here.
 */

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export interface PageRequest {
  limit: number;
  offset: number;
  page: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  /** True when another page exists, so the caller need not count rows. */
  hasMore: boolean;
}

function toPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

/**
 * Reads `page` and `limit` from a query string.
 *
 * Anything unusable falls back to the default rather than erroring: a bad
 * page number in a URL should show the first page, not a 400.
 */
export function parsePageRequest(query: Record<string, unknown>): PageRequest {
  const page = toPositiveInt(query.page, 1);
  // Capped so a caller cannot ask for the whole table by passing limit=999999.
  const limit = Math.min(
    toPositiveInt(query.limit, DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE
  );
  return { limit, offset: (page - 1) * limit, page };
}

/**
 * Turns rows fetched with `limit + 1` into a page.
 *
 * Asking for one extra row reveals whether a further page exists without a
 * second COUNT query against the same table.
 */
export function toPage<T>(rows: T[], request: PageRequest): Page<T> {
  const hasMore = rows.length > request.limit;
  return {
    items: hasMore ? rows.slice(0, request.limit) : rows,
    page: request.page,
    pageSize: request.limit,
    hasMore,
  };
}
