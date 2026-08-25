#!/bin/sh
# Builds every image a platform needs, from this commit, under one version.
#
#   ./script/docker-build.sh            builds :dev
#   ./script/docker-build.sh 0.1.0      builds :0.1.0
#   ./script/docker-build.sh 0.1.0 push builds and pushes all three
#
# All three carry the same version, because the composer writes its own version
# into every export and the export pulls the other two by that tag. A composer
# at 0.1.0 shipping exports that pull a 0.0.9 platform is exactly the drift the
# old single-binary design ruled out by construction, so this script is what
# replaces it. Build them together or not at all.
#
# lawnotation-iaa lives in its own repository — it is the only Go left in the
# product — so this builds it from a sibling checkout. Without one, the version
# cannot be released: an export naming an image nobody can pull is worse than
# no release.
set -e
cd "$(dirname "$0")/.."

VERSION=${1:-dev}
ACTION=${2:-}
REGISTRY=${REGISTRY:-ghcr.io/maastrichtu-biss}
IAA_SRC=${IAA_SRC:-../lawnotation-iaa}

COMPOSER="$REGISTRY/legal-blocks-composer:$VERSION"
PLATFORM="$REGISTRY/legal-blocks-platform:$VERSION"
IAA="$REGISTRY/lawnotation-iaa:$VERSION"

echo "Building $VERSION"
echo

if [ -f "$IAA_SRC/Dockerfile" ]; then
	docker build -t "$IAA" "$IAA_SRC"
else
	echo "error: no lawnotation-iaa checkout at $IAA_SRC." >&2
	echo "       Clone it beside this repo, or set IAA_SRC to where it is." >&2
	echo "       Exports that compute agreement name $IAA and cannot start without it." >&2
	exit 1
fi

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
echo "  $IAA"

if [ "$ACTION" = "push" ]; then
	if [ "$VERSION" = "dev" ]; then
		echo
		echo "error: refusing to push :dev — pass a version number." >&2
		echo "       An export from an unreleased composer should fail to pull" >&2
		echo "       loudly rather than quietly run whatever :latest is today." >&2
		exit 1
	fi
	echo
	# The platform and the agreement service first. If pushing fails partway,
	# the composer — the only one that *names* the others — is the one still
	# unpublished, so nobody can export something that cannot start.
	docker push "$IAA"
	docker push "$PLATFORM"
	docker push "$COMPOSER"
	echo
	echo "Pushed. Exports from $VERSION will pull $PLATFORM and $IAA."
fi
