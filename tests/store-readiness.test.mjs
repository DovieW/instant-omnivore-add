import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(root, path), "utf8");
const manifest = JSON.parse(read("manifest.json"));

test("manifest satisfies store packaging requirements", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.name);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.description.length <= 132);
  assert.deepEqual(manifest.host_permissions, ["<all_urls>"]);
  assert.ok(!manifest.permissions.includes("bookmarks"));
  assert.ok(manifest.optional_permissions.includes("bookmarks"));

  for (const size of [16, 32, 48, 128]) {
    assert.ok(existsSync(join(root, manifest.icons[String(size)])));
  }
});

test("extension package contains no remote or dynamic executable code", () => {
  const popupHtml = read("popup.html");
  const executableSources = [read("background.js"), read("contentScript.js"), read("popup.js")];

  assert.match(popupHtml, /<script src="popup\.js"><\/script>/);
  assert.doesNotMatch(popupHtml, /<script[^>]+src="https?:/i);
  for (const source of executableSources) {
    assert.doesNotMatch(source, /\beval\s*\(/);
    assert.doesNotMatch(source, /\bnew\s+Function\b/);
  }
});

test("popup requires affirmative consent and keeps the API token local", () => {
  const popupHtml = read("popup.html");
  const popupJs = read("popup.js");

  assert.match(popupHtml, /id="consentCheckbox"/);
  assert.match(popupHtml, /id="consentAgree"[^>]+disabled/);
  assert.match(popupHtml, /hovered link URLs and titles/i);
  assert.match(popupHtml, /active page URL, title, and HTML/i);
  assert.match(popupHtml, /API token and consent stay on this device/i);
  assert.match(popupHtml, /Stored only in Chrome local extension storage on this device/);
  assert.doesNotMatch(popupHtml, /token[^\n]*sync storage|sync storage[^\n]*token/i);
  assert.match(popupJs, /DATA_CONSENT_KEY/);
  assert.match(popupJs, /chrome\.storage\.local\.set\(\{\s*\[API_KEY_KEY\]/);

  const syncWrite = popupJs.match(/chrome\.storage\.sync\.set\(\{([\s\S]*?)\n\s*\}\);/);
  assert.ok(syncWrite, "expected a Chrome sync settings write");
  assert.ok(!syncWrite[1].includes("API_KEY_KEY"), "API token must not be written to Chrome sync");
});

test("hover tracking remains inactive until consent is accepted", async () => {
  const source = read("contentScript.js");

  async function execute(consentValue) {
    const windowListeners = [];
    const documentListeners = [];
    const runtimeListeners = [];
    const storageListeners = [];

    const context = {
      URL,
      Date,
      Number,
      console,
      window: {
        addEventListener: (type) => windowListeners.push(type),
      },
      document: {
        visibilityState: "visible",
        addEventListener: (type) => documentListeners.push(type),
        querySelectorAll: () => [],
      },
      chrome: {
        runtime: {
          sendMessage: () => {},
          onMessage: { addListener: (listener) => runtimeListeners.push(listener) },
        },
        storage: {
          local: {
            get: async () => ({ "instantOmnivore.dataConsent.v1": consentValue }),
          },
          onChanged: { addListener: (listener) => storageListeners.push(listener) },
        },
      },
    };

    vm.runInNewContext(source, context, { filename: "contentScript.js" });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    return { windowListeners, documentListeners, runtimeListeners, storageListeners };
  }

  const withoutConsent = await execute(null);
  assert.deepEqual(withoutConsent.windowListeners, []);
  assert.deepEqual(withoutConsent.documentListeners, []);
  assert.deepEqual(withoutConsent.runtimeListeners, []);

  const withConsent = await execute({ version: 1, acceptedAt: "2026-08-09T00:00:00.000Z" });
  assert.ok(withConsent.windowListeners.includes("pointermove"));
  assert.ok(withConsent.windowListeners.includes("mousemove"));
  assert.ok(withConsent.documentListeners.includes("visibilitychange"));
  assert.equal(withConsent.runtimeListeners.length, 1);
});

test("public privacy policy discloses every handled data class", () => {
  const privacy = read("PRIVACY.md");

  for (const phrase of [
    "Hovered link URLs and titles",
    "active page HTML",
    "Bookmark URLs and titles",
    "Omnivore API token",
    "Chrome local extension storage",
    "Chrome sync storage",
    "does not sell user data",
    "Chrome Web Store Limited Use",
  ]) {
    assert.match(privacy, new RegExp(phrase, "i"));
  }
});
