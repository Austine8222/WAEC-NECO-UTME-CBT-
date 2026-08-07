const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, 'app.js'); // Or wherever your file is

let appContent = fs.readFileSync(indexPath, 'utf8');

// Replace placeholder with the actual Netlify environment variable
const apiToken = process.env.ALOC_API_TOKEN || '';
appContent = appContent.replace('__INJECT_ALOC_TOKEN__', apiToken);

fs.writeFileSync(indexPath, appContent, 'utf8');
console.log('Successfully injected environment variables into app.js');
