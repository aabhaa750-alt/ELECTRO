/* ============================================================
   ElectroMart Homepage Logic
   ============================================================ */

let currentOffset = 0;
const PAGE_SIZE = 12;
let currentFilters = { search: "", category: "All", brand: "", sort: "", in_stock: false };
let categoriesCache = [];

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  await loadMeta();
  await trackVisit();
  await loadCategories();
  await loadFlashSale();
  await loadTrending();
  await loadProducts(true);
  await loadCoupons();
  await loadTodaysDeals();
  startFlashCountdown();
  bindEvents();
  renderCartSummary();
  launchBalloons(6);
  startOfferTicker();
  openProductFromUrlParam();
});

/* ---------- Deep-link: open a specific product when arriving via ?product=<id> ---------- */
function openProductFromUrlParam() {
  const params = new URLSearchParams(window.location.search);
  const pid = params.get("product");
  if (!pid) return;
  openProductModal(parseInt(pid));
  // Clean the URL so a refresh/share doesn't keep re-opening the modal
  const cleanUrl = window.location.origin + window.location.pathname;
  window.history.replaceState({}, "", cleanUrl);
}

async function loadMeta() {
  const res = await fetch("/api/meta");
  META = await res.json();
}

async function trackVisit() {
  const key = "em_visit_tracked_" + new Date().toDateString();
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, "1");
  fetch("/api/track-visit", { method: "POST" }).catch(() => {});
}

/* ---------- Categories ---------- */
async function loadCategories() {
  const res = await fetch("/api/categories");
  categoriesCache = await res.json();
  const chipRow = document.getElementById("categoryChipRow");
  const catSelect = document.getElementById("filterCategory");
  const brandSelect = document.getElementById("filterBrand");

  categoriesCache.forEach((c) => {
    const chip = document.createElement("button");
    chip.className = "em-chip";
    chip.dataset.category = c.category;
    chip.textContent = `${c.category} (${c.count})`;
    chipRow.appendChild(chip);

    const opt = document.createElement("option");
    opt.value = c.category;
    opt.textContent = c.category;
    catSelect.appendChild(opt);
  });

  // populate brand filter with a flat unique set (fetched from products already loaded categories' brands)
  const brandRes = await fetch("/api/products?limit=100");
  const brandData = await brandRes.json();
  const brands = [...new Set(brandData.items.map((p) => p.brand))].sort();
  brands.forEach((b) => {
    const opt = document.createElement("option");
    opt.value = b;
    opt.textContent = b;
    brandSelect.appendChild(opt);
  });

  chipRow.addEventListener("click", (e) => {
    const btn = e.target.closest(".em-chip");
    if (!btn) return;
    document.querySelectorAll(".em-chip").forEach((c) => c.classList.remove("active"));
    btn.classList.add("active");
    currentFilters.category = btn.dataset.category;
    document.getElementById("filterCategory").value = btn.dataset.category;
    loadProducts(true);
  });
}

/* ---------- Product card rendering ---------- */
function renderStars(rating) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  let html = "";
  for (let i = 0; i < full; i++) html += '<i class="fa-solid fa-star"></i>';
  if (half) html += '<i class="fa-solid fa-star-half-stroke"></i>';
  for (let i = full + (half ? 1 : 0); i < 5; i++) html += '<i class="fa-regular fa-star"></i>';
  return html;
}

function productCardHtml(p) {
  const outOfStock = p.stock <= 0;
  const lowStock = p.stock > 0 && p.stock <= 5;
  return `
  <div class="em-product-card" data-id="${p.id}">
    ${p.discount_percent > 0 ? `<span class="em-discount-badge">${p.discount_percent}% OFF</span>` : ""}
    ${p.is_flash_sale ? `<span class="em-flash-badge"><i class="fa-solid fa-bolt"></i> FLASH</span>` : ""}
    <div class="em-product-img-wrap" onclick="openProductModal(${p.id})">
      <img src="${p.image_url}" alt="${p.name}" loading="lazy">
      ${outOfStock ? `<div class="em-out-of-stock-overlay">Out of Stock</div>` : ""}
    </div>
    <div class="em-product-body">
      <div class="em-product-brand">${p.brand}</div>
      <div class="em-product-name" onclick="openProductModal(${p.id})" style="cursor:pointer">${p.name}</div>
      <div class="em-rating">${renderStars(p.rating)} <span>${p.rating} (${p.reviews_count})</span></div>
      <div class="em-price-row">
        <span class="em-offer-price">₹${Math.round(p.offer_price).toLocaleString("en-IN")}</span>
        <span class="em-mrp">₹${Math.round(p.mrp).toLocaleString("en-IN")}</span>
        <span class="em-discount-pct">${p.discount_percent}% off</span>
      </div>
      ${lowStock ? `<div class="em-stock-note em-stock-low"><i class="fa-solid fa-triangle-exclamation"></i> Only ${p.stock} left!</div>` : ""}
      ${outOfStock ? `<div class="em-stock-note em-stock-out">Currently unavailable</div>` : ""}
      <div class="em-product-actions">
        ${outOfStock ? `
        <button class="em-notify-btn" onclick='openNotifyModal(${p.id}, ${JSON.stringify(p.name)})'>
          <i class="fa-solid fa-bell"></i> Notify Me
        </button>` : `
        <button class="em-btn-cart" onclick='quickAddToCart(${JSON.stringify(p)})'>
          <i class="fa-solid fa-cart-plus"></i> Add
        </button>
        <button class="em-btn-buy" onclick='quickBuyNow(${JSON.stringify(p)})'>
          Buy Now
        </button>`}
      </div>
    </div>
  </div>`;
}

/* ---------- Out-of-stock "Notify Me" ---------- */
function openNotifyModal(id, name) {
  document.getElementById("notifyProductId").value = id;
  document.getElementById("notifyProductName").textContent = `We'll email you the moment "${name}" is back in stock.`;
  document.getElementById("notifyEmailInput").value = "";
  new bootstrap.Modal(document.getElementById("notifyModal")).show();
}

async function submitNotifyRequest() {
  const id = document.getElementById("notifyProductId").value;
  const email = document.getElementById("notifyEmailInput").value.trim();
  if (!email || !email.includes("@")) {
    showToast("Please enter a valid email address", "error");
    playErrorSound();
    return;
  }
  try {
    const res = await fetch("/api/notify-stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: parseInt(id), email }),
    });
    const data = await res.json();
    if (data.error) {
      showToast(data.error, "error");
      playErrorSound();
      return;
    }
    showToast(data.message, "success");
    playCouponSound();
    bootstrap.Modal.getInstance(document.getElementById("notifyModal")).hide();
  } catch (e) {
    showToast("Could not save your request right now", "error");
    playErrorSound();
  }
}

function quickAddToCart(p) {
  addToCart(p, 1);
}
function quickBuyNow(p) {
  addToCart(p, 1);
  document.getElementById("checkoutBtn").scrollIntoView({ behavior: "smooth", block: "center" });
  showToast("Added — scroll to cart summary to complete your purchase", "success");
}

/* ---------- Flash sale & trending rows ---------- */
async function loadFlashSale() {
  const res = await fetch("/api/products?flash_sale=1&limit=12");
  const data = await res.json();
  document.getElementById("flashSaleRow").innerHTML = data.items.map(productCardHtml).join("") ||
    `<p class="text-secondary small">No flash sale items right now.</p>`;
}

async function loadTrending() {
  const res = await fetch("/api/products?trending=1&limit=12");
  const data = await res.json();
  document.getElementById("trendingRow").innerHTML = data.items.map(productCardHtml).join("") ||
    `<p class="text-secondary small">No trending items right now.</p>`;
}

async function loadTodaysDeals() {
  const res = await fetch("/api/products?sort=discount&limit=5&in_stock=1");
  const data = await res.json();
  document.getElementById("todaysDealsList").innerHTML = data.items.map((p) => `
    <div class="em-deal-item">
      <img src="${p.image_url}" alt="">
      <div class="em-deal-info">
        <div class="em-deal-name">${p.name}</div>
        <div class="em-deal-price"><strong>₹${Math.round(p.offer_price)}</strong> <span class="em-mrp">₹${Math.round(p.mrp)}</span></div>
      </div>
      <button class="em-btn-cart" style="font-size:0.7rem;padding:4px 8px;" onclick='quickAddToCart(${JSON.stringify(p)})'>Add</button>
    </div>
  `).join("");
}

/* ---------- All products grid ---------- */
async function loadProducts(reset = false) {
  if (reset) {
    currentOffset = 0;
    document.getElementById("productsGrid").innerHTML = "";
  }
  const params = new URLSearchParams({
    limit: PAGE_SIZE,
    offset: currentOffset,
  });
  if (currentFilters.search) params.set("search", currentFilters.search);
  if (currentFilters.category && currentFilters.category !== "All") params.set("category", currentFilters.category);
  if (currentFilters.brand) params.set("brand", currentFilters.brand);
  if (currentFilters.sort) params.set("sort", currentFilters.sort);
  if (currentFilters.in_stock) params.set("in_stock", "1");

  const res = await fetch(`/api/products?${params.toString()}`);
  const data = await res.json();

  const grid = document.getElementById("productsGrid");
  data.items.forEach((p) => {
    const col = document.createElement("div");
    col.className = "col-6 col-md-4 col-xl-3";
    col.innerHTML = productCardHtml(p);
    grid.appendChild(col);
  });

  currentOffset += data.items.length;
  const loadMoreBtn = document.getElementById("loadMoreBtn");
  loadMoreBtn.style.display = currentOffset >= data.total ? "none" : "inline-block";

  const infoEl = document.getElementById("searchResultInfo");
  if (currentFilters.search) {
    infoEl.classList.remove("d-none");
    infoEl.textContent = `${data.total} result(s) for "${currentFilters.search}"`;
  } else {
    infoEl.classList.add("d-none");
  }

  if (data.total === 0) {
    grid.innerHTML = `<div class="col-12 text-center text-secondary py-5"><i class="fa-solid fa-magnifying-glass fa-2x mb-2"></i><p>No products found. Try different filters.</p></div>`;
  }
}

async function refreshProductStocks() {
  // Re-render the visible grid so stock numbers reflect the latest purchase
  await loadProducts(true);
  await loadFlashSale();
  await loadTrending();
}

/* ---------- Coupons list ---------- */
async function loadCoupons() {
  const res = await fetch("/api/coupons");
  const coupons = await res.json();
  document.getElementById("couponList").innerHTML = coupons.map((c) => `
    <div class="em-coupon-chip" onclick="document.getElementById('couponInput').value='${c.code}'; applyCoupon('${c.code}');">
      <div><strong>${c.code}</strong><div class="text-secondary" style="font-size:0.7rem">${c.description}</div></div>
      <i class="fa-solid fa-copy text-secondary"></i>
    </div>
  `).join("");
}

/* ---------- Flash sale countdown ---------- */
function startFlashCountdown() {
  if (!META.flash_sale_end) return;
  const endTime = new Date(META.flash_sale_end).getTime();
  function tick() {
    const now = Date.now();
    let diff = Math.max(0, endTime - now);
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const pad = (n) => String(n).padStart(2, "0");
    document.getElementById("cdHours").textContent = pad(h);
    document.getElementById("cdMinutes").textContent = pad(m);
    document.getElementById("cdSeconds").textContent = pad(s);
    const miniText = document.getElementById("flashTimerText");
    if (miniText) miniText.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  tick();
  setInterval(tick, 1000);
}

/* ---------- Product quick view modal ---------- */
async function openProductModal(id) {
  const res = await fetch(`/api/products/${id}`);
  const p = await res.json();
  if (p.error) {
    showToast("That product could not be found", "error");
    return;
  }
  const modalBody = document.getElementById("productModalContent");
  modalBody.innerHTML = `
    <div class="modal-header border-0">
      <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
    </div>
    <div class="modal-body pt-0">
      <div class="row g-4">
        <div class="col-md-5">
          <img src="${p.image_url}" class="w-100 rounded-3" alt="${p.name}">
        </div>
        <div class="col-md-7">
          <div class="em-product-brand">${p.brand} · ${p.category}</div>
          <h4 class="fw-bold mt-1">${p.name}</h4>
          <div class="em-rating mb-2">${renderStars(p.rating)} <span>${p.rating} (${p.reviews_count} reviews)</span></div>
          <div class="em-price-row mb-2">
            <span class="em-offer-price fs-4">₹${Math.round(p.offer_price).toLocaleString("en-IN")}</span>
            <span class="em-mrp">₹${Math.round(p.mrp).toLocaleString("en-IN")}</span>
            <span class="em-discount-pct">${p.discount_percent}% off</span>
          </div>
          <p class="text-secondary small">${p.description}</p>
          <p class="small"><i class="fa-solid fa-shield-halved text-primary"></i> ${p.warranty_months} months brand warranty</p>
          <p class="small">${p.stock > 0 ? `<span class="text-success"><i class="fa-solid fa-circle-check"></i> In stock (${p.stock} available)</span>` : `<span class="text-danger">Out of stock</span>`}</p>
          <div class="d-flex gap-2 mt-3">
            ${p.stock <= 0 ? `
            <button class="em-notify-btn" onclick='bootstrap.Modal.getInstance(document.getElementById("productModal")).hide(); openNotifyModal(${p.id}, ${JSON.stringify(p.name)});'>
              <i class="fa-solid fa-bell"></i> Notify Me When Available
            </button>` : `
            <button class="em-btn-cart flex-grow-1" onclick='quickAddToCart(${JSON.stringify(p)}); bootstrap.Modal.getInstance(document.getElementById("productModal")).hide();'>
              <i class="fa-solid fa-cart-plus"></i> Add to Cart
            </button>
            <button class="em-btn-buy flex-grow-1" onclick='quickBuyNow(${JSON.stringify(p)}); bootstrap.Modal.getInstance(document.getElementById("productModal")).hide();'>
              Buy Now
            </button>`}
          </div>
        </div>
      </div>
    </div>
  `;
  new bootstrap.Modal(document.getElementById("productModal")).show();
}

/* ---------- Event bindings ---------- */
function bindEvents() {
  let searchTimeout;
  document.getElementById("globalSearchInput").addEventListener("input", (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentFilters.search = e.target.value.trim();
      loadProducts(true);
    }, 350);
  });

  document.getElementById("filterCategory").addEventListener("change", (e) => {
    currentFilters.category = e.target.value;
    document.querySelectorAll(".em-chip").forEach((c) => c.classList.toggle("active", c.dataset.category === e.target.value));
    loadProducts(true);
  });
  document.getElementById("filterBrand").addEventListener("change", (e) => {
    currentFilters.brand = e.target.value;
    loadProducts(true);
  });
  document.getElementById("filterSort").addEventListener("change", (e) => {
    currentFilters.sort = e.target.value;
    loadProducts(true);
  });
  document.getElementById("filterInStock").addEventListener("change", (e) => {
    currentFilters.in_stock = e.target.checked;
    loadProducts(true);
  });
  document.getElementById("loadMoreBtn").addEventListener("click", () => loadProducts(false));
  document.getElementById("cartToggleBtn").addEventListener("click", (e) => {
    e.preventDefault();
    document.querySelector(".em-sticky-panel")?.scrollIntoView({ behavior: "smooth" });
  });
  document.getElementById("notifySubmitBtn")?.addEventListener("click", submitNotifyRequest);
}
