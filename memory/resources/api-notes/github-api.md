# GitHub API Notes

<!-- AGENT INSTRUCTIONS
Reference notes for agents making GitHub API calls.
- Use these patterns as a starting point — do not hardcode tokens
- All requests require Authorization: Bearer $GITHUB_TOKEN
- Rate limit: 5000 requests/hour for authenticated requests
- Use conditional requests (If-None-Match / ETag) to save rate limit budget
-->

## Authentication

```
Authorization: Bearer ${GITHUB_TOKEN}
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28
```

Token scopes needed per operation:
- Push/commit: `repo`
- Read public repos: `public_repo`
- Read org repos: `read:org`

---

## Common Endpoints

### List repos
```
GET https://api.github.com/user/repos?sort=updated&per_page=30
```

### Create commit via API (tree + commit + ref update)
```
POST https://api.github.com/repos/{owner}/{repo}/git/trees
POST https://api.github.com/repos/{owner}/{repo}/git/commits
PATCH https://api.github.com/repos/{owner}/{repo}/git/refs/heads/main
```

### Get latest commit SHA
```
GET https://api.github.com/repos/{owner}/{repo}/git/ref/heads/main
→ response.object.sha
```

### Create/update file directly (simpler for single-file changes)
```
PUT https://api.github.com/repos/{owner}/{repo}/contents/{path}
Body: { message, content (base64), sha (required for updates) }
```

### List pull requests
```
GET https://api.github.com/repos/{owner}/{repo}/pulls?state=open
```

---

## Rate Limiting

Check remaining budget from response headers:
- `X-RateLimit-Remaining` — requests left in current window
- `X-RateLimit-Reset` — Unix timestamp when window resets

```javascript
const remaining = parseInt(res.headers['x-ratelimit-remaining'] || '5000', 10);
if (remaining < 100) {
  log('Warning: GitHub rate limit running low');
}
```

---

## Error Handling Patterns

```javascript
if (res.status === 401) throw new Error('GitHub token invalid or missing repo scope');
if (res.status === 403) throw new Error('GitHub rate limit exceeded or insufficient permissions');
if (res.status === 404) throw new Error('Repo or resource not found — check GITHUB_TOKEN scope');
if (res.status === 422) throw new Error('Unprocessable entity — check request body format');
```

---

## Webhook Payload (for future use)

Verify webhook signature:
```javascript
const sig = req.headers['x-hub-signature-256'];
const expected = 'sha256=' + crypto.createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
  throw new Error('Invalid webhook signature');
}
```

---

## Gotchas

- The `git -C <dir> push` approach (used by deploy-agent) requires the remote URL to embed the token:
  `https://${GITHUB_TOKEN}@github.com/owner/repo.git`
  Or configure via git credential helper — never hardcode in source.
- Empty commits are rejected by `git commit`; wrap in try/catch and check for "nothing to commit".
- Binary files must be base64-encoded when using the Contents API.
