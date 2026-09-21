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
}

const cms = createMorphicClient({
  baseUrl: 'https://cms.example.com',
  apiKey: process.env.MORPHIC_API_KEY,
  tenantId: process.env.MORPHIC_TENANT_ID,
})

const posts = await cms.entries.list<Post>('posts', {
  page: 1,
  limit: 10,
  filters: { is_in_review: 'Yes', featured: true },
})
```

`entries.list()` returns either a paginated collection response or a global entry response, matching Morphic CMS REST behavior. Select, Radio, and Boolean filters exact-match and combine with AND logic.

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
