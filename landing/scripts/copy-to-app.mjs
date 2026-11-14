// Copia el export estático (out/) a app/static/landing, donde FastAPI lo sirve.
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "out");
const target = resolve(root, "..", "app", "static", "landing");

if (!existsSync(source)) {
  console.error("No existe landing/out. Ejecuta primero: npm run build");
  process.exit(1);
}
rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log(`Landing copiada a ${target}`);
