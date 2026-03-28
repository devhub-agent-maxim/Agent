# Vercel API Notes

<!-- AGENT INSTRUCTIONS
Reference notes for agents interacting with the Vercel REST API v13.
- Base URL: https://api.vercel.com
- Auth header: Authorization: Bearer ${VERCEL_TOKEN}
- All responses are JSON
- Deploy states: INITIALIZING → BUILDING → READY | ERROR | CANCELED
-->

## Authentication

```
Authorization: Bearer ${VERCEL_TOKEN}
Content-Type: application/json
```

Token scopes: use a "Full Account" token for deployments, or scope to specific team.
Obtain at: https://vercel.com/account/tokens

---

## Deployment Lifecycle

### 1. Create deployment
```
POST https://api.vercel.com/v13/deployments
Body: {
  "name": "project-name",
  "target": "production",          // "production" | "preview"
  "gitSource": {                   // optional — omit for file-based deploys
    "type": "github",
    "repo": "owner/repo",
    "ref": "main"
  }
}
Response: { id, url, status, ... }
```

### 2. Poll status
```
GET https://api.vercel.com/v13/deployments/{deploymentId}
Response: { id, url, status, readyState, ... }
```

States:
- `INITIALIZING` — queued
- `BUILDING` — build running
- `READY` — deployed and live
- `ERROR` — build or deploy failed
- `CANCELED` — manually canceled

### 3. Verify live URL
```javascript
// deploy-agent polls every 10s up to 5 minutes (30 attempts)
const liveUrl = `https://${deployment.url}`;
const httpStatus = await httpsGet(liveUrl); // expect 200
```

---

## List deployments for a project
```
GET https://api.vercel.com/v6/deployments?projectId={id}&limit=5
```

## Get deployment logs (for debugging)
```
GET https://api.vercel.com/v2/deployments/{id}/events
```

---

## Error Handling

```javascript
if (res.status === 400) throw new Error('Bad request — check deployment payload format');
if (res.status === 401) throw new Error('Vercel token invalid or expired');
if (res.status === 402) throw new Error('Vercel plan limit reached');
if (res.status === 403) throw new Error('Vercel token lacks permission for this team/project');
if (res.status === 409) throw new Error('Deployment already exists with this configuration');
```

---

## Environment Variables via API

```
PATCH https://api.vercel.com/v10/projects/{projectId}/env
Body: [{ key, value, type: "encrypted" | "plain", target: ["production"] }]
```

---

## Gotchas

- `url` in the response does NOT include `https://` — prepend it manually.
- `status` and `readyState` may both be present; `readyState` is the newer field.
- Deployments triggered by git push (via Vercel Git integration) are separate from
  API-triggered deployments — deploy-agent uses direct API calls.
- The first deploy to a new project name auto-creates the project on Vercel.
- Production domains are only assigned after the first successful deploy with
  `"target": "production"`.
