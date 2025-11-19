// scripts/build-products.js
// سكربت بيجيب CSV من Google Sheets ويحوّله لملف data/products.js
// عشان يتقري مباشرةً من المتصفح بدون ما نضرب Google Sheets كل مرة

const fs = require("node:fs/promises");

const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRBz_5SuMZ0KwWDN5v_gLCo-RuRonyc0oW__QkWeTQPUjP-AG1vZVt_FHF9_trMYxIT6LdE-765_aV8/pub?gid=372316673&single=true&output=csv";

const parseBool = (v) => (v ?? "").toString().trim().toLowerCase() === "true";

function csvToObjects(csv) {
  const rows = [];
  let field = "",
    row = [],
    q = false;
  const pushF = () => {
    row.push(field);
    field = "";
  };
  const pushR = () => {
    rows.push(row);
    row = [];
  };
  for (const c of csv) {
    if (c === '"') {
      q = !q;
    } else if (c === "," && !q) {
      pushF();
    } else if (c === "\n" && !q) {
      pushF();
      pushR();
    } else {
      field += c;
    }
  }
  if (field || row.length) {
    pushF();
    pushR();
  }

  const headers = (rows.shift() || []).map((h) => h.trim());

  return rows
    .filter((r) => r.some((x) => (x || "").trim() !== ""))
    .map((r, idx) => {
      const o = {};
      headers.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));

      const keySource = (
        o.id ||
        o.sku ||
        o.barcode ||
        `${o.name}|${o.unit}` ||
        ""
      ).toString();
      o._uid = keySource.trim() || `row-${idx + 1}`;

      o.price = o.price ? Number(o.price) : null;
      o.sale_price = o.sale_price ? Number(o.sale_price) : null;

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
