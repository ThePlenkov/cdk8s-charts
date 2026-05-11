# @cdk8s-charts/gitlab-runner

Typed cdk8s construct for the [GitLab Runner Helm chart](https://docs.gitlab.com/runner/install/kubernetes/).

## Usage

```typescript
import { GitlabRunner } from '@cdk8s-charts/gitlab-runner';

const runner = new GitlabRunner(this, 'runner', {
  namespace: 'ci',
  gitlabUrl: 'https://gitlab.example.com',
  runnerSecretName: 'gitlab-runner-token',
  jobNamespace: 'ci-jobs',
});

console.log(runner.exports.deploymentName);
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `namespace` | `string` | yes | K8s namespace for the runner manager |
| `gitlabUrl` | `string` | yes | GitLab URL for registration and default clone URL |
| `runnerSecretName` | `string` | yes | Existing Kubernetes Secret containing the runner token |
| `jobNamespace` | `string` | no | Namespace where runner jobs execute |
| `defaultJobImage` | `string` | no | Default Kubernetes executor image |
| `version` | `string` | no | Helm chart version pin |
| `values` | `DeepPartial<GitlabRunnerValues>` | no | Raw Helm overrides |

## Exports

| Export | Type | Description |
|--------|------|-------------|
| `deploymentName` | `string` | Helm deployment fullname |
| `secretName` | `string` | Runner token Secret name |
