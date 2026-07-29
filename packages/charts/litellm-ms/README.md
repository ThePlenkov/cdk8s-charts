# @cdk8s-charts/litellm-ms

Typed cdk8s construct for the **componentized** LiteLLM Helm chart:

```
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
});
```

Exports:

- `gatewayHost` / `gatewayPort` — LLM data plane (`/v1`, port 4000)
- `backendHost` / `backendPort` — management API (port 4001)
- `uiHost` / `uiPort` — Admin UI (port 3000)
- `host` / `port` — alias for gateway (compat with monolithic wiring)
