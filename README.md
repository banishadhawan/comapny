# AasaMedChem Inventory & Order Management System

A high-precision, role-based B2B chemical inventory and order management system built using **Next.js (App Router)**, **Neon-hosted PostgreSQL**, and **CSS Modules**. 

This system handles chemical items with diverse quantity dimensions, complex unit conversions, and features a dual-dashboard interface (Seller and Admin portals) with detailed conversion audit trails.

---

## 🌟 Core Features

*   **Role-Based Access Control**:
    *   **Admin Dashboard**: CRUD catalog products, configure unit pricing, monitor exact stock levels, and review/approve incoming quotations.
    *   **Seller Portal**: Browse/search products, perform live unit conversions on the fly, manage a checkout cart, and place quotation requests.
*   **High-Precision Unit Conversion Engine**: Dynamic conversion across weight, volume, and count dimensions (`g`, `kg`, `mL`, `L`, `items`).
*   **Atomic Inventory Checks**: Pending quotations are audited by the Admin and lock rows during approval (`SELECT FOR UPDATE`) to prevent inventory race conditions.
*   **Slate Dark Visual Design**: Premium dark aesthetics with glassmorphic cards, responsive grid structures, and interactive states styled using raw CSS Modules (no Tailwind boilerplate).

---

## 🛠️ Tech Stack & Architecture

```mermaid
graph TD
    User([Web Client]) -->|Requests| NextJS[Next.js App Router]
    NextJS -->|Client View| Seller[Seller Portal]
    NextJS -->|Client View| Admin[Admin Portal]
    
    NextJS -->|HttpOnly JWT Cookie| AuthAPI[Auth API Routes]
    NextJS -->|Lazy Connection Pool| DB[Neon PostgreSQL Database]
    
    Seller -->|Live Math| ConvLib[Conversion Library - big.js]
    Admin -->|Row Locking Transaction| DB
```

1.  **Frontend**: Next.js App Router (React 19, JavaScript) using CSS Modules for premium custom styling.
2.  **Backend**: Next.js Route Handlers (API Endpoints) executing raw SQL queries via the `pg` client.
3.  **Database**: Neon PostgreSQL serverless database.
4.  **Math Engine**: `big.js` is utilized in both client-side and server-side contexts to eliminate JavaScript binary floating-point errors (e.g. `0.1 + 0.2 !== 0.3`).

---

## 🗄️ Database Schema & Precision Choices

We use raw SQL schemas configured inside `scripts/db-init.js`.

### 1. `users` Table
Stores authentication data. Passwords are salted and hashed using `bcryptjs`.
*   `id` (`UUID`, PK, defaults to `uuid_generate_v4()`)
*   `email` (`VARCHAR(255)`, Unique, Not Null)
*   `password_hash` (`VARCHAR(255)`, Not Null)
*   `role` (`VARCHAR(50)`, Check `admin` or `seller`)
*   `name` (`VARCHAR(255)`, Not Null)
*   `created_at` (`TIMESTAMP`)

### 2. `products` Table
Stores chemical items.
*   `id` (`UUID`, PK)
*   `sku` (`VARCHAR(100)`, Unique, Not Null)
*   `name` (`VARCHAR(255)`, Not Null)
*   `description` (`TEXT`)
*   `category` (`VARCHAR(100)`, Not Null)
*   `base_unit` (`VARCHAR(20)`, Check `g`, `kg`, `L`, `mL`, `items`)
*   `base_price_inr` (`NUMERIC(20, 4)`) - *Price of 1 unit of `base_unit`*
*   `inventory_quantity` (`NUMERIC(20, 8)`) - *Stock level stored in `base_unit`*

#### Why These Numerical Ratios?
*   **`NUMERIC(20, 4)` for Prices**: Storing prices up to 4 decimal places allows micro-pricing of materials (e.g., fractional Rupees for grams of raw solvents) while supporting large bulk purchase values (up to 999 Trillion INR) without rounding distortion.
*   **`NUMERIC(20, 8)` for Quantities**: Storing stock to 8 decimal places allows microgram-scale measurements (e.g., `0.00000001 kg` equals `10 micrograms` or `0.01 milligrams`), which is common in high-purity chemical reagent stock rooms.

### 3. `orders` Table
Stores quotation containers.
*   `id` (`UUID`, PK)
*   `user_id` (`UUID`, FK to `users.id`)
*   `status` (`VARCHAR(50)`, Check `pending`, `approved`, `rejected`, `cancelled`)
*   `total_price_inr` (`NUMERIC(20, 4)`)
*   `created_at` (`TIMESTAMP`)

### 4. `order_items` Table
Stores items in a quotation, preserving the exact unit ordered by the seller.
*   `id` (`UUID`, PK)
*   `order_id` (`UUID`, FK to `orders.id`)
*   `product_id` (`UUID`, FK to `products.id`)
*   `ordered_quantity` (`NUMERIC(20, 8)`) - *The quantity inputted by the user*
*   `ordered_unit` (`VARCHAR(20)`) - *The unit selected by the user*
*   `price_per_ordered_unit_inr` (`NUMERIC(20, 4)`) - *Calculated rate per the ordered unit*
*   `converted_quantity_base` (`NUMERIC(20, 8)`) - *Quantity in base units, used for inventory*
*   `item_total_price_inr` (`NUMERIC(20, 4)`) - *Total price of this line item*

---

## 📏 Unit Storage & Conversion Strategy

### 1. Internals Storage
*   All product prices and stock quantities are stored relative to their configured **`base_unit`** in the `products` table.
*   Dimensions are grouped to prevent unit mismatches:
    *   **WEIGHT Dimension**: `g` (scale: 1), `kg` (scale: 1000)
    *   **VOLUME Dimension**: `mL` (scale: 1), `L` (scale: 1000)
    *   **COUNT Dimension**: `items` (scale: 1)

### 2. The Conversion Formulas
Let $S_{\text{from}}$ be the scale factor of the source unit, and $S_{\text{to}}$ be the scale factor of the destination unit.
*   **Quantity Conversion**:
    $$\text{Quantity}_{\text{to}} = \text{Quantity}_{\text{from}} \times \left(\frac{S_{\text{from}}}{S_{\text{to}}}\right)$$
*   **Unit Price Conversion**:
    $$\text{Price}_{\text{to}} = \text{Price}_{\text{from}} \times \left(\frac{S_{\text{to}}}{S_{\text{from}}}\right)$$

*Example: NaCl is configured with base unit `kg` (scale: 1000) and base price ₹450.00/kg. If a user orders `500 g` (scale: 1):*
*   $\text{Converted Quantity} = 500 \times \left(\frac{1}{1000}\right) = 0.50000000\text{ kg}$
*   $\text{Converted Rate} = 450 \times \left(\frac{1}{1000}\right) = \text{₹}0.4500\text{/g}$
*   $\text{Item Total} = 500\text{ g} \times \text{₹}0.4500\text{/g} = \text{₹}225.00$

### 3. Application Points
*   **Client-Side Grid**: Dynamic calculations run via `lib/conversion.js` on user input, updating the subtotal, converted rate, and base unit equivalent live.
*   **Client-Side Cart**: Displays warning banners if the requested quantity exceeds available inventory levels.
*   **Server-Side Order Placement**: Recalculates all items using `Big.js` before saving to prevent tampering, storing the calculated order item values in the `order_items` table.
*   **Admin Approval**: Reloads products under row locks (`SELECT FOR UPDATE`), verifies stock in terms of the base unit, and deducts the exact value.

---

## 🚀 Local Setup Instructions

### 1. Clone & Install Dependencies
```bash
git clone <repository_url>
cd company
npm install
```

### 2. Configure Environment Variables
Create a file named `.env.local` in the project root:
```env
DATABASE_URL="postgres://your_neon_user:your_neon_pass@your_neon_host/neondb?sslmode=require"
JWT_SECRET="aasamedchem_secret_key_123_hackathon"
```

### 3. Run Database Migrations & Seeds
Execute the seeding script to create tables and pre-populate test records:
```bash
node scripts/db-init.js
```

### 4. Start Local Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔑 Tester Login Credentials

You can click these credentials directly on the login page, or log in manually:

| Portal | Email | Password | Role Description |
| :--- | :--- | :--- | :--- |
| **Admin Control Center** | `admin@aasamedchem.com` | `adminpassword` | Manage catalog, inspect conversion audit logs, approve/reject orders. |
| **Seller Portal** | `seller@aasamedchem.com` | `sellerpassword` | Search chemical catalog, use live unit calculator, place orders. |

---

## ☁️ Vercel Deployment Instructions

1.  Create a new project on [Vercel](https://vercel.com).
2.  Import your GitHub repository.
3.  In the **Environment Variables** section of Vercel settings, add:
    *   `DATABASE_URL`: Your Neon PostgreSQL connection string.
    *   `JWT_SECRET`: A secure random secret string.
4.  Click **Deploy**. Next.js will build the client components and serverless APIs automatically.
5.  *(Optional)* To re-seed or reset your database tables in production, you can run `node scripts/db-init.js` locally using your production `DATABASE_URL`, or integrate it as a deployment step.
