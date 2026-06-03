'use strict';
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UNITS } from '@/lib/conversion';
import styles from '@/styles/dashboard.module.css';
import comps from '@/styles/components.module.css';
import Big from 'big.js';

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [orders, setOrders] = useState([]);
  
  // Tabs & Search
  const [activeTab, setActiveTab] = useState('products'); // products | orders
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Modals & Forms
  const [modalType, setModalType] = useState(null); // null | 'create' | 'edit'
  const [formSku, setFormSku] = useState('');
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formBaseUnit, setFormBaseUnit] = useState('kg');
  const [formBasePrice, setFormBasePrice] = useState('');
  const [formInventory, setFormInventory] = useState('');
  const [editingProductId, setEditingProductId] = useState(null);

  // States
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    async function loadSession() {
      try {
        const authRes = await fetch('/api/auth/me');
        const authData = await authRes.json();
        
        if (!authRes.ok || !authData.user) {
          router.push('/login');
          return;
        }

        if (authData.user.role !== 'admin') {
          if (authData.user.role === 'seller') {
            router.push('/seller');
          } else {
            router.push('/login');
          }
          return;
        }

        setUser(authData.user);
        
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

  // Metrics Helpers
  const getLowStockCount = () => {
    return products.filter(p => parseFloat(p.inventory_quantity) < 10).length;
  };

  const getPendingOrdersCount = () => {
    return orders.filter(o => o.status === 'pending').length;
  };

  const getTotalSales = () => {
    return orders
      .filter(o => o.status === 'approved')
      .reduce((acc, o) => acc.plus(new Big(o.total_price_inr)), new Big(0))
      .toFixed(2);
  };

  // Modals operations
  const openCreateModal = () => {
    setFormSku('');
    setFormName('');
    setFormDescription('');
    setFormCategory('');
    setFormBaseUnit('kg');
    setFormBasePrice('');
    setFormInventory('');
    setModalType('create');
    setError('');
  };

  const openEditModal = (p) => {
    setEditingProductId(p.id);
    setFormSku(p.sku);
    setFormName(p.name);
    setFormDescription(p.description || '');
    setFormCategory(p.category);
    setFormBaseUnit(p.base_unit);
    setFormBasePrice(parseFloat(p.base_price_inr).toString());
    setFormInventory(parseFloat(p.inventory_quantity).toString());
    setModalType('edit');
    setError('');
  };

  const closeModal = () => {
    setModalType(null);
    setEditingProductId(null);
  };

  // Save product (Create/Update)
  const saveProduct = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    setError('');

    const productPayload = {
      sku: formSku,
      name: formName,
      description: formDescription,
      category: formCategory,
      base_unit: formBaseUnit,
      base_price_inr: parseFloat(formBasePrice),
      inventory_quantity: parseFloat(formInventory)
    };

    const isEdit = modalType === 'edit';
    const url = isEdit ? `/api/products/${editingProductId}` : '/api/products';
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(productPayload)
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save product');
      }

      setSuccess(`Product "${formName}" ${isEdit ? 'updated' : 'created'} successfully.`);
      closeModal();
      await fetchProducts(search, categoryFilter);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Delete product
  const deleteProduct = async (product) => {
    if (!confirm(`Are you absolutely sure you want to delete ${product.name}?\nThis will remove the product and all associated order historical items.`)) {
      return;
    }

    setActionLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/products/${product.id}`, { method: 'DELETE' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete product');
      }

      setSuccess(`Product "${product.name}" deleted successfully.`);
      await fetchProducts(search, categoryFilter);
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Update Order Status (Approve/Reject/Cancel)
  const updateOrderStatus = async (orderId, newStatus) => {
    const actionName = newStatus === 'approved' ? 'approve' : newStatus === 'rejected' ? 'reject' : 'cancel';
    if (!confirm(`Are you sure you want to ${actionName} this quotation?`)) {
      return;
    }

    setActionLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update order status');
      }

      setSuccess(`Quotation successfully ${newStatus}!`);
      await fetchOrders();
      await fetchProducts(search, categoryFilter); // Refresh inventory metrics
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Get ratio scale representation for audit helper
  const getConversionExplanation = (item) => {
    const orderedUnit = item.ordered_unit;
    const baseUnit = item.product_base_unit;
    
    if (orderedUnit === baseUnit) {
      return `1 ${orderedUnit} = 1 ${baseUnit} (No conversion needed)`;
    }

    const scaleOrdered = UNITS[orderedUnit].scale; // Big
    const scaleBase = UNITS[baseUnit].scale; // Big
    
    const factor = scaleOrdered.div(scaleBase);
    
    return `1 ${orderedUnit} = ${factor.toString()} ${baseUnit}`;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-main)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '40px', height: '40px', border: '4px solid var(--border-color)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
          <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-display)' }}>Loading Admin Workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      <header className={styles.navbar}>
        <div className={styles.brand}>
          <div className={styles.logoText}>AasaMedChem</div>
          <span className={`${styles.badge} ${styles.adminBadge}`}>Admin Panel</span>
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
            <h1 className={styles.pageTitle}>Control Center Dashboard</h1>
            <p className={styles.pageSubtitle}>Manage products catalog, view inventory levels, and audit conversions of quotations.</p>
          </div>
          {activeTab === 'products' && (
            <button className={`${comps.btn} ${comps.btnPrimary}`} onClick={openCreateModal}>
              + Add Product
            </button>
          )}
        </div>

        {/* Metrics Cards */}
        <div className={styles.grid3}>
          <div className={styles.card}>
            <div className={styles.cardTitle}>Total Products</div>
            <div className={styles.cardValue}>{products.length}</div>
            <div className={styles.cardFooter}>Active catalog entries</div>
          </div>
          <div className={styles.card} style={{ borderLeft: getLowStockCount() > 0 ? '3px solid var(--warning)' : '1px solid var(--border-color)' }}>
            <div className={styles.cardTitle}>Low Stock Items</div>
            <div className={styles.cardValue} style={{ color: getLowStockCount() > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>{getLowStockCount()}</div>
            <div className={styles.cardFooter}>Inventory &lt; 10 units</div>
          </div>
          <div className={styles.card} style={{ borderLeft: getPendingOrdersCount() > 0 ? '3px solid var(--primary)' : '1px solid var(--border-color)' }}>
            <div className={styles.cardTitle}>Pending Quotations</div>
            <div className={styles.cardValue} style={{ color: getPendingOrdersCount() > 0 ? 'var(--primary)' : 'var(--text-primary)' }}>{getPendingOrdersCount()}</div>
            <div className={styles.cardFooter}>Awaiting approval decision</div>
          </div>
        </div>

        {error && <div className={comps.error} style={{ marginBottom: '24px' }}>⚠️ {error}</div>}
        {success && <div className={comps.statusBadge} style={{ width: '100%', display: 'block', backgroundColor: 'var(--accent-glow)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7', padding: '12px 16px', borderRadius: 'var(--radius-md)', marginBottom: '24px' }}>✓ {success}</div>}

        {/* Workspace Navigation Tabs */}
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${activeTab === 'products' ? styles.tabActive : ''}`} onClick={() => setActiveTab('products')}>
            📦 Products Catalog
          </button>
          <button className={`${styles.tab} ${activeTab === 'orders' ? styles.tabActive : ''}`} onClick={() => setActiveTab('orders')}>
            📝 Quotations & Orders
          </button>
        </div>

        {/* Tab 1: Products List & Filters */}
        {activeTab === 'products' && (
          <div>
            <div className={styles.filterBar}>
              <div className={styles.searchWrapper}>
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Search products by SKU, name, or category..."
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
                <p className={comps.emptyStateTitle}>No products found.</p>
                <p>Click "Add Product" above to insert a new item into the inventory database.</p>
              </div>
            ) : (
              <div className={comps.tableContainer}>
                <table className={comps.table}>
                  <thead>
                    <tr>
                      <th>SKU & Product</th>
                      <th>Category</th>
                      <th>Base Unit</th>
                      <th>Base Price (INR)</th>
                      <th>Inventory Quantity</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(p => {
                      const isLowStock = parseFloat(p.inventory_quantity) < 10;
                      const isOutOfStock = parseFloat(p.inventory_quantity) === 0;

                      return (
                        <tr key={p.id}>
                          <td>
                            <div style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>{p.sku}</div>
                            <div style={{ fontWeight: 700, fontSize: '14.5px', marginTop: '2px' }}>{p.name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px', maxWidth: '350px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                              {p.description}
                            </div>
                          </td>
                          <td>
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{p.category}</span>
                          </td>
                          <td>
                            <code style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px', color: 'var(--secondary)', fontWeight: 600 }}>{p.base_unit}</code>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>₹{parseFloat(p.base_price_inr).toFixed(4)}</div>
                          </td>
                          <td>
                            <div className={
                              isOutOfStock ? comps.stockOut : isLowStock ? comps.stockLow : comps.stockHigh
                            } style={{ fontWeight: 600 }}>
                              {parseFloat(p.inventory_quantity).toFixed(8)} {p.base_unit}
                            </div>
                            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {isOutOfStock ? '⚠️ Out of Stock' : isLowStock ? '⚠️ Low Inventory Alert' : '✓ Stock Adequate'}
                            </div>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '8px' }}>
                              <button className={`${comps.btn} ${comps.btnSecondary} ${comps.btnSmall}`} onClick={() => openEditModal(p)}>
                                Edit
                              </button>
                              <button className={`${comps.btn} ${comps.btnDanger} ${comps.btnSmall}`} onClick={() => deleteProduct(p)}>
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Orders List (Auditable) */}
        {activeTab === 'orders' && (
          <div>
            {orders.length === 0 ? (
              <div className={comps.emptyState}>
                <p className={comps.emptyStateTitle}>No quotations have been placed yet.</p>
                <p>When sellers place quotations, they will appear here with full conversion audit details.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {orders.map(order => {
                  const statusClass = 
                    order.status === 'approved' ? comps.statusApproved :
                    order.status === 'rejected' ? comps.statusRejected :
                    order.status === 'cancelled' ? comps.statusCancelled : comps.statusPending;

                  return (
                    <div key={order.id} className={styles.card} style={{ borderLeft: order.status === 'pending' ? '4px solid var(--primary)' : '1px solid var(--border-color)' }}>
                      
                      {/* Order Header Info */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            <h3 style={{ fontSize: '16px' }}>Quotation ID: <code style={{ color: 'var(--secondary)' }}>{order.id}</code></h3>
                            <span className={`${comps.statusBadge} ${statusClass}`}>{order.status}</span>
                          </div>
                          
                          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                            👤 Placed by: <strong>{order.user_name}</strong> ({order.user_email})
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            📅 Date: {new Date(order.created_at).toLocaleString()}
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Quotation Grand Total</span>
                          <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--accent)', fontFamily: 'var(--font-display)' }}>
                            ₹{parseFloat(order.total_price_inr).toFixed(2)}
                          </div>
                        </div>
                      </div>

                      {/* Items & Audit Logs Section */}
                      <div style={{ marginBottom: '20px' }}>
                        <h4 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em', marginBottom: '12px' }}>
                          Items Audit & Conversions
                        </h4>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {order.items?.map((item, idx) => {
                            const isConversionApplied = item.ordered_unit !== item.product_base_unit;

                            return (
                              <div key={idx} style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '10px' }}>
                                  <div>
                                    <strong style={{ fontSize: '14.5px' }}>{item.product_name}</strong>
                                    <span style={{ fontSize: '12px', background: 'rgba(255,255,255,0.04)', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px', fontFamily: 'monospace' }}>
                                      {item.product_sku}
                                    </span>
                                  </div>
                                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                                    ₹{parseFloat(item.item_total_price_inr).toFixed(2)}
                                  </div>
                                </div>

                                {/* AUDIT BLOCK */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '6px', fontSize: '12px', border: '1px dashed var(--border-color)' }}>
                                  <div>
                                    <span style={{ color: 'var(--text-muted)' }}>Ordered Quantity:</span>
                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                                      {parseFloat(item.ordered_quantity).toString()} {item.ordered_unit}
                                    </div>
                                  </div>
                                  <div>
                                    <span style={{ color: 'var(--text-muted)' }}>Unit Rate:</span>
                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                                      ₹{parseFloat(item.price_per_ordered_unit_inr).toFixed(4)} / {item.ordered_unit}
                                    </div>
                                  </div>
                                  <div>
                                    <span style={{ color: 'var(--text-muted)' }}>Internal Database Base Rate:</span>
                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                                      ₹{parseFloat(item.product_base_price).toFixed(4)} / {item.product_base_unit}
                                    </div>
                                  </div>
                                  <div>
                                    <span style={{ color: 'var(--text-muted)' }}>Conversion Factor:</span>
                                    <div style={{ fontWeight: 600, color: 'var(--secondary)', marginTop: '2px' }}>
                                      {getConversionExplanation(item)}
                                    </div>
                                  </div>
                                  <div style={{ gridColumn: 'span 2' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Calculation Math:</span>
                                    <div style={{ color: 'var(--accent)', fontWeight: 600, marginTop: '2px' }}>
                                      {parseFloat(item.ordered_quantity).toString()} {item.ordered_unit} × ₹{parseFloat(item.price_per_ordered_unit_inr).toFixed(4)}/unit = ₹{parseFloat(item.item_total_price_inr).toFixed(2)}
                                    </div>
                                  </div>
                                  <div style={{ gridColumn: 'span 2' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Inventory Deduction (Converted to Base Unit):</span>
                                    <div style={{ color: 'var(--warning)', fontWeight: 600, marginTop: '2px' }}>
                                      {parseFloat(item.converted_quantity_base).toFixed(8)} {item.product_base_unit}
                                    </div>
                                  </div>
                                </div>

                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Admin Actions */}
                      {order.status === 'pending' && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                          <button 
                            className={`${comps.btn} ${comps.btnDanger} ${comps.btnSmall}`} 
                            onClick={() => updateOrderStatus(order.id, 'rejected')}
                            disabled={actionLoading}
                          >
                            Reject Quotation
                          </button>
                          <button 
                            className={`${comps.btn} ${comps.btnSuccess} ${comps.btnSmall}`} 
                            onClick={() => updateOrderStatus(order.id, 'approved')}
                            disabled={actionLoading}
                          >
                            {actionLoading ? 'Deducting Stock...' : 'Approve & Deduct Stock'}
                          </button>
                        </div>
                      )}

                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Modal Dialog for Create/Edit Product */}
        {modalType && (
          <div className={comps.modalOverlay}>
            <div className={comps.modalContent}>
              <div className={comps.modalHeader}>
                <h3 className={comps.modalTitle}>
                  {modalType === 'create' ? 'Add New Product to Catalog' : 'Modify Product Configuration'}
                </h3>
                <button className={comps.modalClose} onClick={closeModal}>✕</button>
              </div>

              <form onSubmit={saveProduct}>
                <div className={comps.modalBody}>
                  <div className={comps.formGroup}>
                    <label className={comps.formLabel}>SKU Identification</label>
                    <input
                      type="text"
                      className={comps.formInput}
                      value={formSku}
                      onChange={(e) => setFormSku(e.target.value)}
                      placeholder="e.g., CHEM-NACL-001"
                      required
                      disabled={actionLoading}
                    />
                  </div>

                  <div className={comps.formGroup}>
                    <label className={comps.formLabel}>Chemical/Product Name</label>
                    <input
                      type="text"
                      className={comps.formInput}
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="e.g., Sodium Chloride (Analytical Grade)"
                      required
                      disabled={actionLoading}
                    />
                  </div>

                  <div className={comps.formRow}>
                    <div className={comps.formGroup}>
                      <label className={comps.formLabel}>Catalog Category</label>
                      <input
                        type="text"
                        className={comps.formInput}
                        value={formCategory}
                        onChange={(e) => setFormCategory(e.target.value)}
                        placeholder="e.g., Chemical Reagents"
                        required
                        disabled={actionLoading}
                        list="category-suggestions"
                      />
                      <datalist id="category-suggestions">
                        {categories.map(cat => <option key={cat} value={cat} />)}
                      </datalist>
                    </div>

                    <div className={comps.formGroup}>
                      <label className={comps.formLabel}>Storage Base Unit</label>
                      <select
                        className={styles.selectInput}
                        style={{ height: '42px', padding: '10px 14px' }}
                        value={formBaseUnit}
                        onChange={(e) => setFormBaseUnit(e.target.value)}
                        required
                        disabled={actionLoading || modalType === 'edit'} // Lock unit editing once created to avoid historical conversion mismatch issues
                      >
                        <option value="g">g (grams)</option>
                        <option value="kg">kg (kilograms)</option>
                        <option value="mL">mL (milliliters)</option>
                        <option value="L">L (liters)</option>
                        <option value="items">items (count)</option>
                      </select>
                    </div>
                  </div>

                  <div className={comps.formRow}>
                    <div className={comps.formGroup}>
                      <label className={comps.formLabel}>Base Unit Price (INR)</label>
                      <input
                        type="number"
                        step="any"
                        className={comps.formInput}
                        value={formBasePrice}
                        onChange={(e) => setFormBasePrice(e.target.value)}
                        placeholder="e.g., 450.00"
                        required
                        disabled={actionLoading}
                        min="0"
                      />
                    </div>

                    <div className={comps.formGroup}>
                      <label className={comps.formLabel}>Stock Inventory Quantity</label>
                      <input
                        type="number"
                        step="any"
                        className={comps.formInput}
                        value={formInventory}
                        onChange={(e) => setFormInventory(e.target.value)}
                        placeholder="e.g., 150.75"
                        required
                        disabled={actionLoading}
                        min="0"
                      />
                    </div>
                  </div>

                  <div className={comps.formGroup}>
                    <label className={comps.formLabel}>Product Description</label>
                    <textarea
                      className={`${comps.formInput} comps.formTextarea`}
                      style={{ minHeight: '80px', resize: 'vertical' }}
                      value={formDescription}
                      onChange={(e) => setFormDescription(e.target.value)}
                      placeholder="Enter safety notes, concentration details, chemical formulas, etc."
                      disabled={actionLoading}
                    />
                  </div>
                </div>

                <div className={comps.modalFooter}>
                  <button type="button" className={`${comps.btn} ${comps.btnSecondary}`} onClick={closeModal} disabled={actionLoading}>
                    Cancel
                  </button>
                  <button type="submit" className={`${comps.btn} ${comps.btnPrimary}`} disabled={actionLoading}>
                    {actionLoading ? 'Saving...' : 'Save Configuration'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
