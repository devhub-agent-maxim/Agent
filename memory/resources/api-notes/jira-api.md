# Jira & Linear API Notes

<!-- AGENT INSTRUCTIONS
Reference notes for jira-sync-agent.js.
- Jira uses REST v3 with Basic Auth (email:api_token as base64)
- Linear uses GraphQL at https://api.linear.app/graphql
- LINEAR_API_KEY takes priority — if set, Linear is used; Jira is ignored
-->

---

## Jira Cloud REST API v3

### Authentication
```
Authorization: Basic base64(email:api_token)
Accept: application/json
Content-Type: application/json
```
Base URL: `${JIRA_BASE_URL}/rest/api/3/`
Obtain API token: https://id.atlassian.com/manage-profile/security/api-tokens

### Search issues (JQL)
```
GET /rest/api/3/search?jql={encoded_jql}&maxResults=10&fields=summary,status,assignee

Example JQL:
  project=DEV AND status=Todo AND assignee=currentUser() ORDER BY created DESC

Response: {
  issues: [{ id, key, fields: { summary, status: { name }, assignee } }]
}
```

### Get transitions (to find the "Done" transition ID)
```
GET /rest/api/3/issue/{issueKey}/transitions
Response: {
  transitions: [{ id, name, to: { name } }]
}
```
Find the transition where `to.name === "Done"` (exact name varies by project workflow).

### Update issue status (transition)
```
POST /rest/api/3/issue/{issueKey}/transitions
Body: { "transition": { "id": "31" } }
Response: 204 No Content on success
```

### Common status codes
- 204 — success (no body)
- 400 — invalid transition or body
- 401 — bad credentials
- 403 — no permission for this project
- 404 — issue not found

### Gotchas
- Transition IDs vary per project workflow — always fetch them dynamically.
- `assignee=currentUser()` requires the API token to belong to the assignee.
- Board-level statuses (e.g. "In Review") may not have a direct REST transition; use the workflow name.

---

## Linear GraphQL API

### Authentication
```
Authorization: ${LINEAR_API_KEY}    ← no "Bearer" prefix for personal keys
Content-Type: application/json
```
Endpoint: `https://api.linear.app/graphql`
Obtain key: https://linear.app/settings/api → Personal API keys

### Pull Todo issues
```graphql
query {
  issues(filter: { state: { name: { eq: "Todo" } } }, first: 10) {
    nodes {
      id          # UUID used for mutations
      identifier  # e.g. "ENG-42" — used in TASKS.md
      title
      description
    }
  }
}
```

### Find "Done" workflow state ID
```graphql
query {
  workflowStates(filter: { name: { eq: "Done" } }) {
    nodes { id name }
  }
}
```

### Update issue to Done
```graphql
mutation($id: String!, $stateId: String!) {
  issueUpdate(id: $id, input: { stateId: $stateId }) {
    success
    issue { id identifier state { name } }
  }
}
```

### Resolve identifier → UUID
```graphql
query($identifier: String!) {
  issue(id: $identifier) {
    id
  }
}
```
Note: Linear accepts the human-readable identifier (e.g. "ENG-42") as the `id` argument in queries.

### Common errors
- `AuthenticationError` — check LINEAR_API_KEY
- `NotFoundException` — issue ID not found; confirm identifier format
- Rate limit: 1500 requests/hour for personal keys

### Gotchas
- Linear `identifier` (e.g. ENG-42) differs from the internal UUID `id`.
  - Use `identifier` for display and TASKS.md entries.
  - Use `id` (UUID) for mutations.
- Workflow state names are case-sensitive in GraphQL filters.
- Team-scoped states: if "Done" doesn't exist at org level, query by team:
  `workflowStates(filter: { name: { eq: "Done" }, team: { id: { eq: "team-uuid" } } })`
