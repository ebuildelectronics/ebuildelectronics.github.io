// e-Build static catalog + Google Sheets JSONP loader
// This version works on GitHub Pages and usually also works when opened directly by double-clicking index.html.
const SHEET_ID = "1CcYDAVrPhewlClUBXXLjQHujbjrDflGdnOEZoT2-u_w";
const SHEET_GID = "0";

// Replace this with your Google Form / Jotform / Messenger link later.
const ORDER_FORM_LINK = "YOUR_ORDER_FORM_LINK_HERE";

// Your image folders should be uploaded like this:
// images/eBuild Products/Arduino/Arduino Uno R3 DIP with cable.jpg
const IMAGE_ROOT = "images/eBuild Products/";
const PLACEHOLDER_IMAGE = "images/placeholder-board.svg";

const peso = n => n && Number(String(n).replace(/[^0-9.]/g, '')) > 0
  ? `₱${Number(String(n).replace(/[^0-9.]/g, '')).toLocaleString('en-PH')}`
  : "Ask for price";

const qs = new URLSearchParams(location.search);
let EBUILD_PRODUCTS = [];
const nav = document.getElementById('nav');
document.getElementById('menuBtn')?.addEventListener('click', () => nav.classList.toggle('open'));

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeHtml(text) {
  return String(text || '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch]));
}

function normalizeHeader(h) {
  return String(h || '').trim().toLowerCase();
}

function getCellValue(cell) {
  if (!cell) return '';
  // Google Visualization cells may have formatted value f and raw value v.
  return cell.f ?? cell.v ?? '';
}

function rowsFromGoogleTable(table) {
  const headers = table.cols.map(col => normalizeHeader(col.label));
  return table.rows.map(row => {
    const obj = {};
    headers.forEach((header, i) => obj[header] = getCellValue(row.c[i]));
    return obj;
  });
}

function normalizeProductsFromObjects(rows) {
  return rows.map((r, rowIndex) => {
    const name = String(r['name'] || '').trim();
    const id = String(r['product id'] || '').trim() || slugify(name) || `product-${rowIndex + 1}`;
    return {
      id,
      name,
      description: String(r['description'] || '').trim(),
      price: String(r['price'] || '').trim(),
      category: String(r['product category'] || 'Uncategorized').trim(),
      image: String(r['image'] || name).trim()
    };
  }).filter(p => p.id && p.name);
}

function loadGoogleSheetProducts() {
  return new Promise((resolve, reject) => {
    const callbackName = 'ebuildSheetCallback_' + Date.now();
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Google Sheet loading timed out.'));
    }, 12000);

    function cleanup() {
      clearTimeout(timeout);
      delete window[callbackName];
      document.getElementById(callbackName)?.remove();
    }

    window[callbackName] = response => {
      try {
        cleanup();
        if (!response || response.status === 'error') {
          throw new Error(response?.errors?.[0]?.detailed_message || 'Google Sheet returned an error.');
        }
        const rows = rowsFromGoogleTable(response.table);
        const products = normalizeProductsFromObjects(rows);
        if (!products.length) throw new Error('No products found. Check header names in row 1.');
        resolve(products);
      } catch (err) {
        reject(err);
      }
    };

    const script = document.createElement('script');
    script.id = callbackName;
    script.onerror = () => {
      cleanup();
      reject(new Error('Could not connect to Google Sheet. Check sharing permissions.'));
    };
    script.src = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?gid=${SHEET_GID}&headers=1&tqx=responseHandler:${callbackName};out:json`;
    document.body.appendChild(script);
  });
}

async function loadProducts() {
  try {
    return await loadGoogleSheetProducts();
  } catch (err) {
    console.warn('Google Sheet failed:', err);
    showLoadWarning(err.message || String(err));
    // Fallback products keep the page from looking broken.
    return [
      {
        id: 'demo-1',
        name: 'Demo Product - Google Sheet not loaded',
        description: 'The layout is working, but the live Google Sheet failed to load. Check sharing/publish settings or internet connection.',
        price: '',
        category: 'Demo',
        image: ''
      }
    ];
  }
}

function showLoadWarning(message) {
  const box = document.createElement('div');
  box.className = 'sheet-warning';
  box.innerHTML = `<strong>Product loading notice:</strong> ${escapeHtml(message)}<br><span>Make sure the Google Sheet is shared as “Anyone with the link can view”.</span>`;
  document.querySelector('main')?.prepend(box);
}

function shortDescription(text, max = 130) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max) + '…' : clean;
}

function getImageCandidates(product) {
  const raw = String(product.image || product.name || '').trim();
  const name = String(product.name || '').trim();
  const category = String(product.category || '').trim();
  if (!raw && !name) return [PLACEHOLDER_IMAGE];

  // GitHub Pages cannot scan folders, so this version checks predictable paths only.
  // Main recommended path: images/eBuild Products/EXACT_IMAGE_NAME.jpg
  // This ignores category folders by trying the flat folder first.
  const cleanRaw = raw.replace(/\\/g, '/');
  const filenameOnly = cleanRaw.split('/').pop();
  const bases = [];

  function addBase(base) {
    if (base && !bases.includes(base)) bases.push(base);
  }

  // 1) Flat folder match by Image column / filename.
  addBase(filenameOnly);

  // 2) Flat folder match by Product Name, useful when image name is same as product name.
  addBase(name);

  // 3) Backward-compatible fallbacks for old category-folder setup.
  if (cleanRaw.includes('/')) addBase(cleanRaw);
  if (category && filenameOnly) addBase(`${category}/${filenameOnly}`);

  const paths = [];
  bases.forEach(base => {
    const hasExt = /\.(jpg|jpeg|png|webp|gif|svg)$/i.test(base);
    if (hasExt) {
      paths.push(`${IMAGE_ROOT}${base}`);
    } else {
      ['jpg', 'jpeg', 'png', 'webp'].forEach(ext => paths.push(`${IMAGE_ROOT}${base}.${ext}`));
    }
  });

  paths.push(PLACEHOLDER_IMAGE);
  return paths.map(p => encodeURI(p));
}

function imageTag(product, className = '') {
  const candidates = getImageCandidates(product);
  return `<img ${className ? `class="${className}"` : ''} src="${candidates[0]}" data-img-index="0" data-img-list='${JSON.stringify(candidates)}' alt="${escapeHtml(product.name)}" onerror="nextImage(this)">`;
}

function nextImage(img) {
  const list = JSON.parse(img.dataset.imgList || '[]');
  let index = Number(img.dataset.imgIndex || 0) + 1;
  if (index < list.length) {
    img.dataset.imgIndex = index;
    img.src = list[index];
  }
}


// ---------------- Simple static cart ----------------
const CART_KEY = 'ebuild_cart_v1';

function parsePriceNumber(value) {
  const n = Number(String(value || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]').map(normalizeCartProductWithQty); }
  catch { return []; }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartCount();
}

function updateCartCount() {
  const count = getCart().reduce((sum, item) => sum + Number(item.qty || 0), 0);
  document.querySelectorAll('#cartCount').forEach(el => el.textContent = count);
}

function normalizeCartProduct(product = {}) {
  const name = product.name || product.Name || product['Product Name'] || product.title || product.product || '';
  const id = product.id || product.ID || product['Product ID'] || product.productId || slugify(name);
  return {
    id: String(id || slugify(name) || Date.now()).trim(),
    name: String(name || 'Unnamed product').trim(),
    category: String(product.category || product.Category || product['Product Category'] || '').trim(),
    price: String(product.price || product.Price || '').trim(),
    image: String(product.image || product.Image || name || '').trim()
  };
}

function addToCart(product, qty = 1) {
  product = normalizeCartProduct(product);
  const cart = getCart().map(normalizeCartProductWithQty);
  const existing = cart.find(item => String(item.id) === String(product.id));
  if (existing) {
    existing.qty = Number(existing.qty || 1) + qty;
  } else {
    cart.push({ ...product, qty });
  }
  saveCart(cart);
  showToast(`${product.name} added to cart`);
}

function normalizeCartProductWithQty(item = {}) {
  return { ...normalizeCartProduct(item), qty: Math.max(1, Number(item.qty || 1)) };
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
  if (!cart.length) return 'Cart is empty.';
  const lines = ['Hello e-Build Electronics, I would like to inquire/order these items:', ''];
  cart.forEach((item, index) => {
    const price = parsePriceNumber(item.price);
    const lineTotal = price * Number(item.qty || 1);
    lines.push(`${index + 1}. ${item.name} x${item.qty} - ${price ? peso(lineTotal) : 'Ask for price'}`);
  });
  lines.push('', `Estimated Total: ${peso(cartTotal(cart))}`);
  lines.push('', 'Name:', 'Contact Number:', 'Notes:');
  return lines.join('\n');
}

function renderCartPage() {
  const wrap = document.getElementById('cartItems');
  if (!wrap) return;
  const cart = getCart();
  const totalQty = cart.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  const total = cartTotal(cart);
  document.getElementById('summaryItems').textContent = totalQty;
  document.getElementById('summaryTotal').textContent = peso(total);
  document.getElementById('orderSummaryText').value = buildOrderSummary(cart);
  document.getElementById('checkoutFormBtn').href = ORDER_FORM_LINK;

  if (!cart.length) {
    wrap.innerHTML = `<div class="empty-cart"><h2>Your cart is empty</h2><p class="muted">Browse the shop and add products for quote/inquiry.</p><a class="btn primary" href="shop.html">Go to Shop</a></div>`;
    return;
  }

  wrap.innerHTML = cart.map(item => `<article class="cart-item">
    ${imageTag(item, 'cart-img')}
    <div class="cart-info">
      <p class="eyebrow">${escapeHtml(item.category || '')}</p>
      <h3><a href="product.html?id=${encodeURIComponent(item.id)}">${escapeHtml(item.name)}</a></h3>
      <p>${peso(item.price)}</p>
    </div>
    <div class="qty-box">
      <label>Qty</label>
      <input type="number" min="1" value="${Number(item.qty || 1)}" onchange="updateCartQty('${escapeHtml(item.id)}', this.value)">
    </div>
    <div class="cart-line-total">${peso(parsePriceNumber(item.price) * Number(item.qty || 1))}</div>
    <button class="remove-btn" onclick="removeFromCart('${escapeHtml(item.id)}')">Remove</button>
  </article>`).join('');
}

function showToast(message) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

document.addEventListener('click', event => {
  const btn = event.target.closest('[data-add-to-cart]');
  if (!btn) return;
  event.preventDefault();
  const id = btn.dataset.productId;
  const product = EBUILD_PRODUCTS.find(p => String(p.id) === String(id));
  if (!product) {
    showToast('Product data not found. Please refresh the page.');
    return;
  }
  addToCart(product, 1);
});

document.getElementById('copySummaryBtn')?.addEventListener('click', async () => {
  const text = document.getElementById('orderSummaryText').value;
  try {
    await navigator.clipboard.writeText(text);
    showToast('Order summary copied');
  } catch {
    document.getElementById('orderSummaryText').select();
    showToast('Please press Ctrl+C to copy');
  }
});

document.getElementById('clearCartBtn')?.addEventListener('click', clearCart);

updateCartCount();
renderCartPage();

function card(p) {
  return `<article class="product-card">
    <a href="product.html?id=${encodeURIComponent(p.id)}">${imageTag(p)}</a>
    <div class="product-info">
      <span>${escapeHtml(p.category)}</span>
      <h3><a href="product.html?id=${encodeURIComponent(p.id)}">${escapeHtml(p.name)}</a></h3>
      <p class="card-desc">${escapeHtml(shortDescription(p.description))}</p>
      <strong>${peso(p.price)}</strong>
      <div class="card-actions">
        <a class="btn small" href="product.html?id=${encodeURIComponent(p.id)}">Details</a>
        <button class="btn small primary" data-add-to-cart data-product-id="${escapeHtml(p.id)}">Add to Cart</button>
      </div>
    </div>
  </article>`;
}

loadProducts().then(products => {
  EBUILD_PRODUCTS = products;
  const featured = document.getElementById('featuredProducts');
  if (featured) featured.innerHTML = products.slice(0, 6).map(card).join('');

  const count = document.getElementById('productCount');
  if (count) count.textContent = `${products.length} products loaded from Google Sheets`;

  const grid = document.getElementById('productGrid');
  if (grid) {
    const cats = [...new Set(products.map(p => p.category).filter(Boolean))].sort();
    const select = document.getElementById('categoryFilter');
    cats.forEach(c => select.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`));
    const search = document.getElementById('searchInput');
    function render() {
      const term = search.value.toLowerCase();
      const cat = select.value;
      const filtered = products.filter(p =>
        (cat === 'all' || p.category === cat) &&
        (`${p.id} ${p.name} ${p.description} ${p.category}`.toLowerCase().includes(term))
      );
      grid.innerHTML = filtered.map(card).join('') || '<p>No products found.</p>';
    }
    search.addEventListener('input', render);
    select.addEventListener('change', render);
    render();
  }

  const detail = document.getElementById('productDetail');
  if (detail) {
    const wanted = qs.get('id');
    const p = products.find(x => String(x.id) === String(wanted)) || products[0];
    document.title = `${p.name} | e-Build`;
    detail.innerHTML = `<div>${imageTag(p, 'detail-img')}</div>
      <div>
        <p class="eyebrow">${escapeHtml(p.category)} • ${escapeHtml(p.id)}</p>
        <h1>${escapeHtml(p.name)}</h1>
        <h2>${peso(p.price)}</h2>
        <div class="description">${escapeHtml(p.description).replace(/\n/g, '<br>')}</div>
        <div class="actions">
          <button class="btn primary" data-add-to-cart data-product-id="${escapeHtml(p.id)}">Add to Cart</button>
          <a class="btn" href="cart.html">View Cart</a>
          <a class="btn" href="contact.html">Contact Us</a>
        </div>
        <p class="muted">7-day Warranty • Shipping: Maxim COD</p>
      </div>`;
  }

  const priceTable = document.getElementById('priceTable');
  if (priceTable) {
    priceTable.innerHTML = products.map(p => `<tr>
      <td><a href="product.html?id=${encodeURIComponent(p.id)}">${escapeHtml(p.name)}</a></td>
      <td>${escapeHtml(p.category)}</td>
      <td>${peso(p.price)}</td>
      <td><button class="link-button" data-add-to-cart data-product-id="${escapeHtml(p.id)}">Add</button></td>
    </tr>`).join('');
  }
});
