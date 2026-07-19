/* ============================================================
   ElectroMart Admin Dashboard Logic
   ============================================================ */

let inventoryOffset = 0;
const INV_PAGE_SIZE = 15;
let allInventory = [];
let charts = {};

document.addEventListener("DOMContentLoaded", async () => {
  await loadStats();
  await loadSalesAnalytics();
  await loadLowStock();
  await loadInventory();
  bindAdminEvents();
  setInterval(loadStats, 15000); // simulate near-real-time updates
});

function fmtINR(n) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

/* ---------- Stat Cards ---------- */
async function loadStats() {
  const res = await fetch("/api/admin/stats");
  const s = await res.json();

  const cards = [
    { label: "Total Revenue", value: fmtINR(s.revenue), icon: "fa-indian-rupee-sign", color: "#4f46e5", sub: `${s.orders_count} orders` },
    { label: "Total Profit", value: fmtINR(s.profit), icon: "fa-chart-line", color: "#17c964", sub: `Margin ${(s.revenue ? (s.profit / s.revenue * 100).toFixed(1) : 0)}%` },
    { label: "Customer Footfall", value: s.total_footfall.toLocaleString("en-IN"), icon: "fa-users", color: "#00b8d9", sub: `${s.today_footfall.toLocaleString("en-IN")} today` },
    { label: "Inventory Value", value: fmtINR(s.inventory_value), icon: "fa-boxes-stacked", color: "#ffb020", sub: `Budget ${fmtINR(s.total_budget)}` },
    { label: "Low Stock Alerts", value: s.low_stock_count, icon: "fa-triangle-exclamation", color: "#ff8a00", sub: `${s.out_of_stock_count} out of stock` },
    { label: "Budget Remaining", value: fmtINR(s.budget_remaining), icon: "fa-sack-dollar", color: "#7c3aed", sub: "Available to invest" },
  ];

  document.getElementById("statCardsRow").innerHTML = cards.map((c) => `
    <div class="col-6 col-lg-4 col-xl-2">
      <div class="em-stat-card">
        <div class="em-stat-icon" style="background:${c.color}"><i class="fa-solid ${c.icon}"></i></div>
        <div>
          <div class="em-stat-label">${c.label}</div>
          <div class="em-stat-value">${c.value}</div>
          <div class="em-stat-sub">${c.sub}</div>
        </div>
      </div>
    </div>
  `).join("");

  // budget bar
  const bar = document.getElementById("budgetProgressBar");
  bar.style.width = s.budget_utilization_pct + "%";
  bar.style.background = s.over_budget_amount > 0
    ? "linear-gradient(90deg, #ff8a00, #ff3b5c)"
    : "linear-gradient(90deg, #4f46e5, #7c3aed)";
  document.getElementById("budgetInvested").textContent = fmtINR(s.inventory_value);
  document.getElementById("budgetTotal").textContent = fmtINR(s.total_budget);
  const remainingEl = document.getElementById("budgetRemaining");
  const noteEl = document.getElementById("budgetNote");
  if (s.over_budget_amount > 0) {
    remainingEl.textContent = fmtINR(0);
    remainingEl.style.color = "#ff3b5c";
    noteEl.innerHTML = `<i class="fa-solid fa-circle-info"></i> Inventory value exceeds the initial ₹${(s.total_budget/100000).toFixed(0)}L budget by ${fmtINR(s.over_budget_amount)} — funded through reinvested profits as the store scaled up.`;
  } else {
    remainingEl.textContent = fmtINR(s.budget_remaining);
    remainingEl.style.color = "#17c964";
    noteEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> Within the allocated initial budget.`;
  }
}

/* ---------- Charts ---------- */
async function loadSalesAnalytics() {
  const res = await fetch("/api/admin/sales-analytics");
  const data = await res.json();

  const ctx1 = document.getElementById("revenueChart");
  if (charts.revenue) charts.revenue.destroy();
  charts.revenue = new Chart(ctx1, {
    type: "line",
    data: {
      labels: data.daily.map((d) => d.day.slice(5)),
      datasets: [
        { label: "Revenue", data: data.daily.map((d) => d.revenue), borderColor: "#4f46e5", backgroundColor: "rgba(79,70,229,0.1)", fill: true, tension: 0.35 },
        { label: "Profit", data: data.daily.map((d) => d.profit), borderColor: "#17c964", backgroundColor: "rgba(23,201,100,0.1)", fill: true, tension: 0.35 },
      ],
    },
    options: { responsive: true, plugins: { legend: { position: "bottom" } } },
  });

  const ctx2 = document.getElementById("categoryChart");
  if (charts.category) charts.category.destroy();
  charts.category = new Chart(ctx2, {
    type: "doughnut",
    data: {
      labels: data.by_category.map((c) => c.category),
      datasets: [{
        data: data.by_category.map((c) => c.revenue),
        backgroundColor: ["#4f46e5", "#7c3aed", "#00b8d9", "#17c964", "#ffb020", "#ff3b5c", "#ff8a00", "#0ea968", "#3730a3", "#00d9ff"],
      }],
    },
    options: { responsive: true, plugins: { legend: { position: "bottom", labels: { boxWidth: 10, font: { size: 10 } } } } },
  });

  const ctx3 = document.getElementById("topProductsChart");
  if (charts.top) charts.top.destroy();
  charts.top = new Chart(ctx3, {
    type: "bar",
    data: {
      labels: data.top_products.map((p) => p.product_name.length > 18 ? p.product_name.slice(0, 18) + "…" : p.product_name),
      datasets: [{ label: "Units Sold", data: data.top_products.map((p) => p.units), backgroundColor: "#4f46e5", borderRadius: 6 }],
    },
    options: { responsive: true, indexAxis: "y", plugins: { legend: { display: false } } },
  });

  const ctx4 = document.getElementById("stockChart");
  if (charts.stock) charts.stock.destroy();
  charts.stock = new Chart(ctx4, {
    type: "bar",
    data: {
      labels: data.stock_distribution.map((s) => s.category),
      datasets: [{ label: "Units in Stock", data: data.stock_distribution.map((s) => s.total_stock), backgroundColor: "#17c964", borderRadius: 6 }],
    },
    options: { responsive: true, plugins: { legend: { display: false } } },
  });
}

/* ---------- Low stock ---------- */
async function loadLowStock() {
  const res = await fetch("/api/admin/low-stock");
  const rows = await res.json();
  document.getElementById("lowStockTableBody").innerHTML = rows.length ? rows.map((p) => `
    <tr>
      <td>${p.name}</td>
      <td>${p.category}</td>
      <td>${p.stock}</td>
      <td>${p.stock === 0
        ? `<span class="em-stock-badge em-stock-out">Out of Stock</span>`
        : `<span class="em-stock-badge em-stock-low">Low Stock</span>`}</td>
    </tr>
  `).join("") : `<tr><td colspan="4" class="text-center text-secondary py-3">All products are well stocked 🎉</td></tr>`;
}

/* ---------- Inventory management ---------- */
async function loadInventory() {
  const res = await fetch("/api/admin/products");
  allInventory = await res.json();
  inventoryOffset = 0;
  renderInventoryPage();
}

function stockBadge(stock) {
  if (stock === 0) return `<span class="em-stock-badge em-stock-out">Out</span>`;
  if (stock <= 5) return `<span class="em-stock-badge em-stock-low">Low</span>`;
  return `<span class="em-stock-badge em-stock-ok">OK</span>`;
}

function renderInventoryPage(filtered = null) {
  const source = filtered || allInventory;
  const slice = source.slice(0, inventoryOffset + INV_PAGE_SIZE);
  inventoryOffset = slice.length;

  document.getElementById("inventoryTableBody").innerHTML = slice.map((p) => `
    <tr data-id="${p.id}">
      <td>${p.id}</td>
      <td><img src="${p.image_url}" alt="" class="em-inv-thumb" title="View on storefront" onclick="viewOnStorefront(${p.id})"></td>
      <td style="max-width:180px" class="em-inv-name" title="View on storefront" onclick="viewOnStorefront(${p.id})">${p.name}</td>
      <td>${p.category}</td>
      <td><input type="number" class="em-inline-input mrp-input" value="${p.mrp}"></td>
      <td><input type="number" class="em-inline-input price-input" value="${p.offer_price}"></td>
      <td>${p.discount_percent}%</td>
      <td><input type="number" class="em-inline-input stock-input" value="${p.stock}"> ${stockBadge(p.stock)}</td>
      <td>${p.rating} <i class="fa-solid fa-star text-warning"></i></td>
      <td>
        <button class="btn btn-sm btn-outline-secondary view-product-btn" title="View on storefront" onclick="viewOnStorefront(${p.id})"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
        <button class="btn btn-sm btn-outline-primary save-product-btn" title="Save"><i class="fa-solid fa-floppy-disk"></i></button>
        <button class="btn btn-sm btn-outline-danger delete-product-btn" title="Delete"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>
  `).join("");

  document.getElementById("inventoryLoadMoreBtn").style.display = inventoryOffset >= source.length ? "none" : "inline-block";
  attachInventoryRowEvents();
}

/* ---------- Redirect to the same product on the customer storefront ---------- */
function viewOnStorefront(productId) {
  window.open(`/?product=${productId}`, "_blank");
}

function attachInventoryRowEvents() {
  document.querySelectorAll(".save-product-btn").forEach((btn) => {
    btn.onclick = async () => {
      const tr = btn.closest("tr");
      const id = tr.dataset.id;
      const mrp = parseFloat(tr.querySelector(".mrp-input").value);
      const offer_price = parseFloat(tr.querySelector(".price-input").value);
      const stock = parseInt(tr.querySelector(".stock-input").value);
      const discount_percent = mrp ? Math.round((1 - offer_price / mrp) * 100) : 0;
      await fetch(`/api/admin/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mrp, offer_price, stock, discount_percent }),
      });
      showToast(`Product #${id} updated`, "success");
      if (typeof playCouponSound === "function") playCouponSound();
      await loadInventory();
      await loadLowStock();
      await loadStats();
    };
  });
  document.querySelectorAll(".delete-product-btn").forEach((btn) => {
    btn.onclick = async () => {
      const tr = btn.closest("tr");
      const id = tr.dataset.id;
      if (!confirm("Delete this product permanently?")) return;
      await fetch(`/api/admin/products/${id}`, { method: "DELETE" });
      showToast(`Product #${id} deleted`, "success");
      if (typeof playErrorSound === "function") playErrorSound();
      await loadInventory();
      await loadLowStock();
      await loadStats();
    };
  });
}

/* ---------- Add product ---------- */
function bindAdminEvents() {
  document.getElementById("inventoryLoadMoreBtn").addEventListener("click", () => renderInventoryPage());
  document.getElementById("inventorySearch").addEventListener("input", (e) => {
    const term = e.target.value.trim().toLowerCase();
    inventoryOffset = 0;
    if (!term) {
      renderInventoryPage();
      return;
    }
    const filtered = allInventory.filter((p) =>
      p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term) || p.brand.toLowerCase().includes(term)
    );
    renderInventoryPage(filtered);
  });

  document.getElementById("addProductForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    await fetch("/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    showToast("Product added successfully", "success");
    if (typeof playSuccessSound === "function") playSuccessSound();
    if (typeof fireConfetti === "function") fireConfetti({ particleCount: 60, spread: 70 });
    bootstrap.Modal.getInstance(document.getElementById("addProductModal")).hide();
    e.target.reset();
    await loadInventory();
    await loadStats();
    await loadLowStock();
  });
}

/* Local minimal toast (admin page doesn't load cart.js) */
function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = `em-toast ${type}`;
  const icon = type === "success" ? "fa-circle-check" : "fa-circle-exclamation";
  toast.innerHTML = `<i class="fa-solid ${icon}"></i> ${message}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}
