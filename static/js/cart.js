/* ============================================================
   ElectroMart Cart Engine
   Handles: localStorage cart, quantity discounts, cart value
   discounts, coupon application, live summary rendering.
   ============================================================ */

const CART_KEY = "electromart_cart";
let META = { quantity_tiers: [], cart_value_tiers: [], flash_sale_end: null };
let appliedCoupon = null; // {code, discount}
let lastCartTierPct = 0; // tracks the highest cart-value discount tier currently unlocked

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  renderCartSummary();
  updateCartBadge();
}

function getCart() {
  return loadCart();
}

function addToCart(product, qty = 1) {
  const cart = loadCart();
  const existing = cart.find((i) => i.product_id === product.id);
  if (existing) {
    existing.quantity += qty;
  } else {
    cart.push({
      product_id: product.id,
      name: product.name,
      image_url: product.image_url,
      offer_price: product.offer_price,
      mrp: product.mrp,
      stock: product.stock,
      quantity: qty,
    });
  }
  saveCart(cart);
  playAddToCartSound();
  showToast(`${product.name} added to cart`, "success");
}

function updateCartQty(productId, qty) {
  let cart = loadCart();
  const item = cart.find((i) => i.product_id === productId);
  if (!item) return;
  if (qty <= 0) {
    cart = cart.filter((i) => i.product_id !== productId);
  } else {
    item.quantity = Math.min(qty, item.stock || 99);
  }
  saveCart(cart);
}

function removeFromCart(productId) {
  const cart = loadCart().filter((i) => i.product_id !== productId);
  saveCart(cart);
}

function clearCart() {
  localStorage.removeItem(CART_KEY);
  appliedCoupon = null;
  renderCartSummary();
  updateCartBadge();
}

function updateCartBadge() {
  const cart = loadCart();
  const count = cart.reduce((s, i) => s + i.quantity, 0);
  const badge = document.getElementById("cartCountBadge");
  if (badge) badge.textContent = count;
}

/* ---------- Discount math ---------- */
function qtyDiscountPct(qty) {
  for (const [minQty, pct] of META.quantity_tiers) {
    if (qty >= minQty) return pct;
  }
  return 0;
}

function cartValueDiscountPct(value) {
  for (const [minVal, pct] of META.cart_value_tiers) {
    if (value >= minVal) return pct;
  }
  return 0;
}

function computeCartTotals() {
  const cart = loadCart();
  let subtotal = 0;
  let lineDiscountTotal = 0;
  const lines = cart.map((item) => {
    const lineTotal = item.offer_price * item.quantity;
    const pct = qtyDiscountPct(item.quantity);
    const lineDiscount = (lineTotal * pct) / 100;
    subtotal += lineTotal;
    lineDiscountTotal += lineDiscount;
    return { ...item, lineTotal, pct, lineDiscount, lineFinal: lineTotal - lineDiscount };
  });

  const afterLineDiscount = subtotal - lineDiscountTotal;
  const cartPct = cartValueDiscountPct(afterLineDiscount);
  const cartDiscount = (afterLineDiscount * cartPct) / 100;
  const afterCartDiscount = afterLineDiscount - cartDiscount;

  let couponDiscount = 0;
  if (appliedCoupon && appliedCoupon.discount) {
    couponDiscount = Math.min(appliedCoupon.discount, afterCartDiscount);
  }

  const grandTotal = Math.max(afterCartDiscount - couponDiscount, 0);
  const totalMrp = cart.reduce((s, i) => s + i.mrp * i.quantity, 0);
  const totalSavings = totalMrp - grandTotal;

  return {
    lines, subtotal, lineDiscountTotal, cartPct, cartDiscount,
    afterCartDiscount, couponDiscount, grandTotal, totalMrp, totalSavings,
  };
}

/* ---------- Rendering ---------- */
function renderCartSummary() {
  const cart = loadCart();
  const listEl = document.getElementById("cartItemsList");
  const emptyEl = document.getElementById("emptyCartMsg");
  const breakdownEl = document.getElementById("cartBreakdown");
  const checkoutBtn = document.getElementById("checkoutBtn");
  if (!listEl) return; // not on this page

  if (cart.length === 0) {
    listEl.innerHTML = "";
    emptyEl.classList.remove("d-none");
    breakdownEl.innerHTML = "";
    checkoutBtn.disabled = true;
    document.getElementById("totalSavingsAmount").textContent = "₹0";
    renderTierHighlights(0, 0);
    lastCartTierPct = 0;
    return;
  }
  emptyEl.classList.add("d-none");
  checkoutBtn.disabled = false;

  const totals = computeCartTotals();

  // Celebrate the moment a bigger cart-value discount tier gets unlocked
  if (totals.cartPct > lastCartTierPct) {
    playUnlockSound();
    fireConfetti({ particleCount: 50, spread: 65, origin: { y: 0.75 } });
    showToast(`🎉 You unlocked an extra ${totals.cartPct}% OFF on your cart!`, "offer");
  }
  lastCartTierPct = totals.cartPct;

  listEl.innerHTML = totals.lines.map((line) => `
    <div class="em-cart-line">
      <img src="${line.image_url}" alt="">
      <div class="em-cart-line-info">
        <div class="em-cart-line-name">${line.name}</div>
        <div class="em-cart-line-price">₹${Math.round(line.offer_price)} ×
          <input type="number" min="1" max="${line.stock}" value="${line.quantity}"
            style="width:42px;border:1px solid #e9eaf2;border-radius:6px;text-align:center;font-size:0.75rem;"
            onchange="updateCartQty(${line.product_id}, parseInt(this.value)||1)">
        </div>
        ${line.pct > 0 ? `<div class="em-cart-line-discount">Buy ${line.quantity}: extra ${line.pct}% off applied</div>` : ""}
      </div>
      <button class="em-remove-line" onclick="removeFromCart(${line.product_id})"><i class="fa-solid fa-trash"></i></button>
    </div>
  `).join("");

  breakdownEl.innerHTML = `
    <div class="row-line"><span>Subtotal</span><span>₹${Math.round(totals.subtotal)}</span></div>
    ${totals.lineDiscountTotal > 0 ? `<div class="row-line discount-line"><span>Quantity Discount</span><span>-₹${Math.round(totals.lineDiscountTotal)}</span></div>` : ""}
    ${totals.cartDiscount > 0 ? `<div class="row-line discount-line"><span>Cart Value Discount (${totals.cartPct}%)</span><span>-₹${Math.round(totals.cartDiscount)}</span></div>` : ""}
    ${totals.couponDiscount > 0 ? `<div class="row-line discount-line"><span>Coupon ${appliedCoupon.code}</span><span>-₹${Math.round(totals.couponDiscount)}</span></div>` : ""}
    <div class="row-line total"><span>Total</span><span>₹${Math.round(totals.grandTotal)}</span></div>
  `;

  document.getElementById("totalSavingsAmount").textContent = `₹${Math.round(totals.totalSavings)}`;
  renderTierHighlights(cart.reduce((s, i) => s + i.quantity, 0), totals.afterCartDiscount);
}

function renderTierHighlights(maxQtyInCart, cartValue) {
  const qtyList = document.getElementById("qtyTierList");
  const cartList = document.getElementById("cartTierList");
  if (qtyList) {
    const sorted = [...META.quantity_tiers].sort((a, b) => a[0] - b[0]);
    qtyList.innerHTML = sorted.map(([minQty, pct]) => {
      const active = maxQtyInCart >= minQty;
      return `<li class="${active ? "active-tier" : ""}"><span>Buy ${minQty}+ items</span><span class="em-tier-badge">${pct}% OFF</span></li>`;
    }).join("");
  }
  if (cartList) {
    const sorted = [...META.cart_value_tiers].sort((a, b) => a[0] - b[0]);
    cartList.innerHTML = sorted.map(([minVal, pct]) => {
      const active = cartValue >= minVal;
      return `<li class="${active ? "active-tier" : ""}"><span>Cart above ₹${minVal}</span><span class="em-tier-badge">${pct}% OFF</span></li>`;
    }).join("");
  }
}

/* ---------- Coupons ---------- */
async function applyCoupon(code) {
  const totals = computeCartTotals();
  const msgEl = document.getElementById("couponMessage");
  try {
    const res = await fetch("/api/coupons/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, cart_total: totals.afterCartDiscount }),
    });
    const data = await res.json();
    if (data.valid) {
      appliedCoupon = { code: data.code, discount: data.discount };
      msgEl.innerHTML = `<span class="text-success"><i class="fa-solid fa-circle-check"></i> ${data.message}</span>`;
      showToast(data.message, "success");
      playCouponSound();
      fireConfetti({ particleCount: 60, spread: 80, origin: { y: 0.75 } });
    } else {
      appliedCoupon = null;
      msgEl.innerHTML = `<span class="text-danger"><i class="fa-solid fa-circle-xmark"></i> ${data.message}</span>`;
      playErrorSound();
    }
  } catch (e) {
    msgEl.innerHTML = `<span class="text-danger">Could not validate coupon right now</span>`;
    playErrorSound();
  }
  renderCartSummary();
}

/* ---------- Checkout ---------- */
async function checkout() {
  const cart = loadCart();
  if (cart.length === 0) return;
  const items = cart.map((i) => ({ product_id: i.product_id, quantity: i.quantity }));
  try {
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, coupon_code: appliedCoupon ? appliedCoupon.code : null }),
    });
    const data = await res.json();
    if (data.error) {
      showToast(data.error, "error");
      playErrorSound();
      return;
    }
    showToast(`Order #${data.order_id} placed! You paid ₹${Math.round(data.total)}`, "success");
    playSuccessSound();
    fireCrackers();
    launchBalloons(16);
    clearCart();
    document.getElementById("couponMessage").innerHTML = "";
    document.getElementById("couponInput").value = "";
    // Redirect to the celebratory order confirmation page
    setTimeout(() => { window.location.href = "/order/" + data.order_id; }, 800);
  } catch (e) {
    showToast("Checkout failed. Please try again.", "error");
    playErrorSound();
  }
}

/* ---------- Toast ---------- */
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

document.addEventListener("DOMContentLoaded", () => {
  updateCartBadge();
  const checkoutBtn = document.getElementById("checkoutBtn");
  if (checkoutBtn) checkoutBtn.addEventListener("click", checkout);
  const applyCouponBtn = document.getElementById("applyCouponBtn");
  if (applyCouponBtn) {
    applyCouponBtn.addEventListener("click", () => {
      const code = document.getElementById("couponInput").value.trim();
      if (code) applyCoupon(code);
    });
  }
});
