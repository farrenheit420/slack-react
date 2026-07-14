export default function HomePage() {
  return (
    <main style={{ padding: 40, maxWidth: 560, lineHeight: 1.5 }}>
      <h1 style={{ marginTop: 0 }}>Slack React API</h1>
      <p>
        Backend for the Slack React Figma plugin. Endpoints live under{" "}
        <code>/auth/slack/*</code> and <code>/api/emoji/*</code>.
      </p>
    </main>
  );
}
