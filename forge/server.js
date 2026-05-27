// ═══════════════════════════════════════════════════════════════
// ◊·κ=1 · FallCore Factory · the factory that mints branded
//                              on-prem-AI stacks on demand.
//
// Customer fills the wizard. Factory:
//   1. Allocates a unique prime
//   2. Signs a 30-day Konomi trial licence for them
//   3. Templates the FallCore source files with their branding
//   4. Builds a ZIP they download
//   5. They `docker compose up` → their cognitive stack is live
//
// Endpoints:
//   POST /v1/forge/fallcore  → ZIP download
//   GET  /v1/tiers           → 4-tier catalog (lite/pro/sovereign/enterprise)
//   GET  /v1/verticals       → vertical preset list
//   GET  /health             → status
//   GET  /v1/stats           → forges built, top verticals
// ═══════════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const KONOMI_PRIVATE_KEY = process.env.KONOMI_PRIVATE_KEY || '';
const TEMPLATES = path.join(__dirname, '..', 'templates');
const STATE_FILE = path.join(__dirname, '..', '.state.json');

// Prime pool — extension primes available to FallCore deployments
const PRIME_POOL = [211, 223, 227, 229, 233, 239, 241, 251, 257, 263, 269, 271, 277, 281, 283, 293, 307, 311, 313, 317, 331, 337, 347, 349, 353, 359, 367, 373, 379, 383, 389, 397, 401, 409, 419, 421];

let STATE = { forges: 0, by_vertical: {}, by_tier: {}, prime_cursor: 0, history: [] };
try { if (fs.existsSync(STATE_FILE)) STATE = Object.assign(STATE, JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))); } catch (_) {}
function persistState() { try { fs.writeFileSync(STATE_FILE, JSON.stringify(STATE, null, 2)); } catch (_) {} }

const TIERS = {
  lite:       { id:'lite',       name:'Lite',       monthly:297,  setup:0,     model:'llama3.1:8b',     vram:'8GB',  savings:'~40%',  desc:'For teams burning £20-50k/yr on frontier. We host on dedicated single-tenant GPU.' },
  pro:        { id:'pro',        name:'Pro',        monthly:997,  setup:5000,  model:'qwen2.5:32b',     vram:'24GB', savings:'~75%',  desc:'For teams burning £50-200k/yr. We deploy on your infra. Weekly LoRA fine-tune.' },
  sovereign:  { id:'sovereign',  name:'Sovereign',  monthly:1997, setup:25000, model:'qwen2.5:72b',     vram:'48GB', savings:'~95%',  desc:'For regulated industries. You own the hardware. We install + maintain quarterly.' },
  enterprise: { id:'enterprise', name:'Enterprise', monthly:4997, setup:0,     model:'qwen2.5:72b',     vram:'48GB+',savings:'~99%',  desc:'Multi-region, multi-tenant, custom compliance certifications, white-label.' }
};

const VERTICALS = {
  legal:        { id:'legal',        name:'Legal & Compliance',    compliance:['SRA','GDPR'],            tools:['FallBrief','FallForensics','Apex'] },
  procurement:  { id:'procurement',  name:'Procurement',            compliance:['SOX','GDPR','ISO 9001'], tools:['Apex Procurement','FallAccount','FallScout'] },
  healthcare:   { id:'healthcare',   name:'Healthcare / Clinical', compliance:['HIPAA','GDPR'],          tools:['FallGrade','FallConsensus','FallBrief'] },
  finance:      { id:'finance',      name:'Finance & Audit',       compliance:['SOX','FCA','GDPR'],      tools:['FallAccount Elite','FallSignal','FallForensics'] },
  fitness:      { id:'fitness',      name:'Gym / Fitness',          compliance:[],                        tools:['GymOps','FallLead','FallReach'] },
  education:    { id:'education',    name:'Education',              compliance:['GDPR','FERPA'],          tools:['FallLearn','FallGrade','FallConsensus'] },
  manufacturing:{ id:'manufacturing',name:'Manufacturing / SCADA', compliance:['ISO 9001','ISA-95'],     tools:['FallCube','FallSignal','Trilogy stack'] },
  realestate:   { id:'realestate',   name:'Real Estate',            compliance:['GDPR'],                  tools:['FallForce','FallReach','FallLead'] },
  hospitality:  { id:'hospitality',  name:'Hospitality',            compliance:['GDPR'],                  tools:['FallForce','FallReach','FallConcierge'] },
  agency:       { id:'agency',       name:'Agency / Pro services', compliance:['GDPR'],                  tools:['FallForce','FallReach','FallAccount','GroundLevel'] },
  ngo:          { id:'ngo',          name:'NGO / Field ops',        compliance:['GDPR'],                  tools:['FallLead','FallSignal','FallConsensus'] },
  other:        { id:'other',        name:'Other / Custom',         compliance:[],                        tools:['FallForce','FallReach','FallAccount'] }
};

// ── Konomi licence signing ─────────────────────
function canonicalJSON(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalJSON).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJSON(obj[k])).join(',') + '}';
}
function loadPrivKey() {
  if (!KONOMI_PRIVATE_KEY) return null;
  const seed = Buffer.from(KONOMI_PRIVATE_KEY, 'base64');
  if (seed.length !== 32) return null;
  const prefix = Buffer.from('302e020100300506032b657004220420', 'hex');
  return crypto.createPrivateKey({ key: Buffer.concat([prefix, seed]), format: 'der', type: 'pkcs8' });
}
function signTrialLicence(slug, prime, days, tier) {
  const privKey = loadPrivKey();
  if (!privKey) return null;
  const issued = new Date();
  const expires = new Date(issued.getTime() + (days || 30) * 24 * 60 * 60 * 1000);
  const payload = {
    v: 1, forge_id: 'fc_factory_' + crypto.randomBytes(5).toString('hex'),
    tool_id: slug, tool_prime: prime, tier: tier === 'enterprise' ? 'enterprise' : 'trial',
    features: ['core','mesh_inbound','cascade','rag','lora_loop','bsv_anchor'],
    issued: issued.toISOString(), expires: expires.toISOString(),
    issuer: 'konomi-factory'
  };
  const sig = crypto.sign(null, Buffer.from(canonicalJSON(payload), 'utf8'), privKey);
  return Buffer.from(JSON.stringify({ payload, sig: sig.toString('base64') })).toString('base64');
}

function nextPrime() {
  for (const p of PRIME_POOL) {
    if (!STATE.history.some(h => h.prime === p)) return p;
  }
  // exhausted, recycle
  return PRIME_POOL[STATE.forges % PRIME_POOL.length];
}

function slugify(s) {
  return String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40);
}
function esc(s) { return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ── Template substitution ──────────────────────
function substitute(text, vars) {
  return text
    .replace(/__COMPANY__/g, vars.company)
    .replace(/__COMPANY_SLUG__/g, vars.slug)
    .replace(/__COMPANY_SHORT__/g, vars.short || vars.company)
    .replace(/__VERTICAL__/g, vars.vertical_name)
    .replace(/__VERTICAL_SLUG__/g, vars.vertical_slug)
    .replace(/__TIER__/g, vars.tier_name)
    .replace(/__TIER_SLUG__/g, vars.tier_slug)
    .replace(/__MODEL__/g, vars.model)
    .replace(/__VRAM__/g, vars.vram)
    .replace(/__SAVINGS__/g, vars.savings)
    .replace(/__MONTHLY__/g, String(vars.monthly))
    .replace(/__SETUP__/g, String(vars.setup))
    .replace(/__PRIME__/g, String(vars.prime))
    .replace(/__BRAND_PRIMARY__/g, vars.brand_primary)
    .replace(/__BRAND_ACCENT__/g, vars.brand_accent)
    .replace(/__BRAND_BG__/g, vars.brand_bg)
    .replace(/__COMPLIANCE__/g, vars.compliance_list)
    .replace(/__TOOLS__/g, vars.tools_list)
    .replace(/__BUILT_AT__/g, vars.built_at)
    .replace(/__FORGE_ID__/g, vars.forge_id)
    .replace(/__TRIAL_LICENCE_B64__/g, vars.trial_licence_b64 || '')
    .replace(/__FRONTIER_SPEND__/g, String(vars.frontier_spend || ''))
    .replace(/__SAVINGS_YEAR1__/g, String(vars.savings_year1 || ''));
}

// Recursively walk a directory, applying substitution to .js, .yml, .md, .html, .json, .env
function shouldTemplate(filename) {
  return /\.(js|yml|yaml|md|html|json|env|template|txt|sh|conf|toml)$/i.test(filename) || filename === '.env' || filename === 'Dockerfile' || filename.startsWith('Dockerfile');
}

function addToArchive(archive, baseDir, vars, archiveRoot) {
  function walk(currentPath, relPath) {
    const stat = fs.statSync(currentPath);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(currentPath)) {
        walk(path.join(currentPath, entry), path.join(relPath, entry));
      }
    } else {
      // Skip the meta-templates that are NOT meant to be in the customer ZIP as-is
      const base = path.basename(currentPath);
      if (base === '.DS_Store') return;
      let outName = relPath
        .replace('docker-compose.template.yml', 'docker-compose.yml')
        .replace('env.template', '.env')
        .replace('README.template.md', 'README.md')
        .replace('package.template.json', 'package.json')
        .replace('landing.template.html', 'public/index.html')
        .replace(/^gitignore\.template$/, '.gitignore')
        .replace(/^\.gitignore\.template$/, '.gitignore');
      // Skip the meta template name we already mapped manually
      if (relPath === '.gitignore.template' || relPath === 'gitignore.template') {
        outName = '.gitignore';
      }
      const archivePath = path.join(archiveRoot, outName);
      if (shouldTemplate(base)) {
        const content = fs.readFileSync(currentPath, 'utf8');
        archive.append(substitute(content, vars), { name: archivePath });
      } else {
        archive.file(currentPath, { name: archivePath });
      }
    }
  }
  walk(baseDir, '');
}

// ── Express app ────────────────────────────────
const app = express();
app.use(cors({ origin: '*', exposedHeaders: ['Content-Disposition'] }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'fallcore-factory',
    version: '0.1.0',
    konomi_signing: !!KONOMI_PRIVATE_KEY,
    forges_built: STATE.forges,
    by_tier: STATE.by_tier,
    by_vertical: STATE.by_vertical
  });
});

app.get('/v1/tiers', (req, res) => res.json({ tiers: TIERS }));
app.get('/v1/verticals', (req, res) => res.json({ verticals: VERTICALS }));

app.get('/v1/stats', (req, res) => res.json({
  total: STATE.forges, by_tier: STATE.by_tier, by_vertical: STATE.by_vertical,
  primes_assigned: STATE.history.length,
  recent: STATE.history.slice(-10)
}));

// ── Main forge endpoint ───────────────────────
app.post('/v1/forge/fallcore', (req, res) => {
  try {
    const input = req.body || {};
    const company = String(input.company || '').trim();
    if (!company) return res.status(400).json({ error: 'company required' });
    if (company.length < 2 || company.length > 80) return res.status(400).json({ error: 'company name length must be 2-80 chars' });

    const tierKey = TIERS[input.tier] ? input.tier : 'pro';
    const tier = TIERS[tierKey];
    const verticalKey = VERTICALS[input.vertical] ? input.vertical : 'other';
    const vertical = VERTICALS[verticalKey];

    const slug = slugify(company);
    const short = String(input.short || company.split(/\s+/)[0]).slice(0, 24);
    const prime = nextPrime();
    const forgeId = 'fc_' + crypto.randomBytes(6).toString('hex');
    const builtAt = new Date().toISOString();

    const brandPrimary = String(input.brand_primary || '#22c55e').trim();
    const brandAccent = String(input.brand_accent || '#d4af37').trim();
    const brandBg = String(input.brand_bg || '#0a0c10').trim();

    const frontierSpend = parseInt(input.frontier_spend_gbp || 0, 10);
    const tierAnnual = tier.monthly * 12 + tier.setup;
    const savingsRatio = parseFloat(tier.savings.replace(/[~%]/g,''))/100;
    const savingsYear1 = Math.max(0, Math.round(frontierSpend * savingsRatio - tierAnnual));

    const trialLicenceB64 = signTrialLicence(slug, prime, 30, tierKey) || '';

    const vars = {
      company, slug, short,
      vertical_name: vertical.name, vertical_slug: vertical.id,
      tier_name: tier.name, tier_slug: tier.id,
      model: tier.model, vram: tier.vram, savings: tier.savings,
      monthly: tier.monthly, setup: tier.setup,
      prime, brand_primary: brandPrimary, brand_accent: brandAccent, brand_bg: brandBg,
      compliance_list: vertical.compliance.join(', ') || 'none',
      tools_list: vertical.tools.join(' · '),
      built_at: builtAt, forge_id: forgeId,
      trial_licence_b64: trialLicenceB64,
      frontier_spend: frontierSpend,
      savings_year1: savingsYear1
    };

    // Update stats
    STATE.forges++;
    STATE.by_tier[tierKey] = (STATE.by_tier[tierKey] || 0) + 1;
    STATE.by_vertical[verticalKey] = (STATE.by_vertical[verticalKey] || 0) + 1;
    STATE.history.push({ forge_id: forgeId, company, slug, prime, tier: tierKey, vertical: verticalKey, t: Date.now(), spend: frontierSpend, savings: savingsYear1 });
    if (STATE.history.length > 500) STATE.history = STATE.history.slice(-500);
    persistState();

    // Build the ZIP
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="' + slug + '-fallcore.zip"');
    res.setHeader('x-fallcore-forge-id', forgeId);
    res.setHeader('x-fallcore-prime', String(prime));

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', err => { console.error('archive error:', err); res.status(500).end(); });
    archive.pipe(res);

    const archiveRoot = slug + '-fallcore';

    // STACK_MANIFEST.json — record of what's inside
    const manifest = {
      v: 1, type: 'fallcore_stack',
      company, slug, short,
      vertical: vertical, tier: tier,
      prime, forge_id: forgeId, built_at: builtAt,
      brand: { primary: brandPrimary, accent: brandAccent, bg: brandBg },
      frontier_spend_gbp: frontierSpend, savings_year1_gbp: savingsYear1,
      tools_recommended: vertical.tools,
      konomi_licence_b64: trialLicenceB64,
      konomi_pubkey_b64: 'bQWcb/SgeWVIEa0H+YYGhzohMfo9zcDysqZEvzYtXTw=',
      factory_url: 'https://sjgant80-hub.github.io/fallcore-factory/',
      next_steps: [
        '1. Unzip',
        '2. cp .env.example .env  → edit if needed (model is preset for your tier)',
        '3. docker compose up -d',
        '4. docker compose exec ollama ollama pull ' + tier.model,
        '5. ANTHROPIC_BASE_URL=http://your-host:11434  → point apps at the stack',
        '6. After 1 week: node eval/replay.js --days 7  → see your ROI'
      ]
    };
    archive.append(JSON.stringify(manifest, null, 2), { name: path.join(archiveRoot, 'STACK_MANIFEST.json') });

    // konomi-licence.json
    if (trialLicenceB64) {
      archive.append(JSON.stringify({ envelope_b64: trialLicenceB64, pubkey_b64: 'bQWcb/SgeWVIEa0H+YYGhzohMfo9zcDysqZEvzYtXTw=', algorithm: 'ed25519' }, null, 2), { name: path.join(archiveRoot, 'konomi-licence.json') });
    }

    // INSTALL.md — quick start
    const installMd = [
      '# ◊·κ ' + company + ' · FallCore install',
      '',
      '_Forged ' + builtAt + ' · prime ' + prime + ' · tier ' + tier.name + ' · ' + tier.model + '_',
      '',
      '## Quickstart',
      '',
      '```bash',
      '# 1. Check hardware',
      '#    ' + tier.name + ' tier expects: ' + tier.vram + ' VRAM (' + tier.model + ')',
      '',
      '# 2. Configure',
      'cp .env.example .env',
      '',
      '# 3. Bring it up',
      'docker compose up -d',
      '',
      '# 4. Pull the model (one-time)',
      'docker compose exec ollama ollama pull ' + tier.model,
      '',
      '# 5. Point your existing apps at the stack',
      'export ANTHROPIC_BASE_URL=http://your-host:11434',
      '#  → all Anthropic SDK calls now route through your FallCore',
      '',
      '# 6. Verify',
      'curl http://localhost:11434/health',
      '',
      '# 7. After a week, run the eval to see your ROI',
      'node eval/replay.js --days 7',
      '```',
      '',
      '## What\'s in the box',
      '',
      '- `docker-compose.yml` — Ollama + Qdrant + proxy, pre-configured for your tier',
      '- `proxy/server.js` — Anthropic-API-compatible front-end with your branding + identity',
      '- `public/index.html` — your branded internal landing page (' + brandPrimary + ' brand colour)',
      '- `konomi-licence.json` — 30-day trial signed by Konomi master key',
      '- `STACK_MANIFEST.json` — record of what was forged + projected ROI',
      '',
      '## Your projected ROI',
      '',
      '- Frontier spend declared:    £' + frontierSpend.toLocaleString(),
      '- Tier annual cost:           £' + tierAnnual.toLocaleString() + (tier.setup ? ' (incl. £' + tier.setup.toLocaleString() + ' setup)' : ''),
      '- Year 1 savings (projected): **£' + savingsYear1.toLocaleString() + '** (based on ' + tier.savings + ' frontier savings ratio)',
      '',
      '## Recommended Fall* tools for ' + vertical.name,
      '',
      vertical.tools.map(t => '- ' + t).join('\n'),
      '',
      '## Compliance posture',
      '',
      (vertical.compliance.length ? vertical.compliance.map(c => '- ' + c).join('\n') : '_None specified — talk to us if you need certifications._'),
      '',
      '## Support',
      '',
      '- Factory: https://sjgant80-hub.github.io/fallcore-factory/',
      '- Source: https://github.com/sjgant80-hub/fallcore',
      '- Estate: https://github.com/sjgant80-hub',
      '- Forge ID: `' + forgeId + '` (quote this for any support)',
      '',
      '◊·κ=1'
    ].join('\n');
    archive.append(installMd, { name: path.join(archiveRoot, 'INSTALL.md') });

    // Walk templates dir, apply substitution
    addToArchive(archive, TEMPLATES, vars, archiveRoot);

    archive.finalize();
  } catch (e) {
    console.error('forge failed:', e);
    res.status(500).json({ error: e.message });
  }
});

// Static landing
app.use(express.static(path.join(__dirname, '..', 'public')));

app.listen(PORT, () => {
  console.log('━'.repeat(60));
  console.log('◊·κ=1 FallCore Factory v0.1.0');
  console.log('━'.repeat(60));
  console.log('Listening on  http://localhost:' + PORT);
  console.log('Konomi sign   ' + (KONOMI_PRIVATE_KEY ? 'enabled' : 'DISABLED (set KONOMI_PRIVATE_KEY env)'));
  console.log('Tiers         ' + Object.keys(TIERS).join(', '));
  console.log('Verticals     ' + Object.keys(VERTICALS).length + ' loaded');
  console.log('Forges to date ' + STATE.forges);
  console.log('━'.repeat(60));
});
