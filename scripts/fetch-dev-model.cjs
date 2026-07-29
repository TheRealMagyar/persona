"use strict";

/**
 * Download a free sample VRM into public/assets for local development.
 * Animations (*.vrma) are still required for motion; without them the model
 * appears in a rest pose.
 */

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");

const PROJECT_ROOT = path.join(__dirname, "..");
const TARGET = path.join(PROJECT_ROOT, "public", "assets", "model.vrm");
// Official Seed-san sample from the VRM specification repository (local test only).
const SOURCE_URL =
  process.env.PERSONA_DEV_MODEL_URL ||
  "https://raw.githubusercontent.com/vrm-c/vrm-specification/master/samples/Seed-san/vrm/Seed-san.vrm";

function download(url, destination) {
  return new Promise((resolve, reject) => {
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
            reject(new Error(`Download failed: HTTP ${status} for ${currentUrl}`));
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

async function main() {
  fs.mkdirSync(path.dirname(TARGET), { recursive: true });
  if (fs.existsSync(TARGET) && fs.statSync(TARGET).size > 0) {
    console.log(`Already present: ${TARGET}`);
    console.log("Delete it first if you want to re-download.");
    return;
  }
  console.log(`Downloading sample VRM to ${TARGET}`);
  console.log(`Source: ${SOURCE_URL}`);
  await download(SOURCE_URL, TARGET);
  const size = fs.statSync(TARGET).size;
  if (size < 1_000) {
    fs.unlinkSync(TARGET);
    throw new Error("Downloaded file looks empty; aborting.");
  }
  console.log(`Saved ${size} bytes.`);
  console.log("Note: animations (public/assets/animations/*.vrma) are still missing.");
  console.log("The model will appear, but idle/talk clips will not play until you add them.");
  console.log("Next: npm run demo");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
