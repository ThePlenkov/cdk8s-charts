import type { DeepPartial } from '@cdk8s-charts/utils';

export interface GitlabRunnerValues {
  gitlabUrl?: string;
  /**
   * @deprecated Prefer providing the token via a Kubernetes Secret and setting
   * `runners.secret` (or `GitlabRunnerProps.runnerSecretName`) instead.
   * Setting this value stores the token in plaintext Helm release state.
   */
  runnerToken?: string;
  imagePullPolicy?: 'Always' | 'IfNotPresent' | 'Never';
  concurrent?: number;
  checkInterval?: number;
  rbac?: {
    create?: boolean;
    clusterWideAccess?: boolean;
    rules?: Array<{
      apiGroups?: string[];
      resources?: string[];
      verbs?: string[];
    }>;
  };
  serviceAccount?: {
    create?: boolean;
    name?: string;
  };
  runners?: {
    secret?: string;
    tags?: string;
    runUntagged?: boolean;
    protected?: boolean;
    locked?: boolean;
    config?: string;
  };
  resources?: {
    limits?: Record<string, string>;
    requests?: Record<string, string>;
  };
  fullnameOverride?: string;
  nameOverride?: string;
}

export interface GitlabRunnerProps {
  namespace: string;
  gitlabUrl: string;
  runnerSecretName: string;
  jobNamespace?: string;
  defaultJobImage?: string;
  /** Helm chart ref. Defaults to gitlab-runner. */
  chart?: string;
  /** Helm repository URL for the chart. Defaults to the GitLab chart repo. */
  repo?: string;
  /** Optional Helm chart version pin. Omit to let Helm resolve the latest chart. */
  version?: string;
  values?: DeepPartial<GitlabRunnerValues>;
}

export interface GitlabRunnerExports {
  deploymentName: string;
  secretName: string;
}

export type Values = GitlabRunnerValues;
export type Props = GitlabRunnerProps;
export type Exports = GitlabRunnerExports;
