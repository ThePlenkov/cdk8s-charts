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
