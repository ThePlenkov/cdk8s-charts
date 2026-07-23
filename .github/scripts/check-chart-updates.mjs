import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const CHART_INDEX = join(REPO_ROOT, '.github', 'chart-index.json');
const DRY_RUN = process.argv.includes('--dry-run');

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...opts,
  });
}

function getRepoSlug() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  try {
    const url = run('git', ['remote', 'get-url', 'origin'], {
      cwd: REPO_ROOT,
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    const match = url.match(/github\.com[:/](.+?)(?:\.git)?$/);
    return match ? match[1] : undefined;
  } catch {
    return undefined;
  }
}

function repoArgs() {
  const slug = getRepoSlug();
  return slug ? ['--repo', slug] : [];
}

function helmLatestVersion(chart, repo) {
  const args = ['show', 'chart', chart];
  if (repo) args.push('--repo', repo);
  const output = run('helm', args, { stdio: ['pipe', 'pipe', 'ignore'] });
  const match = output.match(/^version:\s*(.+)$/m);
  if (!match) throw new Error('version not found in helm show chart output');
  return match[1].trim();
}

function findOpenIssues(name) {
  const searchQuery = `Update ${name} to`;
  try {
    const output = run('gh', [
      'search',
      'issues',
      searchQuery,
      ...repoArgs(),
      '--state',
      'open',
      '--match',
      'title',
      '--sort',
      'updated',
      '--order',
      'desc',
      '--limit',
      '10',
      '--json',
      'number,title,updatedAt',
    ]);
    return JSON.parse(output);
  } catch {
    return [];
  }
}

function closeIssue(number) {
  if (DRY_RUN) {
    console.log(`[dry-run] would close duplicate issue #${number}`);
    return;
  }
  run('gh', [
    'issue',
    'close',
    String(number),
    ...repoArgs(),
    '--comment',
    'Superseded by a newer version update.',
  ]);
}

function createIssue(name, version, chart, repo) {
  const title = `Update ${name} to ${version}`;
  const ref = repo ? `${chart} --repo ${repo}` : chart;
  const body = [
    `A new upstream Helm chart version is available for **${name}**: \`${version}\`.`,
    '',
    '**Chart reference:**',
    `\`${ref}\``,
    '',
    'Next steps (manual):',
    `1. Inspect the new Helm values: \`helm show values ${ref}\``,
    `2. Update \`packages/charts/${name}/src/construct.ts\` and regenerate types if the schema changed.`,
    '3. Run the build and example to verify the updated chart still synthesizes.',
    '',
    '<!-- chart-update -->',
  ].join('\n');

  if (DRY_RUN) {
    console.log(`[dry-run] would create issue: ${title}`);
    return;
  }

  const output = run('gh', ['issue', 'create', '--title', title, '--body', body, ...repoArgs()]);
  console.log(`  created issue: ${title} (${output.trim()})`);
}

function updateIssue(number, name, version, chart, repo) {
  const title = `Update ${name} to ${version}`;
  const ref = repo ? `${chart} --repo ${repo}` : chart;
  const body = [
    `A new upstream Helm chart version is available for **${name}**: \`${version}\`.`,
    '',
    '**Chart reference:**',
    `\`${ref}\``,
    '',
    'Next steps (manual):',
    `1. Inspect the new Helm values: \`helm show values ${ref}\``,
    `2. Update \`packages/charts/${name}/src/construct.ts\` and regenerate types if the schema changed.`,
    '3. Run the build and example to verify the updated chart still synthesizes.',
    '',
    '<!-- chart-update -->',
  ].join('\n');

  if (DRY_RUN) {
    console.log(`[dry-run] would update issue #${number}: ${title}`);
    return;
  }

  run('gh', ['issue', 'edit', String(number), '--title', title, '--body', body, ...repoArgs()]);
  console.log(`  updated issue #${number}: ${title}`);
}

function processChart(chart, version) {
  const title = `Update ${chart.name} to ${version}`;
  const issues = findOpenIssues(chart.name);

  // No open issue -> create one.
  if (issues.length === 0) {
    createIssue(chart.name, version, chart.chart, chart.repo);
    return;
  }

  // Keep the most recently updated issue and close any duplicates.
  const [primary, ...duplicates] = issues;
  for (const duplicate of duplicates) {
    console.log(`  closing duplicate issue #${duplicate.number} for ${chart.name}`);
    closeIssue(duplicate.number);
  }

  // If the primary issue already points to the current version, nothing to do.
  if (primary.title === title) {
    console.log(`  issue already up to date: ${title}`);
    return;
  }

  updateIssue(primary.number, chart.name, version, chart.chart, chart.repo);
}

function warnAboutUnindexedCharts(indexed) {
  const chartsDir = join(REPO_ROOT, 'packages', 'charts');
  for (const dir of readdirSync(chartsDir)) {
    const construct = join(chartsDir, dir, 'src', 'construct.ts');
    if (!statSync(join(chartsDir, dir)).isDirectory() || !existsSync(construct)) {
      continue;
    }
    const content = readFileSync(construct, 'utf8');
    if (content.includes('renderChart(') && !indexed.has(dir)) {
      console.warn(`Warning: ${dir} uses renderChart but is not in .github/chart-index.json`);
    }
  }
}

async function main() {
  const index = JSON.parse(readFileSync(CHART_INDEX, 'utf8'));
  const indexed = new Set(index.charts.map((c) => c.name));
  warnAboutUnindexedCharts(indexed);

  for (const chart of index.charts) {
    try {
      const version = helmLatestVersion(chart.chart, chart.repo);
      console.log(`${chart.name}: ${version}`);
      processChart(chart, version);
    } catch (error) {
      console.error(`${chart.name}: ${error.message}`);
    }
  }
}

main();
