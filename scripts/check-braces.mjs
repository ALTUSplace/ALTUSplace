import { readFileSync } from 'node:fs';

const content = readFileSync('client/src/contexts/LanguageContext.tsx', 'utf8');
const lines = content.split('\n');

let braceDepth = 0;
let inStr = false;
let strChar = '';
let escape = false;

const showLines = new Set([13,14,109,110,111, 258,259,260,261, 407,408,409,410,411,412]);

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (inStr) {
      if (ch === strChar) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = true; strChar = ch; continue; }
    if (ch === '{') braceDepth++;
    if (ch === '}') braceDepth--;
  }
  if (showLines.has(i + 1)) {
    console.log(`${i + 1}: depth=${braceDepth} | ${line.trim().slice(0, 80)}`);
  }
}
console.log('FINAL depth: ' + braceDepth);
