import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const envText = fs.readFileSync('.env.local', 'utf8');
const env = Object.fromEntries(envText.split('\n').filter(Boolean).map(line => {
  const [k, ...v] = line.split('=');
  return [k.trim(), v.join('=').trim()];
}));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const BUCKET = 'goal-navigator-records';
const PREFIX = 'records';

async function list() {
  const { data, error } = await supabase.storage.from(BUCKET).list(PREFIX, { limit: 1000 });
  if (error) { console.error('list error', error); return; }
  for (const f of data.filter(i => i.name.endsWith('.json'))) {
    const path = `${PREFIX}/${f.name}`;
    const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(path);
    if (dlErr) { console.log('dl error', f.name, dlErr.message); continue; }
    try {
      const rec = JSON.parse(await blob.text());
      const keys = Object.keys(rec.answers || {});
      console.log(rec.id, rec.title?.slice(0, 30), rec.status, 'keys:', keys.length, keys.slice(0, 8));
      if (rec.title && rec.title.includes('生活クレーム')) {
        console.log('MATCH', JSON.stringify(rec.answers, null, 2));
      }
    } catch (e) {
      console.log('parse error', f.name, e.message);
    }
  }
}
list();
