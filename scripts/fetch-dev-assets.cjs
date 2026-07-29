"use strict";

/**
 * Download free local-dev character media into public/assets.
 * Model: VRM Seed-san sample. Animations: MIT VRMA pack (tk256ailab/vrm-viewer),
 * remapped onto Persona's stable filenames.
 *
 * These files are for local testing only — not for redistribution in releases
 * unless you independently verify each license.
 */

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");

const PROJECT_ROOT = path.join(__dirname, "..");
const ASSET_ROOT = path.join(PROJECT_ROOT, "public", "assets");

const MODEL_URL =
  process.env.PERSONA_DEV_MODEL_URL ||
  "https://raw.githubusercontent.com/vrm-c/vrm-specification/master/samples/Seed-san/vrm/Seed-san.vrm";

const VRMA_BASE =
  process.env.PERSONA_DEV_VRMA_BASE ||
  "https://raw.githubusercontent.com/tk256ailab/vrm-viewer/main/VRMA";

// Map Persona's stable slots → free sample clips (pick visually distinct ones).
const ANIMATION_SOURCES = {
  "idle.vrma": "Relax.vrma",
  "idle2.vrma": "Sleepy.vrma",
  "talk1.vrma": "Thinking.vrma",
  "talk2.vrma": "LookAround.vrma",
  "talk3.vrma": "Surprised.vrma",
  "greeting.vrma": "Goodbye.vrma",
  "happy.vrma": "Clapping.vrma",
  "finger-gun.vrma": "Angry.vrma",
  "dance.vrma": "Jump.vrma",
};

function download(url, destination) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const file = fs.createWriteStream(destination);
    const request = (currentUrl, redirectsLeft) => {
      https
        .get(currentUrl, (response) => {
          const status = response.statusCode ?? 0;
          if (
            status >= 300 &&
            status < 400 &&
            response.headers.location &&
            redirectsLeft > 0
          ) {
            response.resume();
            request(response.headers.location, redirectsLeft - 1);
            return;
          }
          if (status !== 200) {
            file.close();
            fs.unlink(destination, () => {});
            reject(new Error(`HTTP ${status} for ${currentUrl}`));
            return;
          }
          response.pipe(file);
          file.on("finish", () => file.close(() => resolve(destination)));
        })
        .on("error", (error) => {
          file.close();
          fs.unlink(destination, () => {});
          reject(error);
        });
    };
    request(url, 5);
  });
}

async function ensureFile(relativePath, url, { force = false } = {}) {
  const destination = path.join(ASSET_ROOT, relativePath);
  if (!force && fs.existsSync(destination) && fs.statSync(destination).size > 1_000) {
    console.log(`skip  ${relativePath} (already present)`);
    return destination;
  }
  console.log(`get   ${relativePath}`);
  console.log(`      ← ${url}`);
  await download(url, destination);
  const size = fs.statSync(destination).size;
  if (size < 500) {
    fs.unlinkSync(destination);
    throw new Error(`${relativePath} looks empty (${size} bytes)`);
  }
  console.log(`ok    ${relativePath} (${size} bytes)`);
  return destination;
}

async function main() {
  const force = process.argv.includes("--force");
  fs.mkdirSync(path.join(ASSET_ROOT, "animations"), { recursive: true });

  await ensureFile("model.vrm", MODEL_URL, { force });

  for (const [slot, sourceName] of Object.entries(ANIMATION_SOURCES)) {
    await ensureFile(`animations/${slot}`, `${VRMA_BASE}/${sourceName}`, { force });
  }

  console.log("\nDev character pack is ready under public/assets/.");
  console.log("Rebuild and launch: npm run demo");
  console.log(
    "Tip: tray menu → Preview dance / speaking, or ask Grok: play_animation dance",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
