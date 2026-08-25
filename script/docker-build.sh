#!/bin/sh
# Builds both images from this commit, stamped with one version.
#
#   ./script/docker-build.sh            builds :dev
#   ./script/docker-build.sh 1.4.2      builds :1.4.2
#   ./script/docker-build.sh 1.4.2 push builds and pushes both
#
# Both images have to carry the same version, because the composer writes its
# own version into every export and the export pulls the platform image by that
# tag. A composer at 1.4.2 shipping exports that pull a 1.4.1 platform is
# exactly the drift the old single-binary design ruled out by construction, so
# this script is what replaces it. Build them together or not at all.
#
# lawnotation-iaa is not built here — it is its own repository, and the only
# Go left in the product. Its tag has to exist before an export naming it can
# start.
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
	--build-arg "IAA_IMAGE=$REGISTRY/lawnotation-iaa" \
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
	echo "Make sure $REGISTRY/lawnotation-iaa:$VERSION exists too."
fi
