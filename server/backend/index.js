require('dotenv').config();
const fs = require('fs');
const https = require('https');
const http = require('http');
const app = require('./app');

// Ports and TLS paths via env, with sensible defaults
const HTTP_PORT = Number(process.env.PORT || process.env.HTTP_PORT || 8000);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 443);
const SSL_KEY_PATH = process.env.SSL_KEY_PATH || '/etc/letsencrypt/live/bugchain.xyz/privkey.pem';
const SSL_CERT_PATH = process.env.SSL_CERT_PATH || '/etc/letsencrypt/live/bugchain.xyz/fullchain.pem';
const DISABLE_HTTPS = String(process.env.DISABLE_HTTPS || '').toLowerCase() === 'true';

// Start HTTP or HTTPS depending on cert availability
function startHttpWithRetry(port, retries = 5) {
  const server = http.createServer(app);
  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE' && retries > 0) {
      const nextPort = port + 1;
      console.warn(`⚠️  Port ${port} in use, retrying on :${nextPort} (remaining ${retries - 1})`);
      setTimeout(() => startHttpWithRetry(nextPort, retries - 1), 150);
    } else {
      console.error('Server failed to start:', err);
      process.exit(1);
    }
  });
  server.listen(port, () => {
    console.log(`✅ HTTP server listening on :${port}`);
  });
}

function startServers() {
  const hasKey = fs.existsSync(SSL_KEY_PATH);
  const hasCert = fs.existsSync(SSL_CERT_PATH);

  if (!DISABLE_HTTPS && hasKey && hasCert) {
    const sslOptions = {
      key: fs.readFileSync(SSL_KEY_PATH),
      cert: fs.readFileSync(SSL_CERT_PATH),
    };
    https.createServer(sslOptions, app).listen(HTTPS_PORT, () => {
      console.log(`✅ HTTPS server listening on :${HTTPS_PORT}`);
    });
  } else {
    const reason = DISABLE_HTTPS
      ? 'HTTPS disabled by env'
      : 'SSL certificates not found';
    console.log(`⚠️  ${reason} → starting HTTP on :${HTTP_PORT}`);
    startHttpWithRetry(HTTP_PORT, 10);
  }
}

startServers();

module.exports = app;
