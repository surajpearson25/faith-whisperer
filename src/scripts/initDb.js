const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

async function run() {
  const schemaPath = path.join(__dirname, '../../sql/schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  try {
    await pool.query(sql);
    console.log('Database schema initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize database schema:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
