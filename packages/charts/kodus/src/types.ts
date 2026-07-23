import type { DeepPartial, ResourceRequirements } from '@cdk8s-charts/utils';

export interface KodusServiceValues {
  enabled?: boolean;
  port?: number;
  containerPort?: number;
  replicas?: number;
  image?: { repository?: string; tag?: string; pullPolicy?: string };
  env?: Record<string, string>;
  resources?: ResourceRequirements;
  readinessProbe?: Record<string, unknown>;
  livenessProbe?: Record<string, unknown>;
}

export interface KodusValues {
  platform?: string;
  imageTag?: string;
  image?: { pullPolicy?: string };
  global?: {
    imageRegistry?: string;
    labels?: Record<string, string>;
    existingSecret?: string;
    autoGenerateSecrets?: boolean;
    secrets?: Record<string, string>;
    config?: Record<string, string | number | boolean>;
  };
  services?: {
    web?: KodusServiceValues;
    api?: KodusServiceValues;
    worker?: KodusServiceValues;
    webhooks?: KodusServiceValues;
    'mcp-manager'?: KodusServiceValues;
  };
  migrations?: Record<string, unknown>;
  ingress?: Record<string, unknown>;
  route?: Record<string, unknown>;
  autoscaling?: Record<string, unknown>;
  pdb?: Record<string, unknown>;
  networkPolicy?: Record<string, unknown>;
  resourceQuota?: Record<string, unknown>;
  serviceAccount?: Record<string, unknown>;
  rbac?: Record<string, unknown>;
  podSecurityContext?: Record<string, unknown>;
  containerSecurityContext?: Record<string, unknown>;
  postgres?: Record<string, unknown>;
  mongodb?: Record<string, unknown>;
  rabbitmq?: Record<string, unknown>;
  waitForDeps?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface KodusProps {
  namespace: string;
  /** Local path to the upstream Kodus chart. */
  chart: string;
  /** Kodus application image tag, pinned in the upstream chart. */
  imageTag: string;
  llm: {
    baseUrl: string;
    apiKey: string;
    model: string;
  };
  webhookUrl?: string;
  expose?: {
    webPort?: number;
    apiPort?: number;
    webhooksPort?: number;
  };
  values?: DeepPartial<KodusValues>;
}

export interface KodusExports {
  webHost: string;
  webPort: number;
  apiHost: string;
  apiPort: number;
  webhooksHost: string;
  webhooksPort: number;
}
