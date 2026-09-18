import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { COLORS, TERMINAL } from "./constants";

export const { fontFamily: INTER } = loadInter("normal", {
  weights: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
});
export const { fontFamily: MONO } = loadMono("normal", {
  weights: ["400", "600", "700"],
  subsets: ["latin"],
});

const ORBS = [
  { baseX: 250, baseY: 200, size: 480, color: "#3b82f6", blur: 120, opacity: 0.12, speed: 0.006 },
  { baseX: 1550, baseY: 780, size: 420, color: "#22d3ee", blur: 110, opacity: 0.1, speed: 0.005 },
  { baseX: 960, baseY: 500, size: 550, color: "#6366f1", blur: 140, opacity: 0.08, speed: 0.008 },
  { baseX: 1680, baseY: 160, size: 380, color: "#0ea5e9", blur: 100, opacity: 0.07, speed: 0.007 },
  { baseX: 180, baseY: 820, size: 320, color: "#3b82f6", blur: 100, opacity: 0.06, speed: 0.009 },
];

export const AnimatedBackground: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, overflow: "hidden" }}>
      {ORBS.map((o, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: o.baseX + Math.sin(frame * o.speed + i) * 60 - o.size / 2,
            top: o.baseY + Math.cos(frame * o.speed * 0.8 + i) * 40 - o.size / 2,
            width: o.size,
            height: o.size,
            borderRadius: "50%",
            background: o.color,
            filter: `blur(${o.blur}px)`,
            opacity: o.opacity,
          }}
        />
      ))}
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(59,130,246,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.035) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />
    </AbsoluteFill>
  );
};

/** Spring entrance wrapper. Nothing on screen simply appears. */
export const Enter: React.FC<{
  delay?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ delay = 0, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return (
    <div
      style={{
        opacity: s,
        transform: `translateY(${interpolate(s, [0, 1], [18, 0])}px) scale(${interpolate(
          s,
          [0, 1],
          [0.97, 1]
        )})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const GlowText: React.FC<{
  children: React.ReactNode;
  size?: number;
  color?: string;
  weight?: number;
  mono?: boolean;
  style?: React.CSSProperties;
}> = ({ children, size = 64, color = COLORS.white, weight = 700, mono, style }) => (
  <div
    style={{
      fontFamily: mono ? MONO : INTER,
      fontSize: size,
      fontWeight: weight,
      color,
      textShadow: `0 0 40px ${COLORS.accentGlow}`,
      lineHeight: 1.18,
      ...style,
    }}
  >
    {children}
  </div>
);

export const Card: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
  tone?: "neutral" | "bad" | "good";
}> = ({ children, style, tone = "neutral" }) => {
  const border =
    tone === "bad" ? "rgba(239,68,68,0.45)" : tone === "good" ? "rgba(63,185,80,0.45)" : COLORS.border;
  return (
    <div
      style={{
        background: COLORS.bgCard,
        border: `1px solid ${border}`,
        borderRadius: 14,
        padding: "22px 26px",
        backdropFilter: "blur(10px)",
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** Typewriter terminal. Reveals real captured stdout line by line. */
export const Terminal: React.FC<{
  lines: readonly { text: string; color?: string }[];
  startAt?: number;
  framesPerLine?: number;
  title?: string;
  width?: number;
  fontSize?: number;
}> = ({ lines, startAt = 0, framesPerLine = 14, title = "bash", width = 1180, fontSize = 21 }) => {
  const frame = useCurrentFrame();
  const visible = Math.max(0, Math.floor((frame - startAt) / framesPerLine));
  return (
    <div
      style={{
        width,
        background: TERMINAL.bg,
        border: `1px solid ${COLORS.borderStrong}`,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 16px",
          background: "rgba(255,255,255,0.04)",
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <div key={c} style={{ width: 11, height: 11, borderRadius: 6, background: c }} />
        ))}
        <div style={{ fontFamily: MONO, fontSize: 13, color: COLORS.muted, marginLeft: 10 }}>
          {title}
        </div>
      </div>
      <div style={{ padding: "18px 24px", minHeight: 420 }}>
        {lines.slice(0, visible).map((l, i) => (
          <div
            key={i}
            style={{
              fontFamily: MONO,
              fontSize,
              lineHeight: 1.55,
              color: l.color ?? TERMINAL.text,
              whiteSpace: "pre",
            }}
          >
            {l.text || " "}
          </div>
        ))}
        {visible < lines.length && (
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: fontSize,
              background: COLORS.accentBright,
              opacity: Math.floor(frame / 8) % 2 ? 1 : 0.2,
            }}
          />
        )}
      </div>
    </div>
  );
};

export const Label: React.FC<{ children: React.ReactNode; color?: string }> = ({
  children,
  color = COLORS.accentBright,
}) => (
  <div
    style={{
      fontFamily: MONO,
      fontSize: 15,
      letterSpacing: 2.5,
      textTransform: "uppercase",
      color,
      marginBottom: 14,
    }}
  >
    {children}
  </div>
);
