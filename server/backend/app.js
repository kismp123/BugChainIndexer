const express = require('express');
const cors = require('cors');

const app = express();

// basic middleware
app.use(cors());
app.use(express.json());

// health check
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// routes
const publicRoutes = require('./routes/public');
app.use('/', publicRoutes);

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Not Found' });
});

// error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ ok: false, error: 'Internal Server Error' });
});

module.exports = app;

