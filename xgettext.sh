#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-2.0-or-later
# Regenerate po/templates/geodata.pot from the view JS files.
set -euo pipefail

SRC_DIR="htdocs/luci-static/resources/view/geodata"
OUT_POT="po/templates/geodata.pot"
ENCODING="UTF-8"
WIDTH=120

mapfile -t FILES < <(find "$SRC_DIR" -type f -name "*.js" | sort)
if [ ${#FILES[@]} -eq 0 ]; then
    echo "No JS files found in $SRC_DIR"
    exit 1
fi
mkdir -p "$(dirname "$OUT_POT")"

echo "Generating POT template from JS files in $SRC_DIR"
xgettext --language=JavaScript \
         --keyword=_ \
         --from-code="$ENCODING" \
         --output="$OUT_POT" \
         --width="$WIDTH" \
         --package-name="luci-app-geodata" \
         "${FILES[@]}"

echo "POT template generated: $OUT_POT"