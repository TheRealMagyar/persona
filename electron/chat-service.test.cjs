"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { cleanReply, localFallback } = require("./chat-service.cjs");

test("cleanReply drops noise lines", () => {
  assert.equal(
    cleanReply("npm warn x\nSzia!\n[debug] y\nMi újság?"),
    "Szia! Mi újság?",
  );
});

test("localFallback prefers Hungarian", () => {
  assert.match(localFallback("Szia"), /Hallom|pofázok|agyam/i);
});
