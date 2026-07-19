"""
ElectroMart - Electronics Retail Website
A lightweight Flask + SQLite retail platform.
Run with: python app.py
"""
import sqlite3
import random
import os
from datetime import datetime, timedelta
from flask import Flask, g, jsonify, render_template, request

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "database", "electromart.db")
TOTAL_BUDGET = 2_000_000  # ₹20,00,000

app = Flask(__name__)

# Business logic constants (kept here so both server + client agree)
QUANTITY_DISCOUNT_TIERS = [(5, 15), (3, 10), (2, 5)]   # (min_qty, extra % off) - highest first
CART_VALUE_DISCOUNT_TIERS = [(9999, 15), (4999, 10), (1999, 5)]  # (min_cart_value, % off)


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    os.makedirs(os.path.join(BASE_DIR, "database"), exist_ok=True)
    fresh = not os.path.exists(DB_PATH)
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.executescript("""
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        brand TEXT NOT NULL,
        image_url TEXT,
        mrp REAL NOT NULL,
        offer_price REAL NOT NULL,
        cost_price REAL NOT NULL,
        discount_percent INTEGER NOT NULL,
        rating REAL NOT NULL,
        reviews_count INTEGER NOT NULL,
        stock INTEGER NOT NULL,
        warranty_months INTEGER NOT NULL,
        description TEXT,
        is_flash_sale INTEGER DEFAULT 0,
        is_trending INTEGER DEFAULT 0,
        created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS coupons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        description TEXT,
        discount_type TEXT NOT NULL,
        discount_value REAL NOT NULL,
        min_cart_value REAL DEFAULT 0,
        max_discount REAL,
        active INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subtotal REAL,
        discount REAL,
        coupon_code TEXT,
        total REAL,
        profit REAL,
        created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER REFERENCES orders(id),
        product_id INTEGER,
        product_name TEXT,
        category TEXT,
        quantity INTEGER,
        price REAL,
        cost_price REAL,
        created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    );
    CREATE TABLE IF NOT EXISTS footfall (
        date TEXT PRIMARY KEY,
        count INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS stock_notify (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER,
        email TEXT,
        created_at TEXT
    );
    """)
    db.commit()
    if fresh:
        seed_data(db)
    ensure_flash_sale_window(db)
    db.close()


# ---------------------------------------------------------------------------
# Seed data - 100 realistic electronics products
# ---------------------------------------------------------------------------
CATEGORY_BRANDS = {
    "Smartphones": ["Apple", "Samsung", "OnePlus", "Xiaomi", "Realme", "Google"],
    "Laptops": ["Apple", "Dell", "HP", "Lenovo", "Asus", "Acer"],
    "Headphones": ["Sony", "Bose", "JBL", "boAt", "Sennheiser", "Apple"],
    "Smartwatches": ["Apple", "Samsung", "Noise", "boAt", "Fitbit", "Fire-Boltt"],
    "Tablets": ["Apple", "Samsung", "Lenovo", "Xiaomi", "Realme"],
    "Cameras": ["Canon", "Nikon", "Sony", "Fujifilm", "GoPro"],
    "Televisions": ["Samsung", "LG", "Sony", "Mi", "TCL", "OnePlus"],
    "Speakers": ["JBL", "Bose", "Sony", "boAt", "Marshall"],
    "Gaming Consoles": ["Sony", "Microsoft", "Nintendo"],
    "Accessories": ["Logitech", "Anker", "boAt", "Belkin", "Samsung"],
}

MODEL_WORDS = ["Pro", "Max", "Ultra", "Plus", "Air", "Lite", "Neo", "Edge", "Prime", "X", "SE", "Turbo"]

PRICE_RANGES = {
    "Smartphones": (12000, 145000),
    "Laptops": (28000, 220000),
    "Headphones": (999, 32000),
    "Smartwatches": (1499, 45000),
    "Tablets": (9999, 95000),
    "Cameras": (18000, 175000),
    "Televisions": (11000, 150000),
    "Speakers": (799, 28000),
    "Gaming Consoles": (24999, 59999),
    "Accessories": (299, 6999),
}

BANNER_COLORS = ["1a1a2e/eeeeee", "16213e/00d9ff", "0f3460/ffd60a", "533483/ffffff",
                 "222831/00adb5", "393e46/ff5722", "2c003e/f6f1d1", "0d1b2a/e0e1dd"]


def seed_data(db):
    random.seed(42)
    now = datetime.now()
    idx = 1
    rows = []
    for category, count in _category_quota().items():
        brands = CATEGORY_BRANDS[category]
        low, high = PRICE_RANGES[category]
        for _ in range(count):
            brand = random.choice(brands)
            model = f"{brand} {category[:-1] if category.endswith('s') else category} {random.choice(MODEL_WORDS)} {random.randint(10, 999)}"
            mrp = round(random.uniform(low, high), -1)
            discount_percent = random.choice([5, 8, 10, 12, 15, 18, 20, 25, 30, 35, 40])
            offer_price = round(mrp * (1 - discount_percent / 100), -1)
            cost_price = round(offer_price * random.uniform(0.6, 0.78), 2)
            rating = round(random.uniform(3.5, 5.0), 1)
            reviews = random.randint(20, 8500)
            stock = random.choice([0, 1, 2, 3, 5, 8, 12, 18, 25, 35, 50])
            warranty = random.choice([6, 12, 12, 12, 24, 36])
            color = random.choice(BANNER_COLORS)
            image_url = f"https://placehold.co/600x600/{color}?text={model.replace(' ', '+')}"
            is_flash = 1 if random.random() < 0.15 else 0
            is_trend = 1 if random.random() < 0.20 else 0
            desc = (f"{model} from {brand}. Genuine product with {warranty}-month brand warranty. "
                    f"Category: {category}. Free delivery on orders above ₹499.")
            rows.append((model, category, brand, image_url, mrp, offer_price, cost_price,
                         discount_percent, rating, reviews, stock, warranty, desc,
                         is_flash, is_trend, now.isoformat()))
            idx += 1

    db.executemany("""
        INSERT INTO products (name, category, brand, image_url, mrp, offer_price, cost_price,
            discount_percent, rating, reviews_count, stock, warranty_months, description,
            is_flash_sale, is_trending, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, rows)

    coupons = [
        ("WELCOME10", "10% off on your first order", "percent", 10, 999, 500),
        ("ELECTRO15", "15% off on orders above ₹2999", "percent", 15, 2999, 2000),
        ("FLAT500", "Flat ₹500 off on orders above ₹4999", "flat", 500, 4999, None),
        ("SUPER20", "20% off on orders above ₹9999", "percent", 20, 9999, 3000),
        ("MEGA1000", "Flat ₹1000 off on orders above ₹14999", "flat", 1000, 14999, None),
    ]
    db.executemany("""
        INSERT INTO coupons (code, description, discount_type, discount_value, min_cart_value, max_discount)
        VALUES (?,?,?,?,?,?)
    """, coupons)

    db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('total_budget', ?)", (str(TOTAL_BUDGET),))
    # Seed a bit of historical order/footfall data so analytics charts aren't empty on first run
    _seed_history(db)
    db.commit()


def _category_quota():
    """Distribute 100 products across categories."""
    return {
        "Smartphones": 16, "Laptops": 14, "Headphones": 12, "Smartwatches": 10,
        "Tablets": 8, "Cameras": 8, "Televisions": 12, "Speakers": 10,
        "Gaming Consoles": 4, "Accessories": 6,
    }


def _seed_history(db):
    product_ids = [r[0] for r in db.execute("SELECT id FROM products").fetchall()]
    products = {r["id"]: r for r in db.execute("SELECT * FROM products").fetchall()}
    today = datetime.now()
    for day_offset in range(13, -1, -1):
        day = today - timedelta(days=day_offset)
        num_orders = random.randint(15, 45)
        for _ in range(num_orders):
            n_items = random.randint(1, 3)
            chosen = random.sample(product_ids, n_items)
            subtotal, profit = 0, 0
            items = []
            for pid in chosen:
                p = products[pid]
                qty = random.randint(1, 3)
                subtotal += p["offer_price"] * qty
                profit += (p["offer_price"] - p["cost_price"]) * qty
                items.append((pid, p["name"], p["category"], qty, p["offer_price"], p["cost_price"]))
            discount = round(subtotal * random.choice([0, 0, 0.05, 0.1]), 2)
            total = subtotal - discount
            profit -= discount
            ts = (day.replace(hour=random.randint(9, 22), minute=random.randint(0, 59))).isoformat()
            cur = db.execute("""INSERT INTO orders (subtotal, discount, coupon_code, total, profit, created_at)
                                 VALUES (?,?,?,?,?,?)""", (subtotal, discount, None, total, profit, ts))
            order_id = cur.lastrowid
            for pid, name, cat, qty, price, cost in items:
                db.execute("""INSERT INTO order_items (order_id, product_id, product_name, category,
                               quantity, price, cost_price, created_at) VALUES (?,?,?,?,?,?,?,?)""",
                           (order_id, pid, name, cat, qty, price, cost, ts))
        db.execute("INSERT OR REPLACE INTO footfall (date, count) VALUES (?, ?)",
                   (day.strftime("%Y-%m-%d"), random.randint(3200, 9800)))


def ensure_flash_sale_window(db):
    row = db.execute("SELECT value FROM settings WHERE key='flash_sale_end'").fetchone()
    if row is None or datetime.fromisoformat(row["value"]) < datetime.now():
        new_end = datetime.now() + timedelta(hours=6)
        db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('flash_sale_end', ?)",
                   (new_end.isoformat(),))
        db.commit()


# ---------------------------------------------------------------------------
# Discount engine (shared logic used server-side for checkout integrity)
# ---------------------------------------------------------------------------
def quantity_discount_pct(qty):
    for min_qty, pct in QUANTITY_DISCOUNT_TIERS:
        if qty >= min_qty:
            return pct
    return 0


def cart_value_discount_pct(cart_value):
    for min_val, pct in CART_VALUE_DISCOUNT_TIERS:
        if cart_value >= min_val:
            return pct
    return 0


def row_to_dict(row):
    return {k: row[k] for k in row.keys()}


# ---------------------------------------------------------------------------
# Page routes
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/admin")
def admin():
    return render_template("admin.html")


@app.route("/order/<int:order_id>")
def order_confirmation(order_id):
    """Post-checkout redirection page: order summary + celebration (confetti/balloons)."""
    db = get_db()
    order = db.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
    if not order:
        return render_template("index.html")
    items = db.execute("SELECT * FROM order_items WHERE order_id=?", (order_id,)).fetchall()
    return render_template(
        "order_confirmation.html",
        order=row_to_dict(order),
        items=[row_to_dict(i) for i in items],
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
@app.route("/api/products")
def api_products():
    db = get_db()
    q = request.args
    where, params = [], []

    if q.get("search"):
        where.append("(name LIKE ? OR brand LIKE ? OR category LIKE ?)")
        term = f"%{q.get('search')}%"
        params += [term, term, term]
    if q.get("category") and q.get("category") != "All":
        where.append("category = ?")
        params.append(q.get("category"))
    if q.get("brand"):
        where.append("brand = ?")
        params.append(q.get("brand"))
    if q.get("min_price"):
        where.append("offer_price >= ?")
        params.append(float(q.get("min_price")))
    if q.get("max_price"):
        where.append("offer_price <= ?")
        params.append(float(q.get("max_price")))
    if q.get("flash_sale") == "1":
        where.append("is_flash_sale = 1")
    if q.get("trending") == "1":
        where.append("is_trending = 1")
    if q.get("in_stock") == "1":
        where.append("stock > 0")

    sort_map = {
        "price_low": "offer_price ASC",
        "price_high": "offer_price DESC",
        "discount": "discount_percent DESC",
        "rating": "rating DESC",
        "newest": "id DESC",
    }
    order_by = sort_map.get(q.get("sort"), "id ASC")

    limit = int(q.get("limit", 20))
    offset = int(q.get("offset", 0))

    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    total = db.execute(f"SELECT COUNT(*) c FROM products {where_sql}", params).fetchone()["c"]
    rows = db.execute(
        f"SELECT * FROM products {where_sql} ORDER BY {order_by} LIMIT ? OFFSET ?",
        params + [limit, offset],
    ).fetchall()

    return jsonify({
        "total": total,
        "items": [row_to_dict(r) for r in rows],
    })


@app.route("/api/products/<int:pid>")
def api_product_detail(pid):
    db = get_db()
    row = db.execute("SELECT * FROM products WHERE id=?", (pid,)).fetchone()
    if not row:
        return jsonify({"error": "Not found"}), 404
    return jsonify(row_to_dict(row))


@app.route("/api/categories")
def api_categories():
    db = get_db()
    rows = db.execute("SELECT category, COUNT(*) c FROM products GROUP BY category ORDER BY c DESC").fetchall()
    return jsonify([{"category": r["category"], "count": r["c"]} for r in rows])


@app.route("/api/meta")
def api_meta():
    db = get_db()
    end_row = db.execute("SELECT value FROM settings WHERE key='flash_sale_end'").fetchone()
    return jsonify({
        "flash_sale_end": end_row["value"] if end_row else None,
        "quantity_tiers": QUANTITY_DISCOUNT_TIERS,
        "cart_value_tiers": CART_VALUE_DISCOUNT_TIERS,
    })


@app.route("/api/coupons")
def api_coupons():
    db = get_db()
    rows = db.execute("SELECT * FROM coupons WHERE active=1").fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@app.route("/api/coupons/validate", methods=["POST"])
def api_validate_coupon():
    data = request.get_json(force=True)
    code = (data.get("code") or "").strip().upper()
    cart_total = float(data.get("cart_total", 0))
    db = get_db()
    row = db.execute("SELECT * FROM coupons WHERE code=? AND active=1", (code,)).fetchone()
    if not row:
        return jsonify({"valid": False, "message": "Invalid coupon code"})
    if cart_total < row["min_cart_value"]:
        return jsonify({"valid": False, "message": f"Add items worth ₹{row['min_cart_value']:.0f} more to use this coupon"})
    if row["discount_type"] == "percent":
        discount = cart_total * row["discount_value"] / 100
        if row["max_discount"]:
            discount = min(discount, row["max_discount"])
    else:
        discount = row["discount_value"]
    discount = round(min(discount, cart_total), 2)
    return jsonify({"valid": True, "discount": discount, "message": f"Coupon applied! You saved ₹{discount:.0f}", "code": code})


@app.route("/api/track-visit", methods=["POST"])
def api_track_visit():
    db = get_db()
    today = datetime.now().strftime("%Y-%m-%d")
    db.execute("""INSERT INTO footfall (date, count) VALUES (?, 1)
                  ON CONFLICT(date) DO UPDATE SET count = count + 1""", (today,))
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/checkout", methods=["POST"])
def api_checkout():
    data = request.get_json(force=True)
    items = data.get("items", [])
    coupon_code = (data.get("coupon_code") or "").strip().upper() or None
    db = get_db()

    subtotal, profit, order_items = 0, 0, []
    for item in items:
        p = db.execute("SELECT * FROM products WHERE id=?", (item["product_id"],)).fetchone()
        if not p or p["stock"] < item["quantity"]:
            return jsonify({"error": f"Insufficient stock for {p['name'] if p else 'product'}"}), 400
        qty = int(item["quantity"])
        line_total = p["offer_price"] * qty
        line_discount = line_total * quantity_discount_pct(qty) / 100
        line_final = line_total - line_discount
        subtotal += line_final
        profit += (p["offer_price"] - p["cost_price"]) * qty - line_discount
        order_items.append((p["id"], p["name"], p["category"], qty, p["offer_price"], p["cost_price"]))

    cart_pct = cart_value_discount_pct(subtotal)
    cart_discount = subtotal * cart_pct / 100
    subtotal_after_cart = subtotal - cart_discount
    profit -= cart_discount

    coupon_discount = 0
    if coupon_code:
        c = db.execute("SELECT * FROM coupons WHERE code=? AND active=1", (coupon_code,)).fetchone()
        if c and subtotal_after_cart >= c["min_cart_value"]:
            if c["discount_type"] == "percent":
                coupon_discount = subtotal_after_cart * c["discount_value"] / 100
                if c["max_discount"]:
                    coupon_discount = min(coupon_discount, c["max_discount"])
            else:
                coupon_discount = c["discount_value"]

    total_discount = round((subtotal - subtotal_after_cart) + coupon_discount, 2)
    grand_total = round(subtotal_after_cart - coupon_discount, 2)
    profit -= coupon_discount
    now = datetime.now().isoformat()

    cur = db.execute("""INSERT INTO orders (subtotal, discount, coupon_code, total, profit, created_at)
                         VALUES (?,?,?,?,?,?)""",
                      (subtotal, total_discount, coupon_code, grand_total, round(profit, 2), now))
    order_id = cur.lastrowid
    for pid, name, cat, qty, price, cost in order_items:
        db.execute("""INSERT INTO order_items (order_id, product_id, product_name, category, quantity,
                       price, cost_price, created_at) VALUES (?,?,?,?,?,?,?,?)""",
                   (order_id, pid, name, cat, qty, price, cost, now))
        db.execute("UPDATE products SET stock = stock - ? WHERE id=?", (qty, pid))
    db.commit()

    return jsonify({"order_id": order_id, "subtotal": round(subtotal, 2), "discount": total_discount,
                     "total": grand_total})


# ---------------------------------------------------------------------------
# Admin API
# ---------------------------------------------------------------------------
@app.route("/api/admin/stats")
def api_admin_stats():
    db = get_db()
    revenue = db.execute("SELECT COALESCE(SUM(total),0) v FROM orders").fetchone()["v"]
    profit = db.execute("SELECT COALESCE(SUM(profit),0) v FROM orders").fetchone()["v"]
    orders_count = db.execute("SELECT COUNT(*) c FROM orders").fetchone()["c"]
    inventory_value = db.execute("SELECT COALESCE(SUM(cost_price * stock),0) v FROM products").fetchone()["v"]
    low_stock = db.execute("SELECT COUNT(*) c FROM products WHERE stock <= 5 AND stock > 0").fetchone()["c"]
    out_of_stock = db.execute("SELECT COUNT(*) c FROM products WHERE stock = 0").fetchone()["c"]
    total_footfall = db.execute("SELECT COALESCE(SUM(count),0) v FROM footfall").fetchone()["v"]
    today = datetime.now().strftime("%Y-%m-%d")
    today_footfall = db.execute("SELECT COALESCE(count,0) c FROM footfall WHERE date=?", (today,)).fetchone()
    budget_row = db.execute("SELECT value FROM settings WHERE key='total_budget'").fetchone()
    total_budget = float(budget_row["value"]) if budget_row else TOTAL_BUDGET

    # Budget is the initial capital allocated to launch inventory. As the store grows, profits get
    # reinvested into stock, so current inventory value can exceed the original budget over time.
    over_budget_amount = max(inventory_value - total_budget, 0)
    budget_utilization_pct = round(min(100, (inventory_value / total_budget) * 100), 1) if total_budget else 0
    budget_remaining = max(total_budget - inventory_value, 0)

    return jsonify({
        "revenue": round(revenue, 2),
        "profit": round(profit, 2),
        "orders_count": orders_count,
        "inventory_value": round(inventory_value, 2),
        "total_budget": total_budget,
        "budget_remaining": round(budget_remaining, 2),
        "budget_utilization_pct": budget_utilization_pct,
        "over_budget_amount": round(over_budget_amount, 2),
        "low_stock_count": low_stock,
        "out_of_stock_count": out_of_stock,
        "total_footfall": int(total_footfall),
        "today_footfall": int(today_footfall["c"]) if today_footfall else 0,
    })


@app.route("/api/admin/sales-analytics")
def api_admin_sales_analytics():
    db = get_db()
    daily = db.execute("""
        SELECT substr(created_at,1,10) day, SUM(total) revenue, SUM(profit) profit, COUNT(*) orders
        FROM orders GROUP BY day ORDER BY day DESC LIMIT 14
    """).fetchall()
    daily = list(reversed(daily))

    by_category = db.execute("""
        SELECT category, SUM(quantity * price) revenue, SUM(quantity) units
        FROM order_items GROUP BY category ORDER BY revenue DESC
    """).fetchall()

    top_products = db.execute("""
        SELECT product_name, SUM(quantity) units, SUM(quantity * price) revenue
        FROM order_items GROUP BY product_id ORDER BY units DESC LIMIT 8
    """).fetchall()

    stock_dist = db.execute("""
        SELECT category, SUM(stock) total_stock FROM products GROUP BY category
    """).fetchall()

    return jsonify({
        "daily": [dict(r) for r in daily],
        "by_category": [dict(r) for r in by_category],
        "top_products": [dict(r) for r in top_products],
        "stock_distribution": [dict(r) for r in stock_dist],
    })


@app.route("/api/admin/products", methods=["GET", "POST"])
def api_admin_products():
    db = get_db()
    if request.method == "POST":
        d = request.get_json(force=True)
        mrp = float(d["mrp"])
        offer_price = float(d["offer_price"])
        discount = round((1 - offer_price / mrp) * 100) if mrp else 0
        cur = db.execute("""INSERT INTO products (name, category, brand, image_url, mrp, offer_price,
            cost_price, discount_percent, rating, reviews_count, stock, warranty_months, description,
            is_flash_sale, is_trending, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (d["name"], d["category"], d["brand"], d.get("image_url", ""), mrp, offer_price,
             float(d.get("cost_price", offer_price * 0.7)), discount, float(d.get("rating", 4.0)),
             int(d.get("reviews_count", 0)), int(d.get("stock", 0)), int(d.get("warranty_months", 12)),
             d.get("description", ""), int(d.get("is_flash_sale", 0)), int(d.get("is_trending", 0)),
             datetime.now().isoformat()))
        db.commit()
        return jsonify({"id": cur.lastrowid})

    rows = db.execute("SELECT * FROM products ORDER BY id DESC").fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@app.route("/api/admin/products/<int:pid>", methods=["PUT", "DELETE"])
def api_admin_product_edit(pid):
    db = get_db()
    if request.method == "DELETE":
        db.execute("DELETE FROM products WHERE id=?", (pid,))
        db.commit()
        return jsonify({"ok": True})

    d = request.get_json(force=True)
    fields, params = [], []
    for key in ["name", "category", "brand", "image_url", "mrp", "offer_price", "cost_price",
                "discount_percent", "rating", "reviews_count", "stock", "warranty_months",
                "description", "is_flash_sale", "is_trending"]:
        if key in d:
            fields.append(f"{key}=?")
            params.append(d[key])
    if fields:
        params.append(pid)
        db.execute(f"UPDATE products SET {', '.join(fields)} WHERE id=?", params)
        db.commit()
    return jsonify({"ok": True})


@app.route("/api/notify-stock", methods=["POST"])
def api_notify_stock():
    """Out-of-stock 'Notify Me' capture — stores an email against a product."""
    data = request.get_json(force=True)
    pid = data.get("product_id")
    email = (data.get("email") or "").strip()
    if not pid or not email or "@" not in email:
        return jsonify({"error": "A valid email is required"}), 400
    db = get_db()
    p = db.execute("SELECT name FROM products WHERE id=?", (pid,)).fetchone()
    if not p:
        return jsonify({"error": "Product not found"}), 404
    db.execute("INSERT INTO stock_notify (product_id, email, created_at) VALUES (?,?,?)",
               (pid, email, datetime.now().isoformat()))
    db.commit()
    return jsonify({"ok": True, "message": f"We'll email you the moment \"{p['name']}\" is back in stock!"})


@app.route("/api/admin/low-stock")
def api_admin_low_stock():
    db = get_db()
    rows = db.execute("SELECT * FROM products WHERE stock <= 5 ORDER BY stock ASC").fetchall()
    return jsonify([row_to_dict(r) for r in rows])


if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 5000))
    debug_mode = os.environ.get("RENDER") is None
    app.run(host="0.0.0.0", port=port, debug=debug_mode)
