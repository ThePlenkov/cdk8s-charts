import type { DeepPartial } from '@cdk8s-charts/utils';

/**
 * Mastra Studio — Helm-style values for the Studio UI Deployment + Service.
 */
export interface Values {
  /** Node base image, or a prebuilt image that already contains the Mastra CLI. */
  image: string;
  /** Pinned Mastra version to install when the image does not contain the CLI. */
  mastraVersion: string;
  /** Mastra server service DNS name inside the cluster/compose network. */
  serverHost: string;
  /** Mastra server port. */
  serverPort: number;
  /** Port the Studio UI listens on. */
  studioPort: number;
  /** Kubernetes Service type. */
  serviceType: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
  /** Container command. Defaults to `/bin/sh -ec` which runs the startup script. */
  command: string[];
  /** Container arguments. Defaults to a script that installs a pinned Mastra version and starts Studio. */
  args: string[];
  /** Additional pod annotations. `composed.docker-x/depends-on` is set automatically. */
  podAnnotations: Record<string, string>;
  /** Readiness probe for the Studio container. */
  readinessProbe: {
    path: string;
    port: number;
    initialDelaySeconds: number;
    periodSeconds: number;
  };
}

/** @deprecated Use {@link Values}. */
export type MastraStudioValues = Values;

export interface Props {
  namespace: string;
  /** Mastra server service DNS name inside the cluster/compose network. */
  serverHost: string;
  /** Mastra server port. */
  serverPort: number;
  /** Port the Studio UI listens on (default: 3000). */
  studioPort?: number;
  /** Kubernetes Service type (default: LoadBalancer). */
  serviceType?: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
  /** Node base image, or a prebuilt image that already contains the Mastra CLI (default: node:22-bookworm-slim). */
  image?: string;
  /** Pinned Mastra version to install when the image does not contain the CLI (default: 1.20.2). */
  mastraVersion?: string;
  /** Container command override. */
  command?: string[];
  /** Container arguments override. */
  args?: string[];
  /** Raw value overrides (deep-merged into computed defaults). */
  values?: DeepPartial<Values>;
}

/** @deprecated Use {@link Props}. */
export type MastraStudioProps = Props;

export interface Exports {
  /** Service DNS name. */
  host: string;
  /** Service port. */
  port: number;
  /** Internal URL. */
  url: string;
}

/** @deprecated Use {@link Exports}. */
export type MastraStudioExports = Exports;
