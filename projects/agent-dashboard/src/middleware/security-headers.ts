import helmet from 'helmet';
import { RequestHandler } from 'express';

/**
 * Security headers middleware using helmet
 * Configures comprehensive security headers for the dashboard web UI
 */
export const securityHeaders: RequestHandler = helmet({
  // Content Security Policy - Allow inline styles for dashboard UI
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts for dashboard
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for dashboard
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },

  // HTTP Strict Transport Security - Force HTTPS
  hsts: {
    maxAge: 31536000, // 1 year in seconds
    includeSubDomains: true,
    preload: true,
  },

  // X-Frame-Options - Prevent clickjacking
  frameguard: {
    action: 'deny',
  },

  // X-Content-Type-Options - Prevent MIME sniffing
  noSniff: true,

  // X-DNS-Prefetch-Control - Control DNS prefetching
  dnsPrefetchControl: {
    allow: false,
  },

  // X-Download-Options - Prevent IE from executing downloads
  ieNoOpen: true,

  // Referrer-Policy - Control referrer information
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },

  // X-Permitted-Cross-Domain-Policies - Restrict cross-domain policies
  permittedCrossDomainPolicies: {
    permittedPolicies: 'none',
  },

  // Remove X-Powered-By header
  hidePoweredBy: true,
});
