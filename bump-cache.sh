#!/usr/bin/env bash
# Stamp a fresh version onto CSS/JS references in the HTML.
#
# Bluehost (and the Cloudflare layer in front of it) serve styles.css and the
# scripts with a long cache lifetime, so an edited file can keep showing the old
# version to anyone who has visited before. Changing the query string changes
# the URL, which sidesteps every cache between here and the visitor.
#
# Run this before rsync whenever CSS or JS has changed.
set -euo pipefail
cd "$(dirname "$0")/site"

V=$(date +%Y%m%d%H%M)

for f in *.html; do
  # Rewrite existing ?v=… stamps, and add one where it is missing.
  sed -i -E "s/(href=\"styles\.css)(\?v=[0-9]+)?\"/\1?v=$V\"/g; \
             s/(src=\"(main|poster|profile|reference).js)(\?v=[0-9]+)?\"/\1?v=$V\"/g" "$f"

  # The hero art keeps stable filenames but is served with max-age=86400, so a
  # replaced photo would keep showing the old one for a day. Stamp those URLs
  # too — in both src and srcset, since <picture> serves the webp to most
  # browsers and an unstamped srcset would win over a stamped src.
  sed -i -E "s#((src|srcset)=\"assets/img/hero-(1536|1100|760)\.(jpg|webp))(\?v=[0-9]+)?\"#\1?v=$V\"#g" "$f"

  # Head-shots and sponsor logos keep stable filenames too, and are served with
  # the same day-long lifetime. Replacing a photo under an existing name would
  # otherwise keep showing the old one for up to 24 hours — which is exactly
  # what happened when a placeholder avatar was swapped for a real headshot.
  sed -i -E "s#((src|srcset)=\"assets/(organizers|speakers|sponsors)/[A-Za-z0-9_-]+\.(jpg|png|webp))(\?v=[0-9]+)?\"#\1?v=$V\"#g" "$f"
done

echo "cache version stamped: $V"
grep -ho 'styles\.css?v=[0-9]*' ./*.html | sort -u
