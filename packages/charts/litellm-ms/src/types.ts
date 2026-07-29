import type { DeepPartial } from '@cdk8s-charts/utils';

/** proxy_config block shared with the monolithic LiteLLM chart construct. */
export type LitellmMsProxyConfig = Record<string, unknown>;

export interface LitellmMsVirtualKey {
  alias: string;
  key: string;
  models?: string[];
  max_budget?: number;
}

export interface LitellmMsDatabaseProps {
  /** Deploy Bitnami PostgreSQL when true (default). */
  enabled?: boolean;
  username?: string;
  password?: string;
  database?: string;
  chart?: string;
  version?: string;
  values?: Record<string, unknown>;
}

export interface LitellmMsRedisProps {
  host: string;
  port: number;
  password: string;
}

export interface LitellmMsCallbacksProps {
  mountPath: string;
  files: Record<string, string>;
}

/** Subset of oci://ghcr.io/berriai/litellm/chart/litellm values we merge explicitly. */
export interface LitellmMsValues {
  fullnameOverride?: string;
  masterKey?: { secretName?: string; secretKey?: string };
  database?: {
    writer?: {
      host?: string;
      port?: number;
      dbname?: string;
      passwordSecret?: { name?: string; usernameKey?: string; passwordKey?: string };
    };
  };
  redis?: {
    host?: string;
    port?: number;
    passwordSecret?: { name?: string; passwordKey?: string };
  };
  gateway?: Record<string, unknown>;
  backend?: Record<string, unknown>;
  ui?: Record<string, unknown>;
  migrationJob?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface LitellmMsProps {
  namespace: string;
  masterKey: string;
  proxyConfig: LitellmMsProxyConfig;
  redis: LitellmMsRedisProps;
  database?: LitellmMsDatabaseProps;
  saltKey?: string;
  env?: Record<string, string>;
  envSecretNames?: string[];
  callbacks?: LitellmMsCallbacksProps;
  virtualKeys?: LitellmMsVirtualKey[];
  chart?: string;
  version?: string;
  serviceType?: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
  values?: DeepPartial<LitellmMsValues>;
}

export interface LitellmMsExports {
  gatewayHost: string;
  gatewayPort: number;
  backendHost: string;
  backendPort: number;
  uiHost: string;
  uiPort: number;
  masterKey: string;
  virtualKeys: Record<string, string>;
  /** Alias for gateway host — drop-in for monolithic `litellm` service DNS. */
  host: string;
  port: number;
}
