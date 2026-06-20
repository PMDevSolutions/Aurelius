/**
 * Programmatic IDML fixtures.
 *
 * Builds real `.idml` (zip) buffers in memory from a map of XML strings, so the
 * happy-path package and every malformed/edge-case variant live as readable
 * source rather than committed binaries. `sampleFiles()` returns a fresh,
 * mutable record each call so tests can delete/replace entries to construct
 * edge cases.
 */
import { strToU8, zipSync } from "fflate";
import { IDML_MIMETYPE } from "../package.js";

/** A map of package-relative path → file contents. */
export type IdmlFiles = Record<string, string | Uint8Array>;

/** A 1×1 PNG, used as a resolvable bundled image asset. */
export const PNG_1x1: Uint8Array = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC",
    "base64",
  ),
);

const DESIGNMAP = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<?aid style="50" type="document" readerVersion="6.0" featureSet="257" product="16.0(44)" ?>
<Document xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="16.0" Self="doc">
  <idPkg:Graphic src="Resources/Graphic.xml" />
  <idPkg:Fonts src="Resources/Fonts.xml" />
  <idPkg:Styles src="Resources/Styles.xml" />
  <idPkg:MasterSpread src="MasterSpreads/MasterSpread_uMaster.xml" />
  <idPkg:Spread src="Spreads/Spread_ub6.xml" />
  <idPkg:Story src="Stories/Story_u100.xml" />
</Document>`;

const GRAPHIC = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Graphic xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="16.0">
  <Color Self="Color/Black" Model="Process" Space="CMYK" ColorValue="0 0 0 100" Name="Black" />
  <Color Self="Color/Brand Blue" Model="Process" Space="RGB" ColorValue="20 90 200" Name="Brand Blue" />
  <Color Self="Color/Paper" Model="Process" Space="CMYK" ColorValue="0 0 0 0" Name="Paper" />
  <Swatch Self="Swatch/None" Name="None" />
  <Tint Self="Tint/BlackTint" Name="Black 50%" BaseColor="Color/Black" TintValue="50" />
  <Gradient Self="Gradient/Fade" Name="Fade" Type="Linear" />
</idPkg:Graphic>`;

const FONTS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Fonts xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="16.0">
  <FontFamily Self="font-family-1" Name="Minion Pro">
    <Font Self="font-minion-regular" FontFamily="Minion Pro" Name="Minion Pro Regular" PostScriptName="MinionPro-Regular" Status="Installed" FontStyleName="Regular" />
    <Font Self="font-minion-bold" FontFamily="Minion Pro" Name="Minion Pro Bold" PostScriptName="MinionPro-Bold" Status="Installed" FontStyleName="Bold" />
  </FontFamily>
  <FontFamily Self="font-family-2" Name="Helvetica">
    <Font Self="font-helvetica" FontFamily="Helvetica" Name="Helvetica" PostScriptName="Helvetica" Status="Installed" FontStyleName="Regular" />
  </FontFamily>
</idPkg:Fonts>`;

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Styles xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="16.0">
  <RootParagraphStyleGroup Self="rpsg">
    <ParagraphStyle Self="ParagraphStyle/$ID/[No paragraph style]" Name="$ID/[No paragraph style]" />
    <ParagraphStyle Self="ParagraphStyle/Heading" Name="Heading" PointSize="24" FontStyle="Bold" FillColor="Color/Black" Justification="LeftAlign" Tracking="10">
      <Properties>
        <BasedOn type="object">ParagraphStyle/$ID/[No paragraph style]</BasedOn>
        <AppliedFont type="string">Minion Pro</AppliedFont>
        <Leading type="unit">28</Leading>
      </Properties>
    </ParagraphStyle>
    <ParagraphStyleGroup Self="psg-body" Name="Body">
      <ParagraphStyle Self="ParagraphStyle/Body" Name="Body" PointSize="12">
        <Properties>
          <AppliedFont type="string">Minion Pro</AppliedFont>
          <Leading type="enumeration">Auto</Leading>
        </Properties>
      </ParagraphStyle>
    </ParagraphStyleGroup>
  </RootParagraphStyleGroup>
  <RootCharacterStyleGroup Self="rcsg">
    <CharacterStyle Self="CharacterStyle/$ID/[No character style]" Name="$ID/[No character style]" />
    <CharacterStyle Self="CharacterStyle/Emphasis" Name="Emphasis" FontStyle="Italic" />
  </RootCharacterStyleGroup>
</idPkg:Styles>`;

const STORY = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Story xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="16.0">
  <Story Self="u100" AppliedTOCStyle="n" TrackChanges="false" StoryTitle="$ID/">
    <StoryPreference OpticalMarginAlignment="false" />
    <ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/Heading">
      <CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]" PointSize="24">
        <Content>Welcome to Aurelius</Content>
      </CharacterStyleRange>
    </ParagraphStyleRange>
    <ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/Body">
      <CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]">
        <Content>Print to React, </Content>
      </CharacterStyleRange>
      <CharacterStyleRange AppliedCharacterStyle="CharacterStyle/Emphasis">
        <Content>beautifully.</Content>
      </CharacterStyleRange>
    </ParagraphStyleRange>
  </Story>
</idPkg:Story>`;

const SPREAD = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Spread xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="16.0">
  <Spread Self="ub6" PageCount="1" ItemTransform="1 0 0 1 0 0">
    <Page Self="page-1" Name="1" GeometricBounds="0 0 792 612" ItemTransform="1 0 0 1 0 0" />
    <TextFrame Self="text-hero" ParentStory="u100" ItemTransform="1 0 0 1 72 72" PreviousTextFrame="n" NextTextFrame="n" Name="Hero Headline">
      <Properties>
        <PathGeometry>
          <GeometryPathType PathOpen="false">
            <PathPointArray>
              <PathPointType Anchor="0 0" LeftDirection="0 0" RightDirection="0 0" />
              <PathPointType Anchor="468 0" LeftDirection="468 0" RightDirection="468 0" />
              <PathPointType Anchor="468 100" LeftDirection="468 100" RightDirection="468 100" />
              <PathPointType Anchor="0 100" LeftDirection="0 100" RightDirection="0 100" />
            </PathPointArray>
          </GeometryPathType>
        </PathGeometry>
      </Properties>
    </TextFrame>
    <Rectangle Self="rect-hero" ItemTransform="1 0 0 1 72 300" FillColor="Color/Paper" StrokeColor="Swatch/None" Name="Hero Image">
      <Properties>
        <PathGeometry>
          <GeometryPathType PathOpen="false">
            <PathPointArray>
              <PathPointType Anchor="0 0" LeftDirection="0 0" RightDirection="0 0" />
              <PathPointType Anchor="468 0" LeftDirection="468 0" RightDirection="468 0" />
              <PathPointType Anchor="468 300" LeftDirection="468 300" RightDirection="468 300" />
              <PathPointType Anchor="0 300" LeftDirection="0 300" RightDirection="0 300" />
            </PathPointArray>
          </GeometryPathType>
        </PathGeometry>
      </Properties>
      <Image Self="img-hero" ItemTransform="1 0 0 1 72 300" ActualPpi="300 300">
        <Properties>
          <Profile type="string">$ID/EmbeddedProfile</Profile>
        </Properties>
        <Link Self="link-hero" LinkResourceURI="file:Links/hero.png" StoredState="Normal" />
      </Image>
    </Rectangle>
  </Spread>
</idPkg:Spread>`;

const MASTER_SPREAD = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:MasterSpread xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="16.0">
  <MasterSpread Self="uMaster" Name="A-Master" NamePrefix="A" ItemTransform="1 0 0 1 0 0">
    <Page Self="master-page-1" Name="A" GeometricBounds="0 0 792 612" ItemTransform="1 0 0 1 0 0" />
    <Rectangle Self="master-band" ItemTransform="1 0 0 1 0 0" FillColor="Color/Brand Blue" Name="Header Band">
      <Properties>
        <PathGeometry>
          <GeometryPathType PathOpen="false">
            <PathPointArray>
              <PathPointType Anchor="0 0" LeftDirection="0 0" RightDirection="0 0" />
              <PathPointType Anchor="612 0" LeftDirection="612 0" RightDirection="612 0" />
              <PathPointType Anchor="612 72" LeftDirection="612 72" RightDirection="612 72" />
              <PathPointType Anchor="0 72" LeftDirection="0 72" RightDirection="0 72" />
            </PathPointArray>
          </GeometryPathType>
        </PathGeometry>
      </Properties>
    </Rectangle>
  </MasterSpread>
</idPkg:MasterSpread>`;

/** A fresh, mutable map of the canonical happy-path IDML package files. */
export function sampleFiles(): IdmlFiles {
  return {
    mimetype: IDML_MIMETYPE,
    "designmap.xml": DESIGNMAP,
    "Resources/Graphic.xml": GRAPHIC,
    "Resources/Fonts.xml": FONTS,
    "Resources/Styles.xml": STYLES,
    "Stories/Story_u100.xml": STORY,
    "Spreads/Spread_ub6.xml": SPREAD,
    "MasterSpreads/MasterSpread_uMaster.xml": MASTER_SPREAD,
    "Links/hero.png": PNG_1x1,
  };
}

/**
 * Zip a file map into a real IDML buffer. The `mimetype` entry, if present, is
 * written first and stored uncompressed, matching the IDML packaging convention.
 */
export function buildIdml(files: IdmlFiles): Uint8Array {
  const zippable: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  if (files.mimetype !== undefined) {
    zippable.mimetype = [toBytes(files.mimetype), { level: 0 }];
  }
  for (const [path, contents] of Object.entries(files)) {
    if (path === "mimetype") continue;
    zippable[path] = [toBytes(contents), { level: 6 }];
  }
  return zipSync(zippable);
}

/** Build the canonical happy-path IDML buffer. */
export function buildSampleIdml(): Uint8Array {
  return buildIdml(sampleFiles());
}

function toBytes(value: string | Uint8Array): Uint8Array {
  return typeof value === "string" ? strToU8(value) : value;
}
