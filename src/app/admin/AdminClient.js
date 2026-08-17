"use client";
import { useState, useRef, useCallback, useMemo } from "react";

const DEFAULT_CATEGORIES = ["Baby Carriers", "Accessories", "Toys & Bouncers", "Nursery & Furniture"];

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
        style={{ border: `2px dashed ${dragging ? "#ff6b9d" : "#e5e7eb"}`, borderRadius: 16, padding: "2.5rem 1.5rem", textAlign: "center", cursor: "pointer", background: dragging ? "#fff0f6" : "#fafafa", transition: "all .2s" }}>
        <div style={{ fontSize: "2.5rem", marginBottom: 8 }}>🤖📸</div>
        <p style={{ fontWeight: 800, fontSize: "1rem", marginBottom: 4 }}>Drop product images here</p>
        <p style={{ fontSize: ".82rem", color: "#9ca3af" }}>Claude AI reads the image → auto-fills name, price, code & category. Images are compressed to WebP automatically.</p>
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
                    ✅ <strong>{u.product.name}</strong> · ${u.product.price} · #{u.product.product_code}
                    {u.compression && <span style={{ marginLeft: 8, opacity: .65 }}>📦 {u.compression.saving} smaller</span>}
                    <span style={{ marginLeft: 6, opacity: .55 }}>via {u.source}</span>
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

export default function AdminClient({ initialProducts }) {
  const [products, setProducts] = useState(initialProducts);
  const [flash, setFlash] = useState(null);
  const [saving, setSaving] = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [expandedProduct, setExpandedProduct] = useState(null);
  const [customCategories, setCustomCategories] = useState([]);
  const [newCatInput, setNewCatInput] = useState("");
  const [activeNewCatId, setActiveNewCatId] = useState(null);

  // New color draft per product row
  const [colorDrafts, setColorDrafts] = useState({});

  const fileRef = useRef();

  const showFlash = (msg, type = "success") => {
    setFlash({ msg, type });
    setTimeout(() => setFlash(null), 4000);
  };

  // Categories list combining default, existing in products, and dynamically created
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
    setProducts(ps => ps.map(p => p.id === id ? { ...p, [field]: val } : p));
  };

  const saveProduct = async (product) => {
    setSaving(s => ({ ...s, [product.id]: true }));
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(product)
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setProducts(ps => ps.map(p => p.id === product.id ? updated : p));
      showFlash(`✅ Saved "${product.name}"`);
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

  // Bulk deletion
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
    if (selectedIds.size === products.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(products.map(p => p.id)));
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

  // Variant Helpers
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

  const needsEdit = products.filter(p => p.price === "EDIT_ME" || !p.price).length;

  return (
    <>
      {flash && <div className={`flash flash-${flash.type}`}>{flash.msg}</div>}
      
      {/* Stats Header */}
      <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        {[["Total", products.length, "#1e1b2e"], ["In Stock", products.filter(p => p.in_stock).length, "#059669"], ["Out of Stock", products.filter(p => !p.in_stock).length, "#dc2626"], ["Needs Edit", needsEdit, "#d97706"]].map(([label, value, color]) => (
          <div key={label} style={{ background: "#fff", border: "2px solid #e5e7eb", borderRadius: 12, padding: ".75rem 1.25rem", textAlign: "center", minWidth: 88 }}>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, color }}>{value}</div>
            <div style={{ fontSize: ".7rem", color: "#6b7280", fontWeight: 700 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Upload Zone */}
      <div className="admin-section">
        <h2>🤖 Add Products via AI Image Scan</h2>
        <p style={{ fontSize: ".82rem", color: "#9ca3af", marginBottom: "1rem" }}>Drop any product photo. Claude reads the image and fills in details automatically. Images are auto-compressed to WebP.</p>
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
          <h2>📦 All Products ({products.length})</h2>
          
          {/* Batch action button */}
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
                    checked={products.length > 0 && selectedIds.size === products.length}
                    onChange={toggleSelectAll}
                    title="Select All"
                    style={{ cursor: "pointer", width: 16, height: 16 }}
                  />
                </th>
                <th>Image</th>
                <th>Name</th>
                <th>Price (JMD)</th>
                <th>Code</th>
                <th>Category</th>
                <th>Stock</th>
                <th>Source</th>
                <th>Variants</th>
                <th>Save</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => {
                const isSelected = selectedIds.has(p.id);
                const isExpanded = expandedProduct === p.id;
                const colors = p.colors || [];
                const sizes = p.sizes || [];

                return (
                  <tr key={p.id} style={{ background: isSelected ? "#fff0f6" : "transparent", opacity: (!p.price || p.price === "EDIT_ME") ? .85 : 1 }}>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectOne(p.id)}
                        style={{ cursor: "pointer", width: 16, height: 16 }}
                      />
                    </td>
                    <td><img src={p.image_path || "/placeholder.png"} alt={p.name} width={52} height={52} style={{ borderRadius: 8, objectFit: "cover", background: "#f3f4f6" }} /></td>
                    <td><input className="admin-input" style={{ minWidth: 140 }} value={p.name} onChange={e => handleEdit(p.id, "name", e.target.value)} /></td>
                    <td><input className="admin-input" style={{ width: 80 }} value={p.price || ""} placeholder="0.00" onChange={e => handleEdit(p.id, "price", e.target.value)} /></td>
                    <td><input className="admin-input" style={{ width: 90 }} value={p.product_code || ""} onChange={e => handleEdit(p.id, "product_code", e.target.value)} /></td>
                    
                    {/* Catalog Dropdown & Creator */}
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <select className="admin-input" style={{ width: 140 }} value={p.category} onChange={e => handleEdit(p.id, "category", e.target.value)}>
                          {categoriesList.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        
                        {activeNewCatId === p.id ? (
                          <div style={{ display: "flex", gap: 4, alignItems: "center", marginTop: 2 }}>
                            <input
                              className="admin-input"
                              style={{ width: 95, fontSize: ".72rem", padding: "2px 6px" }}
                              placeholder="New Catalog"
                              value={newCatInput}
                              onChange={e => setNewCatInput(e.target.value)}
                              onKeyDown={e => { if (e.key === "Enter") handleAddCategoryTag(p.id); }}
                            />
                            <button
                              onClick={() => handleAddCategoryTag(p.id)}
                              style={{ background: "#ff6b9d", color: "#fff", border: "none", borderRadius: 4, padding: "2px 6px", fontSize: ".7rem", cursor: "pointer" }}
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setActiveNewCatId(p.id); setNewCatInput(""); }}
                            style={{ background: "none", border: "none", color: "#ff6b9d", fontSize: ".72rem", cursor: "pointer", fontWeight: 700, textAlign: "left", padding: 0 }}
                          >
                            + New Catalog
                          </button>
                        )}
                      </div>
                    </td>

                    <td style={{ textAlign: "center" }}>
                      <button onClick={() => toggleStock(p.id)} style={{ padding: "3px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: ".75rem", background: p.in_stock ? "#d1fae5" : "#fee2e2", color: p.in_stock ? "#065f46" : "#991b1b" }}>{p.in_stock ? "✓ In Stock" : "✗ OOS"}</button>
                    </td>
                    <td><span className={`tag ${(!p.price || p.price === "EDIT_ME") ? "tag-needs-edit" : "tag-ok"}`}>{p.source || "—"}</span></td>
                    
                    {/* Variant toggle button */}
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

        {/* Expandable Variant Management Drawer below table if product active */}
        {expandedProduct && (() => {
          const p = products.find(x => x.id === expandedProduct);
          if (!p) return null;
          const colors = p.colors || [];
          const sizes = p.sizes || [];
          const showColors = typeof p.showColorSelector === "boolean" ? p.showColorSelector : (colors.length > 0);
          const showSizes = typeof p.showSizeSelector === "boolean" ? p.showSizeSelector : (sizes.length > 0);
          const draftColor = colorDrafts[p.id] || { name: "", hex: "#ff6b9d", inStock: true };

          return (
            <div style={{ background: "#fdf8fa", border: "2px solid #f472b6", borderRadius: 14, padding: "1.25rem", marginTop: "1rem", boxShadow: "0 4px 14px rgba(244,114,182,0.15)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 800, color: "#1e1b2e", margin: 0 }}>
                  🎨 Manage Variants & Display Rules: <span style={{ color: "#ff6b9d" }}>{p.name}</span>
                </h3>
                <button
                  onClick={() => setExpandedProduct(null)}
                  style={{ background: "#e5e7eb", border: "none", borderRadius: "50%", width: 26, height: 26, fontWeight: 800, cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1.25rem" }}>
                
                {/* COLOR PICKER SECTION */}
                <div style={{ background: "#fff", padding: "1rem", borderRadius: 12, border: "1px solid #e5e7eb" }}>
                  <h4 style={{ fontSize: ".88rem", fontWeight: 800, marginBottom: ".6rem", display: "flex", alignItems: "center", gap: 6 }}>
                    🖌 Color Variants ({colors.length})
                  </h4>

                  {/* Preset Swatches */}
                  <p style={{ fontSize: ".72rem", color: "#6b7280", marginBottom: 6, fontWeight: 700 }}>Quick Presets:</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: ".75rem" }}>
                    {PRESET_SWATCHES.map(swatch => (
                      <button
                        key={swatch.name}
                        onClick={() => addColorToProduct(p.id, { name: swatch.name, hex: swatch.hex, inStock: true })}
                        style={{
                          display: "flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 12,
                          border: "1px solid #d1d5db", background: "#f9fafb", fontSize: ".72rem", cursor: "pointer", fontWeight: 600
                        }}
                      >
                        <span style={{ width: 12, height: 12, borderRadius: "50%", background: swatch.hex, border: "1px solid rgba(0,0,0,0.15)" }} />
                        {swatch.name}
                      </button>
                    ))}
                  </div>

                  {/* Custom Color Creator */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: ".75rem", flexWrap: "wrap" }}>
                    <input
                      type="color"
                      value={draftColor.hex}
                      onChange={e => setColorDrafts(d => ({ ...d, [p.id]: { ...draftColor, hex: e.target.value } }))}
                      style={{ width: 32, height: 32, padding: 0, border: "none", borderRadius: 6, cursor: "pointer" }}
                    />
                    <input
                      className="admin-input"
                      style={{ flex: 1, minWidth: 100, fontSize: ".82rem" }}
                      placeholder="Color name (e.g. Pink)"
                      value={draftColor.name}
                      onChange={e => setColorDrafts(d => ({ ...d, [p.id]: { ...draftColor, name: e.target.value } }))}
                    />
                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: ".75rem", fontWeight: 700, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={draftColor.inStock}
                        onChange={e => setColorDrafts(d => ({ ...d, [p.id]: { ...draftColor, inStock: e.target.checked } }))}
                      />
                      In Stock
                    </label>
                    <button
                      onClick={() => {
                        if (!draftColor.name.trim()) return;
                        addColorToProduct(p.id, { name: draftColor.name.trim(), hex: draftColor.hex, inStock: draftColor.inStock });
                        setColorDrafts(d => ({ ...d, [p.id]: { name: "", hex: "#ff6b9d", inStock: true } }));
                      }}
                      style={{ background: "#10b981", color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: ".78rem", fontWeight: 700, cursor: "pointer" }}
                    >
                      + Add
                    </button>
                  </div>

                  {/* Existing Colors List */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {colors.length === 0 ? (
                      <p style={{ fontSize: ".75rem", color: "#9ca3af", italic: "true" }}>No colors added yet.</p>
                    ) : (
                      colors.map((c, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f9fafb", padding: "6px 10px", borderRadius: 8, border: "1px solid #f3f4f6" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 16, height: 16, borderRadius: "50%", background: c.hex, border: "1px solid rgba(0,0,0,0.15)" }} />
                            <span style={{ fontSize: ".82rem", fontWeight: 700 }}>{c.name}</span>
                            <span style={{ fontSize: ".7rem", color: "#9ca3af" }}>({c.hex})</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <label style={{ fontSize: ".72rem", display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontWeight: 600 }}>
                              <input
                                type="checkbox"
                                checked={c.inStock !== false}
                                onChange={() => toggleColorStock(p.id, i)}
                              />
                              {c.inStock !== false ? "In Stock" : "OOS"}
                            </label>
                            <button
                              onClick={() => removeColorFromProduct(p.id, i)}
                              style={{ background: "none", border: "none", color: "#ef4444", fontSize: ".9rem", cursor: "pointer" }}
                            >
                              🗑
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* SIZES & DISPLAY TOGGLES SECTION */}
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  
                  {/* SIZES */}
                  <div style={{ background: "#fff", padding: "1rem", borderRadius: 12, border: "1px solid #e5e7eb" }}>
                    <h4 style={{ fontSize: ".88rem", fontWeight: 800, marginBottom: ".6rem" }}>
                      📏 Sizes (Comma Separated)
                    </h4>
                    <input
                      className="admin-input"
                      style={{ width: "100%", fontSize: ".85rem" }}
                      placeholder="e.g. S, M, L or 0-3M, 3-6M, 6-12M"
                      value={sizes.join(", ")}
                      onChange={e => handleSizesChange(p.id, e.target.value)}
                    />
                    <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {sizes.map((s, idx) => (
                        <span key={idx} style={{ background: "#eff6ff", color: "#1d4ed8", fontSize: ".72rem", fontWeight: 700, padding: "2px 8px", borderRadius: 6, border: "1px solid #bfdbfe" }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* DISPLAY TOGGLES */}
                  <div style={{ background: "#fff", padding: "1rem", borderRadius: 12, border: "1px solid #e5e7eb" }}>
                    <h4 style={{ fontSize: ".88rem", fontWeight: 800, marginBottom: ".6rem" }}>
                      👁 Storefront Display Toggles
                    </h4>
                    <p style={{ fontSize: ".75rem", color: "#6b7280", marginBottom: ".75rem" }}>
                      Control whether variant selectors appear on the Product Detail Page (PDP).
                    </p>

                    <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
                      <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f9fafb", padding: "8px 12px", borderRadius: 8, cursor: "pointer" }}>
                        <span style={{ fontSize: ".82rem", fontWeight: 700 }}>Show Color Selector on PDP</span>
                        <input
                          type="checkbox"
                          checked={showColors}
                          onChange={e => handleEdit(p.id, "showColorSelector", e.target.checked)}
                          style={{ width: 18, height: 18, cursor: "pointer" }}
                        />
                      </label>

                      <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f9fafb", padding: "8px 12px", borderRadius: 8, cursor: "pointer" }}>
                        <span style={{ fontSize: ".82rem", fontWeight: 700 }}>Show Size Selector on PDP</span>
                        <input
                          type="checkbox"
                          checked={showSizes}
                          onChange={e => handleEdit(p.id, "showSizeSelector", e.target.checked)}
                          style={{ width: 18, height: 18, cursor: "pointer" }}
                        />
                      </label>
                    </div>
                  </div>

                </div>

              </div>

              <div style={{ marginTop: "1rem", textAlign: "right" }}>
                <button
                  className="btn btn-pink"
                  onClick={() => { saveProduct(p); setExpandedProduct(null); }}
                >
                  💾 Save All Changes for {p.name}
                </button>
              </div>
            </div>
          );
        })()}

      </div>
    </>
  );
}
