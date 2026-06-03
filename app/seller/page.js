'use strict';
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { convertQuantity, convertPrice } from '@/lib/conversion';
import styles from '@/styles/dashboard.module.css';
import comps from '@/styles/components.module.css';
import Big from 'big.js';

export default function SellerPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [orders, setOrders] = useState([]);
  
  // Search & Filter
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  
  // Loading & State
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Cart: [{ product, qtyInput, unitInput, pricePerUnit, itemTotal }]
  const [cart, setCart] = useState([]);
  
  // Live input state for product grid: { [productId]: { quantity: '1', unit: 'g' } }
  const [gridInputs, setGridInputs] = useState({});

  useEffect(() => {
    // 1. Verify Session & Role
    async function loadSession() {
      try {
        const authRes = await fetch('/api/auth/me');
        const authData = await authRes.json();
        
        if (!authRes.ok || !authData.user) {
          router.push('/login');
          return;
        }

        if (authData.user.role !== 'seller') {
          // If admin, redirect to admin
          if (authData.user.role === 'admin') {
            router.push('/admin');
          } else {
            router.push('/login');
          }
          return;
        }

        setUser(authData.user);
        
        // Load Products & Orders
        await Promise.all([fetchProducts(), fetchOrders()]);
      } catch (err) {
        setError('Failed to verify session details.');
      } finally {
        setLoading(false);
      }
    }

    loadSession();
  }, []);

  const fetchProducts = async (currSearch = '', currCat = '') => {
    try {
      const url = `/api/products?search=${encodeURIComponent(currSearch)}&category=${encodeURIComponent(currCat)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) {
        setProducts(data.products || []);
        setCategories(data.categories || []);
        
        // Initialize inputs for products if not set
        const newInputs = { ...gridInputs };
        data.products.forEach(p => {
          if (!newInputs[p.id]) {
            newInputs[p.id] = {
              quantity: '1',
              unit: p.base_unit
            };
          }
        });
        setGridInputs(newInputs);
      }
    } catch (err) {
      console.error('Fetch products error:', err);
    }
  };

  const fetchOrders = async () => {
    try {
      const res = await fetch('/api/orders');
      const data = await res.json();
      if (res.ok) {
        setOrders(data.orders || []);
      }
    } catch (err) {
      console.error('Fetch orders error:', err);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (e) {
      setError('Logout failed.');
    }
  };

  // Run searches
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearch(val);
    fetchProducts(val, categoryFilter);
  };

  const handleCategoryChange = (e) => {
    const val = e.target.value;
    setCategoryFilter(val);
    fetchProducts(search, val);
  };

  // Get compatible units list
  const getUnitsForProduct = (baseUnit) => {
    if (baseUnit === 'g' || baseUnit === 'kg') return ['g', 'kg'];
    if (baseUnit === 'mL' || baseUnit === 'L') return ['mL', 'L'];
    return ['items'];
  };

  // Handle live calculation inputs
  const handleQtyInputChange = (prodId, val) => {
    setGridInputs(prev => ({
      ...prev,
      [prodId]: {
        ...prev[prodId],
        quantity: val
      }
    }));
  };

  const handleUnitInputChange = (prodId, val) => {
    setGridInputs(prev => ({
      ...prev,
      [prodId]: {
        ...prev[prodId],
        unit: val
      }
    }));
  };

  // Calculate live price for grid row
  const getLiveCalculation = (product) => {
    const input = gridInputs[product.id];
    if (!input || !input.quantity || isNaN(parseFloat(input.quantity)) || parseFloat(input.quantity) <= 0) {
      return {
        rate: '0.00',
        total: '0.00',
        convertedBase: '0.00',
        isValid: false
      };
    }

    try {
      const inputQty = input.quantity;
      const inputUnit = input.unit;
      
      const rate = convertPrice(product.base_price_inr, product.base_unit, inputUnit);
      const total = new Big(inputQty).times(rate);
      const convertedBase = convertQuantity(inputQty, inputUnit, product.base_unit);

      return {
        rate: rate.toFixed(4),
        total: total.toFixed(2),
        convertedBase: convertedBase.toFixed(4),
        isValid: true
      };
    } catch (e) {
      return {
        rate: '0.00',
        total: '0.00',
        convertedBase: '0.00',
        isValid: false
      };
    }
  };

  // Add item to cart
  const addToCart = (product) => {
    const input = gridInputs[product.id];
    if (!input) return;

    const qty = parseFloat(input.quantity);
    if (isNaN(qty) || qty <= 0) {
      setError('Please enter a positive quantity value.');
      return;
    }

    const calc = getLiveCalculation(product);
    if (!calc.isValid) return;

    // Check if item already in cart
    const existingIndex = cart.findIndex(item => item.product.id === product.id && item.unitInput === input.unit);

    if (existingIndex > -1) {
      const updatedCart = [...cart];
      const prevQty = new Big(updatedCart[existingIndex].qtyInput);
      const addedQty = new Big(input.quantity);
      const newQty = prevQty.plus(addedQty);
      
      updatedCart[existingIndex].qtyInput = newQty.toFixed(8);
      updatedCart[existingIndex].itemTotal = newQty.times(updatedCart[existingIndex].pricePerUnit).toFixed(2);
      setCart(updatedCart);
    } else {
      setCart(prev => [
        ...prev,
        {
          product,
          qtyInput: input.quantity,
          unitInput: input.unit,
          pricePerUnit: calc.rate,
          itemTotal: calc.total,
          convertedBase: calc.convertedBase
        }
      ]);
    }

    setSuccess(`Added ${input.quantity} ${input.unit} of ${product.name} to quotation cart.`);
    setTimeout(() => setSuccess(''), 4000);
  };

  const removeFromCart = (index) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  const clearCart = () => {
    setCart([]);
  };

  // Checkout (Place order)
  const placeQuotation = async () => {
    if (cart.length === 0) return;
    setActionLoading(true);
    setError('');

    const formattedItems = cart.map(item => ({
      product_id: item.product.id,
      ordered_quantity: item.qtyInput,
      ordered_unit: item.unitInput
    }));

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: formattedItems })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to place quotation');
      }

      setCart([]);
      setSuccess('Quotation submitted successfully for Admin review!');
      await fetchOrders();
      await fetchProducts(search, categoryFilter); // Refresh inventory levels
      
      // Auto clear success message
      setTimeout(() => setSuccess(''), 6000);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Calculate cart subtotal
  const getCartTotal = () => {
    return cart.reduce((acc, item) => acc.plus(new Big(item.itemTotal)), new Big(0)).toFixed(2);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-main)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '40px', height: '40px', border: '4px solid var(--border-color)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>Loading Seller Workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      <header className={styles.navbar}>
        <div className={styles.brand}>
          <div className={styles.logoText}>AasaMedChem</div>
          <span className={`${styles.badge} ${styles.sellerBadge}`}>Seller Portal</span>
        </div>
        <div className={styles.navActions}>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{user?.name}</span>
            <span className={styles.userEmail}>{user?.email}</span>
          </div>
          <button className={styles.logoutBtn} onClick={handleLogout}>Log Out</button>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.headerSection}>
          <div>
            <h1 className={styles.pageTitle}>Create Chemical Quotation</h1>
            <p className={styles.pageSubtitle}>Search catalog, select units, check conversions, and build orders.</p>
          </div>
        </div>

        {error && <div className={comps.error} style={{ marginBottom: '24px' }}>⚠️ {error}</div>}
        {success && <div className={comps.statusBadge} style={{ width: '100%', display: 'block', backgroundColor: 'var(--accent-glow)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7', padding: '12px 16px', borderRadius: 'var(--radius-md)', marginBottom: '24px' }}>✓ {success}</div>}

        <div className={styles.grid21}>
          
          {/* Main Products Grid & Search */}
          <div>
            <div className={styles.filterBar}>
              <div className={styles.searchWrapper}>
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Search products by SKU, name, description or category..."
                  value={search}
                  onChange={handleSearchChange}
                />
              </div>
              <select className={styles.selectInput} value={categoryFilter} onChange={handleCategoryChange}>
                <option value="">All Categories</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {products.length === 0 ? (
              <div className={comps.emptyState}>
                <p className={comps.emptyStateTitle}>No products found matching filters.</p>
                <p>Try refining your search terms or selecting a different category.</p>
              </div>
            ) : (
              <div className={comps.tableContainer}>
                <table className={comps.table}>
                  <thead>
                    <tr>
                      <th>Product details</th>
                      <th>Base Rate</th>
                      <th>Stock Status</th>
                      <th style={{ width: '280px' }}>Conversion Calculator</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(p => {
                      const units = getUnitsForProduct(p.base_unit);
                      const currentInput = gridInputs[p.id] || { quantity: '1', unit: p.base_unit };
                      const calc = getLiveCalculation(p);
                      const isLowStock = parseFloat(p.inventory_quantity) < 10;
                      const isOutOfStock = parseFloat(p.inventory_quantity) === 0;

                      return (
                        <tr key={p.id}>
                          <td>
                            <div style={{ fontWeight: 700, fontSize: '15px' }}>{p.name}</div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '4px' }}>
                              <span style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', marginRight: '6px', fontWeight: 600 }}>{p.sku}</span>
                              {p.category}
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '4px', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {p.description}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>₹{parseFloat(p.base_price_inr).toFixed(2)}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>per {p.base_unit}</div>
                          </td>
                          <td>
                            <div className={
                              isOutOfStock ? comps.stockOut : isLowStock ? comps.stockLow : comps.stockHigh
                            } style={{ fontSize: '13px', fontWeight: 600 }}>
                              ● {isOutOfStock ? 'Out of Stock' : isLowStock ? 'Low Stock' : 'In Stock'}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {parseFloat(p.inventory_quantity).toFixed(4)} {p.base_unit}
                            </div>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <input
                                  type="number"
                                  className={comps.formInput}
                                  style={{ width: '90px', padding: '6px 10px' }}
                                  value={currentInput.quantity}
                                  min="0"
                                  step="any"
                                  placeholder="Qty"
                                  onChange={(e) => handleQtyInputChange(p.id, e.target.value)}
                                />
                                <select
                                  className={styles.selectInput}
                                  style={{ padding: '6px 10px', minWidth: '80px' }}
                                  value={currentInput.unit}
                                  onChange={(e) => handleUnitInputChange(p.id, e.target.value)}
                                >
                                  {units.map(u => (
                                    <option key={u} value={u}>{u}</option>
                                  ))}
                                </select>
                              </div>
                              {calc.isValid && (
                                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
                                    <span>Rate:</span>
                                    <span>₹{calc.rate} / {currentInput.unit}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                                    <span>Base:</span>
                                    <span>{calc.convertedBase} {p.base_unit}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, color: 'var(--accent)', marginTop: '4px', paddingTop: '4px', borderTop: '1px dashed var(--border-color)' }}>
                                    <span>Subtotal:</span>
                                    <span>₹{calc.total}</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                          <td>
                            <button 
                              className={`${comps.btn} ${comps.btnPrimary} ${comps.btnSmall}`} 
                              onClick={() => addToCart(p)}
                              disabled={!calc.isValid}
                            >
                              + Add Cart
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Past Orders History */}
            <div style={{ marginTop: '48px' }}>
              <h2 style={{ fontSize: '20px', marginBottom: '16px', fontFamily: 'var(--font-display)' }}>Quotation & Order History</h2>
              
              {orders.length === 0 ? (
                <div className={comps.emptyState}>
                  <p className={comps.emptyStateTitle}>No past quotations found.</p>
                  <p>When you place quotations, they will appear in this history list.</p>
                </div>
              ) : (
                <div className={comps.tableContainer}>
                  <table className={comps.table}>
                    <thead>
                      <tr>
                        <th>Date & ID</th>
                        <th>Status</th>
                        <th>Items Summary</th>
                        <th style={{ textAlign: 'right' }}>Total Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map(order => {
                        const statusClass = 
                          order.status === 'approved' ? comps.statusApproved :
                          order.status === 'rejected' ? comps.statusRejected :
                          order.status === 'cancelled' ? comps.statusCancelled : comps.statusPending;

                        return (
                          <React.Fragment key={order.id}>
                            <tr>
                              <td>
                                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                  {new Date(order.created_at).toLocaleDateString()} {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                                <div style={{ fontFamily: 'monospace', fontSize: '11px', marginTop: '2px', color: 'var(--text-secondary)' }}>
                                  ID: {order.id.substring(0, 8)}...
                                </div>
                              </td>
                              <td>
                                <span className={`${comps.statusBadge} ${statusClass}`}>
                                  {order.status}
                                </span>
                              </td>
                              <td>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  {order.items?.map((item, idx) => (
                                    <div key={idx} style={{ fontSize: '12px' }}>
                                      • <strong>{item.product_name}</strong>: {parseFloat(item.ordered_quantity).toString()} {item.ordered_unit} 
                                      {item.ordered_unit !== item.product_base_unit && (
                                        <span style={{ color: 'var(--text-muted)', fontSize: '10.5px' }}>
                                          &nbsp;({parseFloat(item.converted_quantity_base).toString()} {item.product_base_unit})
                                        </span>
                                      )}
                                      <span style={{ color: 'var(--text-muted)' }}> @ ₹{parseFloat(item.price_per_ordered_unit_inr).toFixed(2)}</span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                              <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '15px' }}>
                                ₹{parseFloat(order.total_price_inr).toFixed(2)}
                              </td>
                            </tr>
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>

          {/* Right Sidebar Shopping Cart Drawer */}
          <div>
            <div className={styles.cartSidebar}>
              <div className={styles.cartHeader}>
                <h3 style={{ fontSize: '18px', fontWeight: 700 }}>Quotation Cart</h3>
                <span className={styles.badge} style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)' }}>
                  {cart.length} item{cart.length !== 1 ? 's' : ''}
                </span>
              </div>

              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 10px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  <div style={{ fontSize: '32px', marginBottom: '12px' }}>🛒</div>
                  <p>Your cart is currently empty.</p>
                  <p style={{ fontSize: '11px', marginTop: '4px' }}>Select products, adjust quantities/units, and click Add to Cart.</p>
                </div>
              ) : (
                <>
                  <div className={styles.cartList}>
                    {cart.map((item, index) => {
                      const stockAvailable = parseFloat(item.product.inventory_quantity);
                      const requiredBase = parseFloat(item.converted_quantity_base);
                      const hasSufficientStock = stockAvailable >= requiredBase;

                      return (
                        <div key={index} className={styles.cartItem} style={{ borderLeft: hasSufficientStock ? '3px solid var(--accent)' : '3px solid var(--danger)' }}>
                          <div className={styles.cartItemHeader}>
                            <span>{item.product.name}</span>
                            <button className={styles.removeCartItemBtn} onClick={() => removeFromCart(index)}>✕ Remove</button>
                          </div>
                          
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            SKU: {item.product.sku}
                          </div>

                          <div className={styles.cartItemUnitRow}>
                            <span style={{ fontSize: '13px', fontWeight: 600 }}>{item.qtyInput} {item.unitInput}</span>
                            {item.unitInput !== item.product.base_unit && (
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                ({item.convertedBase} {item.product.base_unit})
                              </span>
                            )}
                          </div>

                          {!hasSufficientStock && (
                            <div style={{ fontSize: '10.5px', color: '#fca5a5', background: 'var(--danger-glow)', padding: '4px 6px', borderRadius: '4px', border: '1px dashed rgba(239,68,68,0.2)' }}>
                              ⚠️ Exceeds stock (avail: {stockAvailable} {item.product.base_unit})
                            </div>
                          )}

                          <div className={styles.cartItemTotalRow}>
                            <span>Rate: ₹{item.pricePerUnit} / {item.unitInput}</span>
                            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>₹{item.itemTotal}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className={styles.cartSummary}>
                    <div className={styles.cartTotalRow}>
                      <span style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 600 }}>Order Subtotal:</span>
                      <span style={{ color: 'var(--accent)' }}>₹{getCartTotal()}</span>
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button 
                        className={`${comps.btn} ${comps.btnSecondary}`} 
                        style={{ flex: 1 }}
                        onClick={clearCart}
                        disabled={actionLoading}
                      >
                        Clear
                      </button>
                      <button 
                        className={`${comps.btn} ${comps.btnPrimary}`} 
                        style={{ flex: 2 }}
                        onClick={placeQuotation}
                        disabled={actionLoading}
                      >
                        {actionLoading ? 'Placing...' : 'Submit Quotation'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
