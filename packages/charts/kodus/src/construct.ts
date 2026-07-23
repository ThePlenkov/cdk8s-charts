import { ApiObject } from 'cdk8s';
import { Construct } from 'constructs';

import { HelmConstruct } from '@cdk8s-charts/utils';
import type { KodusExports, KodusProps, KodusValues } from './types';

const TARGET_PORTS = { web: 3000, api: 3001, webhooks: 3332 } as const;
const PUBLIC_PORTS = { web: 3100, api: 3101, webhooks: 3332 } as const;

/**
 * Deploys the unmodified upstream Kodus Helm chart and exposes its HTTP
 * endpoints for the local compose-managed K3s cluster.
 *
 * The chart bundles its Postgres, MongoDB and RabbitMQ dependencies. The
 * public Services are separate from the chart's ClusterIP Services because
 * the upstream chart does not make Service type configurable.
 */
export class Kodus extends HelmConstruct<KodusValues> {
  public readonly exports: KodusExports;

  constructor(scope: Construct, id: string, props: KodusProps) {
    super(scope, id);

    const values: KodusValues = {
      platform: 'kubernetes',
      imageTag: props.imageTag,
      image: { pullPolicy: 'IfNotPresent' },
      global: {
        labels: { 'kodus.io/environment': 'development', 'kodus.io/team': 'yoda' },
        autoGenerateSecrets: true,
        secrets: {
          API_OPEN_AI_API_KEY: props.llm.apiKey,
        },
        config: {
          WEB_HOSTNAME_API: `${id}-api`,
          WEB_PORT_API: TARGET_PORTS.api,
          WEB_PORT: TARGET_PORTS.web,
          NEXTAUTH_URL: `http://localhost:${props.expose?.webPort ?? PUBLIC_PORTS.web}`,
          API_FRONTEND_URL: `http://${id}-web:${TARGET_PORTS.web}`,
          API_DATABASE_ENV: 'development',
          API_DATABASE_DISABLE_SSL: true,
          API_CLOUD_MODE: false,
          API_LOG_PRETTY: true,
          API_OPENAI_FORCE_BASE_URL: props.llm.baseUrl,
          API_LLM_PROVIDER_MODEL: props.llm.model,
          API_GITLAB_CODE_MANAGEMENT_WEBHOOK: props.webhookUrl ?? '',
        },
      },
      services: {
        web: { enabled: true, replicas: 1 },
        api: { enabled: true, replicas: 1 },
        worker: { enabled: true, replicas: 1 },
        webhooks: { enabled: true, replicas: 1 },
        'mcp-manager': { enabled: false },
      },
      migrations: {
        enabled: true,
        env: { RUN_MIGRATIONS: 'true', RUN_SEEDS: 'true' },
      },
      ingress: { enabled: false },
      route: { enabled: false },
      autoscaling: { enabled: false },
      pdb: { enabled: false },
      networkPolicy: { enabled: false },
      resourceQuota: { enabled: false },
      containerSecurityContext: { readOnlyRootFilesystem: false },
      postgres: { persistence: { enabled: true, size: '2Gi' } },
      mongodb: { persistence: { enabled: true, size: '2Gi' } },
      rabbitmq: { persistence: { enabled: true, size: '2Gi' } },
    };

    this.renderChart(props.chart, id, props.namespace, values, props.values);

    const publicPorts = {
      web: props.expose?.webPort ?? PUBLIC_PORTS.web,
      api: props.expose?.apiPort ?? PUBLIC_PORTS.api,
      webhooks: props.expose?.webhooksPort ?? PUBLIC_PORTS.webhooks,
    };

    this.createPublicService(id, 'web', props.namespace, publicPorts.web, TARGET_PORTS.web);
    this.createPublicService(id, 'api', props.namespace, publicPorts.api, TARGET_PORTS.api);
    this.createPublicService(
      id,
      'webhooks',
      props.namespace,
      publicPorts.webhooks,
      TARGET_PORTS.webhooks,
    );

    this.exports = {
      webHost: `${id}-web-public`,
      webPort: publicPorts.web,
      apiHost: `${id}-api-public`,
      apiPort: publicPorts.api,
      webhooksHost: `${id}-webhooks-public`,
      webhooksPort: publicPorts.webhooks,
    };
  }

  private createPublicService(
    id: string,
    service: 'web' | 'api' | 'webhooks',
    namespace: string,
    port: number,
    targetPort: number,
  ): void {
    new ApiObject(this, `${service}-public-service`, {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { name: `${id}-${service}-public`, namespace },
      spec: {
        type: 'LoadBalancer',
        selector: {
          'app.kubernetes.io/name': service,
          'app.kubernetes.io/instance': id,
          'app.kubernetes.io/part-of': 'kodus',
        },
        ports: [{ name: 'http', port, targetPort, protocol: 'TCP' }],
      },
    });
  }
}
