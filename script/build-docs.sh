#!/bin/sh
# Renders docs/*.md to PDF.
#
# The markdown is the source and the thing to edit; the PDF is a build
# artefact and is not tracked, so regenerating it never shows up as a diff.
#
# Needs pandoc and a LaTeX engine (xelatex ships with MacTeX). xelatex rather
# than pdflatex because the diagrams use box-drawing and arrow characters that
# pdflatex's default fonts do not have.
set -e
cd "$(dirname "$0")/.."

command -v pandoc >/dev/null || { echo "pandoc is not installed"; exit 1; }
command -v xelatex >/dev/null || { echo "xelatex is not installed"; exit 1; }

for src in docs/*.md; do
	out="${src%.md}.pdf"
	pandoc "$src" \
		--from=markdown \
		--pdf-engine=xelatex \
		--toc --toc-depth=2 \
		--highlight-style=tango \
		-V documentclass=article \
		-V papersize=a4 \
		-V geometry:margin=2.4cm \
		-V mainfont="Helvetica Neue" \
		-V monofont="Menlo" \
		-V fontsize=10pt \
		-V colorlinks=true \
		-V linkcolor=black \
		-V toccolor=black \
		-o "$out"
	echo "  $out"
done

echo
echo "Done."
