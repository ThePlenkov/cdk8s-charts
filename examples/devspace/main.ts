/**
 * Example: Deploy a DevSpace development environment for OpenShift.
 *
 * This sets up a Gascity AI coding assistant with OpenShift Routes:
 *   - Gascity: AI coding assistant with dashboard and supervisor
 *   - Nginx: Reverse proxy for routing
 *   - OpenShift Routes: External access via OpenShift router
 *
 * Prerequisites:
 *   - cp .env.example .env && fill in values
 *   - npx cdk8s synth
 *   - kubectl apply -f dist/
 */

import { App, Chart, ApiObject } from 'cdk8s';
import { ConfigMap, PersistentVolumeClaim } from 'cdk8s-plus-27';
import type { Construct } from 'constructs';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    // Fallback to default values for testing
    if (name === 'GASCITY_IMAGE_URL') return 'ghcr.io/example/gascity:latest';
    throw new Error(`Required env var ${name} is not set`);
  }
  return v;
}

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

class DevSpaceOpenShift extends Chart {
  constructor(scope: Construct, id: string) {
    super(scope, id, { namespace: 'devspace' });

    const namespace = 'devspace';
    const imageUrl = requireEnv('GASCITY_IMAGE_URL');
    const dashboardPort = 8081;
    const supervisorPort = 8372;
    const nginxPort = 8080;

    // PVC for Gascity workspace
    const pvc = new PersistentVolumeClaim(this, 'gascity-pvc', {
      metadata: { name: 'gascity-pvc', namespace },
      spec: {
        accessModes: ['ReadWriteOnce'],
        resources: {
          requests: { storage: '30Gi' },
        },
      },
    });

    // Nginx Config for sidecar
    const nginxConfig = new ConfigMap(this, 'gascity-nginx-config', {
      metadata: { name: 'gascity-nginx-config', namespace },
      data: {
        'nginx.conf': `
events {
    worker_connections 1024;
}

http {
    server {
        listen ${nginxPort};

        location /supervisor/ {
            proxy_pass http://127.0.0.1:${supervisorPort}/;
            proxy_set_header Host localhost;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

            # SSE support
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            proxy_buffering off;
            proxy_cache off;
        }

        location / {
            proxy_pass http://127.0.0.1:${dashboardPort}/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}`,
      },
    });

    // Gascity deployment with nginx sidecar
    new ApiObject(this, 'gascity', {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: { name: 'gascity', namespace },
      spec: {
        replicas: 1,
        selector: { matchLabels: { app: 'gascity' } },
        template: {
          metadata: { labels: { app: 'gascity' } },
          spec: {
            securityContext: {
              runAsUser: 1002730000,
              fsGroup: 1002730000,
              hostUsers: false,
            },
            containers: [
              {
                name: 'gascity',
                image: imageUrl,
                env: [
                  { name: 'HOME', value: '/workspace' },
                  { name: 'GC_DASHBOARD_SUPERVISOR_URL', value: '/supervisor' },
                  {
                    name: 'PATH',
                    value: '/usr/local/bin:/workspace/.local/bin:/workspace/.opencode/bin:/workspace/node-v20.16.0-linux-x64/bin:/usr/local/go/bin:/workspace/bin:/usr/bin:/bin',
                  },
                ],
                command: ['/bin/bash'],
                args: ['-c', `cd /workspace && pkill -9 gc || true && rm -f /workspace/.gc/supervisor.pid /workspace/.gc/supervisor.lock && gc supervisor run & sleep 5 && gc dashboard --api /supervisor --port ${dashboardPort}`],
                ports: [{ containerPort: dashboardPort, name: 'dashboard' }],
                volumeMounts: [
                  {
                    name: 'workspace',
                    mountPath: '/workspace',
                  },
                ],
                resources: {
                  requests: { cpu: '200m', memory: '512Mi' },
                  limits: { cpu: '1', memory: '2Gi' },
                },
              },
              {
                name: 'nginx-sidecar',
                image: 'nginx:alpine',
                ports: [{ containerPort: nginxPort, name: 'nginx-proxy' }],
                volumeMounts: [
                  {
                    name: 'nginx-config',
                    mountPath: '/etc/nginx/nginx.conf',
                    subPath: 'nginx.conf',
                  },
                  {
                    name: 'nginx-cache',
                    mountPath: '/var/cache/nginx',
                  },
                  {
                    name: 'nginx-run',
                    mountPath: '/var/run',
                  },
                ],
                resources: {
                  requests: { cpu: '100m', memory: '128Mi' },
                  limits: { cpu: '200m', memory: '256Mi' },
                },
              },
            ],
            volumes: [
              {
                name: 'workspace',
                persistentVolumeClaim: { claimName: 'gascity-pvc' },
              },
              {
                name: 'nginx-config',
                configMap: { name: 'gascity-nginx-config' },
              },
              {
                name: 'nginx-cache',
                emptyDir: {},
              },
              {
                name: 'nginx-run',
                emptyDir: {},
              },
            ],
          },
        },
      },
    });

    // Service
    new ApiObject(this, 'gascity-dashboard-service', {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { name: 'gascity-dashboard', namespace },
      spec: {
        selector: { app: 'gascity' },
        ports: [{ port: nginxPort, targetPort: nginxPort }],
      },
    });

    // OpenShift Route
    new ApiObject(this, 'gascity-route', {
      apiVersion: 'route.openshift.io/v1',
      kind: 'Route',
      metadata: { name: 'gascity-dashboard', namespace },
      spec: {
        to: { kind: 'Service', name: 'gascity-dashboard' },
        port: { targetPort: nginxPort },
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Synth
// ---------------------------------------------------------------------------

const app = new App();
new DevSpaceOpenShift(app, 'devspace-openshift');
app.synth();
