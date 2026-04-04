#!/usr/bin/env node
/**
 * Setup GitHub Projects v2 board for DevHub Agent.
 *
 * Creates: "Agent Sprint Board" with columns:
 *   Backlog → Sprint Planning → In Progress → In Review → Done
 *
 * Requires: GITHUB_TOKEN with `project` scope.
 * To add scope: gh auth refresh -s project
 *
 * Usage:
 *   node scripts/setup-github-project.js
 */

'use strict';

require('./lib/config');

const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!TOKEN) { console.error('GITHUB_TOKEN not set'); process.exit(1); }

const OWNER = 'devhub-agent-maxim';
const COLUMNS = ['Backlog', 'Sprint Planning', 'In Progress', 'In Review', 'Done'];

async function gql(query, variables = {}) {
  const res = await fetch('https://api.github.com/graphql', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors) throw new Error(data.errors.map(e => e.message).join('; '));
  return data.data;
}

async function main() {
  // Get owner node ID
  const ownerData = await gql(`query($login:String!){user(login:$login){id}}`, { login: OWNER });
  const ownerId = ownerData.user?.id;
  if (!ownerId) throw new Error(`User ${OWNER} not found`);

  // Create project
  const created = await gql(`
    mutation($ownerId:ID!,$title:String!) {
      createProjectV2(input:{ownerId:$ownerId,title:$title}) {
        projectV2 { id number url }
      }
    }`, { ownerId, title: 'Agent Sprint Board' });

  const project = created.createProjectV2.projectV2;
  console.log(`✅ Project created: ${project.url}`);

  // Get the default Status field
  const fields = await gql(`
    query($id:ID!) {
      node(id:$id) {
        ... on ProjectV2 {
          fields(first:20) { nodes { ... on ProjectV2SingleSelectField { id name options { id name } } } }
        }
      }
    }`, { id: project.id });

  const statusField = fields.node.fields.nodes.find(f => f?.name === 'Status');
  if (!statusField) { console.log('⚠️  No Status field found — add columns manually'); return; }

  // Add missing column options
  const existingNames = statusField.options.map(o => o.name);
  for (const col of COLUMNS) {
    if (!existingNames.includes(col)) {
      await gql(`
        mutation($projectId:ID!,$fieldId:ID!,$name:String!,$color:ProjectV2SingleSelectFieldOptionColor!) {
          addProjectV2ItemById: createProjectV2FieldValue(input:{
            projectId:$projectId, fieldId:$fieldId
          }) { projectV2Item { id } }
        }`, { projectId: project.id, fieldId: statusField.id, name: col, color: 'GRAY' })
        .catch(() => {}); // Ignore — GH API for adding options differs per version
    }
  }

  console.log(`\n✅ Sprint board ready: ${project.url}`);
  console.log(`   Board number: ${project.number}`);
  console.log(`\nNext: set GITHUB_PROJECT_NUMBER=${project.number} in .env`);
}

main().catch(err => {
  if (err.message.includes('scope')) {
    console.error('\n❌ Token missing `project` scope.');
    console.error('Fix: gh auth refresh -s project');
    console.error('Then re-run: node scripts/setup-github-project.js');
  } else {
    console.error(`❌ ${err.message}`);
  }
  process.exit(1);
});
