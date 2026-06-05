import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function parseEnv(text) {
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    env[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim();
  }
  return env;
}

const env = parseEnv(readFileSync('.env', 'utf8'));
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('FAIL: missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

if (url.includes('YOUR_PROJECT') || key.includes('YOUR_ANON')) {
  console.error('FAIL: .env still has placeholder values');
  process.exit(1);
}

const supabase = createClient(url, key);

const { error: docError } = await supabase.from('documents').select('id').limit(1);
if (docError) {
  console.error('FAIL documents table:', docError.message);
  process.exit(1);
}
console.log('OK documents table');

const probePath = `probe-${Date.now()}/relations.json`;
const { error: uploadError } = await supabase.storage
  .from('docs')
  .upload(probePath, '{"groups":[]}\n', { upsert: true, contentType: 'application/json' });
if (uploadError) {
  console.error('FAIL storage upload:', uploadError.message);
  console.error('Tip: in Supabase Dashboard → Storage, create a public bucket named "docs", then re-run schema.sql policies.');
  process.exit(1);
}

await supabase.storage.from('docs').remove([probePath]);
console.log('OK storage bucket docs (upload/delete)');
console.log('Supabase setup looks good.');
