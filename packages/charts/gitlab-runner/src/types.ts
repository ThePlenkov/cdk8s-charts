import type { DeepPartial } from '@cdk8s-charts/utils';

export interface GitlabRunnerValues {
  gitlabUrl?: string;
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
}

export interface GitlabRunnerProps {
  namespace: string;
  gitlabUrl: string;
  runnerSecretName: string;
  jobNamespace?: string;
  defaultJobImage?: string;
  /** Optional Helm chart version pin. Omit to let Helm resolve the latest chart. */
  version?: string;
  values?: DeepPartial<GitlabRunnerValues>;
}

export interface GitlabRunnerExports {
  deploymentName: string;
  secretName: string;
}
