# InDesign pipeline fixtures

`sample.idml` is a small, valid IDML package (a zip of XML) used by the
InDesign-pipeline end-to-end smoke test. It contains one spread with a heading
text frame and a linked image, a master spread, swatches, fonts, and paragraph/
character styles — enough to exercise parse → tokens → React generation.

It is generated from the programmatic builder
`packages/pipeline/src/indesign/__tests__/idml-fixtures.ts` (`buildSampleIdml()`),
so it stays in sync with the unit-test fixtures. To regenerate after changing the
builder, write `buildSampleIdml()`'s bytes to this path.

PDF fixtures are generated in-memory with `pdf-lib` in the test suite
(`packages/pipeline/src/pdf/__tests__/pdf-fixtures.ts`).
