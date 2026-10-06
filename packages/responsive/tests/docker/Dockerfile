# A DETERMINISTIC image for the component certification tests (Dimension 5, visual, and all the others).
# Base = the official Playwright image, PINNED to the version of @playwright/test (1.58.2):
# Chromium + system dependencies fixed → reproducible screenshots, local == CI.
FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /work

# Deterministic fonts for the themes + fontconfig with fixed hinting/antialiasing.
#
# MANROPE IS REQUIRED, not decorative: --pdx-font-heading is
# `'Manrope', system-ui, sans-serif`, and without the package fontconfig resolves the whole chain to
# WenQuanYi Zen Hei — a CJK font present in the base image. Every heading of every baseline would be
# rendered in a Chinese font: heavier, with taller line boxes, and a glyph coverage that draws arrows
# where a Latin font would draw nothing. See the test
# tests/integration/visual-regression/fonts.spec.ts, which fails if a family the tokens declare
# does not resolve to itself.
#
# Pinned versions: noble is a frozen release, so today they match the candidate — but written out,
# the image stops depending on that, and an archive that moves breaks the build instead of changing
# the screenshots silently.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        fontconfig=2.15.0-1.1ubuntu2 \
        fonts-inter=4.0+ds-1 \
        fonts-jetbrains-mono=2.304+ds-4 \
        fonts-manrope=4.504+git20201211-3 \
        fonts-roboto=2:0~20170802-3 \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /etc/fonts/conf.d
COPY packages/responsive/tests/docker/fonts.conf /etc/fonts/local.conf
RUN fc-cache -f

# pnpm through corepack, pinned to the workspace's version
RUN corepack enable && corepack prepare pnpm@10.8.1 --activate

# Install dependencies (Linux-native: esbuild, etc.). The whole repository is copied and installed:
# it is small, and the install layer stays cached until the lockfile changes.
COPY . .
RUN pnpm install --frozen-lockfile

WORKDIR /work/packages/responsive
# Default: run the manifest-based runners with the deterministic config.
CMD ["npx", "playwright", "test", "--config", "tests/playwright-docker.config.ts"]
