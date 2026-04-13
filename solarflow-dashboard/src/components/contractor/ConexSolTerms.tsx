import { useState } from "react";
import React from "react";

const TEAL = "#0D9B8E";
const TEAL_DARK = "#0A7A6E";
const TEAL_LIGHT = "#E1F5EE";
const TEAL_TEXT = "#085041";
const GOLD = "#F5A623";
const GOLD_BG = "#FFF8EC";
const GOLD_TEXT = "#7A4F00";
const DARK = "#1A2533";

// ─── Sub-components ──────────────────────────────────────────────────────────

interface SubLabelProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

function SubLabel({ children, style }: SubLabelProps) {
  return (
    <p style={{
      fontSize: 11,
      fontWeight: 600,
      color: TEAL,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      margin: "10px 0 5px",
      ...style,
    }}>
      {children}
    </p>
  );
}

interface BulletListProps {
  items: string[];
}

function BulletList({ items }: BulletListProps) {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {items.map((item, i) => (
        <li key={i} style={{
          fontSize: 12,
          color: "#555",
          lineHeight: 1.6,
          padding: "4px 0 4px 16px",
          position: "relative",
          borderBottom: i < items.length - 1 ? "0.5px solid #eee" : "none",
        }}>
          <span style={{
            position: "absolute",
            left: 3,
            top: 10,
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: TEAL,
            display: "inline-block",
          }} />
          {item}
        </li>
      ))}
    </ul>
  );
}

interface CertTagProps {
  label: string;
}

function CertTag({ label }: CertTagProps) {
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      background: TEAL_LIGHT,
      color: TEAL_TEXT,
      fontSize: 11,
      fontWeight: 600,
      padding: "3px 8px",
      borderRadius: 4,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: TEAL, display: "inline-block" }} />
      {label}
    </span>
  );
}

interface HighlightBoxProps {
  children: React.ReactNode;
}

function HighlightBox({ children }: HighlightBoxProps) {
  return (
    <div style={{
      background: GOLD_BG,
      borderLeft: `3px solid ${GOLD}`,
      padding: "8px 10px",
      fontSize: 12,
      color: GOLD_TEXT,
      lineHeight: 1.5,
      margin: "4px 0",
    }}>
      {children}
    </div>
  );
}

function InsuranceTable() {
  const rows = [
    ["General Liability", "$1M / $2M agg.", "ConexSol named additional insured"],
    ["Workers' Comp", "Statutory", "Required if Contractor has employees"],
    ["Commercial Auto", "$500K CSL", "Required for vehicles on job sites"],
    ["Tools & Equipment", "$25K min.", "Covers owned tools and equipment"],
    ["Errors & Omissions", "$500K/claim", "Recommended for design-build work"],
  ];
  return (
    <div style={{ overflowX: "auto" }}>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, marginTop: 6 }}>
      <thead>
        <tr>
          {["Coverage", "Minimum", "Notes"].map((h) => (
            <th key={h} style={{ background: DARK, color: "#fff", padding: "6px 8px", textAlign: "left", fontWeight: 500 }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(([cov, min, note], i) => (
          <tr key={i} style={{ background: i % 2 === 0 ? "#f7fafa" : "#fff" }}>
            <td style={{ padding: "6px 8px", borderBottom: "0.5px solid #eee", color: "#444" }}>{cov}</td>
            <td style={{ padding: "6px 8px", borderBottom: "0.5px solid #eee", color: "#444" }}>{min}</td>
            <td style={{ padding: "6px 8px", borderBottom: "0.5px solid #eee", color: "#444" }}>{note}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

function SunIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="3.5" fill="#fff" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42"
        stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const SECTIONS = [
  {
    title: "Independent contractor relationship",
    content: () => (
      <>
        <p className="bt">
          This Agreement is between ConexSol Applications LLC ("Company") and the
          individual or entity registered on the SolarOps platform ("Contractor").
          The Contractor is an independent business operator — not an employee or
          agent of the Company.
        </p>
        <SubLabel>Contractor acknowledges</SubLabel>
        <BulletList items={[
          "The Company does not control the manner or means by which field work is performed.",
          "Contractor sets their own hours and may accept or decline any work order without penalty.",
          "Contractor is responsible for all tools, equipment, and transportation.",
          "No employment relationship, benefits, or withholdings are created by this Agreement.",
        ]} />
      </>
    ),
  },
  {
    title: "Certifications & qualifications",
    content: () => (
      <>
        <SubLabel>Required credentials</SubLabel>
        <BulletList items={[
          "OSHA 10 or OSHA 30 Construction Safety (required within 90 days of onboarding).",
          "Fall Protection training per 29 CFR 1926.502 — mandatory for all rooftop work.",
          "NABCEP PV Installation Professional or equivalent (required for inverter commissioning).",
          "Valid driver's license and clean driving record.",
        ]} />
        <SubLabel>Brand certifications required</SubLabel>
        <p className="bt">Must be current and on file with the Company to receive related work orders:</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
          {["SolarEdge Certified Installer", "Enphase Installer (EIN)", "Tesla Powerwall Certified"].map((c) => (
            <CertTag key={c} label={c} />
          ))}
        </div>
        <SubLabel style={{ marginTop: 12 }}>Prohibited activities</SubLabel>
        <BulletList items={[
          "Performing work outside the scope of the accepted work order.",
          "Subcontracting without prior written Company approval.",
          "Misrepresenting qualifications or scope of completed work.",
        ]} />
      </>
    ),
  },
  {
    title: "Scope of services",
    content: () => (
      <>
        <SubLabel>Rooftop panel work</SubLabel>
        <BulletList items={[
          "Panel installation, relocation, and replacement on residential and commercial rooftops.",
          "MLPE installation including microinverters and DC optimizers.",
          "Roof penetration, flashing, and waterproofing coordination.",
          "Array re-wiring, combiner box work, and string reconfiguration.",
        ]} />
        <SubLabel>Inverter services</SubLabel>
        <BulletList items={[
          "String, microinverter, and hybrid inverter replacement and commissioning.",
          "Firmware updates, remote monitoring config, and energy storage integration.",
          "Disconnect installation and AC/DC wiring per NEC and local AHJ requirements.",
        ]} />
        <SubLabel>Electrical & wiring</SubLabel>
        <BulletList items={[
          "Conduit installation, wire pulling, termination at combiner boxes and load centers.",
          "Metering, CT installation, and energy monitoring device configuration.",
          "Rapid Shutdown system installation and testing.",
        ]} />
      </>
    ),
  },
  {
    title: "Safety requirements",
    content: () => (
      <>
        <HighlightBox>
          Rooftop and electrical work carries serious risks. Contractor assumes full
          responsibility for on-site safety. Violations may result in immediate
          suspension and platform removal.
        </HighlightBox>
        <SubLabel style={{ marginTop: 10 }}>Required PPE</SubLabel>
        <BulletList items={[
          "Full fall-protection harness, lanyard, and anchor system for rooftop work.",
          "Non-conductive, slip-resistant footwear (ASTM F2413).",
          "Electrical-rated gloves (min. Class 0 residential / Class 2 commercial).",
          "Arc flash PPE per NFPA 70E for energized equipment.",
        ]} />
        <SubLabel>Electrical safety</SubLabel>
        <BulletList items={[
          "All work must comply with current NEC and local amendments.",
          "Lockout/Tagout (LOTO) required before working on any energized system.",
          "Conductors must be verified de-energized before touching.",
        ]} />
        <SubLabel>Rooftop safety</SubLabel>
        <BulletList items={[
          "Inspect ladders and anchor points before ascending.",
          "Work prohibited during lightning, high winds (>25 mph), or icy conditions.",
          "Ground support required for rooftop work exceeding one story.",
        ]} />
        <SubLabel>Incident reporting</SubLabel>
        <p className="bt">
          Injuries, near-misses, or property damage must be reported within 4 hours via SolarOps.
        </p>
      </>
    ),
  },
  {
    title: "Insurance requirements",
    content: () => (
      <>
        <p className="bt">
          Proof of insurance must be submitted before the first work order and upon each renewal.
        </p>
        <InsuranceTable />
      </>
    ),
  },
  {
    title: "Work orders & platform conduct",
    content: () => (
      <>
        <SubLabel>Accepting work orders</SubLabel>
        <BulletList items={[
          "Offered first-available. Acceptance is a binding commitment to perform the service.",
          "Cancellation within 24 hours of scheduled date may result in platform penalties.",
          "Repeated cancellations result in reduced priority or platform removal.",
        ]} />
        <SubLabel>Client standards</SubLabel>
        <BulletList items={[
          "Arrive within the scheduled window or communicate delays through the platform.",
          "Professional conduct and respectful communication required at all times.",
          "Contractors may not directly solicit clients for work outside the platform.",
          "All client data and site details are confidential.",
        ]} />
        <SubLabel>Prohibited activity</SubLabel>
        <BulletList items={[
          "Creating multiple accounts or misrepresenting identity.",
          "Manipulating ratings, reviews, or work order history.",
          "Sharing login credentials with unauthorized individuals.",
        ]} />
      </>
    ),
  },
  {
    title: "Compensation & payment",
    content: () => (
      <>
        <SubLabel>Payment schedule</SubLabel>
        <BulletList items={[
          "Payment processed within 7 business days following completion and client sign-off.",
          "Photos, completion checklist, and permit sign-off (if applicable) required first.",
          "Payment disputes must be submitted in writing within 30 days of completion.",
        ]} />
        <SubLabel>Deductions</SubLabel>
        <BulletList items={[
          "Rework costs due to Contractor error may be deducted from pending payments.",
          "Payment may be withheld pending resolution of open warranty claims or disputes.",
        ]} />
        <SubLabel>Tax responsibility</SubLabel>
        <p className="bt">
          Contractor is solely responsible for all applicable taxes. Company will issue IRS
          Form 1099-NEC to qualifying contractors. No withholding will be performed.
        </p>
      </>
    ),
  },
  {
    title: "Warranties & workmanship",
    content: () => (
      <>
        <p className="bt">Contractor warrants all work will be:</p>
        <BulletList items={[
          "Completed in a professional, workmanlike manner consistent with industry standards.",
          "Compliant with all codes, permits, and manufacturer installation requirements.",
          "Free from defects in workmanship for one (1) year from completion date.",
        ]} />
        <p className="bt" style={{ marginTop: 8 }}>
          Failure to honor warranty obligations may result in platform suspension and cost recovery.
        </p>
      </>
    ),
  },
  {
    title: "Liability & indemnification",
    content: () => (
      <>
        <HighlightBox>
          Company liability is limited to fees paid for the specific work order giving rise
          to the claim. Company is not liable for lost profits, consequential, or indirect damages.
        </HighlightBox>
        <p className="bt" style={{ marginTop: 8 }}>
          Contractor agrees to indemnify ConexSol Applications LLC from claims arising from:
        </p>
        <BulletList items={[
          "Performance of work under any work order.",
          "Bodily injury, property damage, or death caused by Contractor or subcontractors.",
          "Violation of applicable codes or permit requirements.",
          "Breach of any obligation under this Agreement.",
        ]} />
      </>
    ),
  },
  {
    title: "Termination & deactivation",
    content: () => (
      <>
        <SubLabel>Voluntary termination</SubLabel>
        <p className="bt">
          Either party may terminate with 14 days written notice. Contractor must complete
          accepted orders or coordinate reassignment.
        </p>
        <SubLabel>Immediate deactivation</SubLabel>
        <BulletList items={[
          "Safety violations, including working without required PPE.",
          "Certification or license revocation, or relevant criminal conviction.",
          "Fraud, misrepresentation, or material breach of this Agreement.",
          "Repeated no-shows, excessive cancellations, or client-harming conduct.",
          "Failure to maintain required insurance coverage.",
        ]} />
      </>
    ),
  },
  {
    title: "Dispute resolution",
    content: () => (
      <>
        <BulletList items={[
          "Informal: Written notice; responding party has 15 business days.",
          "Mediation: Non-binding, mutually agreed mediator, Miami-Dade County, FL.",
          "Arbitration: Binding, under AAA rules, Miami-Dade County, FL.",
        ]} />
        <p className="bt" style={{ marginTop: 8, fontWeight: 500 }}>
          Class action waiver: Contractor waives any right to participate in class action litigation.
        </p>
      </>
    ),
  },
  {
    title: "General provisions",
    content: () => (
      <BulletList items={[
        "Governing law: State of Florida, without regard to conflict of law provisions.",
        "Modifications: Company may modify Terms with platform notification. Continued use constitutes acceptance.",
        "Entire agreement: Supersedes all prior negotiations and representations.",
        "Severability: If any provision is unenforceable, remaining provisions stay in effect.",
      ]} />
    ),
  },
];

// ─── Main Component ───────────────────────────────────────────────────────────

interface ConexSolTermsProps {
  onAccept: () => void;
  onDecline?: () => void;
}

export default function ConexSolTerms({ onAccept, onDecline }: ConexSolTermsProps) {
  const [openSections, setOpenSections] = useState<Record<number, boolean>>({ 0: true });
  const [checked, setChecked] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const uniqueOpened = Object.keys(openSections).length;
  const progress = Math.min(100, Math.round((uniqueOpened / SECTIONS.length) * 100));

  function toggleSection(i: number) {
    setOpenSections((prev) => {
      const next = { ...prev };
      if (next[i]) delete next[i];
      else next[i] = true;
      return next;
    });
  }

  function handleAccept() {
    setAccepted(true);
    if (onAccept) onAccept();
  }

  const styles: Record<string, React.CSSProperties> = {
    wrapper: {
      maxWidth: 660,
      margin: "0 auto",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      color: "#1a1a1a",
    },
    header: {
      padding: "14px 16px",
      borderBottom: "0.5px solid #e5e5e5",
      display: "flex",
      alignItems: "center",
      gap: 12,
    },
    logoMark: {
      width: 36,
      height: 36,
      borderRadius: 8,
      background: TEAL,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    headerTitle: { fontSize: 14, fontWeight: 600, color: "#111", margin: 0 },
    headerSub: { fontSize: 11, color: "#888", margin: "2px 0 0" },
    progressTrack: { height: 3, background: "#eee" },
    progressFill: { height: "100%", background: TEAL, transition: "width 0.3s", width: `${progress}%` },
    warnBanner: {
      margin: "12px 16px 0",
      padding: "8px 10px",
      background: GOLD_BG,
      borderLeft: `3px solid ${GOLD}`,
      fontSize: 12,
      color: GOLD_TEXT,
      lineHeight: 1.5,
    },
    toc: {
      margin: "12px 16px 0",
      border: "0.5px solid #e5e5e5",
      borderRadius: 10,
      overflow: "hidden",
    },
    tocHeader: {
      padding: "7px 12px",
      fontSize: 11,
      fontWeight: 600,
      color: "#888",
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      borderBottom: "0.5px solid #e5e5e5",
      background: "#f8f8f8",
    },
    tocRow: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "7px 12px",
      fontSize: 12,
      color: "#555",
      borderBottom: "0.5px solid #e5e5e5",
      cursor: "pointer",
    },
    tocNum: {
      width: 20,
      height: 20,
      borderRadius: "50%",
      background: TEAL,
      color: "#fff",
      fontSize: 10,
      fontWeight: 600,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    content: { margin: "0 16px" },
    section: {
      marginTop: 10,
      border: "0.5px solid #e5e5e5",
      borderRadius: 10,
      overflow: "hidden",
    },
    sectionHeader: {
      padding: "10px 14px",
      display: "flex",
      alignItems: "center",
      gap: 10,
      cursor: "pointer",
      background: "#fff",
      userSelect: "none",
    },
    sectionNum: {
      width: 26,
      height: 26,
      borderRadius: 6,
      background: TEAL,
      color: "#fff",
      fontSize: 11,
      fontWeight: 600,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    sectionTitle: { flex: 1, fontSize: 13, fontWeight: 500, color: "#111" },
    chevron: { fontSize: 10, color: "#aaa" },
    sectionBody: {
      padding: "12px 14px",
      borderTop: "0.5px solid #e5e5e5",
      background: "#fff",
    },
    footer: {
      position: "sticky",
      bottom: 0,
      background: "#fff",
      borderTop: "0.5px solid #e5e5e5",
      padding: "12px 16px",
      marginTop: 12,
    },
    checkRow: {
      display: "flex",
      alignItems: "flex-start",
      gap: 8,
      marginBottom: 8,
    },
    acceptBtn: {
      width: "100%",
      padding: "10px 0",
      background: accepted ? TEAL_DARK : checked ? TEAL : "#ccc",
      color: "#fff",
      border: "none",
      borderRadius: 8,
      fontSize: 13,
      fontWeight: 600,
      cursor: checked && !accepted ? "pointer" : "not-allowed",
      opacity: checked || accepted ? 1 : 0.5,
      transition: "background 0.2s",
    },
    version: { textAlign: "center", fontSize: 10, color: "#bbb", marginTop: 6 },
  };

  return (
    <div style={styles.wrapper}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.logoMark}><SunIcon /></div>
        <div>
          <p style={styles.headerTitle}>Contractor Agreement & Terms of Service</p>
          <p style={styles.headerSub}>ConexSol Applications LLC — SolarOps Platform · v2026.1</p>
        </div>
      </div>

      {/* Progress bar */}
      <div style={styles.progressTrack}>
        <div style={styles.progressFill} />
      </div>

      {/* Warning banner */}
      <div style={styles.warnBanner}>
        Read this agreement carefully before accepting work orders through SolarOps.
        By accepting a work order you agree to be bound by these terms.
      </div>

      {/* Table of contents */}
      <div style={styles.toc}>
        <div style={styles.tocHeader}>Sections</div>
        {SECTIONS.map((s, i) => (
          <div
            key={i}
            style={{ ...styles.tocRow, borderBottom: i < SECTIONS.length - 1 ? "0.5px solid #e5e5e5" : "none" }}
            onClick={() => toggleSection(i)}
          >
            <span style={styles.tocNum}>{i + 1}</span>
            {s.title}
          </div>
        ))}
      </div>

      {/* Sections */}
      <div style={styles.content}>
        {SECTIONS.map((s, i) => {
          const isOpen = !!openSections[i];
          const Body = s.content;
          return (
            <div key={i} style={styles.section}>
              <div style={styles.sectionHeader} onClick={() => toggleSection(i)}>
                <div style={styles.sectionNum}>{i + 1}</div>
                <div style={styles.sectionTitle}>{s.title}</div>
                <span style={{ ...styles.chevron, transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
              </div>
              {isOpen && (
                <div style={styles.sectionBody}>
                  <Body />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Accept footer */}
      <div style={styles.footer}>
        <div style={styles.checkRow}>
          <input
            type="checkbox"
            id="tc-check"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            disabled={accepted}
            style={{ width: 15, height: 15, marginTop: 1, accentColor: TEAL, flexShrink: 0, cursor: accepted ? "not-allowed" : "pointer" }}
          />
          <label htmlFor="tc-check" style={{ fontSize: 12, color: "#555", lineHeight: 1.5, cursor: accepted ? "default" : "pointer" }}>
            I have read and understand the Contractor Agreement & Terms of Service
          </label>
        </div>
        <button
          style={styles.acceptBtn}
          disabled={!checked || accepted}
          onClick={handleAccept}
        >
          {accepted ? "Agreement accepted ✓" : "Accept & continue"}
        </button>
        {onDecline && !accepted && (
          <button
            onClick={onDecline}
            style={{ width: "100%", marginTop: 6, padding: "8px 0", background: "transparent", border: "0.5px solid #ddd", borderRadius: 8, fontSize: 12, color: "#888", cursor: "pointer" }}
          >
            Decline
          </button>
        )}
        <p style={styles.version}>ConexSol Applications LLC · Miami, FL · v2026.1</p>
      </div>
    </div>
  );
}
