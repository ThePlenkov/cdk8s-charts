# @cdk8s-charts/litellm-ms

Typed cdk8s construct for the **componentized** LiteLLM Helm chart:

```text
oci://ghcr.io/berriai/litellm/chart/litellm
```

This is the microservices deployment (gateway + backend + ui) documented at
https://docs.litellm.ai/docs/proxy/deploy#deploy-with-helm

For the legacy monolithic chart (`oci://ghcr.io/berriai/litellm-helm`), use `@cdk8s-charts/litellm`.

## Quick use

```typescript
import { LitellmMs } from '@cdk8s-charts/litellm-ms';
import { Redis } from '@cdk8s-charts/redis';

const redis = new Redis(this, 'redis', { namespace: 'dev', password: 'dev-redis' });

new LitellmMs(this, 'litellm', {
  namespace: 'dev',
  version: '1.94.0',
  masterKey: process.env.LITELLM_MASTER_KEY!,
  proxyConfig: { model_list: [] },
  redis: {
    host: redis.exports.host,
    port: redis.exports.port,
    password: redis.exports.password,
  },
  database: {
    password: process.env.LITELLM_DB_PASSWORD!,
  },
});
```

Exports:

- `gatewayHost` / `gatewayPort` — LLM data plane (`/v1`, port 4000)
- `backendHost` / `backendPort` — management API (port 4001)
- `uiHost` / `uiPort` — Admin UI (port 3000)
- `host` / `port` — alias for gateway (compat with monolithic wiring)

## Database

By default an embedded Bitnami PostgreSQL release is deployed. Provide `database.password` when `database.enabled !== false`.

To bring your own PostgreSQL, set `database.enabled: false` and supply `database.host` plus one of `database.password` or `database.existingSecret`:

```typescript
new LitellmMs(this, 'litellm', {
  // ...
  database: {
    enabled: false,
    host: 'my-postgres.my-namespace.svc.cluster.local',
    port: 5432,
    database: 'litellm',
    username: 'litellm',
    existingSecret: { name: 'litellm-db-credentials', usernameKey: 'username', passwordKey: 'password' },
  },
});
```
