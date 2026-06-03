const { Client } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: '.env.local' });

async function addUser(email, password, role = 'seller', name = '') {
  if (!email || !password) {
    console.error('Usage: node scripts/add-user.js email password [role] [name]');
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Error: DATABASE_URL is not defined in .env.local');
    process.exit(1);
  }

  const client = new Client({ connectionString, ssl: connectionString.includes('neon.tech') || connectionString.includes('aivencloud.com') ? { rejectUnauthorized: false } : false });
  try {
    await client.connect();
    const pwHash = bcrypt.hashSync(password, 10);
    const res = await client.query('INSERT INTO users (email, password_hash, role, name) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, name = EXCLUDED.name RETURNING id, email, role, name', [email.toLowerCase().trim(), pwHash, role, name || email]);
    console.log('User created/updated:', res.rows[0]);
  } catch (err) {
    console.error('Error adding user:', err);
  } finally {
    await client.end();
  }
}

const args = process.argv.slice(2);
addUser(args[0], args[1], args[2], args[3]);
