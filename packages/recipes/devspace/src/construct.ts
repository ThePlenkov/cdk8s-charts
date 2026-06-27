import type { Construct } from 'constructs';
import { Chart } from 'cdk8s';
import { ApiObject } from 'cdk8s';
import { ConfigMap, Deployment, Volume } from 'cdk8s-plus-27';
import type { DevSpaceExports, DevSpaceProps } from './types';
import { DevPod } from '@cdk8s-charts/devpod';

export class DevSpace extends Chart {
  public readonly exports: DevSpaceExports;

  constructor(scope: Construct, id: string, props: DevSpaceProps) {
    super(scope, id);

    const {
      namespace,
      devpod = { enabled: true, storageSize: '10Gi', password: 'devpod123' },
      gascity = { enabled: true, storageSize: '20Gi', withDashboard: true, withSupervisor: true },
      nginx = { enabled: true, listenPort: 8080 },
      openshift = { enabled: false, createRoutes: false },
    } = props;

    const exports: DevSpaceExports = {};

    // === DevPod Deployment ===
    if (devpod.enabled) {
      const devpodInstance = new DevPod(this, 'devpod', {
        namespace,
        password: devpod.password,
        storageSize: devpod.storageSize,
      });
      exports.devpodHost = devpodInstance.exports.host;
      exports.devpodPort = devpodInstance.exports.port;
    }

    // === Gascity Deployment ===
    if (gascity.enabled) {
      const dashboardPort = 8081;
      const supervisorPort = 8372;

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
        listen ${nginx.listenPort};
        
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
      const deployment = new Deployment(this, 'gascity', {
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
                  image: gascity.imageUrl || 'image-registry.openshift-image-registry.svc:5000/theplenkov-dev/gascity:latest',
                  env: [
                    { name: 'HOME', value: '/workspace' },
                    { name: 'GC_DASHBOARD_SUPERVISOR_URL', value: gascity.supervisorUrl || '/supervisor' },
                    {
                      name: 'PATH',
                      value: '/usr/local/bin:/workspace/.local/bin:/workspace/.opencode/bin:/workspace/node-v20.16.0-linux-x64/bin:/usr/local/go/bin:/workspace/bin:/usr/bin:/bin',
                    },
                  ],
                  command: ['/bin/bash'],
                  args: ['-c', `cd /workspace && pkill -9 gc || true && rm -f /workspace/.gc/supervisor.pid /workspace/.gc/supervisor.lock && gc supervisor run & sleep 5 && gc dashboard --api ${gascity.supervisorUrl || '/supervisor'} --port ${dashboardPort}`],
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
                  ports: [{ containerPort: nginx.listenPort, name: 'nginx-proxy' }],
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
      const service = new ApiObject(this, 'gascity-dashboard-service', {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: { name: 'gascity-dashboard', namespace },
        spec: {
          selector: { app: 'gascity' },
          ports: [{ port: nginx.listenPort, targetPort: nginx.listenPort }],
        },
      });

      exports.gascityDashboardHost = 'gascity-dashboard';
      exports.gascityDashboardPort = nginx.listenPort;
    }

    // === OpenShift Routes ===
    if (openshift.enabled && openshift.createRoutes) {
      if (devpod.enabled) {
        new ApiObject(this, 'devpod-route', {
          apiVersion: 'route.openshift.io/v1',
          kind: 'Route',
          metadata: { name: 'devpod-workspace', namespace },
          spec: {
            to: { kind: 'Service', name: 'devpod' },
            port: { targetPort: 8080 },
          },
        });
      }

      if (gascity.enabled) {
        new ApiObject(this, 'gascity-route', {
          apiVersion: 'route.openshift.io/v1',
          kind: 'Route',
          metadata: { name: 'gascity-dashboard', namespace },
          spec: {
            to: { kind: 'Service', name: 'gascity-dashboard' },
            port: { targetPort: nginx.listenPort },
          },
        });
      }
    }

    this.exports = exports;
  }
}