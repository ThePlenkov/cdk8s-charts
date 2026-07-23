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

function helmLatestVersion(chart, repo) {
  const args = ['show', 'chart', chart];
  if (repo) args.push('--repo', repo);
  const output = run('helm', args, { stdio: ['pipe', 'pipe', 'ignore'] });
  const match = output.match(/^version:\s*(.+)$/m);
  if (!match) throw new Error('version not found in helm show chart output');
  return match[1].trim();
}

function issueExists(title) {
  try {
    const output = run('gh', [
      'issue',
      'list',
      '--search',
      title,
      '--limit',
      '1',
      '--json',
      'number',
      '--jq',
      'length',
    ]);
    return (parseInt(output.trim(), 10) || 0) > 0;
  } catch {
    return false;
  }
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

  run('gh', ['issue', 'create', '--title', title, '--body', body]);
  console.log(`  created issue: ${title}`);
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
      if (DRY_RUN) {
        createIssue(chart.name, version, chart.chart, chart.repo);
        continue;
      }
      if (issueExists(`Update ${chart.name} to ${version}`)) {
        console.log(`  issue already exists for ${chart.name}@${version}`);
        continue;
      }
      createIssue(chart.name, version, chart.chart, chart.repo);
    } catch (error) {
      console.error(`${chart.name}: ${error.message}`);
    }
  }
}

main();
