import { loadEnv } from 'vite';
import { createRouter } from './router.js';

export function starryApiPlugin() {
  return {
    name: 'starry-api',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '');
      const handle = createRouter(env);
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0] || '';
        if (!path.startsWith('/api') && !path.startsWith('/auth')) {
          next();
          return;
        }
        try {
          await handle(req, res);
        } catch (error) {
          console.error(error);
          if (!res.writableEnded) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'server' }));
          }
        }
      });
    },
  };
}
