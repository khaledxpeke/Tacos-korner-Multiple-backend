const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");

const copies = [
  { from: "translations", to: path.join(dist, "translations") },
  { from: "template", to: path.join(dist, "template") },
  { from: "views", to: path.join(dist, "views") },
  { from: path.join("swagger", "openapi.yaml"), to: path.join(dist, "swagger", "openapi.yaml") },
];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

for (const item of copies) {
  const src = path.join(root, item.from);
  if (!fs.existsSync(src)) {
    console.warn(`Asset skip (missing): ${item.from}`);
    continue;
  }
  copyRecursive(src, item.to);
  console.log(`Copied ${item.from} -> ${path.relative(root, item.to)}`);
}
