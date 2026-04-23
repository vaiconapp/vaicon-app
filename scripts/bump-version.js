// Αυξάνει αυτόματα την έκδοση της εφαρμογής πριν από κάθε push/deploy.
// Μορφή: v.DDMMYY.N.TOTAL
//   - DDMMYY : ημερομηνία
//   - N      : μετρητής ημέρας (1 το πρώτο push της ημέρας, αυξάνει για κάθε επόμενο της ίδιας μέρας)
//   - TOTAL  : ΣΥΝΟΛΙΚΟΣ αριθμός deploys από το Netlify (live από το API)
// Παράδειγμα: v.240426.1.134  -> 24/4/26, 1ο push της ημέρας, 134ο deploy συνολικά

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const VERSION_FILE = path.join(__dirname, '..', 'version.js');
const NETLIFY_CFG  = path.join(
  process.env.APPDATA || path.join(require('os').homedir(), '.config'),
  'netlify', 'Config', 'config.json'
);
const SITE_ID = 'd83c61b9-0beb-4dcc-b440-ba10cefec918'; // vaiconapp

// ---------- Ημερομηνία ----------
const now = new Date();
const dd = String(now.getDate()).padStart(2, '0');
const mm = String(now.getMonth() + 1).padStart(2, '0');
const yy = String(now.getFullYear()).slice(-2);
const todayKey  = `${dd}${mm}${yy}`;
const todayFull = `${dd}/${mm}/20${yy}`;

// ---------- Διάβασμα τρέχουσας έκδοσης (για να ξέρουμε αν είναι ίδια μέρα) ----------
let currentVersion = 'v.000000.0.0';
if (fs.existsSync(VERSION_FILE)) {
  const content = fs.readFileSync(VERSION_FILE, 'utf8');
  const m = content.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (m) currentVersion = m[1];
}
const parts        = currentVersion.split('.');
const currentDate  = parts[1] || '';
const currentDayN  = parseInt(parts[2] || '0', 10);
const currentTotal = parseInt(parts[3] || '0', 10);

// ---------- Διάβασμα Netlify token από το CLI config ----------
function getNetlifyToken() {
  try {
    if (!fs.existsSync(NETLIFY_CFG)) return null;
    const cfg = JSON.parse(fs.readFileSync(NETLIFY_CFG, 'utf8'));
    const userId = cfg.userId;
    if (userId && cfg.users && cfg.users[userId]) {
      return cfg.users[userId].auth && cfg.users[userId].auth.token;
    }
    for (const k of Object.keys(cfg.users || {})) {
      const t = cfg.users[k].auth && cfg.users[k].auth.token;
      if (t) return t;
    }
  } catch (e) {
    return null;
  }
  return null;
}

// ---------- Κλήση Netlify API για να μάθουμε τα συνολικά deploys ----------
function fetchDeployCount(token) {
  return new Promise((resolve, reject) => {
    let total = 0;
    let page = 1;

    function requestPage() {
      const options = {
        hostname: 'api.netlify.com',
        path: `/api/v1/sites/${SITE_ID}/deploys?per_page=100&page=${page}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'vaicon-app-bump-version',
        },
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`Netlify API ${res.statusCode}: ${data.substring(0, 200)}`));
          }
          try {
            const arr = JSON.parse(data);
            if (!Array.isArray(arr)) return reject(new Error('Unexpected API response'));
            total += arr.length;
            if (arr.length === 100 && page < 50) {
              page++;
              requestPage();
            } else {
              resolve(total);
            }
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy(new Error('Netlify API timeout'));
      });
      req.end();
    }

    requestPage();
  });
}

// ---------- Κύρια λογική ----------
(async () => {
  let newTotal;
  try {
    const token = getNetlifyToken();
    if (!token) throw new Error('Δεν βρέθηκε Netlify token (τρέξε: netlify login)');
    const netlifyCount = await fetchDeployCount(token);
    newTotal = netlifyCount + 1; // το +1 είναι το deploy που θα γίνει τώρα
    console.log(`[bump-version] Netlify deploys: ${netlifyCount} -> νέο TOTAL: ${newTotal}`);
  } catch (err) {
    newTotal = currentTotal + 1;
    console.log(`[bump-version] ⚠ Netlify API απέτυχε (${err.message}). Fallback σε τοπικό +1.`);
  }

  const newDayN    = (currentDate === todayKey) ? (currentDayN + 1) : 1;
  const newVersion = `v.${todayKey}.${newDayN}.${newTotal}`;

  const content = `// Αυτό το αρχείο ενημερώνεται αυτόματα από το scripts/bump-version.js
// πριν κάθε push. ΜΗΝ το επεξεργάζεσαι χειροκίνητα.
export const APP_VERSION = '${newVersion}';
export const APP_BUILD_DATE = '${todayFull}';
`;
  fs.writeFileSync(VERSION_FILE, content, 'utf8');
  console.log(`[bump-version] ${currentVersion}  ->  ${newVersion}`);
})();
