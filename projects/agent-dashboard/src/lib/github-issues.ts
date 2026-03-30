import { execSync } from 'child_process';

export interface GitHubIssue {
  number: number;
  title: string;
  state: 'open' | 'closed';
  labels: string[];
  url: string;
  column: 'backlog' | 'in-progress' | 'done';
}

export interface KanbanBoard {
  backlog: GitHubIssue[];
  inProgress: GitHubIssue[];
  done: GitHubIssue[];
}

/**
 * Validates GitHub owner/repo name to prevent command injection
 * GitHub names can only contain: alphanumeric, hyphens, underscores, periods
 * Cannot start with a period or hyphen
 * @throws Error if invalid
 */
function validateGitHubIdentifier(value: string, type: 'owner' | 'repo'): void {
  if (!value || typeof value !== 'string') {
    throw new Error(`Invalid ${type}: must be a non-empty string`);
  }

  // GitHub owner/repo naming rules
  const validPattern = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;

  if (!validPattern.test(value)) {
    throw new Error(
      `Invalid ${type} "${value}": can only contain alphanumeric characters, hyphens, underscores, and periods`
    );
  }

  // Additional length validation (GitHub limits)
  if (value.length > 39) {
    throw new Error(`Invalid ${type} "${value}": exceeds maximum length of 39 characters`);
  }
}

/**
 * Validates file path to prevent directory traversal
 * @throws Error if path contains dangerous patterns
 */
function validateRepoPath(path: string): void {
  if (!path || typeof path !== 'string') {
    throw new Error('Invalid repo path: must be a non-empty string');
  }

  // Block directory traversal attempts
  const dangerousPatterns = ['..', '~', '$', '`', ';', '|', '&', '>', '<', '\n', '\r'];

  for (const pattern of dangerousPatterns) {
    if (path.includes(pattern)) {
      throw new Error(`Invalid repo path: contains dangerous pattern "${pattern}"`);
    }
  }
}

/**
 * Fetches GitHub issues using gh CLI and categorizes them into Kanban columns
 * Issues are categorized based on labels:
 * - "in progress" label -> In Progress column
 * - "done" or closed state -> Done column
 * - Everything else -> Backlog column
 */
export async function getGitHubIssuesKanban(owner: string, repo: string): Promise<KanbanBoard> {
  // Validate inputs to prevent command injection (throws on invalid input)
  validateGitHubIdentifier(owner, 'owner');
  validateGitHubIdentifier(repo, 'repo');

  try {
    // Fetch open issues with gh CLI
    const openIssuesJson = execSync(
      `gh issue list --repo ${owner}/${repo} --json number,title,labels,url --limit 100`,
      { encoding: 'utf8', timeout: 10000 }
    );

    // Fetch closed issues (last 20)
    const closedIssuesJson = execSync(
      `gh issue list --repo ${owner}/${repo} --state closed --json number,title,labels,url --limit 20`,
      { encoding: 'utf8', timeout: 10000 }
    );

    const openIssues = JSON.parse(openIssuesJson || '[]');
    const closedIssues = JSON.parse(closedIssuesJson || '[]');

    const backlog: GitHubIssue[] = [];
    const inProgress: GitHubIssue[] = [];
    const done: GitHubIssue[] = [];

    // Process open issues
    for (const issue of openIssues) {
      const labels = issue.labels?.map((l: any) => l.name.toLowerCase()) || [];
      const ghIssue: GitHubIssue = {
        number: issue.number,
        title: issue.title,
        state: 'open',
        labels: issue.labels?.map((l: any) => l.name) || [],
        url: issue.url,
        column: 'backlog'
      };

      if (labels.includes('in progress') || labels.includes('in-progress')) {
        ghIssue.column = 'in-progress';
        inProgress.push(ghIssue);
      } else {
        ghIssue.column = 'backlog';
        backlog.push(ghIssue);
      }
    }

    // Process closed issues (all go to done)
    for (const issue of closedIssues) {
      const ghIssue: GitHubIssue = {
        number: issue.number,
        title: issue.title,
        state: 'closed',
        labels: issue.labels?.map((l: any) => l.name) || [],
        url: issue.url,
        column: 'done'
      };
      done.push(ghIssue);
    }

    return { backlog, inProgress, done };
  } catch (error: any) {
    console.error('[github-issues] Error fetching issues:', error.message);
    return { backlog: [], inProgress: [], done: [] };
  }
}

/**
 * Extracts owner/repo from git remote URL
 * Returns null if unable to determine or if path is invalid
 */
export function getGitHubRepoInfo(repoPath: string): { owner: string; repo: string } | null {
  try {
    // Validate repo path to prevent directory traversal (throws on invalid)
    validateRepoPath(repoPath);

    const remoteUrl = execSync('git remote get-url origin', {
      cwd: repoPath,
      encoding: 'utf8',
      timeout: 5000
    }).trim();

    // Parse GitHub URL (supports both HTTPS and SSH formats)
    // HTTPS: https://github.com/owner/repo.git
    // SSH: git@github.com:owner/repo.git
    const httpsMatch = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
    if (httpsMatch) {
      return {
        owner: httpsMatch[1],
        repo: httpsMatch[2].replace(/\.git$/, '')
      };
    }

    return null;
  } catch (error: any) {
    // Return null for both validation errors and execution errors
    console.error('[github-issues] Error getting repo info:', error.message);
    return null;
  }
}
