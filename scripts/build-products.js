// scripts/build-products.js
// سكربت بيجيب CSV من Google Sheets ويحوّله لملف data/products.js
// عشان يتقري مباشرةً من المتصفح بدون ما نضرب Google Sheets كل مرة

const fs = require("node:fs/promises");
const crypto = require("node:crypto");

const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRBz_5SuMZ0KwWDN5v_gLCo-RuRonyc0oW__QkWeTQPUjP-AG1vZVt_FHF9_trMYxIT6LdE-765_aV8/pub?gid=372316673&single=true&output=csv";

const parseBool = (v) => {
  const s = (v ?? "").toString().trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "y";
};

const toNumber = (v) => {
  const s = (v ?? "").toString().trim();
  if (!s) return null;
  const norm = s.replace(/,/g, "");
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
};

  const text = (csv ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"'; // escaped quote
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (c === "," && !inQuotes) {
      pushField();
      continue;
    }

    if (c === "\n" && !inQuotes) {
      pushField();
      pushRow();
      continue;
    }

    field += c;
  }

  if (field.length || row.length) {
    pushField();
    pushRow();
  }

  const headers = (rows.shift() || []).map((h) => h.trim());

  return rows
    .filter((r) => r.some((x) => (x || "").trim() !== ""))
    .map((r, idx) => {
      const o = {};
      headers.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
      const id = (o.id || "").trim();
      const sku = (o.sku || "").trim();
      const barcode = (o.barcode || "").trim();

      let keySource = (id || sku || barcode || "").toString().trim();
      if (!keySource) {
        const stableBase = `${(o.name||"").trim()}|${(o.unit||"").trim()}|${(o.category||"").trim()}`;
        keySource = crypto.createHash("sha1").update(stableBase, "utf8").digest("hex").slice(0, 12);
        console.warn(`⚠️ Missing id/sku/barcode at row ${idx + 2}. Generated _uid=${keySource}`);
      }
      o._uid = keySource;

      o.price = toNumber(o.price);
      o.sale_price = toNumber(o.sale_price);

      const rawInStock = o.in_stock;
      o.in_stock = rawInStock == null || rawInStock === "" ? true : parseBool(rawInStock);

      o.is_new = parseBool(o.is_new);
      o.is_featured = parseBool(o.is_featured);
      o.by_weight = parseBool(o.by_weight);
      o.tags = (o.tags || "")
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);

      return o;
    });
}

async function main() {
  console.log("جاري تحميل CSV من Google Sheets...");
  const res = await fetch(CSV_URL);
  if (!res.ok) {
    throw new Error("تعذر تحميل CSV: " + res.status + " " + res.statusText);
  }

  const csvText = await res.text();
  const items = csvToObjects(csvText);

  console.log(`تم تحويل ${items.length} منتج.`);

  const jsContent =
    "// ⚠️ ملف متولّد تلقائياً من Google Sheets – لا تعدّل هنا يدويًا.\n" +
    "window.__ALL__ = " +
    JSON.stringify(items, null, 2) +
    ";\n";

  await fs.mkdir("data", { recursive: true });
  await fs.writeFile("data/products.js", jsContent, "utf8");

  console.log("تم إنشاء data/products.js بنجاح ✅");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
