import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

export async function GET(request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const category = searchParams.get('category') || '';

    let sql = 'SELECT * FROM products';
    const params = [];
    const conditions = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`(name ILIKE $${params.length} OR description ILIKE $${params.length} OR sku ILIKE $${params.length} OR category ILIKE $${params.length})`);
    }

    if (category) {
      params.push(category);
      conditions.push(`category = $${params.length}`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY category ASC, name ASC';

    const dbRes = await query(sql, params);
    
    // Also fetch categories dynamically for filter options
    const catRes = await query('SELECT DISTINCT category FROM products ORDER BY category ASC');
    const categories = catRes.rows.map(r => r.category);

    return NextResponse.json({ 
      products: dbRes.rows,
      categories
    });
  } catch (err) {
    console.error('Fetch products error:', err);
    return NextResponse.json(
      { error: 'Internal server error: ' + err.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const user = await getSessionUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    const { sku, name, description, category, base_unit, base_price_inr, inventory_quantity } = await request.json();

    if (!sku || !name || !category || !base_unit || base_price_inr === undefined || inventory_quantity === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const validUnits = ['g', 'kg', 'L', 'mL', 'items'];
    if (!validUnits.includes(base_unit)) {
      return NextResponse.json({ error: 'Invalid base unit configuration' }, { status: 400 });
    }

    const dbRes = await query(
      `INSERT INTO products (sku, name, description, category, base_unit, base_price_inr, inventory_quantity)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        sku.toUpperCase().trim(),
        name.trim(),
        description || '',
        category.trim(),
        base_unit,
        base_price_inr,
        inventory_quantity
      ]
    );

    return NextResponse.json({ 
      message: 'Product created successfully', 
      product: dbRes.rows[0] 
    });
  } catch (err) {
    console.error('Create product error:', err);
    if (err.code === '23505') {
      return NextResponse.json({ error: 'A product with this SKU already exists.' }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Internal server error: ' + err.message },
      { status: 500 }
    );
  }
}
