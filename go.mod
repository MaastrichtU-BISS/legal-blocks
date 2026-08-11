module github.com/MaastrichtU-BISS/legal-blocks

go 1.23

require github.com/MaastrichtU-BISS/lawnotation-iaa v0.0.0

// Local checkout while the library refactor is unreleased. Replace with a
// tagged version once lawnotation-iaa's iaa package is pushed.
replace github.com/MaastrichtU-BISS/lawnotation-iaa => ../lawnotation-iaa
