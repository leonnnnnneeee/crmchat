const fs = require('fs');
let content = fs.readFileSync('src/CRMChat.jsx', 'utf-8');

// I will do the replace of CRMRightPanel properly.
// Since we have `TODO(Refactor): Split out into <CRMRightPanel> component`, I will find that string, and find the NEXT `    </div>\n  )\n}` and replace everything in between.

const startStr = '{/* TODO(Refactor): Split out into <CRMRightPanel> component */}';
const endStr = '    </div>\n  )\n}';

const startIdx = content.indexOf(startStr);
if (startIdx !== -1) {
    const nextFuncEndIdx = content.indexOf('function Avatar', startIdx);
    let endIdx = content.lastIndexOf(endStr);
    
    if (endIdx !== -1 && endIdx > startIdx) {
        const replacement = `{/* TODO(Refactor): Split out into <CRMRightPanel> component */}
      <CRMRightPanel {...chatProps} />
    </div>
  )
}`;
        content = content.substring(0, startIdx) + replacement + content.substring(endIdx + endStr.length);
        fs.writeFileSync('src/CRMChat.jsx', content);
        console.log("Fixed CRMRightPanel!");
    } else {
        console.log("Could not find end of CRMRightPanel");
    }
}
