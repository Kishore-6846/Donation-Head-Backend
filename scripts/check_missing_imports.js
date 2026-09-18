const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', '..', 'frontend', 'src');

function scanDir(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      results = results.concat(scanDir(full));
    } else if (e.name.endsWith('.jsx') || e.name.endsWith('.js')) {
      results.push(full);
    }
  }
  return results;
}

const files = scanDir(srcDir);
const hooks = ['useState', 'useEffect', 'useMemo', 'useCallback', 'useRef', 'useContext'];
const routerHooks = ['useNavigate', 'useLocation', 'useParams'];

console.log(`Scanning ${files.length} frontend files for missing React & Router hooks...`);

let issuesFound = 0;

for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  const rel = path.relative(srcDir, file);

  // Check react hooks
  for (const hook of hooks) {
    const hookRegex = new RegExp(`\\b${hook}\\s*\\(`, 'g');
    if (hookRegex.test(content)) {
      // Check if hook is imported or accessed via React.hook
      const importRegex = new RegExp(`import\\s+.*\\b${hook}\\b.*from\\s+['"]react['"]`, 's');
      const directReactRegex = new RegExp(`React\\.${hook}\\s*\\(`, 'g');
      if (!importRegex.test(content) && !directReactRegex.test(content)) {
        console.log(`[MISSING REACT HOOK] ${rel}: uses ${hook} without importing it from 'react'`);
        issuesFound++;
      }
    }
  }

  // Check router hooks
  for (const rhook of routerHooks) {
    const hookRegex = new RegExp(`\\b${rhook}\\s*\\(`, 'g');
    if (hookRegex.test(content)) {
      const importRegex = new RegExp(`import\\s+.*\\b${rhook}\\b.*from\\s+['"]react-router-dom['"]`, 's');
      if (!importRegex.test(content)) {
        console.log(`[MISSING ROUTER HOOK] ${rel}: uses ${rhook} without importing it from 'react-router-dom'`);
        issuesFound++;
      }
    }
  }
}

if (issuesFound === 0) {
  console.log('All files have correct hook imports!');
} else {
  console.log(`Found ${issuesFound} issues to fix.`);
}
