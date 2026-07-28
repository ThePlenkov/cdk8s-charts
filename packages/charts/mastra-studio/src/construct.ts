import { ApiObject } from 'cdk8s';
import { Construct } from 'constructs';
import type { MastraStudioExports, MastraStudioProps } from './types';

const DEFAULT_STUDIO_PORT = 3000;
const DEFAULT_IMAGE = 'node:22-bookworm-slim';

/**
 * Deploys Mastra Studio as a standalone UI service pointing at a Mastra server.
 *
 * Studio ships in the `mastra` npm package and connects via:
 *   mastra studio --server-host <host> --server-port <port>
 */
export class MastraStudio extends Construct {
  public readonly exports: MastraStudioExports;

  constructor(scope: Construct, id: string, props: MastraStudioProps) {
    super(scope, id);

    const studioPort = props.studioPort ?? DEFAULT_STUDIO_PORT;
    const svcType = props.serviceType ?? 'LoadBalancer';
    const image = props.image ?? DEFAULT_IMAGE;
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
            annotations: {
              'composed.docker-x/depends-on': `${props.serverHost}:service_healthy`,
            },
          },
          spec: {
            containers: [
              {
                name: 'studio',
                image,
                command: ['/bin/sh', '-ec'],
                args: [
                  [
                    'set -eu',
                    'npm install -g mastra@latest',
                    `exec mastra studio --port ${studioPort} --server-host ${props.serverHost} --server-port ${props.serverPort}`,
                  ].join('\n'),
                ],
                ports: [{ containerPort: studioPort }],
                readinessProbe: {
                  httpGet: { path: '/', port: studioPort },
                  initialDelaySeconds: 30,
                  periodSeconds: 10,
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
        type: svcType,
        selector: labels,
        ports: [{ name: 'http', port: studioPort, targetPort: studioPort, protocol: 'TCP' }],
      },
    });

    this.exports = {
      host: id,
      port: studioPort,
      url: `http://${id}:${studioPort}`,
    };
  }
}
