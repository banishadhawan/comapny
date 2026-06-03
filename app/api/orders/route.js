import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { convertQuantity, convertPrice } from '@/lib/conversion';
import Big from 'big.js';

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch orders depending on role
    const ordersQuery = user.role === 'admin'
      ? `SELECT o.*, u.name as user_name, u.email as user_email 
         FROM orders o 
         JOIN users u ON o.user_id = u.id 
         ORDER BY o.created_at DESC`
      : `SELECT o.*, u.name as user_name, u.email as user_email 
         FROM orders o 
         JOIN users u ON o.user_id = u.id 
         WHERE o.user_id = $1 
         ORDER BY o.created_at DESC`;

    const ordersParams = user.role === 'admin' ? [] : [user.id];
    const ordersRes = await query(ordersQuery, ordersParams);

    // Fetch all order items (with product name/sku/base details)
    const itemsRes = await query(
      `SELECT oi.*, p.name as product_name, p.sku as product_sku, p.base_unit as product_base_unit, p.base_price_inr as product_base_price
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id`
    );

    // Group items by order_id
    const orderMap = {};
    ordersRes.rows.forEach(order => {
      order.items = [];
      orderMap[order.id] = order;
    });

    itemsRes.rows.forEach(item => {
      if (orderMap[item.order_id]) {
        orderMap[item.order_id].items.push(item);
      }
    });

    return NextResponse.json({ 
      orders: Object.values(orderMap).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    });
  } catch (err) {
    console.error('Fetch orders error:', err);
    return NextResponse.json(
      { error: 'Internal server error: ' + err.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { items } = await request.json();
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Quotation must contain at least one item' }, { status: 400 });
    }

    const processedItems = [];
    let grandTotal = new Big(0);

    for (const item of items) {
      const { product_id, ordered_quantity, ordered_unit } = item;
      if (!product_id || !ordered_quantity || !ordered_unit) {
        return NextResponse.json({ error: 'Invalid item configurations' }, { status: 400 });
      }

      const q = parseFloat(ordered_quantity);
      if (isNaN(q) || q <= 0) {
        return NextResponse.json({ error: 'Quantity must be a positive number' }, { status: 400 });
      }

      // Fetch the product
      const prodRes = await query('SELECT * FROM products WHERE id = $1', [product_id]);
      if (prodRes.rows.length === 0) {
        return NextResponse.json({ error: `Product not found: ${product_id}` }, { status: 400 });
      }
      const product = prodRes.rows[0];

      // Conversion math using Big
      let convertedQtyBase;
      let pricePerOrderedUnit;
      let itemTotalPrice;

      try {
        convertedQtyBase = convertQuantity(ordered_quantity, ordered_unit, product.base_unit);
        pricePerOrderedUnit = convertPrice(product.base_price_inr, product.base_unit, ordered_unit);
        itemTotalPrice = new Big(ordered_quantity).times(pricePerOrderedUnit);
      } catch (convErr) {
        return NextResponse.json(
          { error: `Unit conversion error for "${product.name}": ${convErr.message}` },
          { status: 400 }
        );
      }

      processedItems.push({
        product_id,
        ordered_quantity: new Big(ordered_quantity).toFixed(8),
        ordered_unit,
        price_per_ordered_unit_inr: pricePerOrderedUnit.toFixed(4),
        converted_quantity_base: convertedQtyBase.toFixed(8),
        item_total_price_inr: itemTotalPrice.toFixed(4)
      });

      grandTotal = grandTotal.plus(itemTotalPrice);
    }

    // Write to DB inside a transaction
    await query('BEGIN');

    const orderRes = await query(
      `INSERT INTO orders (user_id, status, total_price_inr)
       VALUES ($1, 'pending', $2)
       RETURNING *`,
      [user.id, grandTotal.toFixed(4)]
    );
    const newOrder = orderRes.rows[0];

    for (const pItem of processedItems) {
      await query(
        `INSERT INTO order_items (
          order_id, product_id, ordered_quantity, ordered_unit, 
          price_per_ordered_unit_inr, converted_quantity_base, item_total_price_inr
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          newOrder.id,
          pItem.product_id,
          pItem.ordered_quantity,
          pItem.ordered_unit,
          pItem.price_per_ordered_unit_inr,
          pItem.converted_quantity_base,
          pItem.item_total_price_inr
        ]
      );
    }

    await query('COMMIT');

    return NextResponse.json({ 
      message: 'Quotation placed successfully', 
      order: newOrder 
    });

  } catch (err) {
    try {
      await query('ROLLBACK');
    } catch (e) {}
    console.error('Order creation error:', err);
    return NextResponse.json(
      { error: 'Internal server error: ' + err.message },
      { status: 500 }
    );
  }
}
