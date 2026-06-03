import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

export async function PUT(request, { params }) {
  try {
    const user = await getSessionUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    const { id } = await params;
    const { sku, name, description, category, base_unit, base_price_inr, inventory_quantity } = await request.json();

    if (!sku || !name || !category || !base_unit || base_price_inr === undefined || inventory_quantity === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const validUnits = ['g', 'kg', 'L', 'mL', 'items'];
    if (!validUnits.includes(base_unit)) {
      return NextResponse.json({ error: 'Invalid base unit configuration' }, { status: 400 });
    }

    const dbRes = await query(
      `UPDATE products 
       SET sku = $1, name = $2, description = $3, category = $4, base_unit = $5, base_price_inr = $6, inventory_quantity = $7, updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [
        sku.toUpperCase().trim(),
        name.trim(),
        description || '',
        category.trim(),
        base_unit,
        base_price_inr,
        inventory_quantity,
        id
      ]
    );

    if (dbRes.rows.length === 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json({ 
      message: 'Product updated successfully', 
      product: dbRes.rows[0] 
    });
  } catch (err) {
    console.error('Update product error:', err);
    if (err.code === '23505') {
      return NextResponse.json({ error: 'A product with this SKU already exists.' }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Internal server error: ' + err.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const user = await getSessionUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    const { id } = await params;

    const dbRes = await query('DELETE FROM products WHERE id = $1 RETURNING *', [id]);
    if (dbRes.rows.length === 0) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json({ 
      message: 'Product deleted successfully', 
      product: dbRes.rows[0] 
    });
  } catch (err) {
    console.error('Delete product error:', err);
    return NextResponse.json(
      { error: 'Internal server error: ' + err.message },
      { status: 500 }
    );
  }
}
