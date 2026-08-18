"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { parseResilientInput } from "@/lib/product-shared";

const DEFAULT_CATEGORIES = ["Baby Carriers", "Accessories", "Toys & Bouncers", "Nursery & Furniture"];
const DEFAULT_FALLBACK_URL = "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=500&q=80";

const PRESET_SWATCHES = [
  { name: "Soft Pink", hex: "#ffb6c1" },
  { name: "Sky Blue", hex: "#87ceeb" },
  { name: "Mint Green", hex: "#a8e6cf" },
  { name: "Pastel Yellow", hex: "#fff9b1" },
  { name: "Cream", hex: "#fffdd0" },
  { name: "Lavender", hex: "#e6e6fa" },
  { name: "White", hex: "#ffffff" },
  { name: "Black", hex: "#1a1a1a" },
  { name: "Beige", hex: "#f5f5dc" },
  { name: "Navy", hex: "#000080" },
];

function UploadZone({ onProductAdded }) {
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState([]);
  const inputRef = useRef();

  const processFile = useCallback(async (file) => {
    const uid = `${Date.now()}-${Math.random()}`;
    setUploads(u => [...u, { uid, name: file.name, preview: URL.createObjectURL(file), status: "uploading" }]);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/images", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setUploads(u => u.map(i => i.uid === uid ? { ...i, status: "done", product: data.product, source: data.source, compression: data.compression } : i));
      onProductAdded(data.product);
    } catch (err) {
      setUploads(u => u.map(i => i.uid === uid ? { ...i, status: "error", error: err.message } : i));
    }
  }, [onProductAdded]);

  const handleFiles = (files) => Array.from(files).filter(f => f.type.startsWith("image/")).forEach(processFile);

  return (
    <div>
      <div onClick={() => inputRef.current.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        style={{ border: `2px dashed ${dragging ? "#ff6b9d" : "#e5e7eb"}`, borderRadius: 16, padding: "2rem 1.5rem", textAlign: "center", cursor: "pointer", background: dragging ? "#fff0f6" : "#fafafa", transition: "all .2s" }}>
        <div style={{ fontSize: "2.2rem", marginBottom: 6 }}>🤖📸</div>
        <p style={{ fontWeight: 800, fontSize: "1rem", marginBottom: 4 }}>Drop product images here for AI Auto-Fill</p>
        <p style={{ fontSize: ".82rem", color: "#9ca3af" }}>Claude AI reads the image → auto-fills name, price, code & category.</p>
        <input ref={inputRef} type="file" multiple accept="image/*" style={{ display: "none" }} onChange={e => handleFiles(e.target.files)} />
      </div>
      {uploads.length > 0 && (
        <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: ".6rem" }}>
          {uploads.map(u => (
            <div key={u.uid} style={{ display: "flex", alignItems: "center", gap: ".75rem", padding: ".65rem .85rem", borderRadius: 10, background: u.status === "error" ? "#fef2f2" : u.status === "done" ? "#f0fdf4" : "#fefce8", border: `1px solid ${u.status === "error" ? "#fecaca" : u.status === "done" ? "#bbf7d0" : "#fde68a"}` }}>
              <img src={u.preview} alt="" width={44} height={44} style={{ borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: ".82rem", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</p>
                {u.status === "uploading" && <p style={{ fontSize: ".75rem", color: "#d97706" }}>🔍 Compressing + analysing…</p>}
                {u.status === "done" && u.product && (
                  <p style={{ fontSize: ".75rem", color: "#059669" }}>
                    ✅ <strong>{u.product.name}</strong> · ${u.product.price} · {u.product.product_code}
                  </p>
                )}
                {u.status === "error" && <p style={{ fontSize: ".75rem", color: "#dc2626" }}>❌ {u.error}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ManualAddProductForm({ categories, onProductAdded, showFlash }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [code, setCode] = useState("");
  const [category, setCategory] = useState(categories[0] || "Accessories");
  const [imageFile, setImageFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setUploading(true);
    let imageUrl = DEFAULT_FALLBACK_URL;

    try {
      if (imageFile) {
        const formData = new FormData();
        formData.append("file", imageFile);
        const uploadRes = await fetch("/api/upload-image", { method: "POST", body: formData });
        const uploadData = await uploadRes.json();
        if (uploadData.ok && uploadData.url) {
          imageUrl = uploadData.url;
        }
      }

      // Apply resilient parser
      const parsed = parseResilientInput({
        name,
        price,
        product_code: code,
        category,
        image_path: imageUrl,
        images: [imageUrl],
        source: "manual-form"
      });

      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed)
      });

      if (!res.ok) throw new Error("Failed to add product");
      const created = await res.json();
      onProductAdded(created);

      setName("");
      setPrice("");
      setCode("");
      setImageFile(null);
      showFlash(`✨ Created "${created.name}" (${created.product_code})`);
    } catch (err) {
      showFlash("❌ " + err.message, "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ background: "#ffffff", border: "2px solid #e5e7eb", borderRadius: 16, padding: "1.25rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", alignItems: "end" }}>
      <div>
        <label style={{ display: "block", fontSize: ".78rem", fontWeight: 700, marginBottom: 4 }}>Product Name</label>
        <input className="admin-input" style={{ width: "100%" }} placeholder="e.g. Baby Turban Cap" value={name} onChange={e => setName(e.target.value)} required />
      </div>

      <div>
        <label style={{ display: "block", fontSize: ".78rem", fontWeight: 700, marginBottom: 4 }}>Price ($ / J$)</label>
        <input className="admin-input" style={{ width: "100%" }} placeholder="e.g. $1,200 or ~ $730" value={price} onChange={e => setPrice(e.target.value)} />
      </div>

      <div>
        <label style={{ display: "block", fontSize: ".78rem", fontWeight: 700, marginBottom: 4 }}>SKU / Code (#)</label>
        <input className="admin-input" style={{ width: "100%" }} placeholder="e.g. #6013 or #EN71-2" value={code} onChange={e => setCode(e.target.value)} />
      </div>

      <div>
        <label style={{ display: "block", fontSize: ".78rem", fontWeight: 700, marginBottom: 4 }}>Category</label>
        <select className="admin-input" style={{ width: "100%" }} value={category} onChange={e => setCategory(e.target.value)}>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div>
        <label style={{ display: "block", fontSize: ".78rem", fontWeight: 700, marginBottom: 4 }}>📷 Product Image (Supabase Storage)</label>
        <input type="file" accept="image/*" onChange={e => setImageFile(e.target.files?.[0] || null)} style={{ fontSize: ".8rem" }} />
      </div>

      <div>
        <button type="submit" disabled={uploading} className="btn btn-pink" style={{ width: "100%", padding: ".65rem" }}>
          {uploading ? "Saving…" : "➕ Create Product"}
        </button>
      </div>
    </form>
  );
}

export default function AdminClient({ initialProducts }) {
  const [products, setProducts] = useState(initialProducts);
  const [flash, setFlash] = useState(null);
  const [saving, setSaving] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [expandedProduct, setExpandedProduct] = useState(null);
  const [customCategories, setCustomCategories] = useState([]);
  const [newCatInput, setNewCatInput] = useState("");
  const [activeNewCatId, setActiveNewCatId] = useState(null);

  // Active filter tab: "all" | "in_stock" | "needs_review"
  const [activeTab, setActiveTab] = useState("all");

  const [colorDrafts, setColorDrafts] = useState({});
  const fileRef = useRef();

  const showFlash = (msg, type = "success") => {
    setFlash({ msg, type });
    setTimeout(() => setFlash(null), 4000);
  };

  const handleLogout = () => {
    document.cookie = "admin_session=; path=/; max-age=0;";
    window.location.href = "/admin/login";
  };

  const categoriesList = useMemo(() => {
    const set = new Set([...DEFAULT_CATEGORIES, ...customCategories]);
    products.forEach(p => { if (p.category) set.add(p.category); });
    return Array.from(set);
  }, [products, customCategories]);

  const handleProductAdded = useCallback((product) => {
    if (!product) return;
    setProducts(ps => {
      const exists = ps.find(p => p.id === product.id);
      return exists ? ps.map(p => p.id === product.id ? product : p) : [...ps, product];
    });
    showFlash(`✅ "${product.name}" added — review and save below`);
  }, []);

  const handleEdit = (id, field, val) => {
    setProducts(ps => ps.map(p => {
      if (p.id !== id) return p;
      const updated = { ...p, [field]: val };
      if (field === "price" || field === "name" || field === "product_code") {
        const parsed = parseResilientInput(updated);
        return { ...updated, price: parsed.price, product_code: parsed.product_code, needs_review: parsed.needs_review };
      }
      return updated;
    }));
  };

  const saveProduct = async (product) => {
    setSaving(s => ({ ...s, [product.id]: true }));
    try {
      const parsed = parseResilientInput(product);
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed)
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setProducts(ps => ps.map(p => p.id === product.id ? updated : p));
      showFlash(`✅ Saved "${updated.name}"`);
    } catch {
      showFlash("❌ Save failed", "error");
    } finally {
      setSaving(s => ({ ...s, [product.id]: false }));
    }
  };

  const deleteProduct = async (id, name) => {
    if (!confirm(`Delete "${name}"?`)) return;
    await fetch(`/api/products/${id}`, { method: "DELETE" });
    setProducts(ps => ps.filter(p => p.id !== id));
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    showFlash(`🗑 Deleted "${name}"`);
  };

  const handleBulkDelete = async () => {
    const count = selectedIds.size;
    if (count === 0) return;
    if (!confirm(`Are you sure you want to purge all ${count} selected items?`)) return;
    
    const idsToDelete = Array.from(selectedIds);
    try {
      await Promise.all(idsToDelete.map(id => fetch(`/api/products/${id}`, { method: "DELETE" })));
      setProducts(ps => ps.filter(p => !selectedIds.has(p.id)));
      setSelectedIds(new Set());
      showFlash(`🗑 Purged ${count} selected item(s)`);
    } catch {
      showFlash("❌ Bulk delete encountered an error", "error");
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProducts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map(p => p.id)));
    }
  };

  const toggleSelectOne = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleStock = async (id) => {
    const p = products.find(x => x.id === id);
    const updated = { ...p, in_stock: !p.in_stock };
    setProducts(ps => ps.map(x => x.id === id ? updated : x));
    await fetch(`/api/products/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ in_stock: updated.in_stock }) });
  };

  const handleAddCategoryTag = (productId) => {
    if (!newCatInput.trim()) return;
    const cat = newCatInput.trim();
    if (!customCategories.includes(cat)) {
      setCustomCategories(c => [...c, cat]);
    }
    handleEdit(productId, "category", cat);
    setNewCatInput("");
    setActiveNewCatId(null);
    showFlash(`✨ Created catalog category "${cat}"`);
  };

  const addColorToProduct = (productId, colorObj) => {
    const p = products.find(x => x.id === productId);
    if (!p) return;
    const currentColors = p.colors || [];
    const newColors = [...currentColors, colorObj];
    const defaultShowColor = typeof p.showColorSelector === "boolean" ? p.showColorSelector : (newColors.length > 0);
    handleEdit(productId, "colors", newColors);
    handleEdit(productId, "showColorSelector", defaultShowColor);
  };

  const removeColorFromProduct = (productId, colorIndex) => {
    const p = products.find(x => x.id === productId);
    if (!p) return;
    const currentColors = (p.colors || []).filter((_, i) => i !== colorIndex);
    handleEdit(productId, "colors", currentColors);
  };

  const toggleColorStock = (productId, colorIndex) => {
    const p = products.find(x => x.id === productId);
    if (!p) return;
    const currentColors = (p.colors || []).map((c, i) => i === colorIndex ? { ...c, inStock: !c.inStock } : c);
    handleEdit(productId, "colors", currentColors);
  };

  const handleSizesChange = (productId, text) => {
    const arr = text.split(",").map(s => s.trim()).filter(Boolean);
    const p = products.find(x => x.id === productId);
    handleEdit(productId, "sizes", arr);
    if (p && typeof p.showSizeSelector !== "boolean") {
      handleEdit(productId, "showSizeSelector", arr.length > 0);
    }
  };

  const handleCsvUpload = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const res = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "text/plain" }, body: await file.text() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setProducts(data.products);
      showFlash(`✅ CSV imported — ${data.products.length} products`);
    } catch (err) { showFlash("❌ " + err.message, "error"); }
    e.target.value = "";
  };

  const downloadCsv = async () => {
    const blob = await fetch("/api/products?format=csv").then(r => r.blob());
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "products.csv"; a.click();
  };

  // Needs Review logic: price === 0 or needs_review === true or price === "EDIT_ME" or !price
  const needsReviewProducts = useMemo(() => {
    return products.filter(p => p.price === 0 || p.needs_review === true || p.price === "EDIT_ME" || !p.price);
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (activeTab === "in_stock") return products.filter(p => p.in_stock);
    if (activeTab === "needs_review") return needsReviewProducts;
    return products;
  }, [products, activeTab, needsReviewProducts]);

  return (
    <>
      {flash && <div className={`flash flash-${flash.type}`}>{flash.msg}</div>}
      
      {/* Top Header Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800 }}>⚙️ Admin Dashboard</h2>
          <p style={{ margin: 0, fontSize: ".82rem", color: "#6b7280" }}>Manage inventory, pricing, SKUs & image uploads</p>
        </div>
        <button
          onClick={handleLogout}
          style={{
            background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca",
            borderRadius: 10, padding: ".55rem 1rem", fontWeight: 700, cursor: "pointer", fontSize: ".85rem"
          }}
        >
          🚪 Sign Out
        </button>
      </div>

      {/* Stats Header */}
      <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        {[
          ["Total Products", products.length, "#1e1b2e", "all"],
          ["In Stock", products.filter(p => p.in_stock).length, "#059669", "in_stock"],
          ["Needs Review", needsReviewProducts.length, "#dc2626", "needs_review"]
        ].map(([label, value, color, tabKey]) => (
          <div
            key={label}
            onClick={() => setActiveTab(tabKey)}
            style={{
              background: activeTab === tabKey ? "#fff0f6" : "#fff",
              border: `2px solid ${activeTab === tabKey ? "#ff6b9d" : "#e5e7eb"}`,
              borderRadius: 12, padding: ".75rem 1.25rem", textAlign: "center", minWidth: 100, cursor: "pointer",
              boxShadow: activeTab === tabKey ? "0 4px 12px rgba(255, 107, 157, 0.2)" : "none"
            }}
          >
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color }}>{value}</div>
            <div style={{ fontSize: ".7rem", color: "#6b7280", fontWeight: 700 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Add Product Form */}
      <div className="admin-section" style={{ marginBottom: "1.5rem" }}>
        <h2>📱 Add Product (Mobile Photo & Resilient Parser)</h2>
        <p style={{ fontSize: ".82rem", color: "#9ca3af", marginBottom: "1rem" }}>Upload photo to Supabase <code>product-images</code> storage. Auto-formats SKUs (#) and cleans currency prices ($).</p>
        <ManualAddProductForm categories={categoriesList} onProductAdded={handleProductAdded} showFlash={showFlash} />
      </div>

      {/* Upload Zone */}
      <div className="admin-section">
        <h2>🤖 AI Vision Bulk Scan</h2>
        <UploadZone onProductAdded={handleProductAdded} />
      </div>

      {/* CSV Section */}
      <div className="admin-section">
        <h2>📂 Import / Export CSV</h2>
        <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
          <button className="btn btn-outline" onClick={() => fileRef.current.click()}>⬆ Upload CSV</button>
          <button className="btn btn-teal" onClick={downloadCsv}>⬇ Download CSV</button>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleCsvUpload} />
        </div>
      </div>

      {/* Products Table Section */}
      <div className="admin-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: ".75rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: ".75rem" }}>
            <h2>📦 Products Catalog</h2>
            {/* Filter Tabs */}
            <div style={{ display: "flex", gap: 4, background: "#f3f4f6", padding: 4, borderRadius: 8 }}>
              <button
                onClick={() => setActiveTab("all")}
                style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: activeTab === "all" ? "#fff" : "transparent", fontWeight: 700, fontSize: ".78rem", cursor: "pointer" }}
              >
                All ({products.length})
              </button>
              <button
                onClick={() => setActiveTab("in_stock")}
                style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: activeTab === "in_stock" ? "#fff" : "transparent", fontWeight: 700, fontSize: ".78rem", cursor: "pointer" }}
              >
                In Stock ({products.filter(p => p.in_stock).length})
              </button>
              <button
                onClick={() => setActiveTab("needs_review")}
                style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: activeTab === "needs_review" ? "#fee2e2" : "transparent", color: activeTab === "needs_review" ? "#dc2626" : "#374151", fontWeight: 700, fontSize: ".78rem", cursor: "pointer" }}
              >
                ⚠️ Needs Review ({needsReviewProducts.length})
              </button>
            </div>
          </div>
          
          {selectedIds.size > 0 && (
            <button
              onClick={handleBulkDelete}
              style={{
                background: "#dc2626", color: "#fff", border: "none",
                borderRadius: 8, padding: ".55rem 1rem", fontWeight: 700,
                cursor: "pointer", fontSize: ".88rem", display: "flex", alignItems: "center", gap: 6,
                boxShadow: "0 2px 8px rgba(220, 38, 38, 0.25)"
              }}
            >
              🗑 Delete Selected ({selectedIds.size})
            </button>
          )}
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 36, textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={filteredProducts.length > 0 && selectedIds.size === filteredProducts.length}
                    onChange={toggleSelectAll}
                    title="Select All"
                    style={{ cursor: "pointer", width: 16, height: 16 }}
                  />
                </th>
                <th>Image</th>
                <th>Name</th>
                <th>Price (JMD)</th>
                <th>SKU (#)</th>
                <th>Category</th>
                <th>Stock</th>
                <th>Status</th>
                <th>Variants</th>
                <th>Save</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(p => {
                const isSelected = selectedIds.has(p.id);
                const isExpanded = expandedProduct === p.id;
                const colors = p.colors || [];
                const sizes = p.sizes || [];
                const needsRev = p.price === 0 || p.needs_review === true || p.price === "EDIT_ME" || !p.price;

                return (
                  <tr key={p.id} style={{ background: isSelected ? "#fff0f6" : needsRev ? "#fef2f2" : "transparent" }}>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectOne(p.id)}
                        style={{ cursor: "pointer", width: 16, height: 16 }}
                      />
                    </td>
                    <td>
                      <img src={p.image_path || DEFAULT_FALLBACK_URL} alt={p.name} width={52} height={52} style={{ borderRadius: 8, objectFit: "cover", background: "#f3f4f6" }} />
                    </td>
                    <td>
                      <input className="admin-input" style={{ minWidth: 140 }} value={p.name} onChange={e => handleEdit(p.id, "name", e.target.value)} />
                    </td>
                    <td>
                      <input
                        className="admin-input"
                        style={{ width: 85, border: needsRev ? "2px solid #ef4444" : "1px solid #d1d5db" }}
                        value={p.price || 0}
                        placeholder="0"
                        onChange={e => handleEdit(p.id, "price", e.target.value)}
                      />
                    </td>
                    <td>
                      <input className="admin-input" style={{ width: 95 }} value={p.product_code || ""} onChange={e => handleEdit(p.id, "product_code", e.target.value)} />
                    </td>
                    
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <select className="admin-input" style={{ width: 140 }} value={p.category} onChange={e => handleEdit(p.id, "category", e.target.value)}>
                          {categoriesList.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </td>

                    <td style={{ textAlign: "center" }}>
                      <button onClick={() => toggleStock(p.id)} style={{ padding: "3px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: ".75rem", background: p.in_stock ? "#d1fae5" : "#fee2e2", color: p.in_stock ? "#065f46" : "#991b1b" }}>{p.in_stock ? "✓ In Stock" : "✗ OOS"}</button>
                    </td>
                    <td>
                      <span className={`tag ${needsRev ? "tag-needs-edit" : "tag-ok"}`}>
                        {needsRev ? "⚠️ Needs Review" : "OK"}
                      </span>
                    </td>
                    
                    <td>
                      <button
                        onClick={() => setExpandedProduct(isExpanded ? null : p.id)}
                        style={{
                          background: isExpanded ? "#1e1b2e" : "#f3f4f6",
                          color: isExpanded ? "#fff" : "#374151",
                          border: "1px solid #d1d5db",
                          borderRadius: 8,
                          padding: "4px 8px",
                          fontSize: ".75rem",
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: 4
                        }}
                      >
                        🎨 Variants ({colors.length + sizes.length})
                      </button>
                    </td>

                    <td><button className="btn btn-pink btn-sm" onClick={() => saveProduct(p)} disabled={saving[p.id]}>{saving[p.id] ? "…" : "Save"}</button></td>
                    <td><button onClick={() => deleteProduct(p.id, p.name)} style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d5db", fontSize: "1rem" }} title="Delete">🗑</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
