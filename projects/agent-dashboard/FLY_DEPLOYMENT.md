# Fly.io Deployment Instructions

## Current Status: ⚠️ Authentication Required

The Fly CLI has been installed and configured, but authentication is needed to proceed.

## What's Been Done

✅ **Fly CLI Installed**
- Location: `C:\Users\maxim\.fly\bin\flyctl.exe`
- Version: Latest

✅ **fly.toml Created**
- App name: `agent-dashboard`
- Region: Singapore (sin)
- Runtime: Node 20 via Dockerfile
- Memory: 256MB
- Health checks: Enabled at `/health`
- HTTPS: Enforced
- Auto-scaling: Enabled

## Next Steps (For Maxim)

### 1. Complete Authentication

A browser window should have opened at:
```
https://fly.io/app/auth/cli/...
```

**If the browser didn't open:**
```bash
cd projects/agent-dashboard
C:/Users/maxim/.fly/bin/flyctl.exe auth login
```

**Alternative: Use API Token**
If you have a Fly.io API token:
```bash
$env:FLY_API_TOKEN = "your-token-here"
```

### 2. Verify Authentication
```bash
C:/Users/maxim/.fly/bin/flyctl.exe auth whoami
```

### 3. Launch the App (No Deploy)
```bash
cd projects/agent-dashboard
C:/Users/maxim/.fly/bin/flyctl.exe launch --no-deploy
```

This will:
- Create the app on Fly.io
- Allocate resources
- Generate app URL (e.g., `agent-dashboard.fly.dev`)

### 4. Set Environment Variables
```bash
# CORS origins (allow dashboard to call itself)
C:/Users/maxim/.fly/bin/flyctl.exe secrets set CORS_ALLOWED_ORIGINS="https://agent-dashboard.fly.dev,http://localhost:3001"

# Optional: Service URLs if other services are deployed
# flyctl secrets set AGENT_TOOLS_URL="https://agent-tools.fly.dev"
# flyctl secrets set AGENT_SCHEDULER_URL="https://agent-scheduler.fly.dev"
```

### 5. Deploy
```bash
C:/Users/maxim/.fly/bin/flyctl.exe deploy
```

This will:
- Build the Docker image
- Push to Fly.io registry
- Deploy to production
- Run health checks

### 6. Test the Deployment
```bash
# Check app status
C:/Users/maxim/.fly/bin/flyctl.exe status

# Check logs
C:/Users/maxim/.fly/bin/flyctl.exe logs

# Open in browser
C:/Users/maxim/.fly/bin/flyctl.exe open
```

### 7. Get the URL
```bash
C:/Users/maxim/.fly/bin/flyctl.exe info
```

The dashboard will be available at: `https://agent-dashboard.fly.dev`

## Troubleshooting

### Authentication Issues
- Make sure you're logged into Fly.io in the browser
- Try `flyctl auth logout` then `flyctl auth login` again

### Build Failures
- Check Dockerfile is valid: `docker build -t test .`
- Check logs: `flyctl logs`

### Health Check Failures
- Verify `/health` endpoint works locally
- Check the app is listening on port 3001 (internal port in fly.toml)

### Memory Issues
- If 256MB isn't enough, edit fly.toml and change `memory = "512mb"`
- Redeploy: `flyctl deploy`

## Cost Estimate

- **Free Tier**: 3 shared-cpu-1x VMs with 256MB RAM each
- **This Deployment**: 1 VM, 256MB RAM = **FREE** (within limits)
- **After Free Tier**: ~$1.94/month for 1 VM

## Security Notes

- HTTPS is enforced (force_https = true)
- Health checks run every 30 seconds
- Non-root user in container (nodejs:1001)
- Security headers enabled via helmet middleware
- CORS restricted to specified origins

## Monitoring

After deployment, monitor at:
- **Dashboard**: https://fly.io/apps/agent-dashboard
- **Metrics**: https://fly.io/apps/agent-dashboard/metrics
- **Logs**: `flyctl logs -a agent-dashboard`

## Updating After Changes

```bash
cd projects/agent-dashboard
npm run build
flyctl deploy
```

## Rolling Back

```bash
# List releases
flyctl releases -a agent-dashboard

# Rollback to previous version
flyctl releases rollback <version> -a agent-dashboard
```
