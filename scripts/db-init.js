const { Client } = require('pg');
const bcrypt = require('bcryptjs');

// Load .env.local variables if running locally
require('dotenv').config({ path: '.env.local' });

async function initDB() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Error: DATABASE_URL is not defined in your environment or .env.local file.');
    process.exit(1);
  }

  console.log('Connecting to database...');
  const isNeon = connectionString.includes('neon.tech') || connectionString.includes('aivencloud.com');
  const client = new Client({
    connectionString: connectionString,
    ssl: isNeon ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    console.log('Connected successfully. Creating tables...');

    // 1. Enable UUID extension if not already present
    await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    // 2. Create Users Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'seller')),
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Users table ready.');

    // 3. Create Products Table
    // base_unit: g, kg, L, mL, items
    // base_price_inr: numeric(20,4) allows up to 99,999,999,999,999,999.9999 (plenty for high prices)
    // inventory_quantity: numeric(20,8) handles high precision fractions
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        sku VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100) NOT NULL,
        base_unit VARCHAR(20) NOT NULL CHECK (base_unit IN ('g', 'kg', 'L', 'mL', 'items')),
        base_price_inr NUMERIC(20, 4) NOT NULL CHECK (base_price_inr >= 0),
        inventory_quantity NUMERIC(20, 8) NOT NULL DEFAULT 0 CHECK (inventory_quantity >= 0),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Products table ready.');

    // 4. Create Orders Table
    // status: pending, approved, rejected, cancelled
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
        total_price_inr NUMERIC(20, 4) NOT NULL CHECK (total_price_inr >= 0),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Orders table ready.');

    // 5. Create Order Items Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        ordered_quantity NUMERIC(20, 8) NOT NULL CHECK (ordered_quantity > 0),
        ordered_unit VARCHAR(20) NOT NULL CHECK (ordered_unit IN ('g', 'kg', 'L', 'mL', 'items')),
        price_per_ordered_unit_inr NUMERIC(20, 4) NOT NULL CHECK (price_per_ordered_unit_inr >= 0),
        converted_quantity_base NUMERIC(20, 8) NOT NULL CHECK (converted_quantity_base > 0),
        item_total_price_inr NUMERIC(20, 4) NOT NULL CHECK (item_total_price_inr >= 0)
      );
    `);
    console.log('Order items table ready.');

    // --- SEED DATA ---
    console.log('Seeding initial data...');

    // Seed Users
    const adminPasswordHash = bcrypt.hashSync('adminpassword', 10);
    const sellerPasswordHash = bcrypt.hashSync('sellerpassword', 10);

    await client.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES 
        ('admin@aasamedchem.com', $1, 'admin', 'Dr. Alistair Admin'),
        ('seller@aasamedchem.com', $2, 'seller', 'Sam Seller')
      ON CONFLICT (email) DO NOTHING;
    `, [adminPasswordHash, sellerPasswordHash]);
    console.log('Seeded users.');

    // Seed Products
    const seedProducts = [
      {
        sku: 'CHEM-NACL-001',
        name: 'Sodium Chloride (Analytical Grade)',
        description: 'High purity NaCl for general analytical applications. Keep dry.',
        category: 'Chemical Reagents',
        base_unit: 'kg',
        base_price_inr: 450.0000,
        inventory_quantity: 150.75000000
      },
      {
        sku: 'CHEM-AUCL-002',
        name: 'Gold Chloride (AuCl3)',
        description: 'Precious metal compound used in organic synthesis and nanotechnology.',
        category: 'Precious Metal Salts',
        base_unit: 'g',
        base_price_inr: 6500.5000, // Stored per gram
        inventory_quantity: 45.25000000
      },
      {
        sku: 'SOLV-ETH-003',
        name: 'Ethanol (99.9% Absolute)',
        description: 'Anhydrous ethanol suitable for cell culture and spectroscopy.',
        category: 'Solvents',
        base_unit: 'L',
        base_price_inr: 280.0000,
        inventory_quantity: 500.00000000
      },
      {
        sku: 'ACID-HCL-004',
        name: 'Hydrochloric Acid (37% Fuming)',
        description: 'Strong inorganic acid, corrosive. Handle with extreme care.',
        category: 'Acids',
        base_unit: 'mL',
        base_price_inr: 0.3500, // 0.35 INR per mL = 350 INR per Liter
        inventory_quantity: 25000.00000000
      },
      {
        sku: 'LAB-BEAK-005',
        name: 'Glass Beaker (Borosilicate 250mL)',
        description: 'Graduated borosilicate glass beaker. High thermal shock resistance.',
        category: 'Labware',
        base_unit: 'items',
        base_price_inr: 120.0000,
        inventory_quantity: 80.00000000
      }
    ];

    for (const prod of seedProducts) {
      await client.query(`
        INSERT INTO products (sku, name, description, category, base_unit, base_price_inr, inventory_quantity)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (sku) DO UPDATE 
        SET name = EXCLUDED.name, 
            description = EXCLUDED.description,
            category = EXCLUDED.category,
            base_unit = EXCLUDED.base_unit,
            base_price_inr = EXCLUDED.base_price_inr,
            inventory_quantity = EXCLUDED.inventory_quantity;
      `, [prod.sku, prod.name, prod.description, prod.category, prod.base_unit, prod.base_price_inr, prod.inventory_quantity]);
    }
    console.log('Seeded products.');
    console.log('Database initialization completed successfully!');

  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    await client.end();
  }
}

initDB();
