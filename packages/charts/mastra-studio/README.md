# Mastra Studio

Typed cdk8s construct for deploying [Mastra Studio](https://mastra.ai/docs/studio/overview) as a standalone UI service that connects to an existing Mastra server.

```typescript
import { MastraStudio } from '@cdk8s-charts/mastra-studio';

new MastraStudio(this, 'mastra-studio', {
  namespace: 'agents',
  serverHost: 'mastra',
  serverPort: 4111,
  studioPort: 3000,
});
```

## Configuration

- `image` — Node base image, or a prebuilt image that already contains the Mastra CLI (default: `node:22-bookworm-slim`).
- `mastraVersion` — Pinned Mastra version to install when the image does not contain the CLI (default: `1.20.2`).
- `command`/`args` — Override the container startup. Set both together, or omit both to use the default shell startup script.
- `values` — Raw value overrides (deep-merged into computed defaults).

```typescript
new MastraStudio(this, 'mastra-studio', {
  namespace: 'agents',
  serverHost: 'mastra',
  serverPort: 4111,
  image: 'my-registry/mastra-studio:1.20.2',
  command: ['mastra'],
  args: ['studio', '--port', '3000', '--server-host', 'mastra', '--server-port', '4111'],
});
```
