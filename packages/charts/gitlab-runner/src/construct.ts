import { HelmConstruct } from '@cdk8s-charts/utils';
import type { Construct } from 'constructs';
import type { GitlabRunnerExports, GitlabRunnerProps, GitlabRunnerValues } from './types';

const DEFAULT_JOB_IMAGE = 'node:22';
const DEFAULT_RUNNER_CONFIG = (namespace: string, image: string) => `[[runners]]
  clone_url = "http://gitlab/"
  [runners.kubernetes]
    namespace = "${namespace}"
    image = "${image}"
    pull_policy = ["if-not-present"]
`;

export class GitlabRunner extends HelmConstruct<GitlabRunnerValues> {
  public readonly exports: GitlabRunnerExports;

  constructor(scope: Construct, id: string, props: GitlabRunnerProps) {
    super(scope, id);

    const jobNamespace = props.jobNamespace ?? props.namespace;
    const defaultJobImage = props.defaultJobImage ?? DEFAULT_JOB_IMAGE;

    const computed: GitlabRunnerValues = {
      gitlabUrl: props.gitlabUrl,
      imagePullPolicy: 'IfNotPresent',
      concurrent: 2,
      checkInterval: 3,
      rbac: {
        create: true,
        clusterWideAccess: false,
        rules: [
          { resources: ['events'], verbs: ['list', 'watch'] },
          { resources: ['pods'], verbs: ['create', 'delete', 'get', 'list', 'watch'] },
          {
            apiGroups: [''],
            resources: ['pods/attach', 'pods/exec'],
            verbs: ['create', 'delete', 'get', 'patch'],
          },
          { resources: ['pods/log'], verbs: ['get', 'list'] },
          { resources: ['secrets'], verbs: ['create', 'delete', 'get', 'update'] },
          { resources: ['serviceaccounts'], verbs: ['get'] },
          { resources: ['services'], verbs: ['create', 'get'] },
        ],
      },
      serviceAccount: {
        create: true,
      },
      runners: {
        secret: props.runnerSecretName,
        config: DEFAULT_RUNNER_CONFIG(jobNamespace, defaultJobImage),
      },
    };

    this.renderChart('gitlab-runner', id, props.namespace, computed, props.values, {
      helmFlags: ['--repo', 'https://charts.gitlab.io'],
      version: props.version,
    });

    this.exports = {
      deploymentName: id,
      secretName: props.runnerSecretName,
    };
  }
}
