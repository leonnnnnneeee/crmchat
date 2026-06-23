import re

with open('src/CRMChat.jsx', 'r') as f:
    content = f.read()

# Extract Avatar
avatar_match = re.search(r'function Avatar\(\{.*?\n\}', content, re.DOTALL)
if avatar_match:
    avatar_code = avatar_match.group(0)
    print("Found Avatar")
    with open('src/components/chat/Avatar.jsx', 'w') as f:
        f.write("import React, { useState, useEffect } from 'react';\n\n")
        f.write("// Assume photoCache and _authToken are passed or imported\n")
        f.write("const photoCache = {};\nlet _authToken = '';\nexport const setAvatarAuthToken = (t) => _authToken = t;\n\n")
        f.write(avatar_code + "\n\nexport default Avatar;\n")
else:
    print("Avatar not found")
