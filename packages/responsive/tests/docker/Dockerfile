# A DETERMINISTIC image for the component certification tests (Dimension 5, visual, and all the others).
# Base = the official Playwright image, PINNED to the version of @playwright/test (1.58.2):
# Chromium + system dependencies fixed → reproducible screenshots, local == CI.
FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /work

# The values Chromium writes itself at startup, set before it starts (#63, see quality.yml): with
# both already present its two setenv calls never reallocate the environment under another thread.
# `docker run` does not inherit the runner's environment, so the workflow's `env:` stops here.
ENV FC_FONTATIONS=1 DBUS_SESSION_BUS_ADDRESS=disabled:

# Deterministic fonts for the themes + fontconfig with fixed hinting/antialiasing.
#
# MANROPE IS REQUIRED, not decorative: --pdx-font-heading is
# `'Manrope', system-ui, sans-serif`, and without its file fontconfig resolves the whole chain to
# WenQuanYi Zen Hei — a CJK font present in the base image. Every heading of every baseline would be
# rendered in a Chinese font: heavier, with taller line boxes, and a glyph coverage that draws arrows
# where a Latin font would draw nothing. See the test
# tests/integration/visual-regression/fonts.spec.ts, which fails if a family the tokens declare
# does not resolve to itself.
#
# The fonts are files in the repository, not packages: an apt mirror that is slow or down no longer
# fails the build, and nothing outside the repository can change a screenshot (#1032). They are the
# files of the noble packages fonts-inter 4.0+ds-1, fonts-jetbrains-mono 2.304+ds-4,
# fonts-manrope 4.504+git20201211-3 and fonts-roboto-unhinted 2:0~20170802-3, and only the weights
# the visual suite and the font guard open: measured by tracing the files Chromium opens over the
# whole run. A weight a theme starts to use is added from the same package; each folder keeps the
# package's copyright and licence. fontconfig is already in the base image.
COPY packages/responsive/tests/docker/fonts /usr/share/fonts/pdx
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
