#!/usr/bin/env bash
set -euo pipefail

# Commit the version bump and workflow before running npm run release.
cd "$(git rev-parse --show-toplevel)"
if [[ "$(git branch --show-current)" != main ]]; then
  echo 'Release from main.' >&2
  exit 1
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo 'Commit tracked changes before releasing.' >&2
  exit 1
fi
git cat-file -e HEAD:.github/workflows/publish.yml
release_tag="$(node -e '
  const {version} = require("./package.json");
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Expected a stable X.Y.Z version");
  process.stdout.write(`v${version}`);
')"
if git show-ref --verify --quiet "refs/tags/${release_tag}"; then
  echo "Tag ${release_tag} already exists locally." >&2
  exit 1
fi
remote_tag="$(git ls-remote --tags origin "refs/tags/${release_tag}")"
if [[ -n "$remote_tag" ]]; then
  echo "Tag ${release_tag} already exists on origin." >&2
  exit 1
fi

# Publish the workflow commit first, then send a separate tag push event.
git -c push.followTags=false push origin HEAD:refs/heads/main
git tag -a "$release_tag" -m "Release ${release_tag}"
git -c push.followTags=false push origin "refs/tags/${release_tag}"
echo "Pushed ${release_tag}. Check the Publish release workflow in GitHub Actions."
