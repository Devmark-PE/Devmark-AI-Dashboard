// Copia el export estático (out/) a app/static/dashboard, donde FastAPI lo sirve.
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "out");
const target = resolve(root, "..", "app", "static", "dashboard");

if (!existsSync(source)) {
  console.error("No existe frontend/out. Ejecuta primero: npm run build");
  process.exit(1);
}
rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });
console.log(`Dashboard copiado a ${target}`);
