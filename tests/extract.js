"use strict";
/**
 * Pulls the application's inline <script> block out of index.html so the same
 * bytes that ship to the browser can be syntax-checked and exercised headlessly.
 * Nothing here parses a copy of the source. It always reads the shipped file.
 */
const fs = require("fs");
const path = require("path");

const HTML_PATH = path.join(__dirname, "..", "index.html");

function readHtml() {
  return fs.readFileSync(HTML_PATH, "utf8");
}

function extractInlineScript(html) {
  const blocks = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) blocks.push(m[1]);
  if (blocks.length === 0) throw new Error("No inline <script> block found in index.html");
  return blocks.join("\n;\n");
}

function extractCdnSources(html) {
  const out = [];
  const re = /<script[^>]*\bsrc="([^"]+)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

function extractElementIds(html) {
  const ids = new Set();
  const re = /\bid="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) ids.add(m[1]);
  return ids;
}

module.exports = { HTML_PATH, readHtml, extractInlineScript, extractCdnSources, extractElementIds };
