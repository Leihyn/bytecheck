import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import {
  AnimatedBackground,
  Card,
  Enter,
  GlowText,
  Label,
  Terminal,
  INTER,
  MONO,
} from "./ui";
import {
  BRAND,
  COERCE_TUPLE_SNIPPET,
  COLORS,
  DIVERGENCE_LINES,
  KEEPERHUB_COMMENT,
  ORDER_BROADCAST,
  ORDER_SIMULATE,
  STATUS_NOT,
  STATUS_PROVEN,
  TEST_LINES,
} from "./constants";

const Frame: React.FC<{ children: React.ReactNode; pad?: number }> = ({ children, pad = 96 }) => (
  <AbsoluteFill>
    <AnimatedBackground />
    <AbsoluteFill style={{ padding: pad, justifyContent: "center" }}>{children}</AbsoluteFill>
  </AbsoluteFill>
);

/** S1 — Hook. The gap between a description and the chain. */
export const S1: React.FC = () => (
  <Frame>
    <Enter delay={0}>
      <Label>{BRAND.event}</Label>
    </Enter>
    <Enter delay={8}>
      <GlowText size={80} weight={800}>
        An agent that moves treasury funds
        <br />
        does not build its own transaction.
      </GlowText>
    </Enter>
    <Enter delay={70} style={{ marginTop: 44 }}>
      <GlowText size={40} weight={500} color={COLORS.offWhite}>
        It describes one. Something else turns that description into bytes.
      </GlowText>
    </Enter>
    <Enter delay={210} style={{ marginTop: 52 }}>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 34,
          color: COLORS.accentBright,
          borderLeft: `3px solid ${COLORS.accent}`,
          paddingLeft: 24,
        }}
      >
        Between the description and the chain,
        <br />
        the bytes are somebody else&apos;s to choose.
      </div>
    </Enter>
  </Frame>
);

/** S2 — The ordering contrast: three call sites against one. */
export const S2: React.FC = () => (
  <Frame pad={80}>
    <Enter delay={0}>
      <Label>KeeperHub · main · 2026-09-17</Label>
    </Enter>
    <Enter delay={6}>
      <GlowText size={50} weight={700}>
        Three call sites agree. One does not.
      </GlowText>
    </Enter>

    <div style={{ display: "flex", gap: 26, marginTop: 38 }}>
      <Enter delay={70} style={{ flex: 1 }}>
        <Card tone="good">
          <div style={{ fontFamily: MONO, fontSize: 20, color: COLORS.green, marginBottom: 14 }}>
            reshape → coerce
          </div>
          {ORDER_BROADCAST.map((o) => (
            <div
              key={o.file}
              style={{ fontFamily: MONO, fontSize: 16, color: COLORS.offWhite, lineHeight: 1.9 }}
            >
              {o.file}
              <span style={{ color: COLORS.muted }}>:{o.line}</span>
            </div>
          ))}
        </Card>
      </Enter>
      <Enter delay={120} style={{ flex: 1 }}>
        <Card tone="bad">
          <div style={{ fontFamily: MONO, fontSize: 20, color: COLORS.red, marginBottom: 14 }}>
            coerce → reshape
          </div>
          <div style={{ fontFamily: MONO, fontSize: 16, color: COLORS.white, lineHeight: 1.9 }}>
            {ORDER_SIMULATE.file}
            <span style={{ color: COLORS.muted }}>:{ORDER_SIMULATE.line}</span>
          </div>
          <div style={{ fontFamily: INTER, fontSize: 16, color: COLORS.muted, marginTop: 18 }}>
            the simulate path
          </div>
        </Card>
      </Enter>
    </div>

    <Enter delay={300} style={{ marginTop: 30 }}>
      <Card>
        {COERCE_TUPLE_SNIPPET.map((l, i) => (
          <div
            key={i}
            style={{
              fontFamily: MONO,
              fontSize: 20,
              lineHeight: 1.7,
              color: i === 1 ? COLORS.amber : COLORS.offWhite,
            }}
          >
            {l}
          </div>
        ))}
      </Card>
    </Enter>

    <Enter delay={640} style={{ marginTop: 26 }}>
      <div
        style={{
          fontFamily: INTER,
          fontSize: 25,
          fontStyle: "italic",
          color: COLORS.cyan,
          borderLeft: `3px solid ${COLORS.cyan}`,
          paddingLeft: 22,
          maxWidth: 1500,
        }}
      >
        “{KEEPERHUB_COMMENT}”
        <div style={{ fontStyle: "normal", fontSize: 16, color: COLORS.muted, marginTop: 10 }}>
          KeeperHub, lib/abi/struct-args.ts
        </div>
      </div>
    </Enter>
  </Frame>
);

/** S3 — The divergence, reproduced offline. Real stdout. */
export const S3: React.FC = () => (
  <Frame pad={70}>
    <Enter delay={0}>
      <Label>Reproduced offline · no API key · no network</Label>
    </Enter>
    <div style={{ display: "flex", gap: 38, alignItems: "center", marginTop: 10 }}>
      <Enter delay={6}>
        <Terminal lines={DIVERGENCE_LINES} startAt={20} framesPerLine={22} title="bytecheck — divergence" width={1130} fontSize={20} />
      </Enter>
      <div style={{ flex: 1 }}>
        <Enter delay={430}>
          <GlowText size={44} weight={800} color={COLORS.red}>
            Word #1
          </GlowText>
          <div style={{ fontFamily: INTER, fontSize: 25, color: COLORS.offWhite, marginTop: 16, lineHeight: 1.5 }}>
            Same selector.
            <br />
            Same length.
            <br />
            One word apart.
          </div>
        </Enter>
        <Enter delay={560} style={{ marginTop: 34 }}>
          <Card tone="bad">
            <div style={{ fontFamily: MONO, fontSize: 18, color: COLORS.red }}>simulate → true</div>
            <div style={{ fontFamily: MONO, fontSize: 18, color: COLORS.green, marginTop: 8 }}>
              broadcast → false
            </div>
          </Card>
        </Enter>
      </div>
    </div>
  </Frame>
);

/** S4 — The fix: move the check to the Safe. */
export const S4: React.FC = () => {
  const frame = useCurrentFrame();
  const flow = interpolate(frame, [120, 340], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <Frame>
      <Enter delay={0}>
        <Label>The check moves to the boundary a relayer cannot bypass</Label>
      </Enter>
      <Enter delay={6}>
        <GlowText size={58} weight={800}>
          The proposer signs the bytes.
        </GlowText>
      </Enter>

      <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 56 }}>
        {[
          { t: "proposer", s: "signs keccak256(data)", c: COLORS.accentBright },
          { t: "relayer", s: "submits — may be anyone", c: COLORS.offWhite },
          { t: "module", s: "recovers signer from bytes", c: COLORS.cyan },
          { t: "Safe", s: "executes, or nothing moves", c: COLORS.green },
        ].map((n, i) => (
          <React.Fragment key={n.t}>
            <Enter delay={120 + i * 55} style={{ flex: 1 }}>
              <Card style={{ textAlign: "center", opacity: flow > i * 0.2 ? 1 : 0.5 }}>
                <div style={{ fontFamily: MONO, fontSize: 26, color: n.c, fontWeight: 700 }}>{n.t}</div>
                <div style={{ fontFamily: INTER, fontSize: 17, color: COLORS.muted, marginTop: 10 }}>
                  {n.s}
                </div>
              </Card>
            </Enter>
            {i < 3 && (
              <div style={{ fontFamily: MONO, fontSize: 30, color: COLORS.accent, opacity: 0.7 }}>→</div>
            )}
          </React.Fragment>
        ))}
      </div>

      <Enter delay={600} style={{ marginTop: 56 }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 30,
            color: COLORS.white,
            background: "rgba(239,68,68,0.10)",
            border: `1px solid rgba(239,68,68,0.4)`,
            borderRadius: 12,
            padding: "22px 28px",
            display: "inline-block",
          }}
        >
          one byte different → different recovered signer → revert
        </div>
      </Enter>
      <Enter delay={690} style={{ marginTop: 26 }}>
        <GlowText size={34} weight={600} color={COLORS.accentBright}>
          The relayer becomes a courier.
        </GlowText>
      </Enter>
    </Frame>
  );
};

/** S5 — The tests. Real forge output. */
export const S5: React.FC = () => (
  <Frame pad={70}>
    <Enter delay={0}>
      <Label>forge test --offline</Label>
    </Enter>
    <div style={{ display: "flex", gap: 38, alignItems: "center" }}>
      <Enter delay={6}>
        <Terminal lines={TEST_LINES} startAt={16} framesPerLine={24} title="bytecheck — forge test" width={1080} fontSize={20} />
      </Enter>
      <div style={{ flex: 1 }}>
        <Enter delay={250}>
          <Card tone="good">
            <div style={{ fontFamily: MONO, fontSize: 17, color: COLORS.green, marginBottom: 10 }}>
              refused
            </div>
            <div style={{ fontFamily: INTER, fontSize: 21, color: COLORS.white, lineHeight: 1.45 }}>
              Signs bytes for <b>false</b>.<br />
              Submits bytes for <b>true</b>.<br />
              Module refuses. Nothing moves.
            </div>
          </Card>
        </Enter>
        <Enter delay={520} style={{ marginTop: 26 }}>
          <Card tone="bad">
            <div style={{ fontFamily: MONO, fontSize: 17, color: COLORS.red, marginBottom: 10 }}>
              counterfactual
            </div>
            <div style={{ fontFamily: INTER, fontSize: 21, color: COLORS.white, lineHeight: 1.45 }}>
              Same drifted bytes.
              <br />
              No module.
              <br />
              Wrong branch runs. Money moves.
            </div>
          </Card>
        </Enter>
      </div>
    </div>
  </Frame>
);

/** S6 — Honest close. What is proven and what is not. */
export const S6: React.FC = () => (
  <Frame>
    <Enter delay={0}>
      <Label>Status</Label>
    </Enter>
    <div style={{ display: "flex", gap: 30 }}>
      <Enter delay={10} style={{ flex: 1 }}>
        <Card tone="good">
          <div style={{ fontFamily: MONO, fontSize: 19, color: COLORS.green, marginBottom: 16 }}>
            verified by running it
          </div>
          {STATUS_PROVEN.map((s) => (
            <div
              key={s}
              style={{ fontFamily: INTER, fontSize: 20, color: COLORS.white, lineHeight: 1.85 }}
            >
              {s}
            </div>
          ))}
        </Card>
      </Enter>
      <Enter delay={120} style={{ flex: 1 }}>
        <Card tone="bad">
          <div style={{ fontFamily: MONO, fontSize: 19, color: COLORS.red, marginBottom: 16 }}>
            not done
          </div>
          {STATUS_NOT.map((s) => (
            <div
              key={s}
              style={{ fontFamily: INTER, fontSize: 20, color: COLORS.offWhite, lineHeight: 1.85 }}
            >
              {s}
            </div>
          ))}
        </Card>
      </Enter>
    </div>

    <Enter delay={470} style={{ marginTop: 64, textAlign: "center" }}>
      <GlowText size={92} weight={800} mono>
        {BRAND.name}
      </GlowText>
      <div style={{ fontFamily: INTER, fontSize: 34, color: COLORS.accentBright, marginTop: 16 }}>
        {BRAND.tagline}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 24, color: COLORS.muted, marginTop: 26 }}>
        {BRAND.repo}
      </div>
    </Enter>
  </Frame>
);
