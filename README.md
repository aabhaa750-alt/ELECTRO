# ⚡ ElectroMart — Electronics Retail Website

LIVE APP - https://electro-1-dh0v.onrender.com/ 

A fast, lightweight electronics retail platform built with **Flask + SQLite + Bootstrap + vanilla JavaScript**.
Inspired by the shopping experience of Myntra, Zepto, Apple Store, Reliance Digital, and Croma — real retail
UX, not a corporate brochure site.

![Python](https://img.shields.io/badge/Python-3.9+-blue)
![Flask](https://img.shields.io/badge/Flask-3.x-black)
![SQLite](https://img.shields.io/badge/SQLite-3-blue)
![Bootstrap](https://img.shields.io/badge/Bootstrap-5.3-purple)

---

## ✨ Features

### Storefront (Homepage — 70/30 layout)
- **Left (70%)**: Hero banner carousel, category chips, Flash Sale row, Trending Products row,
  searchable/filterable product grid (category, brand, price sort, in-stock), product quick-view modal.
- **Right (30%, sticky)**: Live Offers panel, Flash Sale countdown timer, Today's Deals, quantity-based
  discount tiers, cart-value discount tiers, coupon code entry, real-time savings calculator, live cart summary
  with instant recalculation.
- **Instant discount engine**: quantity discounts and cart-value discounts recalculate live in JavaScript the
  moment quantities change — no page reload.

### Admin Dashboard (`/admin`)
- Revenue, profit, customer footfall, inventory value, low-stock alerts, budget remaining — all as live stat cards.
- Interactive Chart.js visualizations: 14-day revenue/profit trend, revenue by category, top-selling products,
  stock distribution by category.
- Budget tracking bar (₹20,00,000 total budget vs. capital currently invested in inventory).
- Low stock alert table.
- Full inventory management: inline edit price/stock, add new products, delete products.

### Data
- **100 sample electronics products** auto-generated on first run across 10 categories (Smartphones, Laptops,
  Headphones, Smartwatches, Tablets, Cameras, Televisions, Speakers, Gaming Consoles, Accessories) with images,
  MRP/offer price/discount, ratings, reviews, stock, and warranty.
- 14 days of historical order data seeded automatically so dashboard charts aren't empty on first launch.
- 5 ready-to-use coupon codes.

---

## 🗂 Project Structure

```
electromart/
├── app.py                  # Flask app: routes, API, DB init & seeding (single file, minimal code)
├── requirements.txt
├── README.md
├── .gitignore
├── database/
│   └── electromart.db      # Auto-created on first run (SQLite)
├── templates/
│   ├── base.html           # Shared navbar/footer layout
│   ├── index.html          # Homepage (70/30 layout)
│   └── admin.html          # Admin dashboard
└── static/
    ├── css/
    │   ├── style.css       # Storefront styling
    │   └── admin.css       # Dashboard styling
    └── js/
        ├── cart.js         # Cart state, discount engine, checkout
        ├── main.js         # Product rendering, filters, search, timers
        └── admin.js        # Dashboard charts & inventory management
```

---

## 🚀 Getting Started (VS Code)

### 1. Clone / open the folder
```bash
git clone <your-repo-url> electromart
cd electromart
```

### 2. Create a virtual environment (recommended)
```bash
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate
```

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

### 4. Run the app
```bash
python app.py
```

The database (`database/electromart.db`) is created and seeded with 100 products automatically the first
time you run the app — no extra setup steps needed.

### 5. Open in browser
- Storefront: **http://127.0.0.1:5000/**
- Admin Dashboard: **http://127.0.0.1:5000/admin**

---

## 💸 How the Discount Engine Works

| Discount type | Trigger | Example |
|---|---|---|
| Quantity discount | Applied per product line based on quantity in cart | Buy 2+ → extra 5% off · Buy 3+ → 10% · Buy 5+ → 15% |
| Cart-value discount | Applied on the whole cart once threshold is crossed | Cart ≥ ₹1,999 → 5% · ≥ ₹4,999 → 10% · ≥ ₹9,999 → 15% |
| Coupon codes | Applied last, on top of the above | `WELCOME10`, `ELECTRO15`, `FLAT500`, `SUPER20`, `MEGA1000` |
| Flash Sale | Time-boxed pricing on selected products with a live countdown | Resets to a fresh 6-hour window automatically when it expires |

All discount tiers are defined once in `app.py` (`QUANTITY_DISCOUNT_TIERS`, `CART_VALUE_DISCOUNT_TIERS`) and
mirrored to the frontend via `/api/meta`, so the server always re-validates totals at checkout — the client
never has the final say on price.

---

## 🔌 API Reference (used internally by the frontend)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/products` | GET | List products with search/filter/sort/pagination |
| `/api/products/<id>` | GET | Single product detail |
| `/api/categories` | GET | Category list with counts |
| `/api/meta` | GET | Discount tiers + flash sale end time |
| `/api/coupons` | GET | Active coupon codes |
| `/api/coupons/validate` | POST | Validate a coupon against cart total |
| `/api/track-visit` | POST | Increments today's footfall counter |
| `/api/checkout` | POST | Places an order, decrements stock, records profit |
| `/api/admin/stats` | GET | Revenue, profit, footfall, budget, stock alerts |
| `/api/admin/sales-analytics` | GET | Data for dashboard charts |
| `/api/admin/products` | GET/POST | List / create inventory items |
| `/api/admin/products/<id>` | PUT/DELETE | Update / remove inventory item |
| `/api/admin/low-stock` | GET | Products at or below 5 units |

---

## 🧱 Tech Stack

- **Backend**: Python 3, Flask (single-file, minimal routes), raw `sqlite3` (no ORM overhead)
- **Frontend**: HTML5, Bootstrap 5.3, vanilla JavaScript (no build step, no frameworks)
- **Charts**: Chart.js
- **Icons**: Font Awesome 6
- **Database**: SQLite (zero-config, file-based — perfect for a lightweight retail demo)

---

## 📦 Business Context (as modeled in the app)

- **Budget**: ₹20,00,000 total capital, tracked against inventory investment in the Admin Dashboard.
- **Footfall**: Designed for 100,000+ daily visits — footfall is tracked per day and totaled.
- **Inventory**: Fully dynamic — stock decrements automatically at checkout and low-stock/out-of-stock
  states are reflected instantly across the storefront and dashboard.

---

## 📝 Notes

- Product images are generated via [placehold.co](https://placehold.co) placeholder URLs (color-coded per
  product) so the project runs fully offline with zero image hosting setup — swap `image_url` values in the
  database for real product photography in production.
- This is a demo/portfolio-grade project: checkout does not integrate a real payment gateway.
- Delete `database/electromart.db` and restart the app any time to reset to a fresh 100-product catalog.

---

Built with ⚡ for a fast, premium electronics shopping experience.
