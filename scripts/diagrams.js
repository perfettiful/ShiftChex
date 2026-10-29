// renders diagrams/mmd/**/*.mmd to diagrams/images/**/*.png with the shared theme.
// the folders under images/ match the ones under mmd/
//   npm run diagrams                     all of them
//   npm run diagrams -- erd patterns/    only paths that contain erd or patterns/
// uses mermaid-cli through npx, so nothing gets added to package.json.
// first run downloads it (and chromium, unless chrome is already installed)
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { trim } = require("./trim-png");

const ROOT = path.join(__dirname, "..", "diagrams");
const SRC = path.join(ROOT, "mmd");
const OUT = path.join(ROOT, "images");
const CLI = "@mermaid-js/mermaid-cli@12";

// use the chrome that's already installed instead of downloading another one
const CHROME = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/google-chrome",
].find((p) => p && fs.existsSync(p));

const env = { ...process.env };
const args = ["-c", path.join(ROOT, "mermaid.config.json"), "-C", path.join(ROOT, "mermaid.css"),
              "-s", "2", "-b", "white"];
if (CHROME) {
  const config = path.join(os.tmpdir(), "shiftchex-puppeteer.json");
  fs.writeFileSync(config, JSON.stringify({ executablePath: CHROME, args: ["--no-sandbox"] }));
  args.push("-p", config);
  env.PUPPETEER_SKIP_DOWNLOAD = "1";
}

// every .mmd under mmd/, as a path relative to it, like "models/erd.mmd"
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
  d.isDirectory() ? walk(path.join(dir, d.name)) : d.name.endsWith(".mmd") ? [path.join(dir, d.name)] : []);
const only = process.argv.slice(2);
const files = walk(SRC).map((f) => path.relative(SRC, f).split(path.sep).join("/"))
  .filter((f) => !only.length || only.some((o) => f.includes(o))).sort();

let failed = 0;
for (const file of files) {
  const rel = file.replace(/\.mmd$/, ".png");
  const out = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const run = spawnSync("npx", ["-y", CLI, "-q", "-i", path.join(SRC, file), "-o", out, ...args],
    { env, encoding: "utf8", shell: process.platform === "win32" });
  if (run.status === 0) {
    trim(out);
    console.log(`  ${file} -> images/${rel}`);
  } else {
    failed++;
    console.log(`x ${file}\n${(run.stderr || run.stdout).trim()}`);
  }
}
console.log(`${files.length - failed} rendered${failed ? `, ${failed} failed` : ""}`);
process.exit(failed ? 1 : 0);
