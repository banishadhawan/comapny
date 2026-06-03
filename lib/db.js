import { Pool } from 'pg';

let pool;

export function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      console.warn("WARNING: DATABASE_URL is not configured.");
      return {
        query: async () => {
          throw new Error("Database URL is not configured. Please add DATABASE_URL in your environment variables (.env.local).");
        },
        end: async () => {}
      };
    }
    
    const isNeon = connectionString.includes('neon.tech') || connectionString.includes('aivencloud.com');
    pool = new Pool({
      connectionString,
      ssl: isNeon ? { rejectUnauthorized: false } : false,
      max: 10, // Suitable limit for Vercel Serverless environment
      idleTimeoutMillis: 15000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

export async function query(text, params) {
  const p = getPool();
  return p.query(text, params);
}
