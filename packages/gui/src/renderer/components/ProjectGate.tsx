export function ProjectGate({
  productName,
  reason,
  onChoose,
}: {
  productName: string;
  reason?: string;
  onChoose: () => void;
}) {
  return (
    <div className="gate">
      <div className="gate-card">
        <h1>Open a {productName} project</h1>
        <p>
          Point {productName} at your project folder — the directory that contains{" "}
          <code>scripts/</code> and <code>.claude/pipeline.config.json</code>. The app reads and
          writes that folder (scaffolded apps, <code>.claude/visual-qa/</code> artifacts), so it
          must be a real {productName} checkout.
        </p>
        {reason && (
          <div className="banner banner-warn">
            <span>{reason}</span>
          </div>
        )}
        <button type="button" onClick={onChoose}>
          Choose folder…
        </button>
      </div>
    </div>
  );
}
