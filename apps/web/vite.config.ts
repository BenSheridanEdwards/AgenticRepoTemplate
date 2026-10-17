import react from '@vitejs/plugin-react';
import { type Connect, defineConfig, type Plugin } from 'vite';

// The service-status feature fetches from `/api/service-status`. The template
// ships no backend, so this tiny middleware serves a static sample list for the
// dev and preview servers. It exists only to make the running app show real
// data, tests drive the endpoint themselves via network interception (see
// e2e/service-status.spec.ts) rather than relying on this response.
const SAMPLE_SERVICE_STATUSES = [
  { identifier: 'web', name: 'Web application', health: 'operational' },
  { identifier: 'api', name: 'Public API', health: 'degraded' },
  { identifier: 'jobs', name: 'Background jobs', health: 'down' },
];

function serviceStatusEndpoint(): Plugin {
  const handle: Connect.NextHandleFunction = (request, response, next) => {
    if (request.url !== '/api/service-status') {
      next();
      return;
    }
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(SAMPLE_SERVICE_STATUSES));
  };
  return {
    name: 'service-status-endpoint',
    configureServer: (server) => {
      server.middlewares.use(handle);
    },
    configurePreviewServer: (server) => {
      server.middlewares.use(handle);
    },
  };
}

// Vite is only the carrier that makes this template runnable. The agentic
// scaffolding (gates, context, skills) is stack-agnostic — see README.md.
export default defineConfig({
  plugins: [react(), serviceStatusEndpoint()],
  server: { port: 5173 },
  preview: { port: 3000 },
});
