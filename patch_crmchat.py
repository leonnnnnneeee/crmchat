import re

with open('src/CRMChat.jsx', 'r') as f:
    content = f.read()

# Add import
import_str = "import { BackgroundSettingsModal, BACKGROUND_OPTIONS } from './components/chat/BackgroundSettingsModal';\n"
if "BackgroundSettingsModal" not in content:
    content = content.replace("import Avatar from './components/chat/Avatar';", "import Avatar from './components/chat/Avatar';\n" + import_str)

# Add modal rendering
modal_str = """
      {showBgSettings && (
        <BackgroundSettingsModal
          onClose={() => setShowBgSettings(false)}
          bgOption={bgOption} setBgOption={setBgOption}
          bgOpacity={bgOpacity} setBgOpacity={setBgOpacity}
          bgCustomUrl={bgCustomUrl} setBgCustomUrl={setBgCustomUrl}
        />
      )}
"""
if "BackgroundSettingsModal" in import_str and "<BackgroundSettingsModal" not in content:
    content = content.replace("    </div>\n  </>)", modal_str + "\n    </div>\n  </>)")

with open('src/CRMChat.jsx', 'w') as f:
    f.write(content)
