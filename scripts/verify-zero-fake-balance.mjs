#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const TARGET_DIRS = ['src', 'public'];
const AUDIT_OUTPUT_PATH = path.join(ROOT_DIR, 'artifacts', 'verification', 'zero-fake-balance-audit.json');

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.tiff', '.avif',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac',
  '.mp4', '.webm', '.mov', '.avi', '.mkv',
  '.pdf', '.zip', '.tar', '.gz', '.7z', '.rar',
  '.wasm', '.exe', '.dll', '.so', '.dylib', '.bin', '.mid', '.als'
]);

const BANNED_LITERALS = [
  '48294.50',
  '48,294.50',
  '26102.50',
  '26,102.50',
  '22192.00',
  '22,192.00',
];

function isBinaryBuffer(buf) {
  const sampleLength = Math.min(buf.length, 4096);
  for (let i = 0; i < sampleLength; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

function collectFiles(dirPath, collected = []) {
  if (!fs.existsSync(dirPath)) return collected;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, collected);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!BINARY_EXTENSIONS.has(ext)) {
        collected.push(fullPath);
      }
    }
  }
  return collected;
}

function runAudit() {
  const candidateFiles = [];
  for (const relDir of TARGET_DIRS) {
    collectFiles(path.join(ROOT_DIR, relDir), candidateFiles);
  }

  let scannedFilesCount = 0;
  const violations = [];
  const manifestHash = crypto.createHash('sha256');

  for (const filePath of candidateFiles) {
    const rawBuffer = fs.readFileSync(filePath);
    if (isBinaryBuffer(rawBuffer)) {
      continue;
    }

    scannedFilesCount += 1;
    const relPath = path.relative(ROOT_DIR, filePath).split(path.sep).join('/');
    const fileDigest = crypto.createHash('sha256').update(rawBuffer).digest('hex');
    manifestHash.update(`${relPath}:${fileDigest}\n`);

    const content = rawBuffer.toString('utf8');
    const lines = content.split(/\r?\n/);

    for (let idx = 0; idx < lines.length; idx++) {
      const lineText = lines[idx];
      for (const banned of BANNED_LITERALS) {
        if (lineText.includes(banned)) {
          violations.push({
            file: relPath,
            line: idx + 1,
            match: banned,
          });
        }
      }
    }
  }

  const sha256ManifestDigest = manifestHash.digest('hex');
  const verifiedAt = new Date().toISOString();
  const ok = violations.length === 0;

  const auditReport = {
    ok,
    scannedFilesCount,
    violations,
    sha256ManifestDigest,
    verifiedAt,
  };

  fs.mkdirSync(path.dirname(AUDIT_OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(AUDIT_OUTPUT_PATH, JSON.stringify(auditReport, null, 2) + '\n', 'utf8');

  if (ok) {
    console.log(`PASS: Zero-Fake-Balance Gate verified across ${scannedFilesCount} files`);
    process.exit(0);
  } else {
    console.error(`FAIL: Zero-Fake-Balance Gate detected ${violations.length} violation(s) across ${scannedFilesCount} files:`);
    for (const v of violations) {
      console.error(`  - ${v.file}:${v.line} matched "${v.match}"`);
    }
    process.exit(1);
  }
}

runAudit();
