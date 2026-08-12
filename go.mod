module github.com/MaastrichtU-BISS/legal-blocks

go 1.25.0

require github.com/MaastrichtU-BISS/lawnotation-iaa v0.0.0

require (
	github.com/MaastrichtU-BISS/go-legal-docs-client v0.0.0
	github.com/dustin/go-humanize v1.0.1 // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/mattn/go-isatty v0.0.24 // indirect
	github.com/ncruces/go-strftime v1.0.0 // indirect
	github.com/remyoudompheng/bigfft v0.0.0-20230129092748-24d4a6f8daec // indirect
	golang.org/x/sys v0.47.0 // indirect
	modernc.org/libc v1.74.4 // indirect
	modernc.org/mathutil v1.7.1 // indirect
	modernc.org/memory v1.11.0 // indirect
	modernc.org/sqlite v1.56.0
)

// Local checkout while the library refactor is unreleased. Replace with a
// tagged version once lawnotation-iaa's iaa package is pushed.
replace github.com/MaastrichtU-BISS/lawnotation-iaa => ../lawnotation-iaa

// Local checkout while the client is unpublished. Replace with a tagged
// version once go-legal-docs-client is pushed.
replace github.com/MaastrichtU-BISS/go-legal-docs-client => ../go-legal-docs-client
