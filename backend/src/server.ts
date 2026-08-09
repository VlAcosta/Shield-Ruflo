import { buildApp } from './app.js';
import { env } from './config/env.js';

const app = await buildApp();

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  app.log.info({ signal }, 'Graceful shutdown started');

  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, 'Graceful shutdown failed');
    process.exit(1);
  }
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: env.HOST, port: env.PORT });
  app.log.info(
    {
      host: env.HOST,
      port: env.PORT,
      env: env.NODE_ENV,
      version: env.APP_VERSION,
    },
    'Business Shield API started',
  );
} catch (error) {
  app.log.fatal({ err: error }, 'Unable to start Business Shield API');
  process.exit(1);
}
