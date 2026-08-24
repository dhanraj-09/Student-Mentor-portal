import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  parsePageRequest,
  toPage,
} from '../../../src/utils/pagination.js';

describe('parsePageRequest', () => {
  it('defaults to the first page', () => {
    expect(parsePageRequest({})).toEqual({
      page: 1,
      limit: DEFAULT_PAGE_SIZE,
      offset: 0,
    });
  });

  it('computes the offset from the page number', () => {
    expect(parsePageRequest({ page: '3', limit: '10' })).toEqual({
      page: 3,
      limit: 10,
      offset: 20,
    });
  });

  it('caps the limit, so a caller cannot ask for the whole table', () => {
    expect(parsePageRequest({ limit: '999999' }).limit).toBe(MAX_PAGE_SIZE);
  });

  it.each([
    ['a missing value', {}],
    ['a non-numeric page', { page: 'abc' }],
    ['a negative page', { page: '-3' }],
    ['a zero page', { page: '0' }],
    ['a fractional page', { page: '1.5' }],
    ['an array from a repeated query param', { page: ['1', '2'] }],
  ])('falls back to page 1 for %s', (_label, query) => {
    // A bad page number in a URL should show the first page, not a 400.
    expect(parsePageRequest(query as Record<string, unknown>).page).toBe(1);
  });

  it('falls back to the default size for a nonsense limit', () => {
    expect(parsePageRequest({ limit: '-5' }).limit).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageRequest({ limit: 'lots' }).limit).toBe(DEFAULT_PAGE_SIZE);
  });
});

describe('toPage', () => {
  const request = { page: 1, limit: 2, offset: 0 };

  it('reports more pages when an extra row came back', () => {
    // The caller fetches limit + 1 so this can be answered without a COUNT.
    const page = toPage(['a', 'b', 'c'], request);

    expect(page.items).toEqual(['a', 'b']);
    expect(page.hasMore).toBe(true);
  });

  it('does not leak the probe row into the results', () => {
    expect(toPage(['a', 'b', 'c'], request).items).toHaveLength(request.limit);
  });

  it('reports the last page when the rows exactly fill it', () => {
    const page = toPage(['a', 'b'], request);

    expect(page.items).toEqual(['a', 'b']);
    expect(page.hasMore).toBe(false);
  });

  it('handles an empty result', () => {
    expect(toPage([], request)).toEqual({
      items: [],
      page: 1,
      pageSize: 2,
      hasMore: false,
    });
  });

  it('carries the requested page and size back to the client', () => {
    const page = toPage(['a'], { page: 4, limit: 10, offset: 30 });

    expect(page.page).toBe(4);
    expect(page.pageSize).toBe(10);
  });
});
