import { describe, expect, it, vi } from 'vitest'
import { createMorphicClient, type EntryFilters, type ExactFilters, type ListEntriesOptions } from './index.js'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

describe('createMorphicClient', () => {
  it('encodes operator filters alongside scalar equality and schema sorting', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ type: 'collection', entries: [] }))
    const cms = createMorphicClient({ baseUrl: 'https://cms.example.com', fetch })
    await cms.entries.list('posts', {
      page: 2,
      limit: 10,
      filters: {
        title: { icontains: 'Hello %_\\ &+=世界' },
        publish_date: { gte: '2026-10-01', lte: '2026-10-31' },
        category: 42,
        featured: false,
        priority: { eq: 'high' },
        omitted: undefined,
      },
      sortBy: 'publish_date',
      sortDir: 'desc',
    })
    const url = fetch.mock.calls[0][0] as URL
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: '2', limit: '10', sortBy: 'publish_date', sortDir: 'desc',
      'filter[title][icontains]': 'Hello %_\\ &+=世界',
      'filter[publish_date][gte]': '2026-10-01',
      'filter[publish_date][lte]': '2026-10-31',
      'filter[category]': '42', 'filter[featured]': 'false', 'filter[priority][eq]': 'high',
    })
    expect(url.search).toContain('filter%5Btitle%5D%5Bicontains%5D=Hello+%25_%5C+%26%2B%3D%E4%B8%96%E7%95%8C')
    expect(url.search).not.toContain('object')
  })

  it.each([
    { date: { gte: '2026-10-01' } },
    { date: { lte: '2026-10-31' } },
    { date: { gte: '2026-10-25', lte: '2026-10-25' } },
    { date: { eq: '2026-10-25' } },
    { date: '2026-10-25' },
    { category: { eq: 42 }, featured: { eq: false }, title: { eq: 'Works' } },
  ])('preserves filter values for %j', async (filters) => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({}))
    await createMorphicClient({ baseUrl: 'https://cms.example.com', fetch }).entries.list('posts', { filters })
    const params = (fetch.mock.calls[0][0] as URL).searchParams
    for (const [field, value] of Object.entries(filters)) {
      if (typeof value === 'object') {
        for (const [operator, operand] of Object.entries(value)) {
          expect(params.get(`filter[${field}][${operator}]`)).toBe(String(operand))
        }
      } else expect(params.get(`filter[${field}]`)).toBe(value)
    }
  })

  it('omits absent options so server defaults apply', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({}))
    await createMorphicClient({ baseUrl: 'https://cms.example.com', fetch }).entries.list('posts')
    expect((fetch.mock.calls[0][0] as URL).search).toBe('')
  })

  it('supports typed optional fields and retains the ExactFilters export', () => {
    type Post = { title: string; category?: number | null; featured: boolean; date: string | null; group: { title: string } }
    const exact: ExactFilters<Post> = { title: 'Hello', featured: false }
    const options: ListEntriesOptions<Post> = {
      filters: { ...exact, category: { eq: 42 }, date: { lte: '2026-10-31' } },
      sortBy: 'title', sortDir: 'asc',
    }
    // @ts-expect-error Nested content is not a filterable scalar field.
    const nested: EntryFilters<Post> = { group: { eq: { title: 'Hello' } } }
    // @ts-expect-error Equality cannot be combined with a date range.
    const conflicting: EntryFilters<Post> = { date: { eq: '2026-10-01', gte: '2026-10-01' } }
    // @ts-expect-error No case-insensitive equality operator exists.
    const unsupported: EntryFilters<Post> = { title: { ieq: 'Hello' } }
    expect(options.filters?.category).toEqual({ eq: 42 })
    void [nested, conflicting, unsupported]
  })

  it('preserves backend validation errors for invalid filters and sorts', async () => {
    const details = { field: 'publish_date' }
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ error: 'Invalid filter', details }, 400))
    await expect(createMorphicClient({ baseUrl: 'https://cms.example.com', fetch }).entries.list('posts', {
      filters: { publish_date: { gte: '2026-10-31', lte: '2026-10-01' } },
    })).rejects.toMatchObject({ name: 'MorphicApiError', status: 400, details })
  })

  it('serializes tenant, pagination, and multiple exact filters', async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({ type: 'collection', entries: [], pagination: { currentPage: 1, totalPages: 0, totalCount: 0, limit: 10 } })
    )
    const cms = createMorphicClient({ baseUrl: 'https://cms.example.com/', apiKey: 'secret', tenantId: 12, fetch })

    await cms.entries.list<{ is_in_review: 'Yes' | 'No'; featured: boolean }>('posts', {
      page: 1,
      limit: 10,
      filters: { is_in_review: 'Yes', featured: true },
    })

    const [url, init] = fetch.mock.calls[0]
    expect(url.toString()).toBe('https://cms.example.com/api/collections/posts/entries?page=1&limit=10&filter%5Bis_in_review%5D=Yes&filter%5Bfeatured%5D=true')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer secret')
    expect(new Headers(init.headers).get('X-Tenant-ID')).toBe('12')
  })

  it('unwraps a single-entry REST response', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ entry: { id: 35, content: { title: 'Hello' } }, updatedBy: { id: 1, name: 'Bayu' } }))
    const entry = await createMorphicClient({ baseUrl: 'https://cms.example.com', fetch }).entries.get<{ title: string }>(35)
    expect(entry).toMatchObject({ id: 35, content: { title: 'Hello' }, updatedBy: { name: 'Bayu' } })
  })

  it('throws a typed error for API failures', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ error: 'Collection not found' }, 404))
    await expect(createMorphicClient({ baseUrl: 'https://cms.example.com', fetch }).entries.list('missing')).rejects.toEqual(
      expect.objectContaining({ name: 'MorphicApiError', status: 404, message: 'Collection not found' })
    )
  })
})
