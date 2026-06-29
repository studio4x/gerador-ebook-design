const { spawnSync } = require("child_process");

if (process.env.VERCEL) {
  console.log("Skipping local Puppeteer Chrome install on Vercel build.");
  process.exit(0);
}

const result = spawnSync("npx", ["puppeteer", "browsers", "install", "chrome"], {
  stdio: "inherit",
  shell: true,
});

if (result.status !== 0) {
  console.warn("Puppeteer browser install failed after build. Continuing anyway.");
}

process.exit(0);
