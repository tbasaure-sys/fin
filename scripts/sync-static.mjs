/**
 * sync-static.mjs
 *
 * Copies static dashboard assets from src/meta_alpha_allocator/dashboard/static/
 * into public/ so Vercel always serves the latest version.
 *
 * Run automatically by `npm run build` (Vercel calls this before deployment).
 */
import { copyFileSync, mkdirSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = join(__dirname, "..");
const src       = join(root, "src", "meta_alpha_allocator", "dashboard", "static");
const dest      = join(root, "public");

mkdirSync(dest, { recursive: true });

let count = 0;
for (const file of readdirSync(src)) {
  const srcPath  = join(src, file);
  const destPath = join(dest, file);
  if (statSync(srcPath).isFile()) {
    copyFileSync(srcPath, destPath);
    console.log(`  copied ${file}`);
    count++;
  }
}

console.log(`\nsync-static: ${count} file(s) synced to public/`);
