const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Add activeSettingsTab state
if (!code.includes('const [activeSettingsTab, setActiveSettingsTab] = useState')) {
  code = code.replace(
    "const [settings, setSettings] = useState",
    "const [activeSettingsTab, setActiveSettingsTab] = useState('general')\n  const [settings, setSettings] = useState"
  );
}

// 2. Find the bounds of settings-content
const startIndex = code.indexOf('<div className="settings-content">');
const endIndex = code.indexOf('</div>\n          </div>\n\n          <div style={{ display: currentPage === \'browser\' ? \'flex\' : \'none\'');

if (startIndex === -1 || endIndex === -1) {
  console.log("Could not find bounds");
  process.exit(1);
}

const contentBlock = code.substring(startIndex, endIndex);

// 3. Extract all sections
const sectionRegex = /<div className="settings-section card"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>|<div className="settings-section card"[\s\S]*?<\/div>\s*<\/div>/g;

// Instead of complex regex, let's just do simple string splits because we know the exact headers.
const sections = {
  defaultViewMode: '',
  playbackBehavior: '',
  gridItemsPerPage: '',
  cachePath: '',
  browserUrl: '',
  shortcuts: '',
  loopMode: '',
  skipSeconds: '',
  imageAutoplay: ''
};

// We will just do a simpler targeted replacement.
// Instead of replacing the whole block, let's prepend {activeSettingsTab === '...'} around specific sections.
// E.g., replace `<div className="settings-section card">` with `{activeSettingsTab === 'general' && (<div className="settings-section card">` and append `)}` at the end of the div.

// This is prone to nesting errors if not done perfectly.
// Let's use AST or write a clean hardcoded replacement block since we know the exact content.

