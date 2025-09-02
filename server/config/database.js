const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
const sslRequired = /sslmode=require/i.test(connectionString || '');

const pool = new Pool({
  connectionString,
  // If Neon requires SSL via connection string, force SSL even in development
  ssl: sslRequired
    ? { rejectUnauthorized: false }
    : (process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false)
});

// Test connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('Database connection error:', err);
});

module.exports = pool;
