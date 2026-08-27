# Both images, from one file and one source tree.
#
#   docker build --target composer -t legal-blocks-composer .
#   docker build --target platform -t legal-blocks-platform .
#
# script/docker-build.sh does both with the version stamped in. Building them
# together from one commit is what makes "the composer writes its own version
# into the export" a guarantee rather than a hope: the two images with the same
# tag agree about the module registry and the frontend contract, because they
# were built from the same files at the same moment.

FROM node:24-alpine AS build
WORKDIR /src

# better-sqlite3 has prebuilt binaries for common platforms and falls back to
# node-gyp when there is none. Having the toolchain present means the build
# fails loudly at compile time rather than at first request on an unusual arch.
RUN apk add --no-cache python3 make g++

# The workspace layout has to be in place before install, because npm resolves
# workspaces from the root package.json.
COPY package.json package-lock.json ./
COPY packages/manifest/package.json ./packages/manifest/
COPY packages/db/package.json ./packages/db/
COPY packages/export/package.json ./packages/export/
COPY layers/base/package.json ./layers/base/
COPY apps/composer/package.json ./apps/composer/
COPY apps/platform/package.json ./apps/platform/
RUN npm ci

COPY . .

ARG VERSION=dev
ARG PLATFORM_IMAGE=ghcr.io/maastrichtu-biss/legal-blocks-platform
ARG IAA_IMAGE=ghcr.io/maastrichtu-biss/lawnotation-iaa

# Each app builds to its own .output. Nuxt inlines runtimeConfig defaults at
# build time, which is how the composer ends up knowing which images to name.
RUN LEGAL_BLOCKS_VERSION="$VERSION" \
    LEGAL_BLOCKS_PLATFORM_IMAGE="$PLATFORM_IMAGE" \
    LEGAL_BLOCKS_IAA_IMAGE="$IAA_IMAGE" \
    LEGAL_BLOCKS_IAA_VERSION="$VERSION" \
    npm run build

# --- composer -----------------------------------------------------------------
FROM node:24-alpine AS composer

# The composer writes nothing and reads nothing but its own bundle, so it runs
# as a non-root user with no writable directory at all.
RUN adduser -D -u 10001 app
USER app
WORKDIR /app

COPY --from=build --chown=app:app /src/apps/composer/.output ./.output

ENV NITRO_PORT=7788 NITRO_HOST=0.0.0.0
EXPOSE 7788
CMD ["node", ".output/server/index.mjs"]

# --- platform -----------------------------------------------------------------
FROM node:24-alpine AS platform

# /app is where the compose file mounts pipeline.json, and /app/data is where
# the platform's named volume lands.
#
# /app/data must exist here, owned by app, even though a volume is mounted over
# it: Docker initialises a fresh named volume from the ownership of the
# directory it covers. That is the whole reason an export works on Linux
# without the recipient chowning anything — a bind mount would be created
# root-owned by the daemon there, and the platform could not write its
# database into it.
RUN adduser -D -u 10001 app && mkdir -p /app/data && chown -R app:app /app
USER app
WORKDIR /app

COPY --from=build --chown=app:app /src/apps/platform/.output ./.output

# LEGAL_BLOCKS_DIR is /app rather than "." so the platform finds its
# pipeline.json wherever node happens to be invoked from.
ENV NITRO_PORT=7777 NITRO_HOST=0.0.0.0 LEGAL_BLOCKS_DIR=/app
EXPOSE 7777
CMD ["node", ".output/server/index.mjs"]
