import { deepMerge, HelmConstruct } from '@cdk8s-charts/utils';
import { ApiObject } from 'cdk8s';
import type { Construct } from 'constructs';
import type { Exports, Props, Values } from './types';

const DEFAULT_IMAGE = 'node:22-bookworm-slim';
const DEFAULT_MASTRA_VERSION = '1.20.2';
const DEFAULT_STUDIO_PORT = 3000;

const DEFAULT_STARTUP_SCRIPT = `set -eu
if ! command -v mastra >/dev/null 2>&1; then
  npm install -g mastra@\${MASTRA_VERSION}
fi
exec mastra studio --port "\${MASTRA_STUDIO_PORT}" --server-host "\${MASTRA_SERVER_HOST}" --server-port "\${MASTRA_SERVER_PORT}"`;

/**
 * Deploys Mastra Studio as a standalone UI service pointing at a Mastra server.
 *
 * Extends HelmConstruct so it exposes the repository's standard `values` override
 * surface and reuses deepMerge, even though Studio is rendered directly through
 * ApiObjects (there is no upstream Helm chart for Mastra Studio).
 */
export class MastraStudio extends HelmConstruct<Values> {
  public readonly exports: Exports;

  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id);

    const computed: Values = {
      image: props.image ?? DEFAULT_IMAGE,
      mastraVersion: props.mastraVersion ?? DEFAULT_MASTRA_VERSION,
      serverHost: props.serverHost,
      serverPort: props.serverPort,
      studioPort: props.studioPort ?? DEFAULT_STUDIO_PORT,
      serviceType: props.serviceType ?? 'LoadBalancer',
      command: props.command ?? ['/bin/sh', '-ec'],
      args: props.args ?? [DEFAULT_STARTUP_SCRIPT],
      podAnnotations: {},
      readinessProbe: {
        path: '/',
        port: props.studioPort ?? DEFAULT_STUDIO_PORT,
        initialDelaySeconds: 30,
        periodSeconds: 10,
      },
    };

    const values = deepMerge(computed, props.values ?? {});

    // Ensure the readiness probe and compose dependency annotation track the final values.
    values.readinessProbe.port = props.values?.readinessProbe?.port ?? values.studioPort;
    values.podAnnotations['composed.docker-x/depends-on'] = `${values.serverHost}:service_healthy`;

    const labels = { app: id };

    new ApiObject(this, 'deploy', {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: id, namespace: props.namespace },
      spec: {
        replicas: 1,
        selector: { matchLabels: labels },
        template: {
          metadata: {
            labels,
            annotations: values.podAnnotations,
          },
          spec: {
            containers: [
              {
                name: 'studio',
                image: values.image,
                command: values.command,
                args: values.args,
                env: [
                  { name: 'MASTRA_VERSION', value: String(values.mastraVersion) },
                  { name: 'MASTRA_STUDIO_PORT', value: String(values.studioPort) },
                  { name: 'MASTRA_SERVER_HOST', value: values.serverHost },
                  { name: 'MASTRA_SERVER_PORT', value: String(values.serverPort) },
                ],
                ports: [{ containerPort: values.studioPort }],
                readinessProbe: {
                  httpGet: { path: values.readinessProbe.path, port: values.readinessProbe.port },
                  initialDelaySeconds: values.readinessProbe.initialDelaySeconds,
                  periodSeconds: values.readinessProbe.periodSeconds,
                },
              },
            ],
          },
        },
      },
    });

    new ApiObject(this, 'svc', {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { name: id, namespace: props.namespace },
      spec: {
        type: values.serviceType,
        selector: labels,
        ports: [
          { name: 'http', port: values.studioPort, targetPort: values.studioPort, protocol: 'TCP' },
        ],
      },
    });

    this.exports = {
      host: id,
      port: values.studioPort,
      url: `http://${id}:${values.studioPort}`,
    };
  }
}
