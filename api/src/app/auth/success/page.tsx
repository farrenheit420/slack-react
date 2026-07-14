export default function AuthSuccessPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "linear-gradient(160deg, #f7f2f8 0%, #ffffff 55%, #eef6ff 100%)",
      }}
    >
      <div
        style={{
          maxWidth: 420,
          textAlign: "center",
          lineHeight: 1.5,
          color: "#1e1e1e",
        }}
      >
        <h1 style={{ fontSize: 28, margin: "0 0 12px", color: "#4a154b" }}>
          Connected to Slack
        </h1>
        <p style={{ margin: 0, color: "#555" }}>
          You can close this tab and return to Figma. Slack React will finish
          connecting automatically.
        </p>
      </div>
    </main>
  );
}
