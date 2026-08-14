#!/bin/sh
# Builds both images from this commit, stamped with one version.
#
#   ./script/docker-build.sh            builds :dev
#   ./script/docker-build.sh 1.4.2      builds :1.4.2
#   ./script/docker-build.sh 1.4.2 push builds and pushes both
#
# Both images have to carry the same version, because the composer writes its
# own version into every export and pulls the platform image by that tag. A
# composer at 1.4.2 exporting a platform at 1.4.1 is the failure the old
# single-binary design ruled out by construction, so this script is the thing
# that replaces it. Build them together or not at all.
set -e
cd "$(dirname "$0")/.."

VERSION=${1:-dev}
ACTION=${2:-}
REGISTRY=${REGISTRY:-ghcr.io/maastrichtu-biss}

COMPOSER="$REGISTRY/legal-blocks-composer:$VERSION"
PLATFORM="$REGISTRY/legal-blocks-platform:$VERSION"

echo "Building $VERSION"
echo

docker build --target platform \
	--build-arg "VERSION=$VERSION" \
	-t "$PLATFORM" .

docker build --target composer \
	--build-arg "VERSION=$VERSION" \
	--build-arg "PLATFORM_IMAGE=$REGISTRY/legal-blocks-platform" \
	-t "$COMPOSER" .

echo
echo "  $COMPOSER"
echo "  $PLATFORM"

if [ "$ACTION" = "push" ]; then
	if [ "$VERSION" = "dev" ]; then
		echo
		echo "error: refusing to push :dev — pass a version number" >&2
		exit 1
	fi
	echo
	docker push "$PLATFORM"
	docker push "$COMPOSER"
	echo
	echo "Pushed. Exports from $VERSION will pull $PLATFORM."
fi
