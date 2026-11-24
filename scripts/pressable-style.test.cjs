const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' || entry.name.startsWith('.') ? [] : sourceFiles(full);
    return /\.tsx$/.test(entry.name) ? [full] : [];
  });
}

/**
 * NativeWind wraps Pressable and drops a style written as a function, so on a phone
 * `<Pressable style={({ pressed }) => ...}>` renders with no style at all (no border,
 * background, padding or row layout). Use `Tappable` from components/ui/Tappable.
 */
test('no Pressable is styled with a function (use Tappable instead)', () => {
  const offenders = [];
  for (const file of [...sourceFiles(path.join(root, 'app')), ...sourceFiles(path.join(root, 'components'))]) {
    const src = fs.readFileSync(file, 'utf8');
    const re = /<Pressable\b/g;
    let match;
    while ((match = re.exec(src))) {
      // Read the opening tag, skipping `>` inside {...} expressions.
      let depth = 0;
      let end = match.index + 1;
      for (; end < src.length; end++) {
        const ch = src[end];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        else if (ch === '>' && depth === 0) break;
      }
      const tag = src.slice(match.index, end);
      if (/\bstyle=\{\s*(\(|[A-Za-z_$][\w$]*\s*=>)/.test(tag)) {
        const line = src.slice(0, match.index).split('\n').length;
        offenders.push(`${path.relative(root, file)}:${line}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `Function styles on Pressable are dropped by NativeWind:\n${offenders.join('\n')}`);
});
