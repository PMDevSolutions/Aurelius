import { useCallback } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Toggle } from "@/components/ui/Toggle";
import { Button } from "@/components/ui/Button";
import { Footer } from "@/components/Footer";
import { useStore } from "@/lib/store";
import { SUPPORTED_LANGUAGES } from "@/lib/languages";
import { getKeywordForUrl, getAdvancedOptions } from "@/lib/storage";

const pageTypes = [
  { value: "homepage", label: "Homepage" },
  { value: "category-page", label: "Category Page" },
  { value: "product-page", label: "Product Page" },
  { value: "product-software", label: "Product Software" },
  { value: "blog-post", label: "Blog Post" },
  { value: "landing-page", label: "Landing Page" },
  { value: "contact-page", label: "Contact Page" },
  { value: "about-page", label: "About Page" },
  { value: "service-page", label: "Service Page" },
  { value: "portfolio-page", label: "Portfolio Page" },
  { value: "testimonial-page", label: "Testimonial Page" },
  { value: "location-page", label: "Location Page" },
  { value: "legal-page", label: "Legal Page" },
  { value: "event-page", label: "Event Page" },
  { value: "press-page", label: "Press/News Page" },
  { value: "job-page", label: "Job/Career Page" },
];

const languages = SUPPORTED_LANGUAGES.map((lang) => ({
  value: lang.code,
  label: `${lang.code.toUpperCase()} - ${lang.name}`,
}));

interface SetupPageProps {
  onAnalyze: () => void;
}

const isDevMode =
  typeof chrome === "undefined" || chrome.tabs === undefined;

export function SetupPage({ onAnalyze }: SetupPageProps) {
  const { settings, setSettings, apiKey, setApiKey } = useStore();

  const handleUrlBlur = useCallback(async () => {
    const url = settings.targetUrl.trim();
    if (!url) return;
    try {
      const savedKeyword = await getKeywordForUrl(url);
      if (savedKeyword && !settings.keyword) {
        setSettings({ keyword: savedKeyword });
      }
      const host = new URL(url).hostname;
      const savedOptions = await getAdvancedOptions(host);
      if (savedOptions) {
        setSettings({
          pageType: savedOptions.pageType,
          secondaryKeywords: savedOptions.secondaryKeywords,
          language: savedOptions.language,
          advancedMode: true,
        });
      }
    } catch {
      // Invalid URL — ignore
    }
  }, [settings.targetUrl, settings.keyword, setSettings]);

  const canAnalyze =
    settings.keyword.trim() !== "" &&
    (!isDevMode || settings.targetUrl.trim() !== "");

  const secondaryKeywordsLength = settings.secondaryKeywords.length;

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex-1 p-6">
        <div className="rounded-[20px] border-2 border-[#5b5959] bg-bg-700 py-8 px-5 flex flex-col items-center gap-10">
          {/* Content group */}
          <div className="flex flex-col gap-6 self-stretch">
            <h1 className="text-h1 text-text-primary text-center">
              Set up your SEO analysis
            </h1>

            {isDevMode && (
              <>
                <Input
                  label="Page URL to Analyze"
                  type="url"
                  placeholder="https://example.com"
                  value={settings.targetUrl}
                  onChange={(e) => setSettings({ targetUrl: e.target.value })}
                  onBlur={handleUrlBlur}
                />

                <Input
                  label="OpenAI API Key (optional)"
                  type="password"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
              </>
            )}

            <Input
              label="Main keyword"
              placeholder="Enter your main keyword"
              value={settings.keyword}
              onChange={(e) => setSettings({ keyword: e.target.value })}
            />

            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-[10px]">
                <div className="flex items-center gap-3">
                  <span className="text-h2 text-text-primary">Advanced Analysis</span>
                  <span className="text-body-12 text-text-primary">optional</span>
                </div>
                <p className="text-body text-text-secondary">
                  Get smarter, page-specific recommendations based on your page context.
                </p>
              </div>
              <Toggle
                checked={settings.advancedMode}
                onChange={(checked) => setSettings({ advancedMode: checked })}
              />
            </div>

            {settings.advancedMode && (
              <div className="flex flex-col gap-8">
                <Select
                  label="Page type"
                  options={pageTypes}
                  value={settings.pageType}
                  onChange={(e) => setSettings({ pageType: e.target.value })}
                />

                <Select
                  label="AI recommendations language"
                  options={languages}
                  value={settings.language}
                  onChange={(e) => setSettings({ language: e.target.value })}
                />

                <div className="flex flex-col gap-4">
                  <div className="flex items-baseline justify-between">
                    <label
                      htmlFor="secondary-keywords"
                      className="text-h2 text-text-primary"
                    >
                      Secondary keywords
                    </label>
                    <span className="text-body-12 text-text-secondary">
                      ({secondaryKeywordsLength}/2000 characters)
                    </span>
                  </div>
                  <textarea
                    id="secondary-keywords"
                    placeholder="SEO Webflow, Search engine optimization..."
                    value={settings.secondaryKeywords}
                    onChange={(e) =>
                      setSettings({ secondaryKeywords: e.target.value.slice(0, 2000) })
                    }
                    rows={3}
                    className="w-full rounded-[10px] border border-[#717171] bg-bg-500 p-[14px] text-body-16 text-text-primary placeholder:text-bg-300 outline-none focus:ring-1 focus:ring-accent-blue transition-shadow shadow-[0px_1px_2px_0px_rgba(10,13,20,0.03)] resize-none"
                  />
                  <p className="text-body text-text-secondary">
                    Add related or synonym keywords to help AI deliver richer SEO recommendations.
                  </p>
                </div>
              </div>
            )}

            {/* Divider line */}
            <div className="h-px bg-bg-500 w-full" />
          </div>

          {/* Button — sibling of content group, spaced by card's gap-10 */}
          <Button
            onClick={onAnalyze}
            disabled={!canAnalyze}
          >
            Optimize my SEO
          </Button>
        </div>
      </div>
      <Footer />
    </div>
  );
}
