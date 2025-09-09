#!/bin/bash
# setup_hooks.sh

# This script intelligently merges the required hook configuration into your
# .claude/settings.json file, preserving existing settings.

set -e

SETTINGS_FILE=".claude/settings.json"
Hooks_CONFIG_DIR=".claude/hooks"

# The JSON configuration for our hooks
# Note the use of $PWD to ensure absolute paths are always used.
Hooks_JSON=$(cat <<EOF
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "$PWD/$Hooks_CONFIG_DIR/generate_verification_prompt.sh"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "WriteFile|Replace",
        "hooks": [
          {
            "type": "command",
            "command": "$PWD/$Hooks_CONFIG_DIR/run_verification.sh"
          }
        ]
      }
    ]
  }
}
EOF
)

# Create the directory and file if they don't exist
mkdir -p .claude
touch $SETTINGS_FILE

# Check if settings file is empty, if so, just write the hooks
if [ ! -s $SETTINGS_FILE ]; then
  echo "$Hooks_JSON" > $SETTINGS_FILE
  echo "✅ Successfully created and configured $SETTINGS_FILE."
  exit 0
fi

# If the file exists, merge the JSON using jq
# This will recursively add the hooks configuration without deleting existing keys.
TEMP_FILE=$(mktemp)

jq -s '.[0] * .[1]' $SETTINGS_FILE <(echo "$Hooks_JSON") > "$TEMP_FILE" && mv "$TEMP_FILE" "$SETTINGS_FILE"

echo "✅ Successfully merged adjudication hooks into $SETTINGS_FILE."
