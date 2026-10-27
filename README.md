# @morphic-cms/sdk

Framework-neutral JavaScript and TypeScript client for the Morphic CMS REST API.

## Install

```bash
npm install @morphic-cms/sdk
```

## Usage

```ts
import { createMorphicClient } from '@morphic-cms/sdk'

type Post = {
  title: string
  slug: string
  is_in_review: 'Yes' | 'No'
  featured: boolean
  publish_date: string
  category: number
}

const cms = createMorphicClient({
  baseUrl: 'https://cms.example.com',
  apiKey: process.env.MORPHIC_API_KEY,
  tenantId: process.env.MORPHIC_TENANT_ID,
})

const posts = await cms.entries.list<Post>('posts', {
  page: 1,
  limit: 10,
  filters: {
    title: { icontains: 'hello' },
    publish_date: { gte: '2026-10-01', lte: '2026-10-31' },
    category: 42,
    is_in_review: 'Yes',
    featured: true,
  },
  sortBy: 'publish_date',
  sortDir: 'desc',
})
```

`entries.list()` returns either a paginated collection response or a global entry response, matching Morphic CMS REST behavior. Existing scalar filters such as `{ featured: true }` continue to work.

## Filtering and sorting

Filters use top-level schema field names and combine with AND before counting and pagination. Scalar equality shorthand and `{ eq: value }` are supported. The SDK URL-encodes names and values, serializing operators as `filter[title][icontains]=hello` rather than JSON.

| Field type | Supported filter values |
| --- | --- |
| Text / Textarea | String equality (case-sensitive), or `{ icontains: 'hello' }` (case-insensitive contains) |
| Date | `YYYY-MM-DD` equality, or `{ gte: '2026-10-01', lte: '2026-10-31' }` |
| Relation | Positive integer connected entry ID, such as `42` or `{ eq: 42 }` |
| Select / Radio | One configured option value |
| Boolean | `true`, `false`, or `{ eq: true }` / `{ eq: false }` |

`eq` distinguishes `works` from `Works`; there is no `ieq`. Contains treats `%`, `_`, and backslashes literally. Dates must be valid calendar dates; either inclusive boundary may be omitted, equal boundaries are allowed, and reversed ranges are rejected. Missing, null, and empty dates do not match. Equality and contains cannot combine with other operators; only date `gte` and `lte` may combine.

Relation filters use the source collection's field name: Posts' `category: 42` matches the stored Categories entry ID even if that target is unpublished or deleted. Population behavior is unchanged. Nested fields, related title/slug filters, multiple relation IDs, multi-value Select filters, and Time/Datetime filtering are unsupported.

Set `sortBy` to `id`, `createdAt`, or a schema field of type Number, Text, Email, Date, or Boolean, and `sortDir` to `asc` or `desc`. Number sorting is numeric, Text/Email is alphabetical and case-insensitive, Date is chronological, and Boolean ascending puts false before true. Missing, null, empty-string, invalidly typed values, and invalid dates sort last in either direction; ties use entry ID ascending. Sorting occurs before pagination. System `id` and `createdAt` take precedence over schema fields with those names. Omitting sort options retains the server defaults of `createdAt` descending.

Textarea, Slug, Select/Radio, Relation, Time/Datetime, media, documents, rich text, arrays, and groups are not sortable. Unknown fields and invalid directions are rejected.

The SDK exports `EntryFilters<T>`, `EntryFilter`, `FilterOperators`, `FilterScalar`, `SortField`, and `SortDirection`. The existing `ExactFilters<T>` export remains available. Content types cannot distinguish schema kinds such as Text from Date or Select; the backend validates schema-specific rules. Invalid filters or sorts produce a `MorphicApiError` with HTTP status `400` and the backend's details.

## GraphQL compatibility

This SDK's methods use REST. When using your own GraphQL client, both `entriesPage` and legacy `entries` accept the same `filters`, `sortBy`, and `sortDir` capabilities. Pass filter objects directly as the JSON scalar, preserving numbers and booleans rather than serializing them to strings:

```graphql
query {
  entriesPage(
    collectionSlug: "posts"
    page: 1
    limit: 10
    sortBy: "publish_date"
    sortDir: "desc"
    filters: {
      title: { icontains: "hello" }
      publish_date: { gte: "2026-10-01", lte: "2026-10-31" }
      category: { eq: 42 }
      featured: true
    }
  ) {
    entries { id content }
    pagination { currentPage totalPages totalCount limit }
  }
}
```

GraphQL reports invalid filters/sorts as `BAD_USER_INPUT`. Existing authentication and `X-Tenant-ID` requirements still apply to both APIs.

## API

- `cms.collections.list()`
- `cms.entries.list<T>(collection, options)`
- `cms.entries.get<T>(id, options)`
- `cms.entries.create<T>(collection, content, options)`
- `cms.entries.update<T>(id, content, options)`
- `cms.entries.delete(id, { force })`

`MorphicApiError` exposes `status` and `details` for non-successful responses.

## Security

Treat API keys as secrets. Use this client with an API key in server-side code, serverless functions, or protected backend routes—not directly in a public browser bundle.
