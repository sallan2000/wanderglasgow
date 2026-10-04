#!/bin/bash
set -euo pipefail
pnpm install --frozen-lockfile
# Wander Glasgow uses owner-managed Supabase. Apply its SQL upgrades manually;
# do not run the unused template database's migrations after workspace merges.
