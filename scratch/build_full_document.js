const fs = require('fs');
const path = require('path');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  WidthType,
  ShadingType,
  Header,
  Footer,
  PageNumber,
  NumberFormat
} = require('docx');

// --- Color Palette Constants ---
const PRIMARY_COLOR = "0F172A";   // Deep Slate 900
const SECONDARY_COLOR = "0284C7"; // Bright Sky Blue 600
const DARK_SLATE = "334155";      // Slate 700
const LIGHT_BG = "F8FAFC";        // Slate 50
const ALT_ROW_BG = "F1F5F9";      // Slate 100
const CALLOUT_BG = "F0F9FF";      // Sky 50
const CALLOUT_BORDER = "0284C7";  // Sky 600
const WHITE = "FFFFFF";

// --- Helper Styling Functions ---

function createDocumentTitle(titleText, subtitleText) {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 120 },
      children: [
        new TextRun({
          text: titleText,
          bold: true,
          size: 48, // 24pt
          color: PRIMARY_COLOR,
          font: "Arial"
        })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 400 },
      children: [
        new TextRun({
          text: subtitleText,
          italic: true,
          size: 26, // 13pt
          color: SECONDARY_COLOR,
          font: "Arial"
        })
      ]
    })
  ];
}

function createHeading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 160 },
    children: [
      new TextRun({
        text: text,
        bold: true,
        size: 32, // 16pt
        color: PRIMARY_COLOR,
        font: "Arial"
      })
    ]
  });
}

function createHeading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [
      new TextRun({
        text: text,
        bold: true,
        size: 26, // 13pt
        color: SECONDARY_COLOR,
        font: "Arial"
      })
    ]
  });
}

function createHeading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    children: [
      new TextRun({
        text: text,
        bold: true,
        size: 22, // 11pt
        color: DARK_SLATE,
        font: "Arial"
      })
    ]
  });
}

function createBodyParagraph(text, options = {}) {
  const runs = typeof text === 'string' 
    ? [new TextRun({ text, size: 22, color: "333333", font: "Calibri", ...options })]
    : text;
  
  return new Paragraph({
    spacing: { before: 60, after: 120, line: 276 },
    children: runs
  });
}

function createBulletPoint(boldPrefix, text) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { before: 40, after: 80, line: 260 },
    children: [
      new TextRun({ text: boldPrefix + " ", bold: true, size: 22, color: PRIMARY_COLOR, font: "Calibri" }),
      new TextRun({ text: text, size: 22, color: "333333", font: "Calibri" })
    ]
  });
}

function createCalloutBox(title, text) {
  const cell = new TableCell({
    shading: { fill: CALLOUT_BG, type: ShadingType.CLEAR },
    borders: {
      left: { style: BorderStyle.SINGLE, size: 24, color: CALLOUT_BORDER },
      top: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE }
    },
    margins: { top: 140, bottom: 140, left: 200, right: 200 },
    children: [
      new Paragraph({
        spacing: { before: 40, after: 60 },
        children: [
          new TextRun({ text: "💡 " + title, bold: true, size: 22, color: SECONDARY_COLOR, font: "Arial" })
        ]
      }),
      new Paragraph({
        spacing: { before: 0, after: 40, line: 260 },
        children: [
          new TextRun({ text: text, size: 21, italic: true, color: DARK_SLATE, font: "Calibri" })
        ]
      })
    ]
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: [cell] })]
  });
}

function createSlideCard(slideNumber, title, bulletPoints, speakerScript, keyTakeaway) {
  const children = [];

  // Slide Header
  children.push(createHeading2(`Slide ${slideNumber}: ${title}`));

  // Bullet points
  bulletPoints.forEach(bp => {
    children.push(createBulletPoint(bp.prefix, bp.text));
  });

  // Speaker Script Box
  const scriptCell = new TableCell({
    shading: { fill: LIGHT_BG, type: ShadingType.CLEAR },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" },
      left: { style: BorderStyle.SINGLE, size: 18, color: SECONDARY_COLOR },
      right: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E1" }
    },
    margins: { top: 120, bottom: 120, left: 160, right: 160 },
    children: [
      new Paragraph({
        spacing: { before: 40, after: 60 },
        children: [
          new TextRun({ text: "🗣️ Speaker Presentation Script (What to Say):", bold: true, size: 21, color: PRIMARY_COLOR, font: "Arial" })
        ]
      }),
      new Paragraph({
        spacing: { before: 0, after: 40, line: 260 },
        children: [
          new TextRun({ text: `"${speakerScript}"`, italic: true, size: 20, color: "1E293B", font: "Calibri" })
        ]
      })
    ]
  });

  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: [scriptCell] })]
  }));

  if (keyTakeaway) {
    children.push(new Paragraph({
      spacing: { before: 80, after: 200 },
      children: [
        new TextRun({ text: "Key Takeaway: ", bold: true, size: 20, color: SECONDARY_COLOR, font: "Arial" }),
        new TextRun({ text: keyTakeaway, italic: true, size: 20, color: "475569", font: "Calibri" })
      ]
    }));
  }

  return children;
}

function createTable(headers, rows) {
  const headerCells = headers.map(h => new TableCell({
    shading: { fill: PRIMARY_COLOR, type: ShadingType.CLEAR },
    margins: { top: 120, bottom: 120, left: 120, right: 120 },
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          new TextRun({ text: h.text, bold: true, size: 20, color: WHITE, font: "Arial" })
        ]
      })
    ],
    width: h.width ? { size: h.width, type: WidthType.PERCENTAGE } : undefined
  }));

  const tableRows = [
    new TableRow({ children: headerCells, tableHeader: true })
  ];

  rows.forEach((row, idx) => {
    const bg = idx % 2 === 0 ? LIGHT_BG : ALT_ROW_BG;
    const cells = row.map((cellText, colIdx) => new TableCell({
      shading: { fill: bg, type: ShadingType.CLEAR },
      margins: { top: 100, bottom: 100, left: 120, right: 120 },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
        left: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" },
        right: { style: BorderStyle.SINGLE, size: 4, color: "E2E8F0" }
      },
      children: [
        new Paragraph({
          spacing: { line: 240 },
          children: [
            new TextRun({ text: cellText, size: 20, color: "333333", font: "Calibri" })
          ]
        })
      ],
      width: headers[colIdx] && headers[colIdx].width ? { size: headers[colIdx].width, type: WidthType.PERCENTAGE } : undefined
    }));
    tableRows.push(new TableRow({ children: cells }));
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: tableRows
  });
}

// --- Main Document Assembling Function ---

async function buildDocument() {
  console.log("Assembling Fitzen Master Presentation & Technical Document...");

  const sections = [];

  const docChildren = [];

  // Title Section
  docChildren.push(...createDocumentTitle(
    "FITZEN — AI SPORTS TALENT ASSESSMENT PLATFORM",
    "Master Project Specification, User Flow Architecture, Technology Matrix & Presentation Guide"
  ));

  // Callout Overview
  docChildren.push(createCalloutBox(
    "Executive Overview",
    "Fitzen is an end-to-end, privacy-preserving remote sports talent identification platform. It transforms standard smartphone/laptop cameras into verified sports-science testing labs using on-device 3D AI pose estimation, uncertainty-aware biomechanics, cryptographic WebCrypto signing, and transparent athletic potential scoring."
  ));

  docChildren.push(new Paragraph({ spacing: { after: 200 } }));

  // SECTION 1: PROJECT VISION & OBJECTIVES
  docChildren.push(createHeading1("1. Project Vision, Objectives & Core Problem Statement"));

  docChildren.push(createHeading2("1.1 The Core Problem in Remote Sports Talent Discovery"));
  docChildren.push(createBodyParagraph("In traditional sports talent identification, evaluating athletic capability (such as vertical jump height, explosive leg power, push-up muscular endurance, and squat movement quality) requires physical presence at elite training hubs, expensive laboratory force plates, laser jump mats, or high-speed motion capture cameras costing thousands of dollars."));
  docChildren.push(createBodyParagraph("This creates three major industry bottlenecks:"));
  docChildren.push(createBulletPoint("Geographic & Financial Exclusion:", "Talented youth athletes in rural or economically underprivileged regions are systematically overlooked because they cannot access physical scouting combines or expensive hardware."));
  docChildren.push(createBulletPoint("Pervasive Data Fraud & Self-Reporting Bias:", "When athletes submit video footage or self-reported metrics remotely, video tampering, camera angle manipulation, incomplete repetitions, and fabricated jump scores destroy scout trust."));
  docChildren.push(createBulletPoint("Lack of Scientific Precision:", "Most existing mobile apps output raw pixel estimations without confidence intervals, ignoring camera frame-rate quantization, sensor jitter, or biological age vs. chronological age growth spurts."));

  docChildren.push(createHeading2("1.2 What Fitzen Wants to Achieve (Core Objectives)"));
  docChildren.push(createBodyParagraph("Fitzen solves these fundamental challenges by building a zero-cost, serverless-capable, client-side motion lab that turns any device camera into a trustworthy athletic assessment hub. Its key objectives are:"));
  docChildren.push(createBulletPoint("1. On-Device 3D Kinematics without Hardware:", "Extract sub-frame precise kinematic parameters (flight time, joint angles, landing asymmetry, relative peak power) using standard webcams without physical jump mats or external sensors."));
  docChildren.push(createBulletPoint("2. Immutable Cryptographic Trust:", "Sign every assessment payload at capture time on the athlete's device using WebCrypto ECDSA P-256 signatures, hash-chained audit trails, and multi-layer anti-cheat engines so scouts can verify authenticity with 100% certainty."));
  docChildren.push(createBulletPoint("3. Privacy-First & Offline-First Operation:", "Ensure video frames never leave the athlete's local browser device (only pose landmark vectors are processed), enabling seamless offline assessment recording in remote fields with auto-sync when reconnected."));
  docChildren.push(createBulletPoint("4. Biological Potential & Explainable AI:", "Differentiate raw physical performance from biological growth spurts using Mirwald PHV offset modeling, providing human-readable, fully attributable scoring and AI coaching briefs."));

  docChildren.push(createHeading2("1.3 Target Audience & Real-World Use Cases"));
  docChildren.push(createTable(
    [
      { text: "Target Stakeholder", width: 25 },
      { text: "Primary Use Case / Workflow", width: 45 },
      { text: "Key Value Delivered", width: 30 }
    ],
    [
      ["Grassroots Athletes", "Perform live/video assessments on personal phones, track biological potential, earn badges, export signed digital resumes.", "Free, lab-grade performance testing & global scout visibility without traveling."],
      ["Talent Scouts & Academies", "Receive cryptographically verified athletic resumes, filter global leaderboards by power and height, inspect tamper logs.", "Eliminates fraudulent claims; unlocks hidden talent pools globally with zero travel cost."],
      ["Coaches & Physical Educators", "Manage team rosters, monitor squad trendlines with 95% confidence bands, identify form asymmetries.", "Automated squad biomechanics monitoring and AI-synthesized coaching advice."],
      ["Sports Federations & Schools", "Conduct large-scale, standardized athletic combines across thousands of students offline in remote areas.", "Scalable, zero-hardware talent discovery pipeline."]
    ]
  ));

  docChildren.push(new Paragraph({ spacing: { after: 200 } }));

  // SECTION 2: USER FLOW ARCHITECTURE
  docChildren.push(createHeading1("2. End-to-End User Flow Architecture"));

  docChildren.push(createHeading2("2.1 System User Roles & Security Access Matrix"));
  docChildren.push(createBodyParagraph("Fitzen enforces strict Role-Based Access Control (RBAC) powered by stateless JWT authentication and WebCrypto key pairs:"));
  docChildren.push(createBulletPoint("Athlete Role:", "Access to personal dashboard, 3D holographic muscle model, multi-movement assessment suite (Live Camera, Upload Video, Guided Demo), history tracking, badges, notifications, and verifiable digital resume export."));
  docChildren.push(createBulletPoint("Coach Role:", "Access to squad roster overview, individual athlete drill-downs, team performance comparison, 95% confidence trend graphs, and squad AI coaching briefs."));
  docChildren.push(createBulletPoint("Admin Role:", "Platform-wide system health monitoring, database user management, global audit log verification, and tamper detection telemetry."));

  docChildren.push(createHeading2("2.2 Step-by-Step Athlete User Journey"));
  docChildren.push(createBodyParagraph("The complete athlete user journey is structured into 8 seamless steps:"));

  docChildren.push(createBulletPoint("Step 1: Onboarding & Key Generation —", "The athlete registers/logs in via scrypt-hashed credentials. Upon first session initialization, WebCrypto silently generates an asymmetric ECDSA P-256 key pair in browser local storage. The public key is registered with the backend."));
  docChildren.push(createBulletPoint("Step 2: Assessment Selection —", "The athlete chooses an assessment discipline from the dashboard: Vertical Jump (explosive power), Push-Ups (upper body endurance), or Squats (lower body strength & ROM)."));
  docChildren.push(createBulletPoint("Step 3: Capture Mode Selection —", "The athlete selects one of three flexible capture modes: (a) Live Camera (real-time webcam overlay), (b) Upload Video (frame-by-frame 30 FPS deterministic seeking), or (c) Guided Demo (synthesized 3D jump physics simulation)."));
  docChildren.push(createBulletPoint("Step 4: Live Execution & Real-Time Pose HUD —", "During capture, MediaPipe Pose tracks 33 3D landmarks in real time. The canvas renders active joint angle badges (e.g., knee flexion angle, elbow angle) and live posture indicators directly on the video feed. Video stays strictly on-device."));
  docChildren.push(createBulletPoint("Step 5: Processing & Anti-Cheat Pipeline —", "Raw landmarks pass through a 5-point Savitzky-Golay quadratic filter. The Deterministic Finite State Machine (FSM) validates repetition depth (elbows <= 90 deg, knees <= 95 deg) and flags asymmetry (>15 deg) or half-reps. Vertical jump computes flight time via hip trajectory parabola fit fused with height scaling."));
  docChildren.push(createBulletPoint("Step 6: Cryptographic Signing & Hash Chaining —", "Metrics are stringified into a canonical JSON payload, hashed with SHA-256, and signed by the device's WebCrypto ECDSA private key. An append-only audit hash chain links the capture event to previous device assessments."));
  docChildren.push(createBulletPoint("Step 7: Offline Queuing & Auto-Sync —", "If offline, the signed payload is stored in IndexedDB (`idb`). When network connectivity is restored, the sync engine background-flushes payloads to the backend API with server-side idempotency."));
  docChildren.push(createBulletPoint("Step 8: Dashboard Analytics & Digital Resume Export —", "Results update the dashboard instantly: updating the 3D Holographic Human Model, calculating Mirwald biological maturity potential, unlocking 50-badge achievements, rendering trend lines with 95% CIs, generating AI coaching briefs, and allowing 1-click signed `.json` Digital Resume export."));

  docChildren.push(createHeading2("2.3 Step-by-Step Coach & Admin Workflows"));
  docChildren.push(createBulletPoint("Coach Roster Workflow:", "Coaches log into the team dashboard -> View roster performance cards -> Drill down into individual athlete profiles -> Inspect flight time vs hip displacement confidence bands -> Review AI-synthesized squad coaching recommendations."));
  docChildren.push(createBulletPoint("Admin Verification Workflow:", "Admins monitor system telemetry -> Review automated tamper flags (hash mismatch, signature forgery, chain break, or physical implausibility like 100cm jump with 0.1s flight time) -> Manage user access roles."));

  docChildren.push(new Paragraph({ spacing: { after: 200 } }));

  // SECTION 3: TECHNOLOGIES & TOOLS MATRIX
  docChildren.push(createHeading1("3. Complete Technologies & Tools Matrix"));
  docChildren.push(createBodyParagraph("Fitzen is constructed as a modern TypeScript monorepo (`npm` workspaces) with zero native dependencies, ensuring fast execution, easy deployment, and full cross-platform compatibility."));

  docChildren.push(createHeading2("3.1 Technology Stack & Functional Breakdown"));
  docChildren.push(createTable(
    [
      { text: "Technology / Tool", width: 22 },
      { text: "Layer / Category", width: 18 },
      { text: "Exact Function in Fitzen", width: 38 },
      { text: "Key Metric / Feature", width: 22 }
    ],
    [
      ["React 18 + Vite", "Frontend Framework", "Powers the Single Page Application (SPA) with lightning-fast HMR and modular UI rendering.", "Sub-100ms route transitions & client state management."],
      ["Vanilla CSS (Tokens + HSL)", "Styling & Design System", "Hand-crafted cybernetic dark/light theme, custom glassmorphism, zero UI library overhead.", "60 FPS animations, CSS custom properties."],
      ["MediaPipe Pose (Google)", "Computer Vision / AI", "Extracts 33 3D spatial landmarks from webcam video feeds in real time on the client CPU/GPU.", "On-device, zero video transmission, privacy-first."],
      ["HTML5 Canvas & WebGL", "3D Graphics & HUD", "Renders the 3D Holographic Human Muscle Model, live joint angle badges, and force-time jump curves.", "Interactive anatomical muscle diagnostic HUD."],
      ["IndexedDB (`idb`)", "Offline Storage", "Stores signed assessment payloads, device cryptographic keys, and cached dashboards offline.", "100% offline-first capability with auto-sync."],
      ["Node.js (Native TS)", "Backend Runtime", "Runs the lightweight REST API backend without bulky external frameworks.", "Uses native Node v22+ TypeScript execution."],
      ["SQLite (`node:sqlite`)", "Database Engine", "Stores user profiles, signed assessment logs, audit trails, and badges in WAL mode.", "Zero native binary dependencies, transactional FKs."],
      ["WebCrypto API", "Security / Cryptography", "Generates ECDSA P-256 key pairs, creates canonical SHA-256 hashes, and signs assessment metrics.", "Asymmetric cryptographic proof of authenticity."],
      ["Savitzky-Golay Filter", "Kinematics Math Engine", "5-point quadratic polynomial filter that removes camera jitter without adding phase delay.", "Smooth 3D landmark trajectories."],
      ["Sayers & Mirwald Engines", "Sports Science Math", "Calculates peak power (W/kg), flight-time jump height (h = g*t^2 / 8), and biological maturity offset.", "Uncertainty-aware 95% CIs and potential scores."],
      ["Deterministic FSM Engine", "Anti-Cheat Fraud Control", "4-state finite state machine enforcing depth thresholds (elbows<=90°, knees<=95°) and symmetry.", "Rejects half-reps and invalid posture in real-time."],
      ["Anthropic Claude API", "AI Coaching Agent", "Composes biomechanical stats and potential scores into natural-language coaching briefs.", "Upgrades coaching tips; degrades offline gracefully."],
      ["Vitest & JSDOM", "Testing & QA", "Executes 83+ automated test cases spanning physics formulas, crypto tamper checks, API, and UI.", "100% engine mathematical & cryptographic test pass."]
    ]
  ));

  docChildren.push(createHeading2("3.2 Detailed Scientific Algorithms & Research Mechanics"));
  docChildren.push(createBulletPoint("1. 3D Joint Angle Euclidean Math:", "Calculated in spatial 3D Euclidean space across landmarks A, B, C using vector dot products: theta = arccos((BA . BC) / (||BA|| * ||BC||)). Accurately tracks dynamic knee, hip, and elbow flexion."));
  docChildren.push(createBulletPoint("2. Inverse-Variance Height Fusion:", "Merges two independent jump estimators: flight time (parabolic hip curve fit) and hip displacement scaled by stature. Weighted by inverse variance to output an honest 95% confidence interval."));
  docChildren.push(createBulletPoint("3. Mirwald Biological Maturity Offset:", "Estimates years from Peak Height Velocity (PHV) based on leg length, sitting height, stature, mass, and age. Separates biological growth spurts from genuine athletic explosiveness."));
  docChildren.push(createBulletPoint("4. Layered Cryptographic Audit Engine:", "Ingests payloads and evaluates 4 verification gates: (1) Canonical Hash Match, (2) WebCrypto ECDSA Signature Validity, (3) Append-Only Audit Hash Chain Integrity, and (4) Physical Plausibility Screening (flags impossible numbers)."));

  docChildren.push(new Paragraph({ spacing: { after: 200 } }));

  // SECTION 4: PRESENTATION DECK & SPEAKER SCRIPT
  docChildren.push(createHeading1("4. Presentation Deck & Speaker Script (10-Slide Structure)"));
  docChildren.push(createBodyParagraph("This section provides the slide-by-slide content, presentation layout, bullet points, speaker script (exact words to speak), and key takeaways to deliver a presentation."));

  // Slide 1
  docChildren.push(...createSlideCard(
    1,
    "Title & Project Introduction",
    [
      { prefix: "Project Name:", text: "Fitzen — AI Sports Talent Assessment Platform." },
      { prefix: "Presenter / Core Team:", text: "Engineering & Sports Science Development Team." },
      { prefix: "Core Tagline:", text: "Turning any smartphone or laptop into a verified sports-science lab." },
      { prefix: "Key Innovation:", text: "On-device 3D pose kinematics, cryptographic WebCrypto signatures, FSM anti-cheat engine, and biological potential scoring." }
    ],
    "Good morning everyone. Today, I am thrilled to introduce Fitzen — a revolutionary AI-powered sports talent assessment platform. Fitzen is designed to democratize sports science by turning standard smartphone and laptop cameras into verified, lab-grade athletic testing centers. With zero hardware dependencies, Fitzen measures vertical jump, push-ups, and squats with sub-frame precision, signs every result cryptographically at capture time, and predicts future athletic potential — operating completely offline-first.",
    "Fitzen brings laboratory-grade athletic evaluation to every athlete on Earth using existing devices."
  ));

  // Slide 2
  docChildren.push(...createSlideCard(
    2,
    "The Problem — Bottlenecks in Remote Talent Scouting",
    [
      { prefix: "High Hardware Costs:", text: "Traditional jump mats, force plates, and optical tracking systems cost thousands of dollars." },
      { prefix: "Geographic Barrier:", text: "Promising grassroots athletes in rural regions rarely get discovered by scouts." },
      { prefix: "Pervasive Data Fraud:", text: "Remote video submissions and self-reported scores are easily tampered with or fabricated." },
      { prefix: "Lack of Scientific Rigor:", text: "Most mobile apps rely on crude pixel estimation without confidence intervals or growth sput modeling." }
    ],
    "Before building Fitzen, we identified three critical flaws in sports talent identification. First, physical combines require thousands of dollars in specialized equipment like jump mats and force plates, excluding rural and underprivileged athletes. Second, when scouts try to accept remote video submissions, they face widespread fraud — edited videos, cheated reps, and fake numbers. Third, existing apps produce noisy, unverified numbers that ignore camera jitter and biological growth spurts. Fitzen was built to solve all three problems at once.",
    "Hardware costs and remote fraud create an unfair barrier that Fitzen completely eliminates."
  ));

  // Slide 3
  docChildren.push(...createSlideCard(
    3,
    "The Solution — Fitzen AI Motion Intelligence Platform",
    [
      { prefix: "On-Device 3D Pose Tracking:", text: "MediaPipe Pose extracts 33 3D joint landmarks in real time on the user's CPU/GPU." },
      { prefix: "Zero Video Transmission:", text: "100% privacy-preserving — video frames never leave the phone; only landmark coordinate vectors are processed." },
      { prefix: "Cryptographic Tamper Proofing:", text: "WebCrypto ECDSA P-256 signs every metric payload at capture time." },
      { prefix: "Offline-First Engine:", text: "IndexedDB queues assessments offline in remote fields and auto-syncs when online." }
    ],
    "Fitzen solves these bottlenecks through an elegant, modern architecture. Using MediaPipe 3D pose landmarker, Fitzen processes movement on the athlete's device in real time. Crucially, the camera video NEVER leaves the device, protecting athlete privacy. The extracted pose data is filtered using physics algorithms, validated by anti-cheat state machines, signed cryptographically, and queued in IndexedDB. Athletes can test in offline stadiums, and their verified results automatically sync when back online.",
    "Fitzen combines on-device AI, privacy, cryptographic trust, and offline reliability in one unified app."
  ));

  // Slide 4
  docChildren.push(...createSlideCard(
    4,
    "Scientific Foundation & Biomechanical Engines",
    [
      { prefix: "Savitzky-Golay 5-Point Filter:", text: "Polynomial smoothing algorithm removes landmark jitter without introducing phase lag." },
      { prefix: "Flight-Time Jump Kinematics:", text: "Parabolic hip trajectory fitting calculates vertical height via h = (g * t_flight^2) / 8." },
      { prefix: "Sayers Peak Power Formula:", text: "Computes relative explosive power in W/kg: Power = 60.7(Height) + 45.3(Mass) - 2055." },
      { prefix: "Mirwald PHV Maturity Model:", text: "Estimates biological age vs chronological age to evaluate genuine athletic potential headroom." }
    ],
    "At the heart of Fitzen are four rigorous mathematical engines. First, a 5-point Savitzky-Golay filter smooths raw landmark jitter without introducing lag. Second, vertical jump height is computed using parabolic least-squares flight-time analysis fused with height scaling, yielding an honest 95% confidence interval. Third, relative peak power in Watts per kilogram is calculated via the Sayers equation. Finally, the Mirwald biological maturity model evaluates Peak Height Velocity, allowing coaches to distinguish early bloomers from true athletic potential.",
    "Every metric in Fitzen is rooted in peer-reviewed biomechanical science and rigorous physics equations."
  ));

  // Slide 5
  docChildren.push(...createSlideCard(
    5,
    "End-to-End User Flow & Athlete Journey",
    [
      { prefix: "1. Device Key Initialization:", text: "WebCrypto generates a unique ECDSA key pair stored securely in browser storage." },
      { prefix: "2. Capture Mode Choice:", text: "Choose Live Camera, Video File Upload (30 FPS seeking), or Guided 3D Demo." },
      { prefix: "3. Real-Time HUD Overlay:", text: "Live canvas draws active joint angle badges (flexion degrees) and posture guides." },
      { prefix: "4. Processing & Auto-Sync:", text: "FSM validates reps, WebCrypto signs payload, IndexedDB queues for server sync." }
    ],
    "Let us walk through the user flow. When an athlete opens Fitzen, their device silently generates an asymmetric cryptographic key pair. They select their assessment — for example, Push-Ups. They can record live with their webcam, upload a video file, or run a guided demo. During live capture, the canvas overlays real-time joint angle badges directly on their body. Once completed, the FSM verifies form, the payload is signed, queued offline, synced to the server, and displayed on their dashboard.",
    "The user flow is frictionless, visually interactive, and mathematically verified at every single step."
  ));

  // Slide 6
  docChildren.push(...createSlideCard(
    6,
    "Multi-Assessment Suite & FSM Anti-Cheat Engine",
    [
      { prefix: "Vertical Jump Suite:", text: "Tracks flight time, takeoff velocity, countermovement depth, and 95% confidence interval." },
      { prefix: "Push-Up Assessment:", text: "4-State FSM enforces elbow flexion <= 90° depth and flags bilateral arm asymmetry (>15°)." },
      { prefix: "Squat Assessment:", text: "Enforces knee flexion <= 95° parallel depth, lateral valgus tracking, and rejects half-reps." },
      { prefix: "Anti-Cheat Rejection:", text: "Reverses movement prior to full depth immediately triggers REJECTED_REP flags." }
    ],
    "Fitzen features a multi-movement assessment suite covering Vertical Jump, Push-Ups, and Squats. To stop cheating, we developed a 4-state Deterministic Finite State Machine. For Push-Ups, the FSM requires chest descent until elbow flexion reaches 90 degrees or lower. If an athlete tries to do a 'half-rep' by pushing up early, the state machine instantly rejects the repetition as 'INCOMPLETE_ROM'. It also measures left-versus-right arm symmetry to prevent lopsided form.",
    "The FSM engine acts as an unbiased digital judge that guarantees strict execution of form standards."
  ));

  // Slide 7
  docChildren.push(...createSlideCard(
    7,
    "Complete Technology Stack & Modular Monorepo",
    [
      { prefix: "Frontend Architecture:", text: "React 18, Vite, Vanilla CSS Design System (dark/light themes), WebGL Canvas 3D." },
      { prefix: "Backend Architecture:", text: "Node.js (native TS), SQLite (`node:sqlite`) in WAL mode with transactional schema." },
      { prefix: "Packages & Engines:", text: "Modular `@fitzen/engines` (Kinematics, Crypto, Potential, Gamification)." },
      { prefix: "Zero Native Dependencies:", text: "Built on standard Web APIs and native Node features for max portability." }
    ],
    "From an engineering perspective, Fitzen is organized as a clean TypeScript monorepo using npm workspaces. The frontend uses React 18 and Vite paired with a custom Vanilla CSS design system for 60 FPS performance. The backend is built on Node.js using the new native `node:sqlite` module in Write-Ahead Logging mode — requiring zero native C++ compilation modules! The domain engines live in a pure, portable TypeScript package used identically in both browser and server.",
    "Fitzen's architecture is lightweight, zero-dependency, ultra-fast, and built for scale."
  ));

  // Slide 8
  docChildren.push(...createSlideCard(
    8,
    "Cryptographic Verification & Verifiable Digital Resumes",
    [
      { prefix: "Asymmetric WebCrypto Signing:", text: "Every payload is signed with device-held WebCrypto ECDSA P-256 private key." },
      { prefix: "Canonical JSON Hashing:", text: "SHA-256 canonical stringification ensures deterministic tamper checking." },
      { prefix: "Append-Only Audit Hash Chains:", text: "Chains each assessment hash to prior tests, preventing payload deletion or insertion." },
      { prefix: "Exportable Signed Resume:", text: "Athletes can export a verified `.json` digital resume with 1-click scout verification." }
    ],
    "How do we prove to a talent scout in London that an athlete in Kenya actually jumped 65 centimeters? Through cryptography. Every assessment is stringified into a canonical JSON payload, hashed with SHA-256, and signed using the device's private WebCrypto key. Furthermore, assessments are hash-chained in an append-only log. The server verifies the signature, chain, and physical plausibility. Athletes can export a signed Digital Resume file that scouts can verify independently with one click.",
    "Cryptographic verification builds an unforgeable bridge of trust between remote talent and elite scouts."
  ));

  // Slide 9
  docChildren.push(...createSlideCard(
    9,
    "3D Holographic Model, Gamification & AI Coaching Briefs",
    [
      { prefix: "3D Cybernetic Holographic Model:", text: "Interactive anatomical silhouette with muscle targeting (Quads, Glutes, Calves, Core, Triceps)." },
      { prefix: "50-Badge Trophy Room:", text: "Tiered achievement system across 6 categories (Jump, Push-up, Squat, Power, Form, Streaks)." },
      { prefix: "Multi-Metric Global Leaderboards:", text: "Opt-in leaderboards filtered by Jump Height, Reps, or Relative Peak Power (W/kg)." },
      { prefix: "AI Coaching Briefs:", text: "Integrates Anthropic Claude API (`claude-opus-4-8`) with offline rule-based fallback." }
    ],
    "To maximize athlete engagement, Fitzen incorporates rich visual feedback and gamification. The dashboard features a 3D Holographic Human Model with interactive muscle group hover HUDs — highlighting specific target areas like Quadriceps, Calves, or Triceps with targeted form drills. We built a 50-Badge Trophy Room rewarding milestones, form accuracy, and consistency, alongside global multi-metric leaderboards. Finally, an AI agent synthesizes personalized coaching briefs using Anthropic Claude.",
    "Visual 3D graphics, gamification, and AI coaching convert raw metrics into actionable athletic growth."
  ));

  // Slide 10
  docChildren.push(...createSlideCard(
    10,
    "Conclusion, Real-World Impact & Future Roadmap",
    [
      { prefix: "Project Summary:", text: "Fitzen is a complete, scientifically validated, privacy-first, offline-ready talent platform." },
      { prefix: "Testing Validation:", text: "83 automated Vitest test cases passing across kinematics, crypto, API, and UI components." },
      { prefix: "Real-World Impact:", text: "Democratizes talent discovery, eliminates scouting travel costs, and stops data fraud." },
      { prefix: "Future Roadmap:", text: "Native mobile apps, dual-camera WebRTC 3D triangulation, and IMU wearable sensor fusion." }
    ],
    "In conclusion, Fitzen represents the future of remote athletic talent identification. By combining 3D pose kinematics, cryptographic security, deterministic anti-cheat engines, and explainable AI potential scoring, Fitzen levels the playing field for athletes worldwide. Tested with 83 automated test cases across all engines, Fitzen is production-ready today. Looking ahead, our roadmap includes multi-camera 3D triangulation and wearable sensor sync. Thank you, and I am happy to take any questions!",
    "Fitzen empowers every athlete, everywhere, to unlock their true potential and be discovered."
  ));

  docChildren.push(new Paragraph({ spacing: { after: 200 } }));

  // SECTION 5: PRESENTATION Q&A & TECHNICAL DEFENSE CHEAT SHEET
  docChildren.push(createHeading1("5. Presentation Q&A & Technical Defense Guide"));
  docChildren.push(createBodyParagraph("Use this Q&A cheat sheet during your presentation defense to answer technical and business questions from judges or evaluators with absolute authority:"));

  const qaPairs = [
    {
      q: "Q1: How does Fitzen calculate vertical jump height without a calibration board or physical jump mat?",
      a: "Fitzen uses a dual-estimator fusion model. Primary estimator: sub-frame flight time calculated via a least-squares quadratic parabola fit of airborne hip trajectory landmarks (h = g * t^2 / 8). Secondary estimator: hip vertical displacement scaled by athlete stature. These estimates are fused using inverse-variance weighting, propagating camera frame-rate quantization and landmark jitter into an honest 95% confidence interval."
    },
    {
      q: "Q2: How do you prevent an athlete from forging assessment numbers on their phone?",
      a: "Fitzen enforces a 4-tier cryptographic and biomechanical verification pipeline: (1) Canonical JSON payload SHA-256 hashing, (2) Asymmetric WebCrypto ECDSA P-256 digital signature, (3) Append-only audit hash chain validation, and (4) Physical plausibility screening (which rejects mathematically or biomechanically impossible claims, such as a 100cm jump with 0.1s flight time). The server is the sole authority; clients can never verify themselves."
    },
    {
      q: "Q3: What happens if the user does not have an active internet connection?",
      a: "Fitzen is designed offline-first. When an assessment is performed offline, the WebCrypto signed payload is safely stored in IndexedDB (`idb`) on the device. Once an internet connection returns, Fitzen's background sync engine flushes the queued assessments to the backend REST API with server-side idempotency headers to prevent duplicate submissions."
    },
    {
      q: "Q4: How does the FSM Anti-Cheat Engine catch 'half-reps' during Push-Ups or Squats?",
      a: "The movement engine is built as a 4-state Deterministic Finite State Machine: [INIT] -> [UP] -> [DOWN] -> [VALID_REP]. For Push-Ups, the athlete must achieve elbow flexion <= 90 degrees. If the athlete begins ascending before reaching 90 degrees, the FSM immediately transitions to [REJECTED_REP] with reason code 'HALF_REP_INCOMPLETE_ROM', invalidating the count."
    },
    {
      q: "Q5: Why did you choose WebCrypto over standard server-side signing?",
      a: "WebCrypto runs directly inside the client browser hardware/security module, guaranteeing that the private key never leaves the athlete's device. Signing at the point of capture binds the landmark vectors to the specific physical device, establishing non-repudiation."
    },
    {
      q: "Q6: How does Fitzen handle athlete growth spurts versus true explosive power?",
      a: "Fitzen implements the Mirwald Biological Maturity Offset equation. By evaluating standing height, sitting height, body mass, and decimal age, it calculates years from Peak Height Velocity (PHV). This allows Fitzen to separate temporary biological growth advantages from true explosive muscular potential."
    },
    {
      q: "Q7: Is athlete video privacy protected during live camera analysis?",
      a: "Yes, 100%. MediaPipe PoseLandmarker runs completely inside the local browser client (CPU/GPU). Raw video frames are analyzed in memory frame-by-frame and immediately discarded. Only 33 spatial coordinate vectors are kept. Video files are NEVER uploaded or stored on any server."
    },
    {
      q: "Q8: What is the backend technology stack and why SQLite?",
      a: "The backend is built on Node.js running native TypeScript with zero heavy frameworks. It uses Node 22's built-in `node:sqlite` module in Write-Ahead Logging (WAL) mode. This provides zero native C++ compilation dependencies, sub-millisecond local query performance, transactional integrity, and easy portability."
    }
  ];

  qaPairs.forEach(pair => {
    docChildren.push(createHeading3(pair.q));
    docChildren.push(createBodyParagraph(pair.a));
  });

  // Footer & Header configuration
  const doc = new Document({
    creator: "Fitzen AI Engineering Team",
    title: "Fitzen Master Project Specification & Presentation Guide",
    description: "Complete presentation and technical specification document for Fitzen AI Sports Talent Assessment Platform",
    sections: [
      {
        properties: {},
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: "FITZEN — AI Sports Talent Assessment Platform | Presentation & Master Spec", size: 16, color: "94A3B8", font: "Arial" })
                ]
              })
            ]
          })
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "Page ", size: 18, color: "64748B", font: "Arial" }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "64748B", font: "Arial" }),
                  new TextRun({ text: " of ", size: 18, color: "64748B", font: "Arial" }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: "64748B", font: "Arial" })
                ]
              })
            ]
          })
        },
        children: docChildren
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  const targetPath = path.join("c:", "Users", "sonaw", "OneDrive", "Desktop", "Fitzen", "Fitzen-AI-Sports-Talent-Assessment", "Fitzen_Project_Presentation_and_Technical_Specification.docx");
  
  fs.writeFileSync(targetPath, buffer);
  console.log("Successfully generated document at:", targetPath);

  // Also write to parent folder for convenience
  const parentPath = path.join("c:", "Users", "sonaw", "OneDrive", "Desktop", "Fitzen", "Fitzen_Project_Presentation_and_Technical_Specification.docx");
  fs.writeFileSync(parentPath, buffer);
  console.log("Also copied to parent folder at:", parentPath);
}

buildDocument().catch(err => {
  console.error("Error generating document:", err);
  process.exit(1);
});
