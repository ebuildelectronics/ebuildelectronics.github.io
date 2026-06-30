// e-Build static catalog + Google Sheets JSONP loader
// Updated for 2 tabs:
// PI Github = normal products
// EC Github = component groups with values/variants
// Cart update: minimalist Submit Your Order flow via FormSubmit

const SHEET_ID = "1QPW-q9fBD0XzI7FwM9Z15rkXEaVh66j4-NsMeXJcwbA";
const PI_GID = "1495508499";
const EC_GID = "590322752";

// Order emails. FormSubmit sends to the main email and CCs the second email.
const ORDER_EMAIL_TO = "ebuild.electronics@gmail.com";
const ORDER_EMAIL_CC = "official.recortech@gmail.com";
const ORDER_FORM_ENDPOINT = `https://formsubmit.co/${ORDER_EMAIL_TO}`;

const IMAGE_ROOT = "images/eBuild Products/";
const PLACEHOLDER_IMAGE = "images/placeholder-board.svg";
const CART_KEY = "ebuild_cart_v1";

const qs = new URLSearchParams(location.search);
let EBUILD_PRODUCTS = [];

const nav = document.getElementById("nav");
document.getElementById("menuBtn")?.addEventListener("click", () => nav?.classList.toggle("open"));

const peso = value => {
  const n = parsePriceNumber(value);
  return n > 0 ? `₱${n.toLocaleString("en-PH")}` : "Ask for price";
};

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(text) {
  return String(text || "").replace(/[&<>'"]/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[ch]));
}

function normalizeHeader(h) {
  return String(h || "").trim().toLowerCase();
}

function getCellValue(cell) {
  if (!cell) return "";
  return cell.f ?? cell.v ?? "";
}

function rowsFromGoogleTable(table) {
  const headers = table.cols.map(col => normalizeHeader(col.label));
  return table.rows.map(row => {
    const obj = {};
    headers.forEach((header, i) => obj[header] = getCellValue(row.c[i]));
    return obj;
  });
}

function loadGoogleSheetRows(gid) {
  return new Promise((resolve, reject) => {
    const callbackName = "ebuildSheetCallback_" + gid + "_" + Date.now();
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Google Sheet loading timed out."));
    }, 15000);

    function cleanup() {
      clearTimeout(timeout);
      delete window[callbackName];
      document.getElementById(callbackName)?.remove();
    }

    window[callbackName] = response => {
      try {
        cleanup();
        if (!response || response.status === "error") {
          throw new Error(response?.errors?.[0]?.detailed_message || "Google Sheet returned an error.");
        }
        resolve(rowsFromGoogleTable(response.table));
      } catch (err) {
        reject(err);
      }
    };

    const script = document.createElement("script");
    script.id = callbackName;
    script.onerror = () => {
      cleanup();
      reject(new Error("Could not connect to Google Sheet. Check sharing permissions."));
    };
    script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${gid}&headers=1&tqx=responseHandler:${callbackName};out:json`;
    document.body.appendChild(script);
  });
}

function normalizePIProducts(rows) {
  return rows.map((r, index) => {
    const name = String(r["name"] || "").trim();
    const id = String(r["product id"] || "").trim() || slugify(name) || `pi-${index + 1}`;
    return {
      id,
      source: "PI",
      name,
      description: String(r["description"] || "").trim(),
      price: String(r["price"] || "").trim(),
      category: String(r["product category"] || "Uncategorized").trim(),
      image: String(r["image"] || name).trim(),
      stock: String(r["stock"] || "").trim(),
      variants: []
    };
  }).filter(p => p.id && p.name);
}

function normalizeECProducts(rows) {
  const groups = new Map();

  rows.forEach((r, index) => {
    const groupName = String(r["group name"] || r["name"] || "").trim();
    const value = String(r["value"] || "").trim();
    if (!groupName || !value) return;

    const key = groupName.toLowerCase();
    const variantId = String(r["product id"] || "").trim() || `ec-${index + 1}`;
    const variant = {
      id: variantId,
      value,
      price: String(r["price"] || "").trim(),
      stock: String(r["stock"] || "").trim(),
      sku: variantId
    };

    if (!groups.has(key)) {
      groups.set(key, {
        id: `EC-${slugify(groupName)}`,
        source: "EC",
        name: groupName,
        description: String(r["description"] || "").trim(),
        price: variant.price,
        category: String(r["product category"] || "Components").trim(),
        image: String(r["image"] || groupName).trim(),
        stock: String(r["stock"] || "").trim(),
        variants: []
      });
    }

    const product = groups.get(key);
    product.variants.push(variant);
    if (!product.price && variant.price) product.price = variant.price;
  });

  return [...groups.values()].map(product => {
    product.variants.sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true }));
    return product;
  });
}

async function loadProducts() {
  try {
    const [piRows, ecRows] = await Promise.all([
      loadGoogleSheetRows(PI_GID),
      loadGoogleSheetRows(EC_GID)
    ]);

    const normalProducts = normalizePIProducts(piRows);
    const componentProducts = normalizeECProducts(ecRows);
    const products = [...normalProducts, ...componentProducts];

    if (!products.length) throw new Error("No products found. Check header names in row 1.");
    return products;
  } catch (err) {
    console.warn("Google Sheet failed:", err);
    showLoadWarning(err.message || String(err));
    return [{
      id: "demo-1",
      source: "Demo",
      name: "Demo Product - Google Sheet not loaded",
      description: "The layout is working, but the live Google Sheet failed to load. Check sharing/publish settings or internet connection.",
      price: "",
      category: "Demo",
      image: "",
      variants: []
    }];
  }
}

function showLoadWarning(message) {
  const box = document.createElement("div");
  box.className = "sheet-warning";
  box.innerHTML = `<strong>Product loading notice:</strong> ${escapeHtml(message)}<br><span>Make sure the Google Sheet is shared as “Anyone with the link can view”.</span>`;
  document.querySelector("main")?.prepend(box);
}

function shortDescription(text, max = 130) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

function getImageCandidates(product) {
  const raw = String(product.image || product.name || "").trim();
  const name = String(product.name || "").trim();
  const category = String(product.category || "").trim();
  if (!raw && !name) return [PLACEHOLDER_IMAGE];

  const cleanRaw = raw.replace(/\\/g, "/");
  const filenameOnly = cleanRaw.split("/").pop();
  const bases = [];
  const addBase = base => { if (base && !bases.includes(base)) bases.push(base); };

  addBase(filenameOnly);
  addBase(name);
  if (cleanRaw.includes("/")) addBase(cleanRaw);
  if (category && filenameOnly) addBase(`${category}/${filenameOnly}`);

  const paths = [];
  bases.forEach(base => {
    const hasExt = /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(base);
    if (hasExt) paths.push(`${IMAGE_ROOT}${base}`);
    else ["jpg", "jpeg", "png", "webp"].forEach(ext => paths.push(`${IMAGE_ROOT}${base}.${ext}`));
  });
  paths.push(PLACEHOLDER_IMAGE);
  return paths.map(p => encodeURI(p));
}

function imageTag(product, className = "") {
  const candidates = getImageCandidates(product);
  return `<img class="${className}" src="${candidates[0]}" alt="${escapeHtml(product.name)}" data-img-list='${escapeHtml(JSON.stringify(candidates))}' data-img-index="0" onerror="nextImage(this)">`;
}

function nextImage(img) {
  const list = JSON.parse(img.dataset.imgList || "[]");
  let index = Number(img.dataset.imgIndex || 0) + 1;
  if (index < list.length) {
    img.dataset.imgIndex = index;
    img.src = list[index];
  }
}

function parsePriceNumber(value) {
  const n = Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function getSelectedVariant(productId) {
  const select = document.querySelector(`[data-variant-select][data-product-id="${CSS.escape(String(productId))}"]`);
  const product = EBUILD_PRODUCTS.find(p => String(p.id) === String(productId));
  if (!product?.variants?.length) return null;
  return product.variants.find(v => String(v.id) === String(select?.value)) || product.variants[0];
}

function variantSelectHtml(product) {
  if (!product.variants?.length) return "";
  return `
    <label class="variant-label">Value</label>
    <select class="variant-select" data-variant-select data-product-id="${escapeHtml(product.id)}">
      ${product.variants.map(v => `<option value="${escapeHtml(v.id)}" data-price="${escapeHtml(v.price)}">${escapeHtml(v.value)} - ${peso(v.price)}</option>`).join("")}
    </select>
  `;
}

function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]").map(normalizeCartProductWithQty); }
  catch { return []; }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartCount();
}

function updateCartCount() {
  const count = getCart().reduce((sum, item) => sum + Number(item.qty || 0), 0);
  document.querySelectorAll("#cartCount").forEach(el => el.textContent = count);
}

function normalizeCartProduct(product = {}) {
  const name = product.name || product.Name || product["Product Name"] || product.title || product.product || "";
  const id = product.id || product.ID || product["Product ID"] || product.productId || slugify(name);
  return {
    id: String(id || slugify(name) || Date.now()).trim(),
    name: String(name || "Unnamed product").trim(),
    category: String(product.category || product.Category || product["Product Category"] || "").trim(),
    price: String(product.price || product.Price || "").trim(),
    image: String(product.image || product.Image || name || "").trim(),
    variantValue: String(product.variantValue || "").trim(),
    sku: String(product.sku || "").trim()
  };
}

function normalizeCartProductWithQty(item = {}) {
  return { ...normalizeCartProduct(item), qty: Math.max(1, Number(item.qty || 1)) };
}

function makeCartProduct(product, variant = null) {
  if (!variant) return normalizeCartProduct(product);
  return normalizeCartProduct({
    id: `${product.id}__${variant.id}`,
    name: `${product.name} - ${variant.value}`,
    category: product.category,
    price: variant.price,
    image: product.image,
    variantValue: variant.value,
    sku: variant.sku || variant.id
  });
}

function addToCart(product, qty = 1) {
  product = normalizeCartProduct(product);
  const cart = getCart().map(normalizeCartProductWithQty);
  const existing = cart.find(item => String(item.id) === String(product.id));
  if (existing) existing.qty = Number(existing.qty || 1) + qty;
  else cart.push({ ...product, qty });
  saveCart(cart);
  showToast(`${product.name} added to cart`);
}

function removeFromCart(id) {
  saveCart(getCart().filter(item => String(item.id) !== String(id)));
  renderCartPage();
}

function updateCartQty(id, qty) {
  const cart = getCart();
  const item = cart.find(x => String(x.id) === String(id));
  if (!item) return;
  item.qty = Math.max(1, Number(qty || 1));
  saveCart(cart);
  renderCartPage();
}

function clearCart() {
  saveCart([]);
  renderCartPage();
}

function cartTotal(cart) {
  return cart.reduce((sum, item) => sum + parsePriceNumber(item.price) * Number(item.qty || 1), 0);
}

function buildOrderSummary(cart) {
  if (!cart.length) return "Cart is empty.";
  const lines = ["Hello e-Build Electronics, I would like to order these items:", ""];
  cart.forEach((item, index) => {
    const price = parsePriceNumber(item.price);
    const lineTotal = price * Number(item.qty || 1);
    const sku = item.sku ? ` [${item.sku}]` : "";
    lines.push(`${index + 1}. ${item.name}${sku} x${item.qty} - ${price ? peso(lineTotal) : "Ask for price"}`);
  });
  lines.push("", `Estimated Total: ${peso(cartTotal(cart))}`);
  return lines.join("\n");
}

function syncOrderForm(cart) {
  const form = document.getElementById("orderSubmitForm");
  if (!form) return;

  form.action = ORDER_FORM_ENDPOINT;

  const orderText = document.getElementById("orderSummaryText")?.value || buildOrderSummary(cart);
  const fields = {
    formCc: ORDER_EMAIL_CC,
    formSubject: "New Order Request - EBuild Electronics",
    formOrderDetails: orderText,
    formTotalItems: cart.reduce((sum, item) => sum + Number(item.qty || 0), 0),
    formEstimatedTotal: peso(cartTotal(cart))
  };

  Object.entries(fields).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  });

  const submitBtn = document.getElementById("submitOrderBtn");
  if (submitBtn) submitBtn.disabled = !cart.length;
}

function renderCartPage() {
  const wrap = document.getElementById("cartItems");
  if (!wrap) return;

  const cart = getCart();
  const totalQty = cart.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const total = cartTotal(cart);

  document.getElementById("summaryItems").textContent = totalQty;
  document.getElementById("summaryTotal").textContent = peso(total);
  const orderSummary = document.getElementById("orderSummaryText");
  if (orderSummary && (!orderSummary.dataset.userEdited || !cart.length)) orderSummary.value = buildOrderSummary(cart);

  syncOrderForm(cart);

  if (!cart.length) {
    wrap.innerHTML = `<div class="empty-cart"><h2>Your cart is empty</h2><p>Browse the shop and add products for quote/order.</p><a class="btn primary" href="shop.html">Go to Shop</a></div>`;
    return;
  }

  wrap.innerHTML = cart.map(item => `
    <div class="cart-item">
      ${imageTag(item, "cart-img")}
      <div class="cart-info">
        <span>${escapeHtml(item.category || "")}</span>
        <h3><a href="product.html?id=${encodeURIComponent(String(item.id).split("__")[0])}">${escapeHtml(item.name)}</a></h3>
        ${item.sku ? `<small>SKU: ${escapeHtml(item.sku)}</small>` : ""}
        <p>${peso(item.price)}</p>
      </div>
      <div class="qty-box">
        <label>Qty</label>
        <input type="number" min="1" value="${item.qty}" onchange="updateCartQty('${escapeHtml(item.id)}', this.value)">
      </div>
      <div class="cart-line-total">${peso(parsePriceNumber(item.price) * Number(item.qty || 1))}</div>
      <button class="remove-btn" onclick="removeFromCart('${escapeHtml(item.id)}')">Remove</button>
    </div>
  `).join("");
}

function showToast(message) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1800);
}

document.addEventListener("click", event => {
  const btn = event.target.closest("[data-add-to-cart]");
  if (!btn) return;
  event.preventDefault();

  const id = btn.dataset.productId;
  const product = EBUILD_PRODUCTS.find(p => String(p.id) === String(id));
  if (!product) {
    showToast("Product data not found. Please refresh the page.");
    return;
  }

  const variant = getSelectedVariant(id);
  addToCart(makeCartProduct(product, variant), 1);
});

document.addEventListener("change", event => {
  const select = event.target.closest("[data-variant-select]");
  if (!select) return;
  const selected = select.options[select.selectedIndex];
  const priceBox = document.querySelector(`[data-price-box][data-product-id="${CSS.escape(select.dataset.productId)}"]`);
  if (priceBox) priceBox.textContent = peso(selected.dataset.price);
});

document.getElementById("orderSummaryText")?.addEventListener("input", event => {
  event.target.dataset.userEdited = "true";
  syncOrderForm(getCart());
});

document.getElementById("orderSubmitForm")?.addEventListener("submit", event => {
  const cart = getCart();
  if (!cart.length) {
    event.preventDefault();
    showToast("Your cart is empty");
    return;
  }
  syncOrderForm(cart);
});

document.getElementById("clearCartBtn")?.addEventListener("click", clearCart);

function card(p) {
  const firstVariant = p.variants?.[0];
  const priceToShow = firstVariant ? firstVariant.price : p.price;
  return `
    <article class="product-card">
      <a href="product.html?id=${encodeURIComponent(p.id)}">${imageTag(p)}</a>
      <div class="product-info">
        <span>${escapeHtml(p.category)}</span>
        <h3><a href="product.html?id=${encodeURIComponent(p.id)}">${escapeHtml(p.name)}</a></h3>
        <h3 class="price" data-price-box data-product-id="${escapeHtml(p.id)}">${peso(priceToShow)}</h3>
        <div class="card-actions">
          <a class="btn small" href="product.html?id=${encodeURIComponent(p.id)}">Details</a>
          <button class="btn small primary" data-add-to-cart data-product-id="${escapeHtml(p.id)}">Add to Cart</button>
        </div>
      </div>
    </article>
  `;
}

function renderProductDetail(products) {
  const detail = document.getElementById("productDetail");
  if (!detail) return;

  const wanted = qs.get("id");
  const p = products.find(x => String(x.id) === String(wanted)) || products[0];
  const firstVariant = p.variants?.[0];
  const priceToShow = firstVariant ? firstVariant.price : p.price;

  document.title = `${p.name} | e-Build`;
  detail.innerHTML = `
    <div>${imageTag(p, "detail-img")}</div>
    <div>
      <p class="muted">${escapeHtml(p.category)} • ${escapeHtml(p.id)}</p>
      <h1>${escapeHtml(p.name)}</h1>
      ${variantSelectHtml(p)}
      <h2 data-price-box data-product-id="${escapeHtml(p.id)}">${peso(priceToShow)}</h2>
      <p class="description">${escapeHtml(p.description).replace(/\n/g, "<br>")}</p>
      <div class="actions">
        <button class="btn primary" data-add-to-cart data-product-id="${escapeHtml(p.id)}">Add to Cart</button>
        <a class="btn" href="cart.html">View Cart</a>
        <a class="btn" href="contact.html">Contact Us</a>
      </div>
      <p class="muted">7-day Warranty • Shipping: Maxim COD</p>
    </div>
  `;
}

function renderPriceTable(products) {
  const priceTable = document.getElementById("priceTable");
  if (!priceTable) return;

  const rows = [];
  products.forEach(p => {
    if (p.variants?.length) {
      p.variants.forEach(v => rows.push({
        id: `${p.id}__${v.id}`,
        productId: p.id,
        name: `${p.name} - ${v.value}`,
        category: p.category,
        price: v.price
      }));
    } else {
      rows.push({ id: p.id, productId: p.id, name: p.name, category: p.category, price: p.price });
    }
  });

  priceTable.innerHTML = rows.map(row => `
    <tr>
      <td><a href="product.html?id=${encodeURIComponent(row.productId)}">${escapeHtml(row.name)}</a></td>
      <td>${escapeHtml(row.category)}</td>
      <td>${peso(row.price)}</td>
      <td><a class="btn small" href="product.html?id=${encodeURIComponent(row.productId)}">View</a></td>
    </tr>
  `).join("");
}

updateCartCount();
renderCartPage();

loadProducts().then(products => {
  EBUILD_PRODUCTS = products;

  const featured = document.getElementById("featuredProducts");
  if (featured) featured.innerHTML = products.slice(0, 6).map(card).join("");

  const count = document.getElementById("productCount");
  if (count) {
    const variantCount = products.reduce((sum, p) => sum + (p.variants?.length || 0), 0);
    count.textContent = `${products.length} product groups loaded • ${variantCount} component values`;
  }

  const grid = document.getElementById("productGrid");
  if (grid) {
    const cats = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
    const select = document.getElementById("categoryFilter");
    cats.forEach(c => select.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`));
    const search = document.getElementById("searchInput");
    const gridBtn = document.getElementById("gridViewBtn");
const listBtn = document.getElementById("listViewBtn");

function setView(mode) {
  grid.classList.remove("compact-grid", "list-view");
  gridBtn.classList.remove("active");
  listBtn.classList.remove("active");

  if (mode === "list") {
    grid.classList.add("list-view");
    listBtn.classList.add("active");
  } else {
    grid.classList.add("compact-grid");
    gridBtn.classList.add("active");
  }

  localStorage.setItem("shopView", mode);
}

gridBtn?.addEventListener("click", () => setView("grid"));
listBtn?.addEventListener("click", () => setView("list"));

setView(localStorage.getItem("shopView") || "grid");

    function render() {
      const term = search.value.toLowerCase();
      const cat = select.value;
      const filtered = products.filter(p => {
        const variantText = (p.variants || []).map(v => `${v.id} ${v.value} ${v.price}`).join(" ");
        const haystack = `${p.id} ${p.name} ${p.description} ${p.category} ${variantText}`.toLowerCase();
        return (cat === "all" || p.category === cat) && haystack.includes(term);
      });
      grid.innerHTML = filtered.map(card).join("") || "<p>No products found.</p>";
    }

    search.addEventListener("input", render);
    select.addEventListener("change", render);
    render();
  }

  renderProductDetail(products);
  renderPriceTable(products);
});
