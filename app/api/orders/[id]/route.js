import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import Big from 'big.js';

export async function PUT(request, { params }) {
  try {
    const user = await getSessionUser();
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    const { id } = await params;
    const { status } = await request.json();

    const validStatuses = ['approved', 'rejected', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status transition' }, { status: 400 });
    }

    await query('BEGIN');

    // Fetch the order
    const orderRes = await query('SELECT * FROM orders WHERE id = $1', [id]);
    if (orderRes.rows.length === 0) {
      await query('ROLLBACK');
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    
    const order = orderRes.rows[0];
    if (order.status !== 'pending') {
      await query('ROLLBACK');
      return NextResponse.json(
        { error: `Cannot modify a quotation that is already "${order.status}"` },
        { status: 400 }
      );
    }

    // If approving, verify and deduct inventory
    if (status === 'approved') {
      const itemsRes = await query('SELECT * FROM order_items WHERE order_id = $1', [id]);
      
      for (const item of itemsRes.rows) {
        // Fetch product with row-level locking
        const prodRes = await query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [item.product_id]);
        if (prodRes.rows.length === 0) {
          await query('ROLLBACK');
          return NextResponse.json({ error: `Product not found for item ID: ${item.product_id}` }, { status: 400 });
        }
        
        const product = prodRes.rows[0];
        const stock = new Big(product.inventory_quantity);
        const required = new Big(item.converted_quantity_base);

        if (stock.lt(required)) {
          await query('ROLLBACK');
          return NextResponse.json(
            { 
              error: `Insufficient inventory for "${product.name}". ` + 
                     `Required: ${required.toFixed(8)} ${product.base_unit}, ` +
                     `Available: ${stock.toFixed(8)} ${product.base_unit}`
            },
            { status: 400 }
          );
        }

        const newStock = stock.minus(required);

        // Deduct inventory
        await query(
          'UPDATE products SET inventory_quantity = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [newStock.toFixed(8), product.id]
        );
      }
    }

    // Update order status
    const updatedOrderRes = await query(
      `UPDATE orders 
       SET status = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE id = $2 
       RETURNING *`,
      [status, id]
    );

    await query('COMMIT');

    return NextResponse.json({
      message: `Quotation ${status} successfully`,
      order: updatedOrderRes.rows[0]
    });

  } catch (err) {
    try {
      await query('ROLLBACK');
    } catch (e) {}
    console.error('Update order status error:', err);
    return NextResponse.json(
      { error: 'Internal server error: ' + err.message },
      { status: 500 }
    );
  }
}
