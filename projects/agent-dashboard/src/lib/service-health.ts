/**
 * Service Health Monitoring
 * Checks health endpoints of all agent services and tracks response times
 */

interface ServiceStatus {
  name: string;
  url: string;
  status: 'healthy' | 'slow' | 'down';
  responseTimeMs: number | null;
  timestamp: string;
  error?: string;
}

interface HealthCheckResponse {
  services: ServiceStatus[];
  summary: {
    total: number;
    healthy: number;
    slow: number;
    down: number;
  };
  timestamp: string;
}

/**
 * Check a single service health endpoint
 * @param name Service name
 * @param url Health endpoint URL
 * @param timeoutMs Request timeout in milliseconds (default: 5000)
 * @returns ServiceStatus object
 */
export async function checkServiceHealth(
  name: string,
  url: string,
  timeoutMs: number = 5000
): Promise<ServiceStatus> {
  const timestamp = new Date().toISOString();
  const startTime = Date.now();

  try {
    const fetch = (await import('node-fetch')).default;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal as any,
    });

    clearTimeout(timeoutId);
    const responseTimeMs = Date.now() - startTime;

    if (!response.ok) {
      return {
        name,
        url,
        status: 'down',
        responseTimeMs,
        timestamp,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    // Determine status based on response time
    let status: 'healthy' | 'slow' | 'down';
    if (responseTimeMs < 500) {
      status = 'healthy';
    } else if (responseTimeMs < 2000) {
      status = 'slow';
    } else {
      status = 'down';
    }

    return {
      name,
      url,
      status,
      responseTimeMs,
      timestamp,
    };
  } catch (error: any) {
    const responseTimeMs = Date.now() - startTime;

    let errorMessage = 'Unknown error';
    if (error.name === 'AbortError') {
      errorMessage = `Timeout after ${timeoutMs}ms`;
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Connection refused - service may be down';
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'Host not found';
    } else {
      errorMessage = error.message || 'Request failed';
    }

    return {
      name,
      url,
      status: 'down',
      responseTimeMs: null,
      timestamp,
      error: errorMessage,
    };
  }
}

/**
 * Check all agent services health
 * @returns HealthCheckResponse with all services status
 */
export async function checkAllServices(): Promise<HealthCheckResponse> {
  const services = [
    { name: 'Agent Tools', url: 'http://localhost:3000/health' },
    { name: 'Agent Dashboard', url: 'http://localhost:3001/health' },
    { name: 'Agent Scheduler', url: 'http://localhost:3002/health' },
  ];

  // Check all services in parallel
  const results = await Promise.all(
    services.map(({ name, url }) => checkServiceHealth(name, url))
  );

  // Calculate summary
  const summary = {
    total: results.length,
    healthy: results.filter(s => s.status === 'healthy').length,
    slow: results.filter(s => s.status === 'slow').length,
    down: results.filter(s => s.status === 'down').length,
  };

  return {
    services: results,
    summary,
    timestamp: new Date().toISOString(),
  };
}
