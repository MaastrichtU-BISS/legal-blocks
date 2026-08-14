# Both images, from one file and one source tree.
#
#   docker build --target composer -t legal-blocks-composer .
#   docker build --target platform -t legal-blocks-platform .
#
# script/docker-build.sh does both with the version stamped in. Building them
# together from one commit is what makes "the composer writes its own version
# into the export" a guarantee rather than a hope: the two images with the same
# tag agree about the module registry, because they were built from the same
# files at the same moment.

# --- the frontend is built on the host, not here -------------------------------
#
# There was a node stage here that ran `npm run build`, so an image could never
# ship a bundle older than its source. It cannot work yet: web/package.json
# depends on vue-legal-workspace as `file:../../vue-legal-workspace`, a package
# that is not published, sitting outside this build context. npm inside the
# container has nothing to resolve it to.
#
# So web/dist is built on the host — where that symlink exists — and copied in
# with the rest of the tree. script/docker-build.sh runs `npm run build` before
# `docker build` for exactly this reason; the guard below is what catches you
# when you skip it and run `docker build` yourself.
#
# Restore the node stage once the package set is published. It is four lines
# and it is the better design; only the file: dependency is in the way.

# --- Go builds ----------------------------------------------------------------
# Tracks the `go` directive in go.mod. Bumping that means bumping this.
FROM golang:1.25-alpine AS go

# CGO off keeps this a static binary, which is what lets the runtime stages be
# alpine rather than a full distro. The SQLite driver is pure Go.
ENV CGO_ENABLED=0

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Both bundles have to exist, because go:embed reads them at compile time and
# its own error ("pattern dist/composer: no matching files") does not say what
# to do about it.
RUN test -f web/dist/composer/index.html && test -f web/dist/platform/index.html \
 || (echo "" >&2; \
     echo "error: web/dist is missing a bundle." >&2; \
     echo "Build the frontend on the host first:  cd web && npm run build" >&2; \
     echo "(script/docker-build.sh does this for you.)" >&2; \
     echo "" >&2; exit 1)

ARG VERSION=dev
ARG PLATFORM_IMAGE=ghcr.io/maastrichtu-biss/legal-blocks-platform
RUN go build -trimpath \
      -ldflags "-s -w \
        -X github.com/MaastrichtU-BISS/legal-blocks/internal/build.Version=${VERSION} \
        -X github.com/MaastrichtU-BISS/legal-blocks/internal/build.PlatformImage=${PLATFORM_IMAGE}" \
      -o /out/composer ./cmd/composer \
 && go build -trimpath \
      -ldflags "-s -w \
        -X github.com/MaastrichtU-BISS/legal-blocks/internal/build.Version=${VERSION}" \
      -o /out/platform ./cmd/platform

# --- composer -----------------------------------------------------------------
FROM alpine:3.20 AS composer

# The composer writes nothing and reads nothing but its own binary, so it runs
# as a non-root user with no writable directory at all.
RUN adduser -D -u 10001 app
USER app

COPY --from=go /out/composer /usr/local/bin/composer
EXPOSE 7788
ENTRYPOINT ["composer"]

# --- platform -----------------------------------------------------------------
FROM alpine:3.20 AS platform

# /app is where the compose file mounts pipeline.json and data/. It is created
# owned by the app user because data/ is written to at runtime — a bind mount
# from the host arrives owned by the host user, which is why the compose file
# and not this line is the thing to look at if writes ever fail.
RUN adduser -D -u 10001 app && mkdir -p /app && chown app:app /app
USER app
WORKDIR /app

COPY --from=go /out/platform /usr/local/bin/platform
EXPOSE 7777
ENTRYPOINT ["platform"]
