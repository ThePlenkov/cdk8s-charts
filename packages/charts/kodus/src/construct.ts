import { HelmConstruct } from '@cdk8s-charts/utils';
import { ApiObject } from 'cdk8s';
import type { Construct } from 'constructs';
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

    const config = this.flattenToEnv(
      {
        web: {
          hostname_api: `${id}-api`,
          port_api: TARGET_PORTS.api,
          port: TARGET_PORTS.web,
        },
        api: {
          frontend_url: `http://${id}-web:${TARGET_PORTS.web}`,
          cloud: { mode: false },
          database: { env: 'development', disable_ssl: true },
          log: { pretty: true },
          openai: { force_base_url: props.llm.baseUrl },
          llm: { provider_model: props.llm.model },
          gitlab: { code_management_webhook: props.webhookUrl ?? '' },
        },
        nextauth: { url: `http://localhost:${props.expose?.webPort ?? PUBLIC_PORTS.web}` },
      },
      '',
    );

    // Upstream Kodus reads this exact env var name (OPEN_AI with underscore).
    const secrets = this.flattenToEnv({ api: { open_ai: { api_key: props.llm.apiKey } } }, '');

    const values: KodusValues = {
      platform: 'kubernetes',
      imageTag: props.imageTag,
      image: { pullPolicy: 'IfNotPresent' },
      global: {
        labels: { 'kodus.io/environment': 'development', 'kodus.io/team': 'yoda' },
        autoGenerateSecrets: true,
        secrets,
        config,
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

    const finalValues = this.renderChart(props.chart, id, props.namespace, values, props.values);

    const targetPorts = {
      web: finalValues.services?.web?.containerPort ?? TARGET_PORTS.web,
      api: finalValues.services?.api?.containerPort ?? TARGET_PORTS.api,
      webhooks: finalValues.services?.webhooks?.containerPort ?? TARGET_PORTS.webhooks,
    };

    const publicPorts = {
      web: props.expose?.webPort ?? PUBLIC_PORTS.web,
      api: props.expose?.apiPort ?? PUBLIC_PORTS.api,
      webhooks: props.expose?.webhooksPort ?? PUBLIC_PORTS.webhooks,
    };

    this.createPublicService(id, 'web', props.namespace, publicPorts.web, targetPorts.web);
    this.createPublicService(id, 'api', props.namespace, publicPorts.api, targetPorts.api);
    this.createPublicService(
      id,
      'webhooks',
      props.namespace,
      publicPorts.webhooks,
      targetPorts.webhooks,
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
          // Match the Kodus Helm chart's component selector labels.
          // Chart name defaults to 'kodus'; component is the service name.
          'app.kubernetes.io/name': 'kodus',
          'app.kubernetes.io/instance': id,
          'app.kubernetes.io/component': service,
        },
        ports: [{ name: 'http', port, targetPort, protocol: 'TCP' }],
      },
    });
  }
}
