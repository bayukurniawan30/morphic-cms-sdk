import { describe, expect, it, vi } from 'vitest'
import { createMorphicClient } from './index.js'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

describe('createMorphicClient', () => {
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
