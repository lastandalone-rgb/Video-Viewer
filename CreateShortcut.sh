#!/usr/bin/env bash
# CreateShortcut.sh — 在 macOS 桌面建立啟動捷徑

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHORTCUT="$HOME/Desktop/啟動影片播放器.command"

cat > "$SHORTCUT" <<EOF
#!/usr/bin/env bash
cd "$SCRIPT_DIR"
npm run dev
EOF

chmod +x "$SHORTCUT"
echo "捷徑已成功建立在桌面上：$SHORTCUT"
