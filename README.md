# Create Swagger Client

A TypeScript tool that generates a fully type-safe REST API client from OpenAPI/Swagger specifications. Built with `openapi-typescript` and `ts-morph`, it creates a strongly-typed client class with autocomplete and compile-time type checking for all API endpoints.

## Features

- ✅ **Full Type Safety**: All endpoints, parameters, request bodies, and responses are type-checked
- 🚀 **Auto-completion**: IDE autocomplete for paths, methods, and payloads
- 🔄 **Multiple HTTP Methods**: Support for GET, POST, PUT, DELETE, and PATCH
- 📝 **OpenAPI Spec Support**: Works with OpenAPI 3.x specifications (JSON or YAML)
- 🌐 **URL or File Input**: Generate from remote URLs or local files
- 🎯 **Type Inference**: Automatic extraction of path params, query params, headers, and request/response types
- ⏱️ **Built-in Timeout**: Default 30s timeout per request (configurable)

## Installation

```bash
npm install -g create-swagger-client
# or
npx create-swagger-client
```

## Usage

### Generate API Client

Run the generator with your OpenAPI specification:

```bash
# From a URL
npx create-swagger-client https://api.example.com/openapi.json

# From a local file
npx create-swagger-client ./swagger.json

# Specify custom output file
npx create-swagger-client https://api.example.com/openapi.json my-api-client.ts
```

**Arguments:**
- `source` (required): URL or file path to your OpenAPI/Swagger specification
- `output` (optional): Output file name (default: `swagger-client.ts`)

This will generate a file with:
- All TypeScript types from your OpenAPI spec
- A `RestApiClient` class with type-safe methods
- Helper types for extracting parameters and responses

### Using the Generated Client

After generation, import and use the client:

```typescript
import { RestApiClient } from './swagger-client';

// Initialize the client
const api = new RestApiClient('https://api.example.com', {
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN'
  }
});

// Make type-safe requests
// GET request with query parameters
const users = await api.get('/users', {
  query: { page: 1, limit: 10 }
});

// GET request with path parameters
const user = await api.get('/users/{id}', {
  path: { id: '123' }
});

// POST request with body
const newUser = await api.post('/users', {
  body: {
    name: 'John Doe',
    email: 'john@example.com'
  }
});

// PUT request
const updatedUser = await api.put('/users/{id}', {
  path: { id: '123' },
  body: {
    name: 'Jane Doe',
    email: 'jane@example.com'
  }
});

// DELETE request
await api.delete('/users/{id}', {
  path: { id: '123' }
});

// PATCH request
const patchedUser = await api.patch('/users/{id}', {
  path: { id: '123' },
  body: {
    email: 'newemail@example.com'
  }
});
```

### Advanced Usage

#### Custom Headers per Request

```typescript
const data = await api.get('/protected-endpoint', {
  headers: {
    'X-Custom-Header': 'value'
  }
});
```

#### Request with Multiple Parameter Types

```typescript
const result = await api.post('/projects/{projectId}/tasks', {
  path: { projectId: 'proj-123' },
  query: { notify: true },
  headers: { 'X-Request-ID': 'req-456' },
  body: {
    title: 'New Task',
    description: 'Task description'
  }
});
```

#### Custom Fetch Options

Each method accepts an optional `RequestInit` as the third argument:

```typescript
const users = await api.get('/users', { query: { page: 1 } }, {
  credentials: 'include',
  mode: 'cors'
});
```

#### Timeout

The client uses a default timeout of 30 seconds. You can override it in the constructor:

```typescript
const api = new RestApiClient('https://api.example.com', {}, 10_000);
```

## Generated Types

The generator creates several useful type utilities:

- `RestMethod`: Union of HTTP methods (`"get" | "post" | "put" | "delete" | "patch"`)
- `KeyPaths`: All available API paths
- `PathsForMethod<M>`: Paths that support method `M`
- `ExtractPathParams<Path, Method>`: Extract path parameters for an endpoint
- `ExtractQueryParams<Path, Method>`: Extract query parameters for an endpoint
- `ExtractHeaderParams<Path, Method>`: Extract header parameters for an endpoint
- `ExtractBody<Path, Method>`: Extract request body type for an endpoint
- `APIResponse<Path, Method>`: Extract response type for an endpoint
- `ApiPayload<Path, Method>`: Combined payload type for a request
- `ApiClientType`: Type definition for the entire client

## Example: Using Generated Types

```typescript
import { 
  RestApiClient, 
  ExtractBody, 
  APIResponse 
} from './swagger-client';

// Use types in your code
type CreateUserBody = ExtractBody<'/users', 'post'>;
type UserResponse = APIResponse<'/users/{id}', 'get'>;

const createUser = (data: CreateUserBody): Promise<UserResponse> => {
  return api.post('/users', { body: data });
};
```

## Error Handling

The client throws an `ApiError` for failed requests. The error includes `status`, `statusText`, and a parsed JSON `body` when available:

```typescript
try {
  const user = await api.get('/users/{id}', {
    path: { id: '123' }
  });
} catch (error) {
  console.error('API request failed:', error.message);
  // error.status, error.statusText, error.body
}
```

## Requirements

- Node.js 16+ (for running the CLI)
- TypeScript 5.x (peer dependency for generated types)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.