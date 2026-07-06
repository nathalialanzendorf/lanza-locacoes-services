import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TEMPLATES_DIR = path.join(REPO_ROOT, "templates", "canvas");

export function componentNameFromSlug(prefix, slug) {
  return (
    prefix +
    slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join("")
      .replace(/[^a-zA-Z0-9]/g, "")
  );
}

export function renderCanvasLayout(layoutName, { dados, componentName }) {
  const templatePath = path.join(TEMPLATES_DIR, `${layoutName}.layout.tsx`);
  const template = fs.readFileSync(templatePath, "utf8");
  return template
    .replace("__DADOS__", JSON.stringify(dados, null, 2))
    .replace("__COMPONENT_NAME__", componentName);
}

export function writeCanvas(outPath, content) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, content, "utf8");
  return outPath;
}

/** Slug do projeto Cursor a partir do caminho do repositório (ex.: d:\Dropbox\Aworklanza → d-Dropbox-Aworklanza). */
export function cursorProjectSlugFromRepo(repoRoot) {
  const normalized = path.resolve(repoRoot);
  const win = /^([a-zA-Z]):[\\/](.*)$/.exec(normalized);
  if (win) {
    const drive = win[1].toLowerCase();
    const rest = win[2].replace(/\\/g, "-").replace(/\//g, "-");
    return `${drive}-${rest}`;
  }
  return normalized.replace(/^\//, "").replace(/\//g, "-");
}

/** Diretório onde o Cursor IDE detecta canvases (~/.cursor/projects/{slug}/canvases). */
export function cursorProjectCanvasesDir(repoRoot) {
  const override = process.env.CURSOR_PROJECT_CANVASES_DIR?.trim();
  if (override) return path.resolve(override);
  const home = process.env.USERPROFILE || process.env.HOME;
  if (!home) return null;
  const slug = cursorProjectSlugFromRepo(repoRoot);
  return path.join(home, ".cursor", "projects", slug, "canvases");
}

/** Copia o canvas gerado para o diretório do Cursor IDE (mesmo nome de ficheiro). */
export function copyCanvasToCursorIde(repoRoot, canvasPath) {
  const destDir = cursorProjectCanvasesDir(repoRoot);
  if (!destDir) return null;
  const content = fs.readFileSync(canvasPath, "utf8");
  const destPath = path.join(destDir, path.basename(canvasPath));
  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(destPath, content, "utf8");
  return destPath;
}
