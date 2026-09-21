export type EntryStatus = 'draft' | 'published' | (string & {})
export type SortField = 'id' | 'createdAt'
export type SortDirection = 'asc' | 'desc'

export type Pagination = {
  currentPage: number
  totalPages: number
  totalCount: number
  limit: number
}

export type UpdatedBy = { id: number; name: string | null }

export type Entry<TContent extends Record<string, unknown> = Record<string, unknown>> = {
  id: number
  tenantId: number | null
  collectionId: number
  content: TContent
  updatedById: number | null
  updatedBy?: UpdatedBy | null
  status: EntryStatus
  locale: string
  translationGroupId: string | null
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type CollectionField = {
  id?: string
  name: string
  label?: string
  type: string
  required?: boolean
  multiple?: boolean
  options?: Array<{ label?: string; value: string }>
  [key: string]: unknown
}

export type Collection = {
  id: number
  tenantId: number | null
  name: string
  slug: string
  type: 'collection' | 'global' | (string & {})
  enableTrash: boolean
  localized: boolean
  fields: CollectionField[]
  createdAt: string
  updatedAt: string
}

export type CollectionEntries<TContent extends Record<string, unknown>> = {
  type: 'collection'
  entries: Entry<TContent>[]
  pagination: Pagination
}

export type GlobalEntry<TContent extends Record<string, unknown>> = {
  type: 'global'
  entry: Entry<TContent> | null
}

export type EntryList<TContent extends Record<string, unknown>> =
  | CollectionEntries<TContent>
  | GlobalEntry<TContent>

export type ExactFilters<TContent extends Record<string, unknown>> = Partial<{
  [Key in keyof TContent as TContent[Key] extends string | boolean ? Key : never]: Extract<
    TContent[Key],
    string | boolean
  >
}>

export type ListEntriesOptions<TContent extends Record<string, unknown>> = {
  page?: number
  limit?: number
  locale?: string
  status?: EntryStatus | 'all'
  trash?: boolean
  sortBy?: SortField
  sortDir?: SortDirection
  filters?: ExactFilters<TContent>
}

export type EntryWriteOptions = {
  status?: EntryStatus
  locale?: string
  translationGroupId?: string
}

export type MorphicClientOptions = {
  /** CMS origin, for example https://cms.example.com (without /api). */
  baseUrl: string
  /** Keep this server-side; browser bundles expose API keys to visitors. */
  apiKey?: string
  /** Required for regular users in a multi-tenant CMS. */
  tenantId?: number | string
  fetch?: typeof globalThis.fetch
  headers?: HeadersInit
}

export type MorphicApiErrorDetails = unknown

export class MorphicApiError extends Error {
  readonly status: number
  readonly details: MorphicApiErrorDetails

  constructor(message: string, status: number, details?: MorphicApiErrorDetails) {
    super(message)
    this.name = 'MorphicApiError'
    this.status = status
    this.details = details
  }
}

type RequestOptions = RequestInit & { query?: URLSearchParams }

const normalizeBaseUrl = (baseUrl: string) => baseUrl.replace(/\/+$/, '')

const parseResponse = async <T>(response: Response): Promise<T> => {
  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text()

  if (!response.ok) {
    const error = payload as { error?: string; message?: string; details?: unknown }
    throw new MorphicApiError(
      error?.error || error?.message || `Morphic CMS request failed (${response.status})`,
      response.status,
      error?.details ?? payload
    )
  }

  return payload as T
}

export const createMorphicClient = (options: MorphicClientOptions) => {
  const fetcher = options.fetch || globalThis.fetch
  if (!fetcher) throw new Error('A Fetch implementation is required to use @morphic-cms/sdk.')

  const request = async <T>(path: string, requestOptions: RequestOptions = {}) => {
    const url = new URL(`/api${path}`, normalizeBaseUrl(options.baseUrl))
    requestOptions.query?.forEach((value, key) => url.searchParams.append(key, value))
    const headers = new Headers(options.headers)
    headers.set('Accept', 'application/json')
    if (options.apiKey) headers.set('Authorization', `Bearer ${options.apiKey}`)
    if (options.tenantId !== undefined) headers.set('X-Tenant-ID', String(options.tenantId))
    if (requestOptions.body) headers.set('Content-Type', 'application/json')

    const response = await fetcher(url, { ...requestOptions, headers })
    return parseResponse<T>(response)
  }

  const entries = {
    list: async <TContent extends Record<string, unknown> = Record<string, unknown>>(
      collection: string | number,
      listOptions: ListEntriesOptions<TContent> = {}
    ): Promise<EntryList<TContent>> => {
      const query = new URLSearchParams()
      for (const key of ['page', 'limit', 'locale', 'status', 'trash', 'sortBy', 'sortDir'] as const) {
        const value = listOptions[key]
        if (value !== undefined) query.set(key, String(value))
      }
      for (const [field, value] of Object.entries(listOptions.filters || {})) {
        if (value !== undefined) query.set(`filter[${field}]`, String(value))
      }
      return request<EntryList<TContent>>(`/collections/${encodeURIComponent(String(collection))}/entries`, { query })
    },

    get: async <TContent extends Record<string, unknown> = Record<string, unknown>>(
      id: number,
      getOptions: Pick<ListEntriesOptions<TContent>, 'locale' | 'status'> = {}
    ): Promise<Entry<TContent>> => {
      const query = new URLSearchParams()
      if (getOptions.locale) query.set('locale', getOptions.locale)
      if (getOptions.status) query.set('status', getOptions.status)
      const response = await request<{ entry: Entry<TContent>; updatedBy: UpdatedBy | null }>(
        `/entries/${id}`,
        { query }
      )
      return { ...response.entry, updatedBy: response.updatedBy }
    },

    create: async <TContent extends Record<string, unknown>>(
      collection: string | number,
      content: TContent,
      writeOptions: EntryWriteOptions = {}
    ): Promise<Entry<TContent>> => {
      const response = await request<{ success: boolean; entry: Entry<TContent> }>(
        `/collections/${encodeURIComponent(String(collection))}/entries`,
        { method: 'POST', body: JSON.stringify({ ...content, ...writeOptions }) }
      )
      return response.entry
    },

    update: async <TContent extends Record<string, unknown>>(
      id: number,
      content: TContent,
      writeOptions: Omit<EntryWriteOptions, 'translationGroupId'> = {}
    ): Promise<Entry<TContent>> => {
      const response = await request<{ success: boolean; entry: Entry<TContent> }>(
        `/entries/${id}`,
        { method: 'PUT', body: JSON.stringify({ ...content, ...writeOptions }) }
      )
      return response.entry
    },

    delete: async (id: number, options: { force?: boolean } = {}): Promise<{ message?: string }> => {
      const query = new URLSearchParams()
      if (options.force) query.set('force', 'true')
      const response = await request<{ success: boolean; message?: string }>(`/entries/${id}`, {
        method: 'DELETE',
        query,
      })
      return { message: response.message }
    },
  }

  return {
    collections: {
      list: async (): Promise<Collection[]> =>
        (await request<{ collections: Collection[] }>('/collections')).collections,
    },
    entries,
  }
}

export type MorphicClient = ReturnType<typeof createMorphicClient>
