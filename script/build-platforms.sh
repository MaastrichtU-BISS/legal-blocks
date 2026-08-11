#!/bin/sh
# Cross-compiles the platform binary for every operating system an exported
# platform might have to run on, into binaries/.
#
# The composer includes whichever of these it finds when building an export, so
# a platform exported from a Mac runs on a colleague's Windows machine. Without
# them an export only carries the binary it was exported from, which runs on
# that one operating system.
#
# Cross-compiling works because the code is pure Go with no cgo. A future
# service that needs a C library would break that, and would need a CI matrix
# building on each operating system instead.
#
# Run this after changing any Go code or rebuilding web/dist.
set -e
cd "$(dirname "$0")/.."

mkdir -p binaries
rm -f binaries/platform-*

for target in darwin/arm64 darwin/amd64 windows/amd64 linux/amd64; do
	os=${target%/*}
	arch=${target#*/}
	ext=""
	[ "$os" = "windows" ] && ext=".exe"
	out="binaries/platform-$os-$arch$ext"

	# -s -w strips debug info: the binaries ship to end users and are a third
	# smaller without it. -trimpath keeps local paths out of the build.
	GOOS="$os" GOARCH="$arch" CGO_ENABLED=0 \
		go build -trimpath -ldflags="-s -w" -o "$out" ./cmd/legal-blocks

	printf '  %-24s %s\n' "$target" "$(du -h "$out" | cut -f1)"
done

echo
echo "Built $(ls binaries | wc -l | tr -d ' ') binaries into binaries/."
echo "Exports made from the composer will now run on all of these systems."
