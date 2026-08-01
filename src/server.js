import app from './app.js';

const port = Number(process.env.PORT) || 3000;

const server = app.listen(port, () => {
  console.log(`Node.js service running at http://localhost:${port}`);
});

function shutdown(signal) {
  console.log(`${signal} received. Closing HTTP server.`);

  server.close((error) => {
    if (error) {
      console.error('Failed to close HTTP server cleanly.', error);
      process.exit(1);
    }

    console.log('HTTP server closed.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
