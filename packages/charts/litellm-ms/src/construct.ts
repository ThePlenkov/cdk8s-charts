import { readFileSync } from 'node:fs';
import type { Volume, VolumeMount } from '@cdk8s-charts/utils';
import { HelmConstruct } from '@cdk8s-charts/utils';
import { ApiObject } from 'cdk8s';
import type { Construct as IConstruct } from 'constructs';
import { Construct } from 'constructs';
import type {
  LitellmMsCallbacksProps,
  LitellmMsExports,
  LitellmMsPostgresqlValues,
  LitellmMsProps,
  LitellmMsValues,
  LitellmMsVirtualKey,
} from './types';

const DEFAULT_CHART = 'oci://ghcr.io/berriai/litellm/chart/litellm';
const DEFAULT_POSTGRES_CHART = 'oci://registry-1.docker.io/bitnamicharts/postgresql';

const WAIT_FOR_LITELLM_SCRIPT = readFileSync(
  new URL('./scripts/wait-for-litellm.sh', import.meta.url),
  'utf8',
);
const PROVISION_KEYS_SCRIPT = readFileSync(
  new URL('./scripts/provision-keys.sh', import.meta.url),
  'utf8',
);

const CONFIGMAP_KEY_RE = /^[a-zA-Z0-9._-]+$/;

function validateCallbackFileNames(id: string, callbacks: LitellmMsCallbacksProps): void {
  for (const fileName of Object.keys(callbacks.files)) {
    if (fileName === '.' || fileName === '..') {
      throw new Error(`${id}: callback filename cannot be '.' or '..' (${fileName})`);
    }
    if (fileName.length > 253) {
      throw new Error(`${id}: callback filename exceeds 253 characters (${fileName})`);
    }
    if (!CONFIGMAP_KEY_RE.test(fileName)) {
      throw new Error(
        `${id}: callback filename must match /^[a-zA-Z0-9._-]+$/ (${fileName}); it is used as a ConfigMap key and subPath`,
      );
    }
  }
}

function validateVirtualKeys(id: string, keys: LitellmMsVirtualKey[]): void {
  const seen = new Set<string>();
  for (const { alias } of keys) {
    if (!alias?.trim()) {
      throw new Error(`${id}: virtual key alias must be non-empty`);
    }
    if (seen.has(alias)) {
      throw new Error(`${id}: duplicate virtual key alias "${alias}"`);
    }
    seen.add(alias);
  }
}

/**
 * LiteLLM microservices chart (gateway + backend + ui).
 *
 * Wraps oci://ghcr.io/berriai/litellm/chart/litellm — the componentized deployment
 * documented at https://docs.litellm.ai/docs/proxy/deploy#deploy-with-helm
 */
export class LitellmMs extends HelmConstruct<LitellmMsValues> {
  public readonly exports: LitellmMsExports;

  constructor(scope: IConstruct, id: string, props: LitellmMsProps) {
    super(scope, id);

    const svcType = props.serviceType ?? 'ClusterIP';
    const db = props.database ?? {};
    const deployPostgres = db.enabled !== false;

    if (deployPostgres && !db.password) {
      throw new Error(`${id}: database.password is required when embedded PostgreSQL is enabled`);
    }

    if (props.callbacks) {
      validateCallbackFileNames(id, props.callbacks);
    }
    if (props.virtualKeys) {
      validateVirtualKeys(id, props.virtualKeys);
    }

    const masterSecret = `${id}-masterkey`;
    const dbSecret = `${id}-db`;
    const redisSecret = `${id}-redis`;
    const envSecret = `${id}-env`;

    const dbUser = db.username ?? 'litellm';
    const dbName = db.database ?? 'litellm';
    const postgresRelease = `${id}-postgresql`;

    new ApiObject(this, 'masterkey', {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: { name: masterSecret, namespace: props.namespace },
      stringData: { 'master-key': props.masterKey },
    });

    new ApiObject(this, 'redis-secret', {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: { name: redisSecret, namespace: props.namespace },
      stringData: { password: props.redis.password },
    });

    if (db.password) {
      new ApiObject(this, 'db-secret', {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: { name: dbSecret, namespace: props.namespace },
        stringData: { username: dbUser, password: db.password },
      });
    }

    const envStringData: Record<string, string> = {};
    if (props.saltKey) {
      envStringData.LITELLM_SALT_KEY = props.saltKey;
    }
    if (props.env) {
      Object.assign(envStringData, props.env);
    }
    if (Object.keys(envStringData).length > 0) {
      new ApiObject(this, 'env', {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: { name: envSecret, namespace: props.namespace },
        stringData: envStringData,
      });
    }

    let dbHost: string;
    let dbPasswordSecretName: string;
    let dbPasswordUsernameKey = 'username';
    let dbPasswordPasswordKey = 'password';

    if (deployPostgres) {
      const postgresScope = new Construct(this, 'postgresql');
      const postgresComputed: LitellmMsPostgresqlValues = {
        auth: { username: dbUser, password: db.password, database: dbName },
        primary: { persistence: { enabled: true } },
      };
      const postgresValues = this.renderChartOn(
        postgresScope,
        db.chart ?? DEFAULT_POSTGRES_CHART,
        postgresRelease,
        props.namespace,
        postgresComputed,
        db.values,
        { version: db.version, helmFlags: ['--skip-tests'] },
      );
      dbHost = LitellmMs.getPostgresHost(postgresRelease, postgresValues);
      dbPasswordSecretName = dbSecret;
    } else {
      if (!db.host) {
        throw new Error(`${id}: database.host is required when embedded PostgreSQL is disabled`);
      }
      dbHost = db.host;
      if (db.password) {
        dbPasswordSecretName = dbSecret;
      } else if (db.existingSecret?.name) {
        dbPasswordSecretName = db.existingSecret.name;
        dbPasswordUsernameKey = db.existingSecret.usernameKey ?? 'username';
        dbPasswordPasswordKey = db.existingSecret.passwordKey ?? 'password';
      } else {
        throw new Error(
          `${id}: database.password or database.existingSecret is required for an external PostgreSQL writer`,
        );
      }
    }

    const gatewayVolumes: Volume[] = [];
    const gatewayMounts: VolumeMount[] = [];

    if (props.callbacks && Object.keys(props.callbacks.files).length > 0) {
      const callbacksName = `${id}-callbacks`;
      new ApiObject(this, 'callbacks', {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: { name: callbacksName, namespace: props.namespace },
        data: props.callbacks.files,
      });
      gatewayVolumes.push({ name: 'callbacks', configMap: { name: callbacksName } });
      for (const fileName of Object.keys(props.callbacks.files)) {
        gatewayMounts.push({
          name: 'callbacks',
          mountPath: `${props.callbacks.mountPath}/${fileName}`,
          subPath: fileName,
        });
      }
    }

    const envSecrets = [
      ...new Set([
        ...(props.envSecretNames ?? []),
        ...(Object.keys(envStringData).length ? [envSecret] : []),
      ]),
    ];

    const computed: LitellmMsValues = {
      fullnameOverride: id,
      masterKey: { secretName: masterSecret, secretKey: 'master-key' },
      database: {
        writer: {
          host: dbHost,
          port: db.port ?? 5432,
          dbname: dbName,
          ...(db.schema ? { schema: db.schema } : {}),
          passwordSecret: {
            name: dbPasswordSecretName,
            usernameKey: dbPasswordUsernameKey,
            passwordKey: dbPasswordPasswordKey,
          },
        },
      },
      redis: {
        host: props.redis.host,
        port: props.redis.port,
        passwordSecret: { name: redisSecret, passwordKey: 'password' },
      },
      gateway: {
        config: { create: true, proxy_config: props.proxyConfig },
        envSecrets,
        ...(gatewayVolumes.length ? { volumes: gatewayVolumes } : {}),
        ...(gatewayMounts.length ? { volumeMounts: gatewayMounts } : {}),
        service: { type: svcType, port: 4000 },
        hpa: { enabled: false },
        resources: {
          requests: { cpu: '100m', memory: '512Mi' },
          limits: { cpu: '1', memory: '2Gi' },
        },
      },
      backend: {
        envSecrets,
        service: { type: 'ClusterIP', port: 4001 },
        hpa: { enabled: false },
        resources: {
          requests: { cpu: '100m', memory: '512Mi' },
          limits: { cpu: '1', memory: '2Gi' },
        },
      },
      ui: {
        service: { type: svcType, port: 3000 },
        hpa: { enabled: false },
        resources: {
          requests: { cpu: '50m', memory: '128Mi' },
          limits: { cpu: '500m', memory: '512Mi' },
        },
      },
      migrationJob: { enabled: true },
    };

    const values = this.renderChart(
      props.chart ?? DEFAULT_CHART,
      id,
      props.namespace,
      computed,
      props.values,
      { helmFlags: ['--skip-tests'], version: props.version },
    );

    const fullname = values.fullnameOverride ?? id;
    const gatewayPort = values.gateway?.service?.port ?? 4000;
    const backendPort = values.backend?.service?.port ?? 4001;
    const uiPort = values.ui?.service?.port ?? 3000;

    const gatewayHost = `${fullname}-gateway`;
    const backendHost = `${fullname}-backend`;
    const uiHost = `${fullname}-ui`;

    const virtualKeyMap: Record<string, string> = {};
    if (props.virtualKeys && props.virtualKeys.length > 0) {
      this.createKeyProvisioningJob(
        id,
        props.namespace,
        masterSecret,
        backendHost,
        backendPort,
        props.virtualKeys,
      );
      for (const vk of props.virtualKeys) virtualKeyMap[vk.alias] = vk.key;
    }

    this.exports = {
      gatewayHost,
      gatewayPort,
      backendHost,
      backendPort,
      uiHost,
      uiPort,
      masterKey: props.masterKey,
      virtualKeys: virtualKeyMap,
      host: gatewayHost,
      port: gatewayPort,
    };
  }

  private static getPostgresHost(releaseName: string, values: LitellmMsPostgresqlValues): string {
    const serviceName = values.primary?.service?.name;
    if (serviceName) {
      return serviceName;
    }
    const fullname =
      values.global?.postgresql?.fullnameOverride ?? values.fullnameOverride ?? releaseName;
    if (values.architecture === 'replication') {
      return `${fullname}-${values.primary?.name ?? 'primary'}`;
    }
    return fullname;
  }

  private createKeyProvisioningJob(
    releaseName: string,
    namespace: string,
    masterSecretName: string,
    host: string,
    port: number,
    keys: LitellmMsVirtualKey[],
  ): void {
    const baseUrl = `http://${host}:${port}`;
    const scriptConfigMapName = `${releaseName}-provision-keys-scripts`;
    const payloadSecretName = `${releaseName}-provision-keys-data`;
    const keySpecs: string[] = [];
    const payloadFiles: Record<string, string> = {};

    keys.forEach((vk, index) => {
      const fileName = `key-${index}.json`;
      payloadFiles[fileName] = JSON.stringify({
        key_alias: vk.alias,
        key: vk.key,
        ...(vk.models ? { models: vk.models } : {}),
        ...(vk.max_budget !== undefined ? { max_budget: vk.max_budget } : {}),
      });
      keySpecs.push(`${vk.alias}\t${fileName}`);
    });

    new ApiObject(this, 'provision-scripts', {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: { name: scriptConfigMapName, namespace },
      data: {
        'wait-for-litellm.sh': WAIT_FOR_LITELLM_SCRIPT,
        'provision-keys.sh': PROVISION_KEYS_SCRIPT,
      },
    });

    new ApiObject(this, 'provision-data', {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: { name: payloadSecretName, namespace },
      stringData: payloadFiles,
    });

    new ApiObject(this, 'provision-keys', {
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: {
        name: `${releaseName}-provision-keys`,
        namespace,
        annotations: {
          'helm.sh/hook': 'post-install,post-upgrade',
          'helm.sh/hook-delete-policy': 'before-hook-creation,hook-succeeded',
        },
      },
      spec: {
        backoffLimit: 5,
        ttlSecondsAfterFinished: 300,
        template: {
          spec: {
            initContainers: [
              {
                name: 'wait-for-litellm',
                image: 'curlimages/curl:8.12.1',
                command: ['sh', '/scripts/wait-for-litellm.sh'],
                env: [
                  { name: 'LITELLM_BASE_URL', value: baseUrl },
                  { name: 'LITELLM_WAIT_RETRIES', value: '60' },
                  { name: 'LITELLM_WAIT_SLEEP_SECONDS', value: '5' },
                ],
                volumeMounts: [
                  { name: 'provision-scripts', mountPath: '/scripts', readOnly: true },
                ],
              },
            ],
            containers: [
              {
                name: 'provision',
                image: 'curlimages/curl:8.12.1',
                command: ['sh', '/scripts/provision-keys.sh'],
                env: [
                  { name: 'LITELLM_BASE_URL', value: baseUrl },
                  {
                    name: 'LITELLM_MASTER_KEY',
                    valueFrom: { secretKeyRef: { name: masterSecretName, key: 'master-key' } },
                  },
                  { name: 'LITELLM_KEY_SPECS', value: keySpecs.join('\n') },
                  { name: 'LITELLM_KEY_DIR', value: '/keys' },
                ],
                volumeMounts: [
                  { name: 'provision-scripts', mountPath: '/scripts', readOnly: true },
                  { name: 'provision-data', mountPath: '/keys', readOnly: true },
                ],
              },
            ],
            restartPolicy: 'OnFailure',
            volumes: [
              {
                name: 'provision-scripts',
                configMap: { name: scriptConfigMapName, defaultMode: 0o755 },
              },
              {
                name: 'provision-data',
                secret: { secretName: payloadSecretName, defaultMode: 0o644 },
              },
            ],
          },
        },
      },
    });
  }
}
