// Runs on every Vercel deploy: turns the SUPABASE_URL and SUPABASE_ANON_KEY
// environment variables into public/config.js so the portal connects to the live database.
const fs = require('fs');
const path = require('path');
const url = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const key = (process.env.SUPABASE_ANON_KEY || '').trim();
const cfg = url && key ? { SUPABASE_URL: url, SUPABASE_ANON_KEY: key } : {};
fs.writeFileSync(path.join(__dirname, '..', 'public', 'config.js'),
  `/* Generated at deploy time. */\nwindow.CC_RUNTIME_CONFIG = ${JSON.stringify(cfg)};\n`);
console.log(url && key ? `Live database configured: ${url}` : 'No SUPABASE_URL / SUPABASE_ANON_KEY set — portal runs in demo mode.');
