import type { CSSProperties } from "react";

type SimulationViewerProps = {
  className?: string;
  style?: CSSProperties;
  modelPath?: string;
};

export default function SimulationViewer({
  className,
  style,
  modelPath,
}: SimulationViewerProps) {
  return (
    <div
      className={className}
      style={{
        display: "grid",
        placeItems: "center",
        borderRadius: "14px",
        border: "1px solid rgba(34,211,238,.25)",
        background:
          "radial-gradient(circle at 30% 20%, rgba(34,211,238,.22), rgba(15,23,42,.6) 65%)",
        color: "var(--text-primary)",
        ...style,
      }}
      aria-label="Hand simulation preview"
      title={modelPath ? `Model: ${modelPath}` : "Simulation preview"}
    >
      <svg
        width="46"
        height="46"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ opacity: 0.85 }}
      >
        <path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2" />
        <path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2" />
        <path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8" />
        <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
      </svg>
    </div>
  );
}
