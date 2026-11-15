/**
 * Mortar Spotter 3D — Viper-1 Recon Tank Spotter & Raycasted LOS Edition
 * Three.js WebGL Engine, True 3D Terrain Raycasted LOS Fog of War,
 * First-Person Tank Periscope Optics, Laser Designator, & Gemini Integration
 */
(() => {
  const WORLD_W = 1000; // X: -500 (West) to +500 (East)
  const WORLD_D = 600;  // Z: -300 (North/Left) to +300 (South/Right)
  const SEG_X = 160;
  const SEG_Z = 96;
  const COLS = SEG_X + 1;
  const ROWS = SEG_Z + 1;
  const CELL = WORLD_W / SEG_X; // 6.25m

  const G = 60; // m/s^2
  const DRAG = 0.018;
  const MORTAR_VEL = 2.55;
  const TANK_VEL = 2.95;
  const WIND_ACCEL = 0.65;

  const THEMES = {
    desert: {
      sky: 0x221a14,
      fogColor: 0x221a14,
      lowColor: 0x7c5836,
      midColor: 0xb98952,
      highColor: 0xd8b482,
      ambient: 0x7a6552,
      sunColor: 0xffdfba,
      stars: false,
      snow: false,
    },
    alpine: {
      sky: 0x162432,
      fogColor: 0x162432,
      lowColor: 0x455866,
      midColor: 0x8ea3b2,
      highColor: 0xe6f0f7,
      ambient: 0x6b8299,
      sunColor: 0xe0f2fe,
      stars: false,
      snow: true,
    },
    night: {
      sky: 0x060b14,
      fogColor: 0x060b14,
      lowColor: 0x1a2622,
      midColor: 0x2c3f39,
      highColor: 0x4a6159,
      ambient: 0x263547,
      sunColor: 0x7dd3fc,
      stars: true,
      snow: false,
    },
    verdant: {
      sky: 0x12221a,
      fogColor: 0x12221a,
      lowColor: 0x263b22,
      midColor: 0x476e3f,
      highColor: 0x7b9663,
      ambient: 0x526b58,
      sunColor: 0xfef3c7,
      stars: false,
      snow: false,
    },
  };

  /* ---------------- WEB AUDIO SYNTH ---------------- */
  class SoundEngine {
    constructor() {
      this.ctx = null;
      this.noiseBuffer = null;
    }

    ensure() {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      if (!this.noiseBuffer && this.ctx) {
        const len = this.ctx.sampleRate * 1.5;
        this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      return this.ctx;
    }

    playMortarFire(isTank = false) {
      const ctx = this.ensure();
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = isTank ? "sawtooth" : "triangle";
      osc.frequency.setValueAtTime(isTank ? 210 : 160, now);
      osc.frequency.exponentialRampToValueAtTime(35, now + 0.25);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.3);

      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(isTank ? 650 : 420, now);
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.24, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
      src.connect(filter).connect(nGain).connect(ctx.destination);
      src.start(now);
      src.stop(now + 0.19);
    }

    playShellWhistle() {
      const ctx = this.ensure();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.exponentialRampToValueAtTime(230, now + 0.45);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.055, now + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.46);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.48);
    }

    playExplosion(intensity = 1) {
      const ctx = this.ensure();
      if (!ctx) return;
      const now = ctx.currentTime;

      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(900 * intensity, now);
      filter.frequency.exponentialRampToValueAtTime(85, now + 0.75);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(Math.min(0.55, 0.32 * intensity), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
      src.connect(filter).connect(gain).connect(ctx.destination);
      src.start(now);
      src.stop(now + 0.9);

      const sub = ctx.createOscillator();
      const sGain = ctx.createGain();
      sub.type = "sine";
      sub.frequency.setValueAtTime(92, now);
      sub.frequency.exponentialRampToValueAtTime(24, now + 0.45);
      sGain.gain.setValueAtTime(0.32 * intensity, now);
      sGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      sub.connect(sGain).connect(ctx.destination);
      sub.start(now);
      sub.stop(now + 0.52);
    }

    playLaserPing() {
      const ctx = this.ensure();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1850, now);
      osc.frequency.exponentialRampToValueAtTime(920, now + 0.18);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.22);
    }

    playRadioSquelch() {
      const ctx = this.ensure();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const oGain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(1450, now);
      oGain.gain.setValueAtTime(0.032, now);
      oGain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
      osc.connect(oGain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.06);

      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(1900, now);
      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(0.065, now + 0.03);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
      src.connect(bp).connect(nGain).connect(ctx.destination);
      src.start(now + 0.02);
      src.stop(now + 0.19);
    }

    playRadarPing() {
      const ctx = this.ensure();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(1320, now);
      osc.frequency.setValueAtTime(980, now + 0.11);
      gain.gain.setValueAtTime(0.075, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.27);
    }

    playSamLaunch() {
      const ctx = this.ensure();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(1520, now + 0.3);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.36);
    }

    playSniperCrack() {
      const ctx = this.ensure();
      if (!ctx) return;
      const now = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.setValueAtTime(1800, now);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      src.connect(hp).connect(gain).connect(ctx.destination);
      src.start(now);
      src.stop(now + 0.13);
    }
  }

  /* ---------------- DOM REFERENCES ---------------- */
  const dom = {
    viewport3d: document.getElementById("viewport-3d"),
    labelsLayer: document.getElementById("landmark-labels-layer"),
    binoOverlay: document.getElementById("bino-overlay"),
    binoReadout: document.getElementById("bino-readout"),

    opTitle: document.getElementById("op-title"),
    opBriefing: document.getElementById("op-briefing"),
    statusDot: document.getElementById("status-dot"),
    aiModeBadge: document.getElementById("ai-mode-badge"),
    apiKeyInput: document.getElementById("api-key-input"),
    toggleKeyVis: document.getElementById("toggle-key-vis"),
    modelSelect: document.getElementById("model-select"),
    ttsToggle: document.getElementById("tts-toggle"),
    reconToggle: document.getElementById("recon-toggle"),
    shellCamToggle: document.getElementById("shellcam-toggle"),
    toggleConfigBtn: document.getElementById("toggle-config-btn"),
    closeConfigBtn: document.getElementById("close-config-btn"),
    configPopover: document.getElementById("config-popover"),
    missionPromptInput: document.getElementById("mission-prompt-input"),
    generateMissionBtn: document.getElementById("generate-mission-btn"),
    quickResetBtn: document.getElementById("quick-reset-btn"),

    hudUnitMortar: document.getElementById("hud-unit-mortar"),
    hudUnitTank: document.getElementById("hud-unit-tank"),
    hudUnitRecon: document.getElementById("hud-unit-recon"),
    playerHpBar: document.getElementById("player-hp-bar"),
    playerHpText: document.getElementById("player-hp-text"),
    tankHpBar: document.getElementById("tank-hp-bar"),
    tankHpText: document.getElementById("tank-hp-text"),
    tankFuelBar: document.getElementById("tank-fuel-bar"),
    tankFuelText: document.getElementById("tank-fuel-text"),
    reconStatusBar: document.getElementById("recon-status-bar"),
    reconHpText: document.getElementById("recon-hp-text"),
    reconStatusText: document.getElementById("recon-status-text"),
    friendlyAmenitiesText: document.getElementById("friendly-amenities-text"),
    enemyAmenitiesText: document.getElementById("enemy-amenities-text"),

    enemyNameLabel: document.getElementById("enemy-name-label"),
    enemyHpBar: document.getElementById("enemy-hp-bar"),
    enemyHpText: document.getElementById("enemy-hp-text"),
    enemyPosText: document.getElementById("enemy-pos-text"),
    windArrow: document.getElementById("wind-arrow"),
    windVal: document.getElementById("wind-val"),
    turnBanner: document.getElementById("turn-banner"),

    camButtons: Array.from(document.querySelectorAll(".cam-btn")),
    toggleRangefinderBtn: document.getElementById("toggle-rangefinder-btn"),
    closeRangefinderBtn: document.getElementById("close-rangefinder-btn"),
    rangefinderPopover: document.getElementById("rangefinder-popover"),
    rangefinderTbody: document.getElementById("rangefinder-tbody"),

    selectMortarBtn: document.getElementById("select-mortar-btn"),
    selectTankBtn: document.getElementById("select-tank-btn"),
    selectReconBtn: document.getElementById("select-recon-btn"),
    elevRangeLabel: document.getElementById("elev-range-label"),
    azimSlider: document.getElementById("azim-slider"),
    azimInput: document.getElementById("azim-input"),
    angleSlider: document.getElementById("angle-slider"),
    angleInput: document.getElementById("angle-input"),
    powerSlider: document.getElementById("power-slider"),
    powerInput: document.getElementById("power-input"),

    drivePadPanel: document.getElementById("drive-pad-panel"),
    driveFwdBtn: document.getElementById("drive-fwd"),
    driveRevBtn: document.getElementById("drive-rev"),
    driveLeftBtn: document.getElementById("drive-left"),
    driveRightBtn: document.getElementById("drive-right"),
    driveStatusNote: document.getElementById("drive-status-note"),

    shellButtons: Array.from(document.querySelectorAll(".shell-btn")),
    radarSweepBtn: document.getElementById("radar-sweep-btn"),
    sendTankCoordsBtn: document.getElementById("send-tank-coords-btn"),
    advanceReconBtn: document.getElementById("advance-recon-btn"),
    targetPrioritySelect: document.getElementById("target-priority-select"),
    calledCoordsList: document.getElementById("called-coords-list"),
    calledCoordsActiveLabel: document.getElementById("called-coords-active-label"),
    laserSpotBtn: document.getElementById("laser-spot-btn"),
    fireBtn: document.getElementById("fire-btn"),

    spotterLog: document.getElementById("spotter-log"),
    enemyReasoning: document.getElementById("enemy-reasoning"),
    enemyTaunt: document.getElementById("enemy-taunt"),
    shotHistoryBody: document.getElementById("shot-history-body"),
  };

  const gemini = new GeminiService();
  const sfx = new SoundEngine();

  /* ---------------- GAME STATE ---------------- */
  const state = {
    phase: "RTS_ACTIVE",
    activeUnit: "mortar", // "mortar" | "tank"
    lastFiringUnit: "ALPHA-1",
    camMode: "orbit", // pit | bino | orbit
    shellCamHoldUntil: 0,
    lastShellFocus: new THREE.Vector3(),
    orbit: { yaw: -0.35, pitch: 0.58, dist: 640, dragging: false, downX: 0, downY: 0, lastX: 0, lastY: 0 },
    driveInput: { fwd: false, rev: false, left: false, right: false },

    mission: {
      operation_name: "OP: IRON RIDGE",
      briefing:
        "3D RTS Line-of-Sight Theater: Click terrain to move VIPER-1 Recon Tank onto the ridge crest to carve back the unexplored black shroud, spot targets for ALPHA-1 Mortar, and fight in real time.",
      theme: "desert",
      ridge_height: 140,
      roughness: 0.55,
      base_wind: 2.5,
      enemy_name: "IRON VULTURE-4",
      landmarks: [
        { name: "North Rail Bridge", type: "bunker" },
        { name: "Ridge Watchpost", type: "tower" },
        { name: "Forward Pillbox", type: "bunker" },
      ],
    },

    heightGrid: new Float32Array(COLS * ROWS),
    scorchGrid: new Float32Array(COLS * ROWS),
    visibilityGrid: new Float32Array(COLS * ROWS),
    exploredGrid: new Float32Array(COLS * ROWS),
    vertMap: new Int32Array(COLS * ROWS),
    ridgePeakY: 140,

    player: { x: -395, z: -25, y: 0, hp: 100, maxHp: 100, azimuth: 0, angle: 54, power: 72, cooldown: 0, maxCooldown: 5.0 },
    tank: { x: -220, z: 55, y: 0, heading: 0, hp: 120, maxHp: 120, fuel: 100, maxFuel: 100, azimuth: 0, angle: 34, power: 68, cooldown: 0, maxCooldown: 4.0, waypoint: null },
    recon: { x: -295, z: -35, y: 0, heading: 0, hp: 60, maxHp: 60, azimuth: 0, angle: 54, power: 72, waypoint: null, stridePhase: 0, binoBoostUntil: 0, pinnedUntil: 0, wasPinned: false },

    enemy: { x: 355, z: 30, y: 0, hp: 100, maxHp: 100, azimuth: 0, angle: 60, power: 70, spotted: false, cooldown: 11.0, thinking: false },
    enemyTank: { x: 235, z: -55, y: 0, heading: Math.PI, hp: 110, maxHp: 110, fuel: 100, maxFuel: 100, azimuth: 0, angle: 34, power: 62, spotted: false, cooldown: 19.0, movePhase: 0 },
    enemyScout: { x: 255, z: 45, y: 0, heading: Math.PI, hp: 50, maxHp: 50, spotted: false, pinnedUntil: 0, stridePhase: 0, wasPinned: false },

    activeTargetKey: "mortar",
    radar: { active: false, estX: 355, estZ: 30, radius: 90, detections: 0, cooldown: 0, maxCooldown: 5.0 },
    train: { x: -420, z: -168, y: 0, vx: 32, hp: 110, maxHp: 110, destroyed: false, respawnTimer: 0, steamTimer: 0, spotted: false },
    amenities: {},
    trees: [],
    riverSegments: [],
    railSegments: [],
    bridgeGroups: [],
    radarLabelEl: null,

    selectedShell: "HE",
    windX: 2.5,
    windZ: 1.2,
    windTimer: 15.0,
    hudTimer: 0,
    specSyncTimer: 0,

    projectiles: [],
    samMissiles: [],
    particles: [],
    flashes: [],
    smokePlumes: [],
    flares: [],
    revealZones: [],
    impactMarkers: [],
    landmarks: [],
    mistSprites: [],
    laserActiveUntil: 0,

    playerShotCount: 0,
    enemyShotCount: 0,
    playerHistory: [],
    enemyHistory: [],
  };

  /* ---------------- THREE.JS SCENE OBJECTS ---------------- */
  let scene, camera, renderer, raycaster;
  let ambientLight, sunLight, muzzleLight;
  let terrainGeo, terrainMesh, gridLines;
  let playerUnit, tankUnit, reconUnit, enemyUnit, enemyTankUnit, enemyScoutUnit, aimDotsGroup;
  let amenityGroup, worldFeatureGroup, treeGroup, trainGroup;
  let landmarkGroup, fxGroup, mistGroup, weatherGroup;
  let laserBeamLine, laserTargetDot, waypointRing, waypointLine, reconWaypointRing, reconWaypointLine;
  let radarZoneGroup, radarOuterRing, radarInnerRing, radarCrossLine;
  let starField, snowPoints;

  function initThree() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x221a14);
    scene.fog = new THREE.FogExp2(0x221a14, 0.00055);

    const w = dom.viewport3d.clientWidth || 1000;
    const h = dom.viewport3d.clientHeight || 500;
    camera = new THREE.PerspectiveCamera(52, w / h, 1, 2600);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    dom.viewport3d.appendChild(renderer.domElement);

    ambientLight = new THREE.HemisphereLight(0x9ca3af, 0x3b2f24, 0.85);
    scene.add(ambientLight);

    sunLight = new THREE.DirectionalLight(0xffdfba, 1.15);
    sunLight.position.set(-280, 420, 220);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 50;
    sunLight.shadow.camera.far = 1400;
    sunLight.shadow.camera.left = -550;
    sunLight.shadow.camera.right = 550;
    sunLight.shadow.camera.top = 380;
    sunLight.shadow.camera.bottom = -380;
    scene.add(sunLight);

    muzzleLight = new THREE.PointLight(0xfb923c, 0, 180);
    scene.add(muzzleLight);

    // Primary Destructible Terrain
    terrainGeo = new THREE.PlaneGeometry(WORLD_W, WORLD_D, SEG_X, SEG_Z);
    terrainGeo.rotateX(-Math.PI / 2);

    const posAttr = terrainGeo.attributes.position;
    terrainGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(posAttr.count * 3), 3));
    for (let i = 0; i < posAttr.count; i++) {
      const ix = Math.round((posAttr.getX(i) + WORLD_W / 2) / CELL);
      const iz = Math.round((posAttr.getZ(i) + WORLD_D / 2) / CELL);
      if (ix >= 0 && ix < COLS && iz >= 0 && iz < ROWS) {
        state.vertMap[iz * COLS + ix] = i;
      }
    }

    terrainMesh = new THREE.Mesh(
      terrainGeo,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.92,
        metalness: 0.04,
        flatShading: true,
      })
    );
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = true;
    scene.add(terrainMesh);

    // Draped tactical 100m grid overlay
    gridLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x88a093, transparent: true, opacity: 0.14 })
    );
    scene.add(gridLines);

    // Units: Friendly (ALPHA-1 Mortar, VIPER-1 Tank, BRAVO-2 Binocular Crew) & Hostile (VULTURE Mortar, KRONOS-2 Tank, SHADOW-3 Scout)
    playerUnit = createMortarUnit(0x4ade80);
    tankUnit = createTankUnit(0x38bdf8);
    reconUnit = createReconCrewUnit(0xa3e635);
    enemyUnit = createMortarUnit(0xf87171);
    enemyTankUnit = createTankUnit(0xf97316);
    enemyScoutUnit = createReconCrewUnit(0xf43f5e);
    scene.add(
      playerUnit.root,
      tankUnit.root,
      reconUnit.root,
      enemyUnit.root,
      enemyTankUnit.root,
      enemyScoutUnit.root
    );

    // Aiming dots ribbon
    aimDotsGroup = new THREE.Group();
    const dotGeo = new THREE.SphereGeometry(1.15, 8, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 14; i++) {
      aimDotsGroup.add(new THREE.Mesh(dotGeo, dotMat));
    }
    scene.add(aimDotsGroup);

    // 3D Green Laser Designator Beam for VIPER-1 Spotter Tank & BRAVO-2 Optics
    const laserGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
    ]);
    laserBeamLine = new THREE.Line(
      laserGeo,
      new THREE.LineBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.95 })
    );
    laserBeamLine.visible = false;
    scene.add(laserBeamLine);

    laserTargetDot = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.9 })
    );
    laserTargetDot.visible = false;
    scene.add(laserTargetDot);

    raycaster = new THREE.Raycaster();

    const makeWpVisual = (hex) => {
      const wpGeo = new THREE.RingGeometry(4.2, 6.8, 22);
      wpGeo.rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(
        wpGeo,
        new THREE.MeshBasicMaterial({ color: hex, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
      );
      ring.visible = false;
      scene.add(ring);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
        new THREE.LineBasicMaterial({ color: hex, transparent: true, opacity: 0.65 })
      );
      line.visible = false;
      scene.add(line);
      return { ring, line };
    };
    const tankWp = makeWpVisual(0x22d3ee);
    waypointRing = tankWp.ring;
    waypointLine = tankWp.line;
    const reconWp = makeWpVisual(0xa3e635);
    reconWaypointRing = reconWp.ring;
    reconWaypointLine = reconWp.line;

    // 3D Counter-Battery Radar Launch Zone Ring (visible over shroud)
    radarZoneGroup = new THREE.Group();
    const rOuterGeo = new THREE.RingGeometry(0.93, 1.0, 48);
    rOuterGeo.rotateX(-Math.PI / 2);
    radarOuterRing = new THREE.Mesh(
      rOuterGeo,
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide, transparent: true, opacity: 0.78 })
    );
    const rInnerGeo = new THREE.RingGeometry(0.45, 0.52, 32);
    rInnerGeo.rotateX(-Math.PI / 2);
    radarInnerRing = new THREE.Mesh(
      rInnerGeo,
      new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide, transparent: true, opacity: 0.55 })
    );
    radarCrossLine = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.35, 0.5, 0),
        new THREE.Vector3(0.35, 0.5, 0),
        new THREE.Vector3(0, 0.5, -0.35),
        new THREE.Vector3(0, 0.5, 0.35),
      ]),
      new THREE.LineBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.8 })
    );
    radarZoneGroup.add(radarOuterRing, radarInnerRing, radarCrossLine);
    radarZoneGroup.visible = false;
    scene.add(radarZoneGroup);

    worldFeatureGroup = new THREE.Group();
    amenityGroup = new THREE.Group();
    treeGroup = new THREE.Group();
    trainGroup = createTrainUnit();
    landmarkGroup = new THREE.Group();
    fxGroup = new THREE.Group();
    mistGroup = new THREE.Group();
    weatherGroup = new THREE.Group();
    scene.add(
      worldFeatureGroup,
      amenityGroup,
      treeGroup,
      trainGroup,
      landmarkGroup,
      fxGroup,
      mistGroup,
      weatherGroup
    );

    createSoftValleyMist();
    createWeatherNodes();
  }

  function createSoftValleyMist() {
    // Procedural radial soft mist texture (no harsh polygon cutouts)
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 128;
    const gctx = c.getContext("2d");
    const grad = gctx.createRadialGradient(64, 64, 6, 64, 64, 62);
    grad.addColorStop(0, "rgba(18, 26, 24, 0.72)");
    grad.addColorStop(0.55, "rgba(14, 20, 19, 0.35)");
    grad.addColorStop(1, "rgba(10, 14, 14, 0)");
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 128, 128);

    const tex = new THREE.CanvasTexture(c);
    const planeGeo = new THREE.PlaneGeometry(165, 165);
    planeGeo.rotateX(-Math.PI / 2);

    for (let ix = 0; ix < 6; ix++) {
      for (let iz = 0; iz < 5; iz++) {
        const wx = 75 + ix * 78 + (Math.random() - 0.5) * 20;
        const wz = -220 + iz * 110 + (Math.random() - 0.5) * 20;
        const mat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(planeGeo, mat);
        mesh.position.set(wx, 18, wz);
        mistGroup.add(mesh);
        state.mistSprites.push({ mesh, x: wx, z: wz, phase: Math.random() * Math.PI * 2 });
      }
    }
  }

  function createMortarUnit(accentColor) {
    const root = new THREE.Group();
    const bagMat = new THREE.MeshStandardMaterial({ color: 0x6b604e, roughness: 0.95, flatShading: true });
    const bagGeo = new THREE.BoxGeometry(5.5, 3.2, 3.4);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const bag = new THREE.Mesh(bagGeo, bagMat);
      bag.position.set(Math.cos(a) * 10, 1.4, Math.sin(a) * 10);
      bag.rotation.y = -a + Math.PI / 2;
      bag.castShadow = true;
      bag.receiveShadow = true;
      root.add(bag);
    }

    const baseMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.5, metalness: 0.35 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.8, 1.4, 12), baseMat);
    base.position.y = 0.7;
    base.castShadow = true;
    root.add(base);

    const yawGroup = new THREE.Group();
    yawGroup.position.y = 1.4;
    root.add(yawGroup);

    const metalMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.35, metalness: 0.75 });
    const legGeo = new THREE.CylinderGeometry(0.45, 0.45, 8.5, 6);
    const legL = new THREE.Mesh(legGeo, metalMat);
    legL.position.set(3.5, 3.2, -3);
    legL.rotation.x = 0.38;
    const legR = new THREE.Mesh(legGeo, metalMat);
    legR.position.set(3.5, 3.2, 3);
    legR.rotation.x = -0.38;
    yawGroup.add(legL, legR);

    const pitchGroup = new THREE.Group();
    pitchGroup.position.set(0, 1.2, 0);
    yawGroup.add(pitchGroup);

    const barrelGeo = new THREE.CylinderGeometry(1.15, 1.45, 14, 12);
    barrelGeo.rotateZ(-Math.PI / 2);
    barrelGeo.translate(6.8, 0, 0);
    const barrel = new THREE.Mesh(barrelGeo, metalMat);
    barrel.castShadow = true;
    pitchGroup.add(barrel);

    const ringGeo = new THREE.CylinderGeometry(1.55, 1.55, 1.1, 12);
    ringGeo.rotateZ(-Math.PI / 2);
    ringGeo.translate(13.5, 0, 0);
    pitchGroup.add(new THREE.Mesh(ringGeo, baseMat));

    return { root, yawGroup, pitchGroup };
  }

  function createTankUnit(accentColor) {
    const root = new THREE.Group();
    const slopeGroup = new THREE.Group();
    root.add(slopeGroup);

    const hullSpinGroup = new THREE.Group();
    slopeGroup.add(hullSpinGroup);

    const armorMat = new THREE.MeshStandardMaterial({ color: 0x3b4d3f, roughness: 0.65, metalness: 0.25, flatShading: true });
    const treadMat = new THREE.MeshStandardMaterial({ color: 0x1c2120, roughness: 0.9, flatShading: true });
    const trimMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.45, metalness: 0.4 });
    const gunMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.35, metalness: 0.7 });

    const treadGeo = new THREE.BoxGeometry(19, 3.4, 3.2);
    const treadL = new THREE.Mesh(treadGeo, treadMat);
    treadL.position.set(0, 1.7, -6.2);
    treadL.castShadow = true;
    const treadR = new THREE.Mesh(treadGeo, treadMat);
    treadR.position.set(0, 1.7, 6.2);
    treadR.castShadow = true;
    hullSpinGroup.add(treadL, treadR);

    const hull = new THREE.Mesh(new THREE.BoxGeometry(17.5, 3.8, 10.2), armorMat);
    hull.position.set(-0.5, 3.4, 0);
    hull.castShadow = true;
    hull.receiveShadow = true;
    hullSpinGroup.add(hull);

    const glacis = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.4, 9.6), armorMat);
    glacis.position.set(8.6, 2.8, 0);
    glacis.rotation.z = -0.52;
    glacis.castShadow = true;
    hullSpinGroup.add(glacis);

    const yawGroup = new THREE.Group();
    yawGroup.position.set(-1.2, 5.4, 0);
    hullSpinGroup.add(yawGroup);

    const turret = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5.4, 3.2, 7), armorMat);
    turret.position.y = 1.6;
    turret.castShadow = true;
    yawGroup.add(turret);

    // Recon Laser Periscope / Optics Mast on roof
    const opticsPod = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 2.2), trimMat);
    opticsPod.position.set(-1.0, 3.9, -1.6);
    yawGroup.add(opticsPod);

    const pitchGroup = new THREE.Group();
    pitchGroup.position.set(4.0, 1.8, 0);
    yawGroup.add(pitchGroup);

    const barrelGeo = new THREE.CylinderGeometry(0.85, 1.15, 15.5, 10);
    barrelGeo.rotateZ(-Math.PI / 2);
    barrelGeo.translate(7.6, 0, 0);
    const barrel = new THREE.Mesh(barrelGeo, gunMat);
    barrel.castShadow = true;
    pitchGroup.add(barrel);

    const brake = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.7, 1.9), trimMat);
    brake.position.set(15.6, 0, 0);
    pitchGroup.add(brake);

    return { root, slopeGroup, hullSpinGroup, yawGroup, pitchGroup };
  }

  /** 2-soldier infantry recon squad carrying dual-lens binoculars & whip antenna. */
  function createReconCrewUnit(accentColor) {
    const root = new THREE.Group();
    const baseGeo = new THREE.RingGeometry(5.5, 7.2, 18);
    baseGeo.rotateX(-Math.PI / 2);
    const baseRing = new THREE.Mesh(
      baseGeo,
      new THREE.MeshBasicMaterial({ color: accentColor, side: THREE.DoubleSide, transparent: true, opacity: 0.78 })
    );
    baseRing.position.y = 0.6;
    root.add(baseRing);

    const kitMat = new THREE.MeshStandardMaterial({ color: 0x3f4e3c, roughness: 0.85, flatShading: true });
    const armorMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.5, metalness: 0.3 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd6a684, roughness: 0.75 });
    const binoMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.35, metalness: 0.8 });

    const squad = new THREE.Group();
    root.add(squad);

    // Lead spotter with raised binoculars
    const torso1 = new THREE.Mesh(new THREE.BoxGeometry(2.8, 4.4, 2.2), kitMat);
    torso1.position.set(1.5, 3.2, -1.6);
    torso1.castShadow = true;
    const head1 = new THREE.Mesh(new THREE.SphereGeometry(1.15, 8, 8), skinMat);
    head1.position.set(1.5, 6.2, -1.6);
    const helmet1 = new THREE.Mesh(new THREE.SphereGeometry(1.35, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), armorMat);
    helmet1.position.set(1.5, 6.45, -1.6);

    const binoL = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 1.8, 6), binoMat);
    binoL.rotation.z = -Math.PI / 2;
    binoL.position.set(2.9, 6.05, -2.0);
    const binoR = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 1.8, 6), binoMat);
    binoR.rotation.z = -Math.PI / 2;
    binoR.position.set(2.9, 6.05, -1.2);

    const pack = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.8, 1.8), armorMat);
    pack.position.set(0.2, 3.6, -1.6);
    const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 6.5, 5), binoMat);
    whip.position.set(-0.2, 7.6, -1.6);

    // Crouched RTO assistant
    const torso2 = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.2, 2.1), kitMat);
    torso2.position.set(-1.6, 2.2, 1.8);
    torso2.castShadow = true;
    const helmet2 = new THREE.Mesh(new THREE.SphereGeometry(1.25, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), armorMat);
    helmet2.position.set(-1.6, 4.3, 1.8);

    squad.add(torso1, head1, helmet1, binoL, binoR, pack, whip, torso2, helmet2);
    return { root, squad };
  }

  /** SAM Surface-to-Air / Counter-Shell Interceptor Turret (radar-dependent). */
  function createSamMesh(accentColor) {
    const group = new THREE.Group();
    const padMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8, flatShading: true });
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.45 });
    const missileMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.4, metalness: 0.5 });

    const pad = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 11, 2.2, 8), padMat);
    pad.position.y = 1.1;
    pad.castShadow = true;
    pad.receiveShadow = true;
    group.add(pad);

    const turret = new THREE.Group();
    turret.position.y = 2.6;
    group.add(turret);

    const ped = new THREE.Mesh(new THREE.BoxGeometry(7.5, 4.2, 7.5), bodyMat);
    ped.position.y = 2.1;
    ped.castShadow = true;
    turret.add(ped);

    for (const zOff of [-3.4, 3.4]) {
      const rack = new THREE.Group();
      rack.position.set(0, 5.2, zOff);
      rack.rotation.z = 0.62;
      const box = new THREE.Mesh(new THREE.BoxGeometry(10.5, 2.6, 2.4), bodyMat);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.2, 8), missileMat);
      cone.rotation.z = -Math.PI / 2;
      cone.position.x = 6.4;
      rack.add(box, cone);
      turret.add(rack);
    }

    return { group, turret };
  }

  /** Armored supply train traveling West-East across the rail corridor. */
  function createTrainUnit() {
    const group = new THREE.Group();
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.45, metalness: 0.65, flatShading: true });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
    const cargoMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.7, flatShading: true });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 });

    const loco = new THREE.Mesh(new THREE.BoxGeometry(20, 7.5, 9), steelMat);
    loco.position.set(16, 4.8, 0);
    loco.castShadow = true;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(8, 3.5, 8.6), trimMat);
    cab.position.set(11, 9.8, 0);
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 4, 8), darkMat);
    stack.position.set(22, 9.8, 0);

    const car1 = new THREE.Mesh(new THREE.BoxGeometry(18, 6.2, 8.2), cargoMat);
    car1.position.set(-7, 4.2, 0);
    car1.castShadow = true;
    const car2 = new THREE.Mesh(new THREE.BoxGeometry(18, 6.2, 8.2), steelMat);
    car2.position.set(-28, 4.2, 0);
    car2.castShadow = true;

    group.add(loco, cab, stack, car1, car2);
    return group;
  }

  function createTreeMesh(scale = 1) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9 * scale, 1.3 * scale, 7 * scale, 6),
      new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.95, flatShading: true })
    );
    trunk.position.y = 3.5 * scale;
    trunk.castShadow = true;
    const f1 = new THREE.Mesh(
      new THREE.ConeGeometry(4.8 * scale, 11 * scale, 7),
      new THREE.MeshStandardMaterial({ color: 0x2d5a3c, roughness: 0.9, flatShading: true })
    );
    f1.position.y = 9.5 * scale;
    f1.castShadow = true;
    const f2 = new THREE.Mesh(
      new THREE.ConeGeometry(3.4 * scale, 8 * scale, 7),
      new THREE.MeshStandardMaterial({ color: 0x3b7a4e, roughness: 0.9, flatShading: true })
    );
    f2.position.y = 14.5 * scale;
    f2.castShadow = true;
    g.add(trunk, f1, f2);
    return g;
  }

  function createWeatherNodes() {
    const starPositions = new Float32Array(320 * 3);
    for (let i = 0; i < 320; i++) {
      starPositions[i * 3] = (Math.random() - 0.5) * 1800;
      starPositions[i * 3 + 1] = 220 + Math.random() * 520;
      starPositions[i * 3 + 2] = (Math.random() - 0.5) * 1400;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    starField = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xe2f0ff, size: 2.8 }));
    weatherGroup.add(starField);

    const snowPositions = new Float32Array(360 * 3);
    for (let i = 0; i < 360; i++) {
      snowPositions[i * 3] = (Math.random() - 0.5) * WORLD_W;
      snowPositions[i * 3 + 1] = Math.random() * 260;
      snowPositions[i * 3 + 2] = (Math.random() - 0.5) * WORLD_D;
    }
    const snowGeo = new THREE.BufferGeometry();
    snowGeo.setAttribute("position", new THREE.BufferAttribute(snowPositions, 3));
    snowPoints = new THREE.Points(
      snowGeo,
      new THREE.PointsMaterial({ color: 0xe6f4ff, size: 2.5, transparent: true, opacity: 0.75 })
    );
    weatherGroup.add(snowPoints);
  }

  /* ---------------- INITIALIZATION ---------------- */
  function init() {
    initThree();
    loadSavedConfig();
    buildRangefinderTable();
    bindEvents();
    startBattle(state.mission);
    requestAnimationFrame(loop);
  }

  function loadSavedConfig() {
    try {
      const savedKey = localStorage.getItem("mortar_spotter_gemini_key") || "";
      const savedModel = localStorage.getItem("mortar_spotter_gemini_model") || "gemini-2.5-flash";
      dom.apiKeyInput.value = savedKey;
      dom.modelSelect.value = savedModel;
      gemini.setConfig({ apiKey: savedKey, model: savedModel });
    } catch (_) {}
    syncModeBadge();
  }

  function syncModeBadge() {
    const live = gemini.isLive();
    dom.statusDot.classList.toggle("live", live);
    dom.aiModeBadge.textContent = live ? `LIVE GEMINI (${gemini.model})` : "SIMULATED AI";
    dom.aiModeBadge.classList.toggle("live", live);
    dom.aiModeBadge.classList.toggle("sim", !live);
  }

  function simulateFlatRange(angleDeg, power, velMult = MORTAR_VEL) {
    const rad = (angleDeg * Math.PI) / 180;
    const v = power * velMult;
    let x = 0;
    let y = 0;
    let vx = Math.cos(rad) * v;
    let vy = Math.sin(rad) * v;
    const dt = 0.016;
    for (let i = 0; i < 1200; i++) {
      vx += -vx * DRAG * dt;
      vy += (-G - vy * DRAG) * dt;
      x += vx * dt;
      y += vy * dt;
      if (y <= 0 && i > 2) break;
    }
    return Math.round(x);
  }

  function buildRangefinderTable() {
    const powers = [30, 50, 65, 80, 95];
    const angles = [30, 45, 60, 75];
    dom.rangefinderTbody.innerHTML = powers
      .map((p) => {
        const cells = angles.map((a) => `<td>${simulateFlatRange(a, p, MORTAR_VEL)}m</td>`).join("");
        return `<tr><td>${p}%</td>${cells}</tr>`;
      })
      .join("");
  }

  /* ---------------- EVENT BINDINGS ---------------- */
  function bindEvents() {
    const syncViewportSize = () => {
      if (!renderer || !camera || !dom.viewport3d) return;
      const w = dom.viewport3d.clientWidth || 1000;
      const h = dom.viewport3d.clientHeight || 420;
      if (w <= 0 || h <= 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", syncViewportSize);
    if (typeof ResizeObserver === "function" && dom.viewport3d) {
      new ResizeObserver(syncViewportSize).observe(dom.viewport3d);
    }
    syncViewportSize();

    dom.apiKeyInput.addEventListener("input", () => {
      const val = dom.apiKeyInput.value.trim();
      gemini.setConfig({ apiKey: val });
      try {
        localStorage.setItem("mortar_spotter_gemini_key", val);
      } catch (_) {}
      syncModeBadge();
    });

    dom.toggleKeyVis.addEventListener("click", () => {
      dom.apiKeyInput.type = dom.apiKeyInput.type === "password" ? "text" : "password";
    });

    dom.modelSelect.addEventListener("change", () => {
      const model = dom.modelSelect.value;
      gemini.setConfig({ model });
      try {
        localStorage.setItem("mortar_spotter_gemini_model", model);
      } catch (_) {}
      syncModeBadge();
    });

    const getUnit = () => (state.activeUnit === "tank" ? state.tank : state.player);

    const round1 = (v) => Math.round(v * 10) / 10;

    const syncAzim = (val) => {
      const u = getUnit();
      const clamped = Math.max(-45, Math.min(45, round1(Number(val) || 0)));
      u.azimuth = clamped;
      dom.azimSlider.value = clamped;
      dom.azimInput.value = clamped;
      updateUnitTransforms();
    };
    dom.azimSlider.addEventListener("input", (e) => syncAzim(e.target.value));
    dom.azimInput.addEventListener("change", (e) => syncAzim(e.target.value));

    const syncAngle = (val) => {
      const u = getUnit();
      const minA = state.activeUnit === "tank" ? 10 : 35;
      const maxA = state.activeUnit === "tank" ? 65 : 85;
      const clamped = Math.max(minA, Math.min(maxA, round1(Number(val) || minA)));
      u.angle = clamped;
      dom.angleSlider.value = clamped;
      dom.angleInput.value = clamped;
      updateUnitTransforms();
    };
    dom.angleSlider.addEventListener("input", (e) => syncAngle(e.target.value));
    dom.angleInput.addEventListener("change", (e) => syncAngle(e.target.value));

    const syncPower = (val) => {
      const u = getUnit();
      const clamped = Math.max(10, Math.min(100, round1(Number(val) || 70)));
      u.power = clamped;
      dom.powerSlider.value = clamped;
      dom.powerInput.value = clamped;
    };
    dom.powerSlider.addEventListener("input", (e) => syncPower(e.target.value));
    dom.powerInput.addEventListener("change", (e) => syncPower(e.target.value));

    dom.selectMortarBtn.addEventListener("click", () => setActiveUnit("mortar"));
    dom.selectTankBtn.addEventListener("click", () => setActiveUnit("tank"));
    dom.selectReconBtn.addEventListener("click", () => setActiveUnit("recon"));
    if (dom.hudUnitMortar) dom.hudUnitMortar.addEventListener("click", () => state.player.hp > 0 && setActiveUnit("mortar"));
    if (dom.hudUnitTank) dom.hudUnitTank.addEventListener("click", () => state.tank.hp > 0 && setActiveUnit("tank"));
    if (dom.hudUnitRecon) dom.hudUnitRecon.addEventListener("click", () => state.recon.hp > 0 && setActiveUnit("recon"));
    dom.radarSweepBtn.addEventListener("click", () => triggerCounterBatteryRadar("MANUAL SWEEP"));
    dom.sendTankCoordsBtn.addEventListener("click", () => sendTankToCoord());
    dom.advanceReconBtn.addEventListener("click", () => commandAdvanceRecon());
    dom.targetPrioritySelect.addEventListener("change", () => {
      selectCalledInCoord(dom.targetPrioritySelect.value, { announce: true });
    });

    const bindHold = (btn, key) => {
      const set = (v) => (state.driveInput[key] = v);
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        set(true);
      });
      btn.addEventListener("pointerup", () => set(false));
      btn.addEventListener("pointerleave", () => set(false));
      btn.addEventListener("pointercancel", () => set(false));
    };
    bindHold(dom.driveFwdBtn, "fwd");
    bindHold(dom.driveRevBtn, "rev");
    bindHold(dom.driveLeftBtn, "left");
    bindHold(dom.driveRightBtn, "right");

    dom.shellButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        dom.shellButtons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.selectedShell = btn.dataset.shell;
      });
    });

    dom.camButtons.forEach((btn) => {
      btn.addEventListener("click", () => setCameraMode(btn.dataset.cam));
    });

    dom.reconToggle.addEventListener("change", () => {
      refreshFogAndTerrain();
      updateHUD();
    });

    dom.laserSpotBtn.addEventListener("click", () => triggerLaserSpotScan());
    dom.fireBtn.addEventListener("click", () => fireActiveUnit());

    dom.toggleRangefinderBtn.addEventListener("click", () => {
      dom.rangefinderPopover.classList.toggle("hidden");
    });
    dom.closeRangefinderBtn.addEventListener("click", () => {
      dom.rangefinderPopover.classList.add("hidden");
    });

    if (dom.toggleConfigBtn && dom.configPopover) {
      dom.toggleConfigBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        dom.configPopover.classList.toggle("hidden");
      });
      if (dom.closeConfigBtn) {
        dom.closeConfigBtn.addEventListener("click", () => dom.configPopover.classList.add("hidden"));
      }
      document.addEventListener("click", (e) => {
        if (
          !dom.configPopover.classList.contains("hidden") &&
          !dom.configPopover.contains(e.target) &&
          e.target !== dom.toggleConfigBtn
        ) {
          dom.configPopover.classList.add("hidden");
        }
      });
    }

    dom.quickResetBtn.addEventListener("click", () => startBattle(state.mission));

    dom.generateMissionBtn.addEventListener("click", async () => {
      const prompt = dom.missionPromptInput.value.trim();
      dom.generateMissionBtn.disabled = true;
      dom.generateMissionBtn.textContent = "GEN...";
      try {
        const mission = await gemini.generateMission(prompt);
        startBattle(mission);
        if (mission._source === "simulated_fallback") {
          appendRadioEntry("SYSTEM", `Gemini fallback (${mission._error}). Loaded simulated 3D mission.`, "", "alert");
        } else if (mission._source === "gemini") {
          appendRadioEntry("COMMAND", `Gemini generated 3D scenario "${mission.operation_name}".`, "MISSION ACTIVE", "system");
        }
      } finally {
        dom.generateMissionBtn.disabled = false;
        dom.generateMissionBtn.textContent = "GENERATE";
      }
    });

    dom.viewport3d.addEventListener("contextmenu", (e) => e.preventDefault());
    dom.viewport3d.addEventListener("pointerdown", (e) => {
      state.orbit.dragging = true;
      state.orbit.downX = e.clientX;
      state.orbit.downY = e.clientY;
      state.orbit.lastX = e.clientX;
      state.orbit.lastY = e.clientY;
    });
    window.addEventListener("pointermove", (e) => {
      if (!state.orbit.dragging) return;
      const totalDist = Math.hypot(e.clientX - state.orbit.downX, e.clientY - state.orbit.downY);
      if (totalDist > 5 && state.camMode !== "orbit") {
        setCameraMode("orbit");
      }
      if (totalDist > 5) {
        const dx = e.clientX - state.orbit.lastX;
        const dy = e.clientY - state.orbit.lastY;
        state.orbit.yaw -= dx * 0.0065;
        const reconOn = dom.reconToggle.checked || state.phase === "GAME_OVER";
        const minPitch = reconOn ? 0.14 : 0.22;
        const maxPitch = reconOn ? 1.28 : 1.22;
        state.orbit.pitch = Math.max(minPitch, Math.min(maxPitch, state.orbit.pitch + dy * 0.0055));
      }
      state.orbit.lastX = e.clientX;
      state.orbit.lastY = e.clientY;
    });
    window.addEventListener("pointerup", (e) => {
      if (!state.orbit.dragging) return;
      state.orbit.dragging = false;
      const moveDist = Math.hypot(e.clientX - state.orbit.downX, e.clientY - state.orbit.downY);
      if (moveDist < 6 && state.phase === "RTS_ACTIVE") {
        const rect = dom.viewport3d.getBoundingClientRect();
        if (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        ) {
          handleViewportRTSClick(e);
        }
      }
    });
    dom.viewport3d.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        if (state.camMode !== "orbit") setCameraMode("orbit");
        const reconOn = dom.reconToggle.checked || state.phase === "GAME_OVER";
        const maxDist = reconOn ? 1150 : 920;
        state.orbit.dist = Math.max(220, Math.min(maxDist, state.orbit.dist + e.deltaY * 0.45));
      },
      { passive: false }
    );

    window.addEventListener("keydown", (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.code === "Tab") {
        e.preventDefault();
        const order = ["mortar", "tank", "recon"];
        const next = order[(order.indexOf(state.activeUnit) + 1) % order.length];
        setActiveUnit(next);
      } else if (e.code === "Space") {
        e.preventDefault();
        fireActiveUnit();
      } else if (e.code === "KeyR") {
        e.preventDefault();
        triggerCounterBatteryRadar("MANUAL SWEEP");
      } else if (e.code === "KeyT") {
        e.preventDefault();
        sendTankToCoord();
      } else if (e.code === "KeyG") {
        e.preventDefault();
        commandAdvanceRecon();
      } else if (e.code === "Digit1") {
        setCameraMode("pit");
      } else if (e.code === "Digit2") {
        setCameraMode("bino");
      } else if (e.code === "Digit3") {
        setCameraMode("orbit");
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        syncAzim(getUnit().azimuth - 1);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        syncAzim(getUnit().azimuth + 1);
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        syncAngle(getUnit().angle + 1);
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        syncAngle(getUnit().angle - 1);
      } else if (e.code === "KeyW") {
        state.driveInput.fwd = true;
      } else if (e.code === "KeyS") {
        state.driveInput.rev = true;
      } else if (e.code === "KeyA") {
        state.driveInput.left = true;
      } else if (e.code === "KeyD") {
        state.driveInput.right = true;
      }
    });

    window.addEventListener("keyup", (e) => {
      if (e.code === "KeyW") state.driveInput.fwd = false;
      else if (e.code === "KeyS") state.driveInput.rev = false;
      else if (e.code === "KeyA") state.driveInput.left = false;
      else if (e.code === "KeyD") state.driveInput.right = false;
    });
  }

  function handleViewportRTSClick(e) {
    const rect = dom.viewport3d.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);

    const pCenter = new THREE.Vector3(state.player.x, state.player.y + 6, state.player.z);
    if (state.player.hp > 0 && raycaster.ray.distanceToPoint(pCenter) < 22) {
      setActiveUnit("mortar");
      return;
    }

    const tCenter = new THREE.Vector3(state.tank.x, state.tank.y + 6, state.tank.z);
    if (state.tank.hp > 0 && raycaster.ray.distanceToPoint(tCenter) < 24) {
      setActiveUnit("tank");
      return;
    }

    const rCenter = new THREE.Vector3(state.recon.x, state.recon.y + 6, state.recon.z);
    if (state.recon.hp > 0 && raycaster.ray.distanceToPoint(rCenter) < 20) {
      setActiveUnit("recon");
      return;
    }

    const reconOn = dom.reconToggle.checked || state.phase === "GAME_OVER";
    for (const tKey of ["mortar", "tank", "scout", "radar", "sam", "depot", "tower", "train"]) {
      const tgt = getTargetInfo(tKey);
      if (!tgt || tgt.hp <= 0) continue;
      if (tgt.spotted || reconOn) {
        const pt = new THREE.Vector3(tgt.x, getTerrainHeight(tgt.x, tgt.z) + 6, tgt.z);
        if (raycaster.ray.distanceToPoint(pt) < 26) {
          selectCalledInCoord(tKey, { announce: true });
          triggerLaserSpotScan(false);
          return;
        }
      }
    }

    const hits = raycaster.intersectObject(terrainMesh, false);
    if (hits.length > 0) {
      const pt = hits[0].point;
      if (e.shiftKey || state.activeUnit === "recon") {
        if (state.recon.hp > 0) {
          setUnitWaypoint(state.recon, pt.x, pt.z, 460);
        }
      } else if (state.tank.hp > 0) {
        setUnitWaypoint(state.tank, pt.x, pt.z, 460);
      }
    }
  }

  function setUnitWaypoint(unitObj, wx, wz, maxE = 460) {
    unitObj.waypoint = {
      x: Math.max(-470, Math.min(maxE, wx)),
      z: Math.max(-260, Math.min(260, wz)),
    };
    updateWaypointVisuals();
    updateHUD();
  }

  function syncWaypointPair(ring, line, unitObj, maxE) {
    if (!ring || !line) return;
    if (!unitObj.waypoint || unitObj.hp <= 0 || state.phase !== "RTS_ACTIVE") {
      ring.visible = false;
      line.visible = false;
      return;
    }
    const wp = unitObj.waypoint;
    const wy = getExploredAt(wp.x, wp.z) >= 0.08 || dom.reconToggle.checked ? getTerrainHeight(wp.x, wp.z) + 2.2 : 4.0;
    ring.position.set(wp.x, wy, wp.z);
    ring.visible = true;
    line.geometry.dispose();
    line.geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(unitObj.x, unitObj.y + 5.5, unitObj.z),
      new THREE.Vector3(wp.x, wy, wp.z),
    ]);
    line.visible = true;
  }

  function updateWaypointVisuals() {
    syncWaypointPair(waypointRing, waypointLine, state.tank);
    syncWaypointPair(reconWaypointRing, reconWaypointLine, state.recon);
  }

  function setCameraMode(mode) {
    state.camMode = mode;
    dom.camButtons.forEach((b) => b.classList.toggle("active", b.dataset.cam === mode));
    dom.binoOverlay.classList.toggle("hidden", mode !== "bino");
    updateUnitTransforms();
  }

  function setActiveUnit(unitKey) {
    if (unitKey === "mortar" && state.player.hp <= 0) return;
    if (unitKey === "tank" && state.tank.hp <= 0) return;
    if (unitKey === "recon" && state.recon.hp <= 0) return;
    state.activeUnit = unitKey;

    dom.selectMortarBtn.classList.toggle("active", unitKey === "mortar");
    dom.selectTankBtn.classList.toggle("active", unitKey === "tank");
    dom.selectReconBtn.classList.toggle("active", unitKey === "recon");

    const isTank = unitKey === "tank";
    const u = isTank ? state.tank : state.player;
    if ((unitKey === "mortar" || unitKey === "tank") && isTargetKnown(state.activeTargetKey) && u._lastLoadedKey !== state.activeTargetKey) {
      const specs = computeDirectHitSpecs(isTank, state.activeTargetKey);
      u.azimuth = specs.azimuth;
      u.angle = specs.angle;
      u.power = specs.power;
      u._lastLoadedKey = state.activeTargetKey;
    }
    const minA = isTank ? 10 : 35;
    const maxA = isTank ? 65 : 85;

    dom.elevRangeLabel.textContent = `(${minA}°–${maxA}°)`;
    dom.angleSlider.min = minA;
    dom.angleSlider.max = maxA;
    dom.angleInput.min = minA;
    dom.angleInput.max = maxA;

    dom.azimSlider.value = u.azimuth;
    dom.azimInput.value = u.azimuth;
    dom.angleSlider.value = u.angle;
    dom.angleInput.value = u.angle;
    dom.powerSlider.value = u.power;
    dom.powerInput.value = u.power;

    dom.shellButtons.forEach((btn) => {
      const sh = btn.dataset.shell;
      const allowed = !isTank || sh === "HE" || sh === "SMOKE";
      btn.disabled = !allowed;
    });
    if (isTank && state.selectedShell !== "HE" && state.selectedShell !== "SMOKE") {
      dom.shellButtons.forEach((b) => b.classList.toggle("active", b.dataset.shell === "HE"));
      state.selectedShell = "HE";
    }

    updateUnitTransforms();
    renderCalledInCoordsUI();
    updateHUD();
  }

  /* ---------------- BATTLE & 3D TERRAIN SETUP ---------------- */
  function startBattle(mission) {
    state.mission = mission;
    state.phase = "RTS_ACTIVE";
    dom.reconToggle.checked = false;
    state.shellCamHoldUntil = 0;
    state.laserActiveUntil = 0;
    laserBeamLine.visible = false;
    laserTargetDot.visible = false;
    radarZoneGroup.visible = false;
    state.scorchGrid.fill(0);
    state.exploredGrid.fill(0);

    clearGroup(fxGroup);
    clearGroup(landmarkGroup);
    clearGroup(amenityGroup);
    clearGroup(worldFeatureGroup);
    clearGroup(treeGroup);
    state.projectiles = [];
    state.samMissiles = [];
    state.particles = [];
    state.flashes = [];
    state.smokePlumes = [];
    state.flares = [];
    state.revealZones = [];
    state.impactMarkers = [];
    state.riverSegments = [];
    state.railSegments = [];
    state.bridgeGroups = [];
    state.trees = [];

    state.playerShotCount = 0;
    state.enemyShotCount = 0;
    state.playerHistory = [];
    state.enemyHistory = [];
    state.windTimer = 15.0;
    state.specSyncTimer = 0;
    state.activeTargetKey = "mortar";
    if (dom.targetPrioritySelect) dom.targetPrioritySelect.value = "mortar";

    state.player.x = Math.round(-405 + Math.random() * 40);
    state.player.z = Math.round(-45 + Math.random() * 35);
    state.player.hp = 100;
    state.player.cooldown = 0;
    state.player._lastLoadedKey = null;

    state.tank.x = Math.round(-225 + Math.random() * 25);
    state.tank.z = Math.round(40 + Math.random() * 55);
    state.tank.heading = 0;
    state.tank.hp = 120;
    state.tank.fuel = state.tank.maxFuel;
    state.tank.cooldown = 0;
    state.tank.waypoint = null;
    state.tank._lastLoadedKey = null;

    state.recon.x = -295;
    state.recon.z = -35;
    state.recon.heading = 0;
    state.recon.hp = state.recon.maxHp;
    state.recon.waypoint = null;
    state.recon.binoBoostUntil = 0;
    state.recon.pinnedUntil = 0;
    state.recon.wasPinned = false;

    state.enemy.x = Math.round(275 + Math.random() * 145);
    state.enemy.z = Math.round((Math.random() - 0.5) * 210);
    state.enemy.hp = 100;
    state.enemy.spotted = false;
    state.enemy.cooldown = 11.0;
    state.enemy.thinking = false;

    state.enemyTank.x = 240;
    state.enemyTank.z = -55;
    state.enemyTank.heading = Math.PI;
    state.enemyTank.hp = state.enemyTank.maxHp;
    state.enemyTank.fuel = state.enemyTank.maxFuel;
    state.enemyTank.spotted = false;
    state.enemyTank.cooldown = 20.0;
    state.enemyTank.movePhase = 0;

    state.enemyScout.x = 250;
    state.enemyScout.z = 50;
    state.enemyScout.heading = Math.PI;
    state.enemyScout.hp = state.enemyScout.maxHp;
    state.enemyScout.spotted = false;
    state.enemyScout.pinnedUntil = 0;
    state.enemyScout.wasPinned = false;

    state.radar = { active: false, estX: state.enemy.x, estZ: state.enemy.z, radius: 90, detections: 0, cooldown: 0, maxCooldown: 5.0 };
    state.train = { x: -420, z: -168, y: 0, vx: 32, hp: 110, maxHp: 110, destroyed: false, respawnTimer: 0, steamTimer: 0, spotted: false };

    state.windX = Number((mission.base_wind ?? (Math.random() - 0.5) * 9).toFixed(1));
    state.windZ = Number(((Math.random() - 0.5) * 5.5).toFixed(1));

    applyTheme(mission.theme || "desert");
    generateTerrain3D(mission);
    placeLandmarks3D(mission.landmarks || []);
    buildWorldFeaturesAndAmenities();

    state.player.y = getTerrainHeight(state.player.x, state.player.z);
    state.tank.y = getTerrainHeight(state.tank.x, state.tank.z);
    state.recon.y = getTerrainHeight(state.recon.x, state.recon.z);
    state.enemy.y = getTerrainHeight(state.enemy.x, state.enemy.z);
    state.enemyTank.y = getTerrainHeight(state.enemyTank.x, state.enemyTank.z);
    state.enemyScout.y = getTerrainHeight(state.enemyScout.x, state.enemyScout.z);

    playerUnit.root.visible = true;
    tankUnit.root.visible = true;
    reconUnit.root.visible = true;
    trainGroup.visible = true;
    state.lastFiringUnit = "ALPHA-1";
    setActiveUnit("mortar");
    refreshFogAndTerrain();
    updateUnitTransforms();
    updateWaypointVisuals();

    dom.opTitle.textContent = mission.operation_name || "OP: IRON RIDGE";
    dom.opBriefing.textContent = mission.briefing || "";
    dom.spotterLog.innerHTML = "";
    dom.shotHistoryBody.innerHTML = "";
    dom.enemyReasoning.textContent = "Monitoring unknown eastern sector (unspotted)...";
    dom.enemyTaunt.textContent = "";

    appendRadioEntry(
      "SENTINEL-R1",
      "Combined-Arms RTS Live: Click RADAR SWEEP (R) to triangulate launches, TANK -> COORDS (T) to send VIPER-1 to guessed/spotted coords, or ADVANCE RECON (G) for BRAVO-2 binoculars!",
      "ALL SYMMETRIC AMENITIES ONLINE",
      "system"
    );

    renderCalledInCoordsUI();
    updateHUD();
  }

  function clearGroup(grp) {
    while (grp.children.length > 0) {
      grp.remove(grp.children[0]);
    }
  }

  function applyTheme(themeKey) {
    const t = THEMES[themeKey] || THEMES.desert;
    scene.background.setHex(t.sky);
    scene.fog.color.setHex(t.fogColor);
    ambientLight.color.setHex(t.ambient);
    sunLight.color.setHex(t.sunColor);
    sunLight.intensity = themeKey === "night" ? 0.55 : 1.15;
    starField.visible = Boolean(t.stars);
    snowPoints.visible = Boolean(t.snow);
  }

  function getRiverCenterX(wz) {
    return -145 + 22 * Math.sin(wz * 0.012);
  }

  function isBridgeCrossing(wz) {
    return Math.abs(wz - -95) < 16 || Math.abs(wz - 85) < 16 || Math.abs(wz - -168) < 14;
  }

  function generateTerrain3D(mission) {
    const ridgeCenter = (Math.random() - 0.5) * 30;
    const ridgeH = mission.ridge_height || 140;
    const rough = mission.roughness ?? 0.55;
    const p1 = Math.random() * Math.PI * 2;
    const p2 = Math.random() * Math.PI * 2;
    const p3 = Math.random() * Math.PI * 2;
    state.ridgePeakY = ridgeH;

    for (let iz = 0; iz < ROWS; iz++) {
      const z = -WORLD_D / 2 + iz * CELL;
      const rivX = getRiverCenterX(z);
      const bridge = isBridgeCrossing(z);
      const distRail = Math.abs(z - -168);

      for (let ix = 0; ix < COLS; ix++) {
        const x = -WORLD_W / 2 + ix * CELL;

        const ridgeCurve = ridgeCenter + 36 * Math.sin(z * 0.011 + p1);
        const dRidge = (x - ridgeCurve) / (105 + 22 * Math.cos(z * 0.015));
        const passDip = 0.8 + 0.2 * Math.cos(z * 0.014 + p2);
        const ridge = ridgeH * passDip * Math.exp(-(dRidge * dRidge));

        const hills =
          (14 + rough * 22) * Math.sin(x * 0.013 + p1) * Math.cos(z * 0.016 + p2) +
          (8 + rough * 14) * Math.sin(x * 0.031 - z * 0.025 + p3) +
          (4 + rough * 8) * Math.cos(x * 0.06 + z * 0.055);

        const edgeRim = Math.pow(Math.max(0, (Math.abs(z) - 210) / 90), 2) * 58;
        let h = Math.max(8, ridge + Math.max(0, hills + 14) + edgeRim);

        // Gently grade the northern rail corridor through the ridge
        if (distRail < 18 && h > 44) {
          const rBlend = Math.min(1, distRail / 18);
          h = 44 + (h - 44) * rBlend * rBlend;
        }

        // Carve North-South river channel except at stone bridge approaches
        const distRiv = Math.abs(x - rivX);
        if (!bridge && distRiv < 22) {
          const rt = Math.pow(distRiv / 22, 1.5);
          h = h * rt + 5 * (1 - rt);
        }

        state.heightGrid[iz * COLS + ix] = h;
      }
    }

    const pads = [
      [state.player.x, state.player.z, 26],
      [state.tank.x, state.tank.z, 20],
      [state.recon.x, state.recon.z, 16],
      [state.enemy.x, state.enemy.z, 26],
      [state.enemyTank.x, state.enemyTank.z, 20],
      [state.enemyScout.x, state.enemyScout.z, 16],
      [-355, -130, 20],
      [-315, -90, 20],
      [-275, 125, 24],
      [-108, -100, 18],
      [345, -130, 20],
      [305, -85, 20],
      [285, 125, 24],
      [108, 95, 18],
    ];
    pads.forEach(([px, pz, pr]) => flattenPad3D(px, pz, pr));
  }

  function buildWorldFeaturesAndAmenities() {
    state.amenities = {};
    state.radarLabelEl = null;

    // 1. River water segments (segmented so unexplored sections stay hidden under shroud)
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x1e5c78,
      roughness: 0.25,
      metalness: 0.45,
      transparent: true,
      opacity: 0.8,
    });
    for (let z = -WORLD_D / 2; z < WORLD_D / 2; z += 20) {
      const zMid = z + 10;
      const rx = getRiverCenterX(zMid);
      const nextX = getRiverCenterX(z + 20);
      const prevX = getRiverCenterX(z);
      const seg = new THREE.Mesh(new THREE.PlaneGeometry(24, 22), waterMat);
      seg.rotation.x = -Math.PI / 2;
      seg.rotation.z = -Math.atan2(nextX - prevX, 20);
      seg.position.set(rx, 11.2, zMid);
      worldFeatureGroup.add(seg);
      state.riverSegments.push({ mesh: seg, x: rx, z: zMid });
    }

    // 2. Three bridges across the river (North Rail Trestle z=-168, North Stone z=-95, South Stone z=85)
    const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85, flatShading: true });
    for (const bz of [-168, -95, 85]) {
      const bx = getRiverCenterX(bz);
      const bg = new THREE.Group();
      const deckY = getTerrainHeight(bx, bz) + 1.2;
      const deck = new THREE.Mesh(new THREE.BoxGeometry(52, 2.2, 16), bridgeMat);
      deck.position.set(0, deckY, 0);
      deck.castShadow = true;
      deck.receiveShadow = true;
      bg.add(deck);
      for (const side of [-7.5, 7.5]) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(52, 2.0, 1.4), bridgeMat);
        wall.position.set(0, deckY + 2.0, side);
        bg.add(wall);
      }
      bg.position.set(bx, 0, bz);
      worldFeatureGroup.add(bg);
      state.bridgeGroups.push({ group: bg, x: bx, z: bz });
    }

    // 3. West-East Rail Line at z = -168 (segmented so shroud conceals eastern track)
    const railMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.4, metalness: 0.7 });
    const tieMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.95 });
    for (let x = -490; x < 490; x += 25) {
      const xm = x + 12.5;
      const rg = new THREE.Group();
      const yA = getTerrainHeight(x, -168);
      const yB = getTerrainHeight(x + 25, -168);
      const ym = (yA + yB) * 0.5 + 1.0;
      const pitch = Math.atan2(yB - yA, 25);
      for (const rz of [-2.8, 2.8]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(25.2, 0.7, 0.7), railMat);
        rail.position.set(0, 0.4, rz);
        rg.add(rail);
      }
      for (let t = -9; t <= 9; t += 6) {
        const tie = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 8.2), tieMat);
        tie.position.set(t, 0, 0);
        rg.add(tie);
      }
      rg.position.set(xm, ym, -168);
      rg.rotation.z = pitch;
      worldFeatureGroup.add(rg);
      state.railSegments.push({ group: rg, x: xm, z: -168 });
    }

    // 4. Destructible 3D Trees across valleys, riverbanks, and ridges
    for (let i = 0; i < 65; i++) {
      const tx = -440 + Math.random() * 880;
      const tz = -240 + Math.random() * 480;
      if (Math.abs(tz - -168) < 20) continue; // Keep rail clear
      if (Math.abs(tx - getRiverCenterX(tz)) < 20) continue; // Keep river bed clear
      if (Math.hypot(tx - state.player.x, tz - state.player.z) < 28) continue;
      if (Math.hypot(tx - state.enemy.x, tz - state.enemy.z) < 28) continue;
      if (Math.hypot(tx - state.tank.x, tz - state.tank.z) < 24) continue;
      const ty = getTerrainHeight(tx, tz);
      const scale = 0.8 + Math.random() * 0.55;
      const tree = createTreeMesh(scale);
      tree.position.set(tx, ty, tz);
      treeGroup.add(tree);
      state.trees.push({ x: tx, z: tz, y: ty, scale, alive: true, group: tree });
    }

    // 5. Symmetric Base Amenities on Both Sides (Radar, SAM, Fuel Depot, Sniper Belltower)
    const defs = [
      { key: "west_radar", side: "west", kind: "radar", name: "West Counter-Radar", x: -355, z: -130, hp: 80, color: 0x38bdf8 },
      { key: "west_sam", side: "west", kind: "sam", name: "West SAM Defense", x: -315, z: -90, hp: 85, color: 0x4ade80 },
      { key: "west_depot", side: "west", kind: "depot", name: "West Fuel Base", x: -275, z: 125, hp: 90, color: 0x38bdf8 },
      { key: "west_tower", side: "west", kind: "tower", name: "West Sniper Tower", x: -108, z: -100, hp: 75, color: 0xa3e635 },
      { key: "east_radar", side: "east", kind: "radar", name: "East Radar Dish", x: 345, z: -130, hp: 80, color: 0xf87171 },
      { key: "east_sam", side: "east", kind: "sam", name: "East SAM Defense", x: 305, z: -85, hp: 85, color: 0xf97316 },
      { key: "east_depot", side: "east", kind: "depot", name: "East Fuel Base", x: 285, z: 125, hp: 90, color: 0xf87171 },
      { key: "east_tower", side: "east", kind: "tower", name: "East Sniper Tower", x: 108, z: 95, hp: 75, color: 0xf43f5e },
    ];

    defs.forEach((d) => {
      const y = getTerrainHeight(d.x, d.z);
      const obj = d.kind === "sam" ? createSamMesh(d.color) : createLandmarkMesh(d.kind);
      obj.group.position.set(d.x, y, d.z);
      amenityGroup.add(obj.group);

      const labelEl = document.createElement("div");
      labelEl.className = `landmark-tag ${d.side === "west" ? "friendly-tag" : "enemy-tag clickable-tag"}`;
      labelEl.textContent = d.name;
      if (d.side === "east") {
        labelEl.title = "Click to aim at target (or send VIPER-1 Tank when Tank is selected)";
        labelEl.addEventListener("click", (ev) => {
          ev.stopPropagation();
          selectCalledInCoord(d.kind, { announce: true });
          if (state.activeUnit === "tank") sendTankToCoord(d.kind);
        });
      }
      dom.labelsLayer.appendChild(labelEl);

      state.amenities[d.key] = {
        ...d,
        y,
        maxHp: d.hp,
        discovered: d.side === "west",
        cooldown: 0,
        group: obj.group,
        spinner: obj.spinner || null,
        turret: obj.turret || null,
        labelEl,
      };
    });

    // Floating HUD label for Counter-Battery Radar Launch Zone
    const rEl = document.createElement("div");
    rEl.className = "landmark-tag radar-est-tag clickable-tag";
    rEl.style.display = "none";
    rEl.title = "Click to aim at Radar Estimate (or send VIPER-1 Tank when Tank is selected)";
    rEl.addEventListener("click", (ev) => {
      ev.stopPropagation();
      selectCalledInCoord("radar_est", { announce: true });
      if (state.activeUnit === "tank") sendTankToCoord("radar_est");
    });
    dom.labelsLayer.appendChild(rEl);
    state.radarLabelEl = rEl;
  }

  function flattenPad3D(cx, cz, radius) {
    const centerH = getTerrainHeight(cx, cz);
    for (let iz = 0; iz < ROWS; iz++) {
      const z = -WORLD_D / 2 + iz * CELL;
      for (let ix = 0; ix < COLS; ix++) {
        const x = -WORLD_W / 2 + ix * CELL;
        const d = Math.hypot(x - cx, z - cz);
        if (d < radius) {
          const t = d / radius;
          const blend = t < 0.55 ? 0 : (t - 0.55) / 0.45;
          const idx = iz * COLS + ix;
          state.heightGrid[idx] = centerH * (1 - blend) + state.heightGrid[idx] * blend;
        }
      }
    }
  }

  /* ---------------- 3D RAYCASTED LINE-OF-SIGHT & FOG OF WAR ---------------- */
  function hasLineOfSight3D(x0, y0, z0, x1, y1, z1) {
    const steps = 18;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const sx = x0 + (x1 - x0) * t;
      const sy = y0 + (y1 - y0) * t;
      const sz = z0 + (z1 - z0) * t;
      if (sy < getTerrainHeight(sx, sz) + 1.5) {
        return false;
      }
    }
    return true;
  }

  function getTankMaxRange() {
    return state.tank.y > 55 ? 480 : 380;
  }

  function getReconMaxRange() {
    return state.recon.y > 55 || performance.now() < state.recon.binoBoostUntil ? 600 : 520;
  }

  function tankHasLOS(tx, ty, tz) {
    if (state.tank.hp <= 0) return false;
    const dist = Math.hypot(tx - state.tank.x, tz - state.tank.z);
    if (dist > getTankMaxRange()) return false;
    return hasLineOfSight3D(state.tank.x, state.tank.y + 9, state.tank.z, tx, ty, tz);
  }

  function reconHasLOS(tx, ty, tz) {
    if (state.recon.hp <= 0) return false;
    const dist = Math.hypot(tx - state.recon.x, tz - state.recon.z);
    if (dist > getReconMaxRange()) return false;
    return hasLineOfSight3D(state.recon.x, state.recon.y + 6.5, state.recon.z, tx, ty, tz);
  }

  function canCallCoordinates() {
    const tankCan = state.tank.hp > 0 && tankHasLOS(state.enemy.x, state.enemy.y + 6, state.enemy.z);
    const reconUnpinned = state.recon.hp > 0 && performance.now() >= state.recon.pinnedUntil;
    return tankCan || reconUnpinned;
  }

  function computeVisibilityAt(wx, wz, wy) {
    if (dom.reconToggle.checked || state.phase === "GAME_OVER") return 1.0;

    const targetY = wy !== undefined ? wy : getTerrainHeight(wx, wz);
    let vis = 0.0;

    const addCircleVis = (cx, cz, rad) => {
      const d = Math.hypot(wx - cx, wz - cz);
      if (d < rad) {
        const v = d < rad * 0.7 ? 1.0 : 1.0 - (d - rad * 0.7) / (rad * 0.3);
        if (v > vis) vis = v;
      }
    };

    // 1) ALPHA-1 Mortar Pit & Friendly Base Amenities
    if (state.player.hp > 0) addCircleVis(state.player.x, state.player.z, 90);
    for (const key of ["west_radar", "west_sam", "west_depot", "west_tower"]) {
      const am = state.amenities[key];
      if (am && am.hp > 0) addCircleVis(am.x, am.z, key === "west_tower" ? 145 : 85);
    }

    // 2) VIPER-1 Recon Tank (55m hull + raycasted optics 380m / 480m on ridge)
    if (state.tank.hp > 0 && vis < 1.0) {
      const dt = Math.hypot(wx - state.tank.x, wz - state.tank.z);
      const maxR = getTankMaxRange();
      if (dt < 55) {
        vis = 1.0;
      } else if (dt < maxR && hasLineOfSight3D(state.tank.x, state.tank.y + 9, state.tank.z, wx, targetY + 2, wz)) {
        const vt = dt < maxR * 0.85 ? 1.0 : 1.0 - (dt - maxR * 0.85) / (maxR * 0.15);
        if (vt > vis) vis = vt;
      }
    }

    // 3) BRAVO-2 Ground Crew Binoculars (55m + 520m/600m long-range raycasted optics)
    if (state.recon.hp > 0 && vis < 1.0) {
      const dr = Math.hypot(wx - state.recon.x, wz - state.recon.z);
      const maxR = getReconMaxRange();
      if (dr < 55) {
        vis = 1.0;
      } else if (dr < maxR && hasLineOfSight3D(state.recon.x, state.recon.y + 6.5, state.recon.z, wx, targetY + 2, wz)) {
        const vr = dr < maxR * 0.85 ? 1.0 : 1.0 - (dr - maxR * 0.85) / (maxR * 0.15);
        if (vr > vis) vis = vr;
      }
    }

    // 4) Parachute Flares (220m) & Smoke / Reveal Zones
    for (const f of state.flares) addCircleVis(f.x, f.z, 220);
    for (const z of state.revealZones) addCircleVis(z.x, z.z, z.radius);

    return vis;
  }

  function isPointRevealed(wx, wz) {
    return computeVisibilityAt(wx, wz) >= 0.35;
  }

  function getExploredAt(wx, wz) {
    if (dom.reconToggle.checked || state.phase === "GAME_OVER") return 1.0;
    const fx = Math.max(0, Math.min(SEG_X - 0.001, (wx + WORLD_W / 2) / CELL));
    const fz = Math.max(0, Math.min(SEG_Z - 0.001, (wz + WORLD_D / 2) / CELL));
    return state.exploredGrid[Math.round(fz) * COLS + Math.round(fx)] || 0;
  }

  function refreshFogAndTerrain(skipDiscovery = false) {
    for (let iz = 0; iz < ROWS; iz++) {
      const z = -WORLD_D / 2 + iz * CELL;
      for (let ix = 0; ix < COLS; ix++) {
        const x = -WORLD_W / 2 + ix * CELL;
        const idx = iz * COLS + ix;
        state.visibilityGrid[idx] = computeVisibilityAt(x, z, state.heightGrid[idx]);
      }
    }
    const tmp = new Float32Array(COLS * ROWS);
    for (let pass = 0; pass < 2; pass++) {
      for (let iz = 0; iz < ROWS; iz++) {
        for (let ix = 0; ix < COLS; ix++) {
          let sum = 0;
          let weight = 0;
          for (let dz = -1; dz <= 1; dz++) {
            const nz = iz + dz;
            if (nz < 0 || nz >= ROWS) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const nx = ix + dx;
              if (nx < 0 || nx >= COLS) continue;
              const w = dx === 0 && dz === 0 ? 4 : dx === 0 || dz === 0 ? 2 : 1;
              sum += state.visibilityGrid[nz * COLS + nx] * w;
              weight += w;
            }
          }
          tmp[iz * COLS + ix] = sum / weight;
        }
      }
      state.visibilityGrid.set(tmp);
    }

    for (let i = 0; i < COLS * ROWS; i++) {
      if (state.visibilityGrid[i] > state.exploredGrid[i]) {
        state.exploredGrid[i] = state.visibilityGrid[i];
      }
    }

    let anyNewCoord = false;
    state.landmarks.forEach((lm, idx) => {
      if (!lm.discovered && isPointRevealed(lm.x, lm.z)) {
        lm.discovered = true;
        anyNewCoord = true;
        if (state.phase === "RTS_ACTIVE" && !skipDiscovery) {
          appendRadioEntry(
            "RECON OPTICS",
            `Landmark spotted: ${lm.name} at E:${Math.round(lm.x)} N:${Math.round(-lm.z)}.`,
            "LANDMARK COORDS LOGGED",
            "system",
            `landmark_${idx}`
          );
        }
      }
    });

    // Discover eastern amenities & enemy mobile forces via Tank/Binocular LOS or Flares
    for (const key of ["east_radar", "east_sam", "east_depot", "east_tower"]) {
      const am = state.amenities[key];
      if (am && !am.discovered && isPointRevealed(am.x, am.z)) {
        am.discovered = true;
        anyNewCoord = true;
        if (state.phase === "RTS_ACTIVE" && !skipDiscovery) {
          const shortKey = key.replace("east_", "");
          const note =
            key === "east_radar"
              ? "Guides East SAM! Destroy it to blind their air defense."
              : key === "east_sam"
                ? "Radar-guided SAM defense battery!"
                : key === "east_depot"
                  ? "Supplies enemy tank fuel! Blow it up to strand KRONOS-2."
                  : "Sniper Belltower! Snipers pin ground scouts (cannot call in coords).";
          appendRadioEntry("RECON OPTICS", `Discovered ${am.name} (E:${am.x} N:${-am.z}) — ${note}`, "ASSET SPOTTED", "system", shortKey);
        }
      }
    }

    if (!state.enemyTank.spotted && state.enemyTank.hp > 0 && isPointRevealed(state.enemyTank.x, state.enemyTank.z)) {
      state.enemyTank.spotted = true;
      anyNewCoord = true;
      if (state.phase === "RTS_ACTIVE" && !skipDiscovery) {
        appendRadioEntry("RECON OPTICS", `Hostile armor spotted: KRONOS-2 Battle Tank at E:${Math.round(state.enemyTank.x)} N:${Math.round(-state.enemyTank.z)}!`, "ENEMY TANK", "alert", "tank");
      }
    }
    if (!state.enemyScout.spotted && state.enemyScout.hp > 0 && isPointRevealed(state.enemyScout.x, state.enemyScout.z)) {
      state.enemyScout.spotted = true;
      anyNewCoord = true;
      if (state.phase === "RTS_ACTIVE" && !skipDiscovery) {
        appendRadioEntry("RECON OPTICS", `Hostile binocular scouts spotted at E:${Math.round(state.enemyScout.x)} N:${Math.round(-state.enemyScout.z)} (SHADOW-3)!`, "ENEMY SCOUT", "system", "scout");
      }
    }
    if (!state.train.spotted && !state.train.destroyed && isPointRevealed(state.train.x, state.train.z)) {
      state.train.spotted = true;
      anyNewCoord = true;
      if (state.phase === "RTS_ACTIVE" && !skipDiscovery) {
        appendRadioEntry("RECON OPTICS", `Armored Supply Train spotted along rail line at E:${Math.round(state.train.x)} N:${Math.round(-state.train.z)}!`, "SUPPLY TRAIN COORDS", "system", "train");
      }
    }

    if (!skipDiscovery && state.phase === "RTS_ACTIVE" && !state.enemy.spotted && state.enemy.hp > 0) {
      const tankSeesEnemy = tankHasLOS(state.enemy.x, state.enemy.y + 6, state.enemy.z);
      const reconSeesEnemy = reconHasLOS(state.enemy.x, state.enemy.y + 6, state.enemy.z);
      const flareSeesEnemy = hasActiveFlareNear(state.enemy.x, state.enemy.z);
      const reconUnpinned = performance.now() >= state.recon.pinnedUntil;

      if (tankSeesEnemy || flareSeesEnemy || (reconSeesEnemy && reconUnpinned)) {
        state.enemy.spotted = true;
        anyNewCoord = true;
        if (state.activeTargetKey === "radar_est") {
          state.activeTargetKey = "mortar";
        }
        const spotterCall = tankSeesEnemy ? "VIPER-1" : "BRAVO-2";
        triggerLaserSpotScan(true, spotterCall, "mortar");
      } else if (reconSeesEnemy && !reconUnpinned && !state.recon.wasPinnedWarned) {
        state.recon.wasPinnedWarned = true;
        appendRadioEntry(
          "BRAVO-2",
          "Enemy battery in binocular view, BUT Belltower Sniper fire has our radio pinned — CANNOT CALL COORDS! Destroy East Sniper Tower or bring VIPER-1 Tank up!",
          "PINNED BY SNIPER — COORDS BLOCKED",
          "alert"
        );
      }
    }

    if (anyNewCoord) renderCalledInCoordsUI();
    syncTerrainColorsAndMist();
  }

  function syncTerrainColorsAndMist() {
    const theme = THEMES[state.mission.theme] || THEMES.desert;
    const reconOn = dom.reconToggle.checked || state.phase === "GAME_OVER";
    const cLow = new THREE.Color(theme.lowColor);
    const cMid = new THREE.Color(theme.midColor);
    const cHigh = new THREE.Color(theme.highColor);
    const cScorch = new THREE.Color(0x161412);
    const cCyanRim = new THREE.Color(0x22d3ee);
    const cShroud = new THREE.Color(0.01, 0.012, 0.018);
    const cBiome = new THREE.Color();
    const cShadow = new THREE.Color();
    const cFinal = new THREE.Color();

    const posAttr = terrainGeo.attributes.position;
    const colAttr = terrainGeo.attributes.color;

    for (let iz = 0; iz < ROWS; iz++) {
      for (let ix = 0; ix < COLS; ix++) {
        const idx = iz * COLS + ix;
        const vIdx = state.vertMap[idx];
        const h = state.heightGrid[idx];
        const vis = reconOn ? 1.0 : state.visibilityGrid[idx];
        const exp = reconOn ? 1.0 : state.exploredGrid[idx];

        // Unexplored shroud flattens terrain height so hills/valleys remain completely unknown until scouted
        const shroudT = Math.min(1, exp / 0.35);
        posAttr.setY(vIdx, 2 + (h - 2) * shroudT);

        const normH = Math.max(0, Math.min(1, h / (state.ridgePeakY + 25)));
        if (normH < 0.45) {
          cBiome.copy(cLow).lerp(cMid, normH / 0.45);
        } else {
          cBiome.copy(cMid).lerp(cHigh, (normH - 0.45) / 0.55);
        }

        const scorch = state.scorchGrid[idx];
        if (scorch > 0) {
          cBiome.lerp(cScorch, Math.min(0.88, scorch));
        }

        // Desaturated 18% explored memory fog vs pure black unexplored shroud
        const luma = cBiome.r * 0.3 + cBiome.g * 0.59 + cBiome.b * 0.11;
        cShadow.setRGB(
          luma * 0.16 + 0.032,
          luma * 0.17 + 0.04,
          luma * 0.19 + 0.048
        );

        if (exp < 0.05) {
          cFinal.copy(cShroud);
        } else if (vis < 0.25) {
          const memT = Math.min(1, exp * 1.5);
          cFinal.copy(cShroud).lerp(cShadow, memT);
        } else if (vis <= 0.42) {
          // Subtle cyan LOS perimeter highlight along the live raycasted visibility boundary
          const edgeT = (vis - 0.25) / 0.17;
          cFinal.copy(cShadow).lerp(cBiome, edgeT * 0.65);
          cFinal.lerp(cCyanRim, 0.32 * Math.sin(edgeT * Math.PI));
        } else {
          const litT = (vis - 0.42) / 0.58;
          cFinal.copy(cShadow).lerp(cBiome, 0.65 + 0.35 * litT);
        }

        colAttr.setXYZ(vIdx, cFinal.r, cFinal.g, cFinal.b);
      }
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    terrainGeo.computeVertexNormals();
    terrainGeo.computeBoundingSphere();

    rebuildDrapedGrid();
  }

  function rebuildDrapedGrid() {
    const pts = [];
    for (let z = -200; z <= 200; z += 100) {
      for (let x = -480; x < 480; x += 20) {
        if (!isPointRevealed(x + 10, z)) continue;
        pts.push(x, getTerrainHeight(x, z) + 0.5, z);
        pts.push(x + 20, getTerrainHeight(x + 20, z) + 0.5, z);
      }
    }
    for (let x = -400; x <= 400; x += 100) {
      for (let z = -280; z < 280; z += 20) {
        if (!isPointRevealed(x, z + 10)) continue;
        pts.push(x, getTerrainHeight(x, z) + 0.5, z);
        pts.push(x, getTerrainHeight(x, z + 20) + 0.5, z + 20);
      }
    }
    gridLines.geometry.dispose();
    gridLines.geometry = new THREE.BufferGeometry();
    gridLines.geometry.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  }

  function getTerrainHeight(wx, wz) {
    const fx = Math.max(0, Math.min(SEG_X - 0.001, (wx + WORLD_W / 2) / CELL));
    const fz = Math.max(0, Math.min(SEG_Z - 0.001, (wz + WORLD_D / 2) / CELL));
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;

    const h00 = state.heightGrid[iz * COLS + ix];
    const h10 = state.heightGrid[iz * COLS + (ix + 1)];
    const h01 = state.heightGrid[(iz + 1) * COLS + ix];
    const h11 = state.heightGrid[(iz + 1) * COLS + (ix + 1)];

    const h0 = h00 * (1 - tx) + h10 * tx;
    const h1 = h01 * (1 - tx) + h11 * tx;
    return h0 * (1 - tz) + h1 * tz;
  }

  function getTerrainNormal(wx, wz) {
    const eps = 5;
    const hL = getTerrainHeight(wx - eps, wz);
    const hR = getTerrainHeight(wx + eps, wz);
    const hD = getTerrainHeight(wx, wz - eps);
    const hU = getTerrainHeight(wx, wz + eps);
    return new THREE.Vector3(hL - hR, 2 * eps, hD - hU).normalize();
  }

  function placeLandmarks3D(defs) {
    state.landmarks = [];
    dom.labelsLayer.innerHTML = "";
    const slots = [
      { x: 55, z: -150 },
      { x: 185, z: -10 },
      { x: 415, z: 15 },
      { x: 215, z: 155 },
    ];
    const amenityCoords = [
      { x: 345, z: -130 },
      { x: 305, z: -85 },
      { x: 285, z: 125 },
      { x: 108, z: 95 },
      { x: -108, z: -100 },
    ];

    defs.slice(0, 4).forEach((item, idx) => {
      const slot = slots[idx] || { x: 250, z: 0 };
      let lx = slot.x + Math.round((Math.random() - 0.5) * 40);
      let lz = slot.z + Math.round((Math.random() - 0.5) * 40);

      if (Math.hypot(lx - state.enemy.x, lz - state.enemy.z) < 65) {
        lz += lz >= state.enemy.z ? 65 : -65;
      }
      for (const ac of amenityCoords) {
        if (Math.hypot(lx - ac.x, lz - ac.z) < 65) {
          lz += lz >= ac.z ? 65 : -65;
        }
      }
      lx = Math.max(40, Math.min(460, lx));
      lz = Math.max(-235, Math.min(235, lz));

      const ly = getTerrainHeight(lx, lz);
      const meshObj = createLandmarkMesh(item.type || "bunker");
      meshObj.group.position.set(lx, ly, lz);
      landmarkGroup.add(meshObj.group);

      const labelEl = document.createElement("div");
      labelEl.className = "landmark-tag clickable-tag";
      labelEl.textContent = item.name;
      labelEl.title = "Click to aim at landmark (or send VIPER-1 Tank when Tank is selected)";
      labelEl.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const k = `landmark_${idx}`;
        selectCalledInCoord(k, { announce: true });
        if (state.activeUnit === "tank") sendTankToCoord(k);
      });
      dom.labelsLayer.appendChild(labelEl);

      state.landmarks.push({
        name: item.name,
        type: item.type || "bunker",
        x: lx,
        y: ly,
        z: lz,
        discovered: false,
        group: meshObj.group,
        spinner: meshObj.spinner,
        labelEl,
      });
    });
  }

  function createLandmarkMesh(type) {
    const group = new THREE.Group();
    let spinner = null;
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8a8275, roughness: 0.9, flatShading: true });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.5, metalness: 0.5 });

    if (type === "tower") {
      const body = new THREE.Mesh(new THREE.BoxGeometry(10, 26, 10), stoneMat);
      body.position.y = 13;
      body.castShadow = true;
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(8.5, 11, 4),
        new THREE.MeshStandardMaterial({ color: 0x7c2d12, flatShading: true })
      );
      roof.position.y = 31.5;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      group.add(body, roof);
    } else if (type === "depot") {
      const tankMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.45, metalness: 0.4 });
      const tankGeo = new THREE.CylinderGeometry(5, 5, 18, 12);
      tankGeo.rotateZ(Math.PI / 2);
      const t1 = new THREE.Mesh(tankGeo, tankMat);
      t1.position.set(0, 5, -6);
      t1.castShadow = true;
      const t2 = new THREE.Mesh(tankGeo, tankMat);
      t2.position.set(0, 5, 6);
      t2.castShadow = true;
      const shed = new THREE.Mesh(new THREE.BoxGeometry(14, 9, 10), stoneMat);
      shed.position.set(-14, 4.5, 0);
      shed.castShadow = true;
      group.add(t1, t2, shed);
    } else if (type === "radar") {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(4, 6, 14, 6), metalMat);
      base.position.y = 7;
      base.castShadow = true;
      spinner = new THREE.Group();
      spinner.position.y = 16;
      const dish = new THREE.Mesh(
        new THREE.SphereGeometry(9, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.42),
        new THREE.MeshStandardMaterial({ color: 0xcbd5e1, side: THREE.DoubleSide, flatShading: true })
      );
      dish.rotation.x = Math.PI * 0.65;
      spinner.add(dish);
      group.add(base, spinner);
    } else {
      const bunker = new THREE.Mesh(new THREE.BoxGeometry(22, 9, 16), stoneMat);
      bunker.position.y = 4.5;
      bunker.castShadow = true;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(25, 2.5, 19), metalMat);
      roof.position.y = 10;
      group.add(bunker, roof);
    }

    return { group, spinner };
  }

  function updateUnitTransforms() {
    state.player.y = getTerrainHeight(state.player.x, state.player.z);
    playerUnit.root.position.set(state.player.x, state.player.y, state.player.z);
    playerUnit.yawGroup.rotation.y = -(state.player.azimuth * Math.PI) / 180;
    playerUnit.pitchGroup.rotation.z = (state.player.angle * Math.PI) / 180;

    state.tank.y = getTerrainHeight(state.tank.x, state.tank.z);
    tankUnit.root.position.set(state.tank.x, state.tank.y, state.tank.z);
    const nrm = getTerrainNormal(state.tank.x, state.tank.z);
    tankUnit.slopeGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), nrm);
    tankUnit.hullSpinGroup.rotation.y = state.tank.heading;
    const tAzim = (state.tank.azimuth * Math.PI) / 180;
    tankUnit.yawGroup.rotation.y = -tAzim - state.tank.heading;
    tankUnit.pitchGroup.rotation.z = (state.tank.angle * Math.PI) / 180;

    state.recon.y = getTerrainHeight(state.recon.x, state.recon.z);
    reconUnit.root.position.set(state.recon.x, state.recon.y, state.recon.z);
    reconUnit.root.rotation.y = state.recon.heading;

    state.enemy.y = getTerrainHeight(state.enemy.x, state.enemy.z);
    enemyUnit.root.position.set(state.enemy.x, state.enemy.y, state.enemy.z);
    enemyUnit.yawGroup.rotation.y = Math.PI - (state.enemy.azimuth * Math.PI) / 180;
    enemyUnit.pitchGroup.rotation.z = (state.enemy.angle * Math.PI) / 180;

    state.enemyTank.y = getTerrainHeight(state.enemyTank.x, state.enemyTank.z);
    enemyTankUnit.root.position.set(state.enemyTank.x, state.enemyTank.y, state.enemyTank.z);
    const eNrm = getTerrainNormal(state.enemyTank.x, state.enemyTank.z);
    enemyTankUnit.slopeGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), eNrm);
    enemyTankUnit.hullSpinGroup.rotation.y = state.enemyTank.heading;

    state.enemyScout.y = getTerrainHeight(state.enemyScout.x, state.enemyScout.z);
    enemyScoutUnit.root.position.set(state.enemyScout.x, state.enemyScout.y, state.enemyScout.z);
    enemyScoutUnit.root.rotation.y = state.enemyScout.heading;

    updateOpticsReadout();
  }

  function updateOpticsReadout() {
    const useReconCam = state.activeUnit === "recon";
    const obs = useReconCam ? state.recon : state.tank;
    const eyeH = useReconCam ? 6.5 : 10.5;
    if (obs.hp <= 0) {
      dom.binoReadout.textContent = `OPTICS OFFLINE — ${useReconCam ? "BRAVO-2" : "VIPER-1"} DESTROYED`;
      dom.binoReadout.classList.add("blocked");
      return;
    }

    const tgt = getTargetInfo(state.activeTargetKey);
    const enemyLOS = tgt && (useReconCam ? reconHasLOS(tgt.x, tgt.y + 6, tgt.z) : tankHasLOS(tgt.x, tgt.y + 6, tgt.z));
    const maxR = useReconCam ? getReconMaxRange() : getTankMaxRange();

    if (useReconCam && performance.now() < state.recon.pinnedUntil) {
      dom.binoReadout.textContent = "BRAVO-2 PINNED BY BELLTOWER SNIPER — COORD CALL-IN BLOCKED";
      dom.binoReadout.classList.add("blocked");
      return;
    }

    if (enemyLOS) {
      const distE = Math.round(Math.hypot(tgt.x - obs.x, tgt.z - obs.z));
      dom.binoReadout.textContent = `${useReconCam ? "BINOCULARS" : "LASER"} RNG: ${distE}m · ${tgt.label} IN LOS CLEAR`;
      dom.binoReadout.classList.remove("blocked");
    } else {
      dom.binoReadout.textContent = `${useReconCam ? "BRAVO-2 BINO" : "VIPER-1 LASER"} RNG: ${maxR}m MAX · ADVANCE TO RIDGE`;
      dom.binoReadout.classList.remove("blocked");
    }
  }

  /* ---------------- 3D LASER DESIGNATOR ---------------- */
  function fireLaserDesignator(tx, ty, tz, durationMs = 1800) {
    const start = new THREE.Vector3(state.tank.x, state.tank.y + 10.2, state.tank.z);
    const end = new THREE.Vector3(tx, ty, tz);
    laserBeamLine.geometry.dispose();
    laserBeamLine.geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    laserBeamLine.visible = true;
    laserTargetDot.position.copy(end);
    laserTargetDot.visible = true;
    state.laserActiveUntil = performance.now() + durationMs;
  }

  /** Return position, HP, and spotted status for any selectable eastern target. */
  function getTargetInfo(key = state.activeTargetKey) {
    if (key === "radar_est") {
      if (!state.radar.active) return null;
      return {
        key: "radar_est",
        label: "RADAR LAUNCH EST",
        shortLabel: `RADAR ±${state.radar.radius}m`,
        x: state.radar.estX,
        y: getTerrainHeight(state.radar.estX, state.radar.estZ),
        z: state.radar.estZ,
        hp: state.enemy.hp,
        maxHp: state.enemy.maxHp,
        spotted: state.radar.active,
        isRadarEst: true,
      };
    }
    if (typeof key === "string" && key.startsWith("landmark_")) {
      const idx = Number(key.slice(9));
      const lm = state.landmarks[idx];
      return lm
        ? { key, label: lm.name.toUpperCase(), shortLabel: lm.name, x: lm.x, y: lm.y, z: lm.z, hp: 100, maxHp: 100, spotted: lm.discovered, isLandmark: true }
        : null;
    }
    if (key === "tank") {
      return { key, label: "KRONOS-2 TANK", shortLabel: "KRONOS-2", x: state.enemyTank.x, y: state.enemyTank.y, z: state.enemyTank.z, hp: state.enemyTank.hp, maxHp: state.enemyTank.maxHp, spotted: state.enemyTank.spotted };
    }
    if (key === "scout") {
      return { key, label: "SHADOW-3 SCOUT", shortLabel: "SHADOW-3", x: state.enemyScout.x, y: state.enemyScout.y, z: state.enemyScout.z, hp: state.enemyScout.hp, maxHp: state.enemyScout.maxHp, spotted: state.enemyScout.spotted };
    }
    if (key === "train") {
      return { key, label: "SUPPLY TRAIN", shortLabel: "TRAIN", x: state.train.x, y: state.train.y, z: state.train.z, hp: state.train.destroyed ? 0 : state.train.hp, maxHp: state.train.maxHp, spotted: state.train.spotted };
    }
    if (key === "radar" || key === "sam" || key === "depot" || key === "tower") {
      const am = state.amenities[`east_${key}`];
      const shortMap = { radar: "E.RADAR", sam: "E.SAM", depot: "E.DEPOT", tower: "E.TOWER" };
      return am
        ? { key, label: am.name.toUpperCase(), shortLabel: shortMap[key], x: am.x, y: am.y, z: am.z, hp: am.hp, maxHp: am.maxHp, spotted: am.discovered }
        : null;
    }
    return { key: "mortar", label: state.mission.enemy_name || "HOSTILE MORTAR", shortLabel: "VULTURE-4", x: state.enemy.x, y: state.enemy.y, z: state.enemy.z, hp: state.enemy.hp, maxHp: state.enemy.maxHp, spotted: state.enemy.spotted };
  }

  function isTargetKnown(key = state.activeTargetKey) {
    const tgt = getTargetInfo(key);
    if (!tgt) return false;
    if (key === "radar_est") return state.radar.active;
    if (tgt.hp <= 0) return false;
    return Boolean(tgt.spotted || dom.reconToggle.checked || state.phase === "GAME_OVER");
  }

  function getCalledInCoordsList() {
    const reconOn = dom.reconToggle.checked || state.phase === "GAME_OVER";
    const keys = ["radar_est", "mortar", "tank", "scout", "radar", "sam", "depot", "tower", "train"];
    state.landmarks.forEach((_, idx) => keys.push(`landmark_${idx}`));
    const list = [];
    for (const k of keys) {
      const t = getTargetInfo(k);
      if (!t) continue;
      if (k === "radar_est") {
        if (state.radar.active) list.push(t);
      } else if (t.spotted || reconOn) {
        list.push(t);
      }
    }
    return list;
  }

  function renderCalledInCoordsUI() {
    const coords = getCalledInCoordsList();
    const moveDisabled = state.phase !== "RTS_ACTIVE" || (state.tank.hp <= 0 && state.recon.hp <= 0);
    const sig = `${state.activeTargetKey}|${moveDisabled ? 1 : 0}|` + coords.map((c) => `${c.key}:${Math.round(c.x)}:${Math.round(c.z)}:${c.hp > 0 ? 1 : 0}:${c.isRadarEst ? state.radar.radius : 0}`).join(",");
    if (dom.calledCoordsList && dom.calledCoordsList._lastSig === sig) return;
    if (dom.calledCoordsList) dom.calledCoordsList._lastSig = sig;

    const mapByKey = new Map(coords.map((c) => [c.key, c]));

    if (dom.targetPrioritySelect) {
      // Remove previous dynamic landmark options
      Array.from(dom.targetPrioritySelect.options).forEach((opt) => {
        if (opt.value.startsWith("landmark_")) opt.remove();
      });

      const baseLabels = {
        mortar: "TGT: HOSTILE MORTAR",
        radar_est: "TGT: RADAR ESTIMATE (UNTRIANGULATED)",
        tank: "TGT: ENEMY TANK",
        scout: "TGT: ENEMY SCOUT",
        radar: "TGT: EAST RADAR (DISABLES SAM)",
        sam: "TGT: EAST SAM BATTERY",
        depot: "TGT: EAST FUEL DEPOT",
        tower: "TGT: EAST SNIPER TOWER",
        train: "TGT: SUPPLY TRAIN",
      };

      Array.from(dom.targetPrioritySelect.options).forEach((opt) => {
        const c = mapByKey.get(opt.value);
        if (c) {
          const eStr = `${c.isRadarEst ? "~" : ""}${Math.round(c.x)}`;
          const nStr = `${c.isRadarEst ? "~" : ""}${Math.round(-c.z)}`;
          opt.textContent = `✓ ${c.shortLabel} (E:${eStr} N:${nStr}${c.hp <= 0 ? " DEAD" : ""})`;
        } else {
          opt.textContent = baseLabels[opt.value] || opt.textContent;
        }
      });

      coords.forEach((c) => {
        if (c.isLandmark) {
          const opt = document.createElement("option");
          opt.value = c.key;
          opt.textContent = `✓ ${c.shortLabel} (E:${Math.round(c.x)} N:${Math.round(-c.z)})`;
          dom.targetPrioritySelect.appendChild(opt);
        }
      });

      if (Array.from(dom.targetPrioritySelect.options).some((o) => o.value === state.activeTargetKey)) {
        dom.targetPrioritySelect.value = state.activeTargetKey;
      }
    }

    if (dom.calledCoordsActiveLabel) {
      const cur = getTargetInfo(state.activeTargetKey);
      const reconOn = dom.reconToggle.checked || state.phase === "GAME_OVER";
      if (cur && (cur.spotted || reconOn || (cur.isRadarEst && state.radar.active))) {
        dom.calledCoordsActiveLabel.textContent = `LOCKED: ${cur.shortLabel} E:${Math.round(cur.x)} N:${Math.round(-cur.z)}`;
      } else {
        dom.calledCoordsActiveLabel.textContent = "NO COORDS LOCKED";
      }
    }

    if (dom.calledCoordsList) {
      dom.calledCoordsList.innerHTML = "";
      if (coords.length === 0) {
        const empty = document.createElement("span");
        empty.className = "coords-empty-hint";
        empty.textContent = "No coords called in yet — run RADAR SWEEP (R) or ADVANCE RECON (G)";
        dom.calledCoordsList.appendChild(empty);
        return;
      }

      coords.forEach((c) => {
        const chip = document.createElement("div");
        chip.className = "coord-chip";
        if (c.isRadarEst) chip.classList.add("radar-chip");
        if (c.key === state.activeTargetKey) chip.classList.add("active");
        if (c.hp <= 0) chip.classList.add("destroyed");

        const aimBtn = document.createElement("button");
        aimBtn.type = "button";
        aimBtn.className = "coord-aim-btn";
        aimBtn.dataset.coordKey = c.key;
        const prefix = c.isRadarEst ? "~" : "";
        aimBtn.textContent = `${c.shortLabel} ${prefix}${Math.round(c.x)}/${prefix}${Math.round(-c.z)}`;
        aimBtn.title = `Aim artillery / load firing specs for ${c.label} (E:${Math.round(c.x)} N:${Math.round(-c.z)})`;
        aimBtn.addEventListener("click", () => selectCalledInCoord(c.key, { announce: true }));

        const goBtn = document.createElement("button");
        goBtn.type = "button";
        goBtn.className = "coord-go-btn";
        goBtn.dataset.tankCoordKey = c.key;
        goBtn.disabled = moveDisabled;
        goBtn.textContent = "➔ TNK";
        goBtn.title = `Send VIPER-1 Tank to ${c.label} (E:${Math.round(c.x)} N:${Math.round(-c.z)})`;
        goBtn.addEventListener("click", () => sendTankToCoord(c.key));

        chip.append(aimBtn, goBtn);
        dom.calledCoordsList.appendChild(chip);
      });
    }
  }

  function selectCalledInCoord(key, { switchUnit = null, announce = false } = {}) {
    const tgt = getTargetInfo(key);
    if (!tgt) return;
    state.activeTargetKey = key;

    const reconOn = dom.reconToggle.checked || state.phase === "GAME_OVER";
    const usable = Boolean(tgt.spotted || reconOn || (key === "radar_est" && state.radar.active));

    if (usable) {
      if (state.player.hp > 0) {
        const mSpecs = computeDirectHitSpecs(false, key);
        state.player.azimuth = mSpecs.azimuth;
        state.player.angle = mSpecs.angle;
        state.player.power = mSpecs.power;
        state.player._lastLoadedKey = key;
      }
      if (state.tank.hp > 0) {
        const tSpecs = computeDirectHitSpecs(true, key);
        state.tank.azimuth = tSpecs.azimuth;
        state.tank.angle = tSpecs.angle;
        state.tank.power = tSpecs.power;
        state.tank._lastLoadedKey = key;
      }
    }

    if (switchUnit) {
      setActiveUnit(switchUnit);
    } else {
      setActiveUnit(state.activeUnit);
    }

    if (announce && usable && state.phase === "RTS_ACTIVE") {
      const fmtAz = (a) => `${a >= 0 ? "+" : ""}${a.toFixed(1)}`;
      const isTank = state.activeUnit === "tank";
      const u = isTank ? state.tank : state.player;
      const prefix = tgt.isRadarEst ? "~" : "";
      appendRadioEntry(
        "FIRE CONTROL",
        `Plotted ${tgt.label} (E:${prefix}${Math.round(tgt.x)} N:${prefix}${Math.round(-tgt.z)}) — ${isTank ? "VIPER-1" : "ALPHA-1"} loaded: AZ ${fmtAz(u.azimuth)}° EL ${u.angle}° CHG ${u.power.toFixed(1)}%.`,
        `TARGET LOCK -> ${tgt.shortLabel}`,
        tgt.isRadarEst ? "system" : ""
      );
    }
    renderCalledInCoordsUI();
    updateHUD();
  }

  function sendTankToCoord(key = null) {
    if (state.phase !== "RTS_ACTIVE") return;
    const reconOn = dom.reconToggle.checked;
    let targetKey = key;
    if (!targetKey) {
      const cur = getTargetInfo(state.activeTargetKey);
      if (cur && (cur.spotted || reconOn || (state.activeTargetKey === "radar_est" && state.radar.active))) {
        targetKey = state.activeTargetKey;
      } else if (state.radar.active) {
        targetKey = "radar_est";
      } else {
        const list = getCalledInCoordsList();
        if (list.length > 0) targetKey = list[0].key;
      }
    }

    const tgt = targetKey ? getTargetInfo(targetKey) : null;
    if (!tgt || !(tgt.spotted || reconOn || (tgt.isRadarEst && state.radar.active))) {
      appendRadioEntry(
        "VIPER-1",
        "No called-in coordinates available yet — click RADAR SWEEP (R) or ADVANCE RECON (G) to generate a fix!",
        "NO COORDS TO MOVE TO",
        "system"
      );
      return;
    }

    sfx.ensure();
    sfx.playLaserPing();

    if (state.tank.hp > 0) {
      setUnitWaypoint(state.tank, tgt.x, tgt.z, 460);
      selectCalledInCoord(targetKey, { announce: false });
      const prefix = tgt.isRadarEst ? "~" : "";
      appendRadioEntry(
        "VIPER-1",
        `Rolling out to called-in coordinates: ${tgt.label} (E:${prefix}${Math.round(tgt.x)} N:${prefix}${Math.round(-tgt.z)})! Tank optics will sweep sector on approach.`,
        `TANK EN ROUTE -> ${tgt.shortLabel}`,
        "system",
        targetKey
      );
    } else if (state.recon.hp > 0) {
      setUnitWaypoint(state.recon, tgt.x, tgt.z, 460);
      appendRadioEntry(
        "BRAVO-2",
        `VIPER-1 offline — BRAVO-2 ground crew advancing to ${tgt.label} (E:${Math.round(tgt.x)} N:${Math.round(-tgt.z)})!`,
        `RECON EN ROUTE -> ${tgt.shortLabel}`,
        "system"
      );
    }
    updateHUD();
  }

  function simulateBallisticLanding(isTank, azimDeg, angleDeg, powerPct, tx = state.enemy.x, tz = state.enemy.z) {
    const u = isTank ? state.tank : state.player;
    const velMult = isTank ? TANK_VEL : MORTAR_VEL;
    const azimRad = (azimDeg * Math.PI) / 180;
    const elevRad = (angleDeg * Math.PI) / 180;
    const speed = powerPct * velMult;
    const vHoriz = speed * Math.cos(elevRad);

    let vx = vHoriz * Math.cos(azimRad);
    let vz = vHoriz * Math.sin(azimRad);
    let vy = speed * Math.sin(elevRad);

    const barrelLen = isTank ? 16 : 14;
    const heightOff = isTank ? 7 : 3;
    let x = u.x + Math.cos(elevRad) * Math.cos(azimRad) * barrelLen;
    let y = u.y + heightOff + Math.sin(elevRad) * barrelLen;
    let z = u.z + Math.cos(elevRad) * Math.sin(azimRad) * barrelLen;

    const subDt = 0.016 / 3;
    for (let step = 0; step < 3600; step++) {
      vx += (state.windX * WIND_ACCEL - vx * DRAG) * subDt;
      vz += (state.windZ * WIND_ACCEL - vz * DRAG) * subDt;
      vy += (-G - vy * DRAG) * subDt;
      x += vx * subDt;
      y += vy * subDt;
      z += vz * subDt;

      if (step > 8) {
        const gy = getTerrainHeight(x, z);
        if (y <= gy) {
          const err = Math.hypot(x - tx, z - tz);
          return { x, y: gy, z, err };
        }
      }
      if (Math.abs(x) > WORLD_W / 2 + 60 || Math.abs(z) > WORLD_D / 2 + 60 || y < -50) {
        break;
      }
    }
    return { x, y: 0, z, err: Math.hypot(x - tx, z - tz) + 500 };
  }

  function computeDirectHitSpecs(isTank, targetKey = state.activeTargetKey) {
    const u = isTank ? state.tank : state.player;
    const tgt = getTargetInfo(targetKey) || state.enemy;
    const dx = tgt.x - u.x;
    const dz = tgt.z - u.z;
    const baseAzim = Math.max(-45, Math.min(45, (Math.atan2(dz, dx) * 180) / Math.PI));
    const candidateAngles = isTank ? [34, 42, 50, 26, 58] : [54, 60, 48, 66, 42];
    const minP = 15;
    const maxP = 100;

    let best = {
      azimuth: Math.round(baseAzim * 10) / 10,
      angle: candidateAngles[0],
      power: isTank ? 60 : 80,
      err: Infinity,
    };

    for (const ang of candidateAngles) {
      let localBestAz = baseAzim;
      let localBestP = 65;
      let localBestErr = Infinity;

      for (let p = minP; p <= maxP; p += 4) {
        for (let da = -10; da <= 10; da += 2.5) {
          const az = Math.max(-45, Math.min(45, baseAzim + da));
          const res = simulateBallisticLanding(isTank, az, ang, p, tgt.x, tgt.z);
          if (res.err < localBestErr) {
            localBestErr = res.err;
            localBestAz = az;
            localBestP = p;
          }
        }
      }

      for (const [stepAz, stepP] of [
        [0.8, 1.2],
        [0.2, 0.3],
        [0.1, 0.1],
      ]) {
        for (let iter = 0; iter < 4; iter++) {
          let improved = false;
          for (let daz = -2; daz <= 2; daz++) {
            for (let dp = -2; dp <= 2; dp++) {
              const az = Math.max(-45, Math.min(45, Math.round((localBestAz + daz * stepAz) * 10) / 10));
              const p = Math.max(minP, Math.min(maxP, Math.round((localBestP + dp * stepP) * 10) / 10));
              const res = simulateBallisticLanding(isTank, az, ang, p, tgt.x, tgt.z);
              if (res.err < localBestErr) {
                localBestErr = res.err;
                localBestAz = az;
                localBestP = p;
                improved = true;
              }
            }
          }
          if (!improved) break;
        }
      }

      if (localBestErr < best.err) {
        best = {
          azimuth: Math.round(localBestAz * 10) / 10,
          angle: ang,
          power: Math.round(localBestP * 10) / 10,
          err: localBestErr,
        };
      }
      if (best.err < 1.2) break;
    }

    return best;
  }

  /** Recompute and load wind- and terrain-compensated direct-hit specs for any called-in target. */
  function syncSpottedDirectHitSpecs(updateMortar = true, updateTank = true, forceTargetKey = state.activeTargetKey) {
    const tgt = getTargetInfo(forceTargetKey);
    const reconOn = dom.reconToggle.checked || state.phase === "GAME_OVER";
    if (!tgt || !(tgt.spotted || reconOn || (forceTargetKey === "radar_est" && state.radar.active))) return;

    if (updateMortar && state.player.hp > 0) {
      const mortarSpecs = computeDirectHitSpecs(false, forceTargetKey);
      state.player.azimuth = mortarSpecs.azimuth;
      state.player.angle = mortarSpecs.angle;
      state.player.power = mortarSpecs.power;
      state.player._lastLoadedKey = forceTargetKey;
    }

    if (updateTank && state.tank.hp > 0) {
      const tankSpecs = computeDirectHitSpecs(true, forceTargetKey);
      state.tank.azimuth = tankSpecs.azimuth;
      state.tank.angle = tankSpecs.angle;
      state.tank.power = tankSpecs.power;
      state.tank._lastLoadedKey = forceTargetKey;
    }

    setActiveUnit(state.activeUnit);
  }

  /** Counter-battery radar loosely triangulates enemy launch origins into usable tactical coords. */
  function triggerCounterBatteryRadar(sourceLabel = "LAUNCH DETECT", launchX = state.enemy.x, launchZ = state.enemy.z) {
    if (state.phase !== "RTS_ACTIVE") return;
    const westRadar = state.amenities.west_radar;
    if (!westRadar || westRadar.hp <= 0) {
      if (sourceLabel === "MANUAL SWEEP") {
        appendRadioEntry("SENTINEL-R1", "Counter-Battery Radar DESTROYED — Radar triangulation and SAM guidance are OFFLINE!", "RADAR OFFLINE", "alert");
      }
      return;
    }

    sfx.ensure();
    sfx.playRadarPing();

    state.radar.detections += 1;
    const rad = Math.max(38, 92 - state.radar.detections * 14);
    const angle = Math.random() * Math.PI * 2;
    const mag = (0.28 + Math.random() * 0.42) * rad;
    state.radar.estX = Math.round(Math.max(40, Math.min(460, launchX + Math.cos(angle) * mag)));
    state.radar.estZ = Math.round(Math.max(-240, Math.min(240, launchZ + Math.sin(angle) * mag)));
    state.radar.radius = rad;
    state.radar.active = true;

    const autoLockRadar = !isTargetKnown(state.activeTargetKey) || state.activeTargetKey === "radar_est";
    if (autoLockRadar) {
      selectCalledInCoord("radar_est", { announce: false });
    } else {
      renderCalledInCoordsUI();
    }

    updateRadarZoneVisual(performance.now());
    appendRadioEntry(
      "SENTINEL-R1 RADAR",
      `${sourceLabel}: Triangulated hostile launch corridor near E:~${state.radar.estX} N:~${-state.radar.estZ} (±${rad}m box). Use TANK -> COORDS (T) to send VIPER-1 or aim Mortar directly at RADAR EST!`,
      `RADAR FIX ±${rad}m @ E:~${state.radar.estX} N:~${-state.radar.estZ}`,
      "system",
      "radar_est"
    );
    updateHUD();
  }

  function updateRadarZoneVisual(now) {
    if (!radarZoneGroup) return;
    const show = state.phase === "RTS_ACTIVE" && state.radar.active && (!state.enemy.spotted || state.activeTargetKey === "radar_est");
    radarZoneGroup.visible = show;
    if (!show) return;

    const r = state.radar.radius;
    const ey = Math.max(10, getTerrainHeight(state.radar.estX, state.radar.estZ) + 4);
    radarZoneGroup.position.set(state.radar.estX, ey, state.radar.estZ);
    radarOuterRing.scale.set(r, 1, r);
    const pulse = 0.72 + 0.25 * Math.sin(now * 0.005);
    radarInnerRing.scale.set(r * pulse, 1, r * pulse);
    radarCrossLine.scale.set(r, 1, r);
  }

  /** Orders BRAVO-2 ground crew with binoculars to advance over the river/ridge and recon the sector. */
  function commandAdvanceRecon() {
    if (state.phase !== "RTS_ACTIVE" || state.recon.hp <= 0) return;
    sfx.ensure();
    sfx.playLaserPing();
    state.recon.binoBoostUntil = performance.now() + 10000;

    const destZ = state.radar.active
      ? Math.max(-190, Math.min(190, state.radar.estZ * 0.65))
      : state.recon.z;
    const destX = state.recon.x < -15 ? 18 : 138;
    setUnitWaypoint(state.recon, destX, destZ, 460);

    appendRadioEntry(
      "BRAVO-2",
      `Binocular Recon Crew advancing to observation point E:${Math.round(destX)} N:${Math.round(-destZ)} (${getReconMaxRange()}m bino boost). Watch for East Belltower snipers!`,
      `ADVANCING TO OP E:${Math.round(destX)} N:${Math.round(-destZ)}`,
      "system"
    );
    refreshFogAndTerrain();
    updateHUD();
  }

  function triggerLaserSpotScan(isAutoDiscovery = false, spotterCall = null, overrideKey = null) {
    if (state.phase !== "RTS_ACTIVE") return;
    if (state.tank.hp <= 0 && state.recon.hp <= 0) return;
    sfx.ensure();
    sfx.playLaserPing();

    const scanKey = overrideKey || state.activeTargetKey;
    const tgt = getTargetInfo(scanKey) || getTargetInfo("mortar");
    const tankInLOS = tgt && tankHasLOS(tgt.x, tgt.y + 6, tgt.z);
    const reconUnpinned = state.recon.hp > 0 && performance.now() >= state.recon.pinnedUntil;
    const reconInLOS = tgt && reconUnpinned && reconHasLOS(tgt.x, tgt.y + 6, tgt.z);

    if (tgt && (tankInLOS || reconInLOS || (isAutoDiscovery && tgt.spotted))) {
      if (tgt.key === "mortar") state.enemy.spotted = true;
      else if (tgt.key === "tank") state.enemyTank.spotted = true;
      else if (tgt.key === "scout") state.enemyScout.spotted = true;
      else if (state.amenities[`east_${tgt.key}`]) state.amenities[`east_${tgt.key}`].discovered = true;

      if (state.tank.hp > 0 && (tankInLOS || !reconInLOS)) {
        fireLaserDesignator(tgt.x, tgt.y + 4, tgt.z, 2400);
      }
      state.revealZones.push({ x: tgt.x, z: tgt.z, radius: 110, timeLeft: 18 });
      if (!isAutoDiscovery) refreshFogAndTerrain(true);

      const call = spotterCall || (tankInLOS ? "VIPER-1" : "BRAVO-2");
      const distSrc = call === "BRAVO-2" ? state.recon : state.tank;
      const tankDist = Math.round(Math.hypot(tgt.x - distSrc.x, tgt.z - distSrc.z));

      const shouldAutoLoad = !overrideKey || state.activeTargetKey === tgt.key || state.activeTargetKey === "radar_est" || !isTargetKnown(state.activeTargetKey);
      if (shouldAutoLoad) {
        state.activeTargetKey = tgt.key;
        syncSpottedDirectHitSpecs(true, true, tgt.key);
      }
      renderCalledInCoordsUI();

      const mSpec = computeDirectHitSpecs(false, tgt.key);
      const tSpec = computeDirectHitSpecs(true, tgt.key);
      const fmtAz = (a) => `${a >= 0 ? "+" : ""}${a.toFixed(1)}`;
      const headline = isAutoDiscovery ? `CONTACT SPOTTED (${tgt.label} @ ${tankDist}m)!` : `LASER LOCK (${tgt.label} @ ${tankDist}m)!`;
      sfx.playRadioSquelch();
      appendRadioEntry(
        call,
        `${headline} Direct-hit specs computed — ALPHA-1: AZ ${fmtAz(mSpec.azimuth)}° EL ${mSpec.angle}° CHG ${mSpec.power.toFixed(1)}% | VIPER-1: AZ ${fmtAz(tSpec.azimuth)}° EL ${tSpec.angle}° CHG ${tSpec.power.toFixed(1)}%.`,
        `${isAutoDiscovery ? "CONTACT SPOTTED" : "DIRECT HIT SPECS"} -> ${tgt.shortLabel || tgt.label}`,
        "alert",
        tgt.key
      );
      speakRadio(`${isAutoDiscovery ? "Contact spotted!" : "Laser lock!"} Direct hit specs available.`);
    } else if (!isAutoDiscovery) {
      const obs = state.activeUnit === "recon" && state.recon.hp > 0 ? state.recon : state.tank;
      const az = (obs.azimuth * Math.PI) / 180;
      const hitX = obs.x + Math.cos(az) * 140;
      const hitZ = obs.z + Math.sin(az) * 140;
      if (state.tank.hp > 0) fireLaserDesignator(hitX, getTerrainHeight(hitX, hitZ) + 2, hitZ, 1200);
      sfx.playRadioSquelch();
      const reason =
        state.activeUnit === "recon" && performance.now() < state.recon.pinnedUntil
          ? "BRAVO-2 PINNED BY SNIPER BELLTOWER — CANNOT CALL IN COORDINATES! Knock out East Tower or use VIPER-1 Tank."
          : "NO TARGET IN LOS — Advance VIPER-1 or BRAVO-2 higher onto the ridge crest, or use RADAR SWEEP (R)!";
      appendRadioEntry(state.activeUnit === "recon" ? "BRAVO-2" : "VIPER-1", reason, "OPTICS BLOCKED / PINNED", "system");
    }
    updateHUD();
  }

  /* ---------------- UNIT DRIVING, FUEL & RECON MOVEMENT ---------------- */
  function stepTankDriving(dt) {
    if (state.phase !== "RTS_ACTIVE" || state.tank.hp <= 0) return;

    const depotAlive = state.amenities.west_depot?.hp > 0;
    const isTankCtrl = state.activeUnit !== "recon";
    const { fwd, rev, left, right } = state.driveInput;
    const manualActive = isTankCtrl && (fwd || rev || left || right);
    let moved = false;

    const tryMoveTank = (nxRaw, nzRaw) => {
      if (state.tank.fuel <= 0) return false;
      const nx = Math.max(-470, Math.min(460, nxRaw));
      const nz = Math.max(-260, Math.min(260, nzRaw));
      if (Math.hypot(nx - state.player.x, nz - state.player.z) < 24) return false;
      if (state.enemy.hp > 0 && Math.hypot(nx - state.enemy.x, nz - state.enemy.z) < 28) return false;
      const dMoved = Math.hypot(nx - state.tank.x, nz - state.tank.z);
      if (dMoved > 0.005) {
        state.tank.x = nx;
        state.tank.z = nz;
        state.tank.fuel = Math.max(0, state.tank.fuel - 3.6 * dt);
        moved = true;
        return true;
      }
      return false;
    };

    if (manualActive) {
      state.tank.waypoint = null;
      if (left) state.tank.heading += 1.85 * dt;
      if (right) state.tank.heading -= 1.85 * dt;
      if (fwd || rev) {
        const dir = fwd ? 1 : -1;
        tryMoveTank(
          state.tank.x + Math.cos(state.tank.heading) * 62 * dt * dir,
          state.tank.z - Math.sin(state.tank.heading) * 62 * dt * dir
        );
      }
    } else if (state.tank.waypoint && state.tank.fuel > 0) {
      const wp = state.tank.waypoint;
      const dx = wp.x - state.tank.x;
      const dz = wp.z - state.tank.z;
      const dist = Math.hypot(dx, dz);

      if (dist < 8) {
        state.tank.waypoint = null;
        updateWaypointVisuals();
        syncSpottedDirectHitSpecs(false, true);
        updateHUD();
      } else {
        const targetH = Math.atan2(-dz, dx);
        const diff = Math.atan2(Math.sin(targetH - state.tank.heading), Math.cos(targetH - state.tank.heading));
        state.tank.heading += Math.sign(diff) * Math.min(Math.abs(diff), 2.8 * dt);
        if (Math.abs(diff) < 1.05) {
          const stepDist = Math.min(dist, 62 * dt);
          const didMove = tryMoveTank(
            state.tank.x + Math.cos(state.tank.heading) * stepDist,
            state.tank.z - Math.sin(state.tank.heading) * stepDist
          );
          if (!didMove && dist < 35) state.tank.waypoint = null;
        }
      }
    } else if (depotAlive && state.tank.fuel < state.tank.maxFuel) {
      const nearDepot = Math.hypot(state.tank.x - state.amenities.west_depot.x, state.tank.z - state.amenities.west_depot.z) < 95;
      state.tank.fuel = Math.min(state.tank.maxFuel, state.tank.fuel + (nearDepot ? 15 : 4.2) * dt);
    }

    if (moved) {
      updateUnitTransforms();
      refreshFogAndTerrain();
      updateWaypointVisuals();
      state.specSyncTimer += dt;
      if (isTargetKnown(state.activeTargetKey) && state.specSyncTimer >= 0.3) {
        state.specSyncTimer = 0;
        syncSpottedDirectHitSpecs(false, true);
      }
      updateHUD();
    } else if (manualActive) {
      updateUnitTransforms();
      updateWaypointVisuals();
    }
  }

  function stepReconCrew(dt, now) {
    if (state.phase !== "RTS_ACTIVE" || state.recon.hp <= 0) return;

    const { fwd, rev, left, right } = state.driveInput;
    const manualActive = state.activeUnit === "recon" && (fwd || rev || left || right);
    let moved = false;

    const pinned = now < state.recon.pinnedUntil;
    const speed = pinned ? 22 : 50;

    if (manualActive) {
      state.recon.waypoint = null;
      if (left) state.recon.heading += 2.2 * dt;
      if (right) state.recon.heading -= 2.2 * dt;
      if (fwd || rev) {
        const dir = fwd ? 1 : -1;
        state.recon.x = Math.max(-460, Math.min(460, state.recon.x + Math.cos(state.recon.heading) * speed * dt * dir));
        state.recon.z = Math.max(-255, Math.min(255, state.recon.z - Math.sin(state.recon.heading) * speed * dt * dir));
        moved = true;
      }
    } else if (state.recon.waypoint) {
      const wp = state.recon.waypoint;
      const dx = wp.x - state.recon.x;
      const dz = wp.z - state.recon.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 7) {
        state.recon.waypoint = null;
        updateWaypointVisuals();
        refreshFogAndTerrain();
        updateHUD();
      } else {
        state.recon.heading = Math.atan2(-dz, dx);
        const step = Math.min(dist, speed * dt);
        state.recon.x += Math.cos(state.recon.heading) * step;
        state.recon.z -= Math.sin(state.recon.heading) * step;
        moved = true;
      }
    }

    if (moved) {
      state.recon.stridePhase += dt * 11;
      reconUnit.squad.position.y = Math.abs(Math.sin(state.recon.stridePhase)) * 0.9;
      updateUnitTransforms();
      refreshFogAndTerrain();
      updateWaypointVisuals();
      updateHUD();
    } else {
      reconUnit.squad.position.y = 0;
    }
  }

  function stepEnemyForces(dt, now) {
    if (state.phase !== "RTS_ACTIVE") return;
    const combatActive = state.playerShotCount > 0 || state.enemy.spotted;

    // 1. KRONOS-2 Enemy Tank patrol, fuel depot dependency, and periodic fire
    if (state.enemyTank.hp > 0) {
      const eastDepotAlive = state.amenities.east_depot?.hp > 0;
      if (state.enemyTank.fuel > 0) {
        state.enemyTank.movePhase += dt * 0.45;
        const targetZ = Math.sin(state.enemyTank.movePhase) * 95;
        const dz = targetZ - state.enemyTank.z;
        if (Math.abs(dz) > 2) {
          state.enemyTank.z += Math.sign(dz) * Math.min(Math.abs(dz), 24 * dt);
          state.enemyTank.heading = dz > 0 ? -Math.PI / 2 : Math.PI / 2;
          state.enemyTank.fuel = Math.max(0, state.enemyTank.fuel - 2.2 * dt);
        }
      } else if (eastDepotAlive) {
        state.enemyTank.fuel = Math.min(state.enemyTank.maxFuel, state.enemyTank.fuel + 10 * dt);
      }

      if (combatActive) {
        state.enemyTank.cooldown -= dt;
        if (state.enemyTank.cooldown <= 0) {
          state.enemyTank.cooldown = 21.0;
          const target = state.tank.hp > 0 ? state.tank : state.player;
          if (target.hp > 0) {
            const tx = target.x + (Math.random() - 0.5) * 44;
            const tz = target.z + (Math.random() - 0.5) * 44;
            fireEnemyUnitShell(state.enemyTank, tx, tz, TANK_VEL, "KRONOS-2");
          }
        }
      }
    }

    // 2. SHADOW-3 Enemy Scout advances cautiously toward east ridge face unless pinned by West Sniper Tower
    if (state.enemyScout.hp > 0 && now >= state.enemyScout.pinnedUntil) {
      if (state.enemyScout.x > 125) {
        state.enemyScout.x -= 16 * dt;
        state.enemyScout.stridePhase += dt * 7;
        enemyScoutUnit.squad.position.y = Math.abs(Math.sin(state.enemyScout.stridePhase)) * 0.7;
      }
    } else {
      enemyScoutUnit.squad.position.y = 0;
    }
  }

  /* ---------------- FIRING & 3D BALLISTICS ---------------- */
  function fireActiveUnit() {
    if (state.phase !== "RTS_ACTIVE") return;
    if (state.activeUnit === "recon") {
      triggerLaserSpotScan(false, "BRAVO-2");
      return;
    }
    const isTank = state.activeUnit === "tank";
    const u = isTank ? state.tank : state.player;
    if (u.hp <= 0 || u.cooldown > 0) return;

    sfx.ensure();
    sfx.playMortarFire(isTank);

    u.cooldown = u.maxCooldown;
    state.playerShotCount += 1;
    state.lastFiringUnit = isTank ? "VIPER-1" : "ALPHA-1";
    updateHUD();

    const velMult = isTank ? TANK_VEL : MORTAR_VEL;
    const azimRad = (u.azimuth * Math.PI) / 180;
    const elevRad = (u.angle * Math.PI) / 180;
    const speed = u.power * velMult;
    const vHoriz = speed * Math.cos(elevRad);

    const vx = vHoriz * Math.cos(azimRad);
    const vz = vHoriz * Math.sin(azimRad);
    const vy = speed * Math.sin(elevRad);

    const barrelLen = isTank ? 16 : 14;
    const heightOff = isTank ? 7 : 3;
    const muzzleX = u.x + Math.cos(elevRad) * Math.cos(azimRad) * barrelLen;
    const muzzleY = u.y + heightOff + Math.sin(elevRad) * barrelLen;
    const muzzleZ = u.z + Math.cos(elevRad) * Math.sin(azimRad) * barrelLen;

    spawnMuzzleFlash(muzzleX, muzzleY, muzzleZ, vx, vy, vz, true);

    const salvo = {
      owner: "player",
      firingUnit: state.lastFiringUnit,
      shotNum: state.playerShotCount,
      shooterX: u.x,
      shooterZ: u.z,
      shellType: state.selectedShell,
      azimuth: u.azimuth,
      angle: u.angle,
      power: u.power,
      windX: state.windX,
      windZ: state.windZ,
      impacts: [],
      totalDamage: 0,
      remaining: 1,
      finalized: false,
    };

    spawnProjectile({
      owner: "player",
      shellType: state.selectedShell,
      x: muzzleX,
      y: muzzleY,
      z: muzzleZ,
      vx,
      vy,
      vz,
      isSubmunition: false,
      salvo,
    });
  }

  function fireEnemyMortar(decision) {
    if (state.phase !== "RTS_ACTIVE" || state.enemy.hp <= 0) return;
    const enemySeen = isPointRevealed(state.enemy.x, state.enemy.z);
    if (enemySeen) {
      sfx.playMortarFire(false);
    }
    state.enemyShotCount += 1;

    state.enemy.azimuth = decision.azimuth;
    state.enemy.angle = decision.angle;
    state.enemy.power = decision.power;
    updateUnitTransforms();

    const azimRad = (decision.azimuth * Math.PI) / 180;
    const elevRad = (decision.angle * Math.PI) / 180;
    const speed = decision.power * MORTAR_VEL;
    const vHoriz = speed * Math.cos(elevRad);

    const vx = -vHoriz * Math.cos(azimRad);
    const vz = -vHoriz * Math.sin(azimRad);
    const vy = speed * Math.sin(elevRad);

    const muzzleX = state.enemy.x - Math.cos(elevRad) * Math.cos(azimRad) * 14;
    const muzzleY = state.enemy.y + 3 + Math.sin(elevRad) * 14;
    const muzzleZ = state.enemy.z - Math.cos(elevRad) * Math.sin(azimRad) * 14;

    if (enemySeen) {
      spawnMuzzleFlash(muzzleX, muzzleY, muzzleZ, vx, vy, vz, true);
    }

    const salvo = {
      owner: "enemy",
      shooterX: state.enemy.x,
      shooterZ: state.enemy.z,
      targetUnitName: decision.targetUnitName || "ALPHA-1",
      targetX: decision.targetX,
      targetZ: decision.targetZ,
      shotNum: state.enemyShotCount,
      shellType: "HE",
      azimuth: decision.azimuth,
      angle: decision.angle,
      power: decision.power,
      windX: state.windX,
      windZ: state.windZ,
      impacts: [],
      totalDamage: 0,
      remaining: 1,
      finalized: false,
    };

    spawnProjectile({
      owner: "enemy",
      shellType: "HE",
      x: muzzleX,
      y: muzzleY,
      z: muzzleZ,
      vx,
      vy,
      vz,
      isSubmunition: false,
      salvo,
    });

    triggerCounterBatteryRadar("VULTURE-4 LAUNCH", state.enemy.x, state.enemy.z);
  }

  function fireEnemyUnitShell(shooter, targetX, targetZ, velMult, unitLabel) {
    if (state.phase !== "RTS_ACTIVE" || !shooter || shooter.hp <= 0) return;
    const dx = targetX - shooter.x;
    const dz = targetZ - shooter.z;
    const aimWorldRad = Math.atan2(dz, dx);
    const elevDeg = 35;
    const elevRad = (elevDeg * Math.PI) / 180;

    let bestPower = 65;
    let bestErr = Infinity;
    const simErr = (p) => {
      const spd = p * velMult;
      const vH = spd * Math.cos(elevRad);
      let vx = vH * Math.cos(aimWorldRad);
      let vz = vH * Math.sin(aimWorldRad);
      let vy = spd * Math.sin(elevRad);
      let sx = shooter.x + Math.cos(elevRad) * Math.cos(aimWorldRad) * 16;
      let sy = shooter.y + 7 + Math.sin(elevRad) * 16;
      let sz = shooter.z + Math.cos(elevRad) * Math.sin(aimWorldRad) * 16;
      const dtS = 0.025;
      for (let k = 0; k < 500; k++) {
        vx += (state.windX * WIND_ACCEL - vx * DRAG) * dtS;
        vz += (state.windZ * WIND_ACCEL - vz * DRAG) * dtS;
        vy += (-G - vy * DRAG) * dtS;
        sx += vx * dtS;
        sz += vz * dtS;
        sy += vy * dtS;
        if (k > 4 && sy <= getTerrainHeight(sx, sz)) {
          return Math.hypot(sx - targetX, sz - targetZ);
        }
      }
      return Math.hypot(sx - targetX, sz - targetZ) + 400;
    };
    for (let p = 30; p <= 100; p += 3) {
      const err = simErr(p);
      if (err < bestErr) {
        bestErr = err;
        bestPower = p;
      }
    }
    for (let dp = -2.5; dp <= 2.5; dp += 0.5) {
      const p = Math.max(25, Math.min(100, bestPower + dp));
      const err = simErr(p);
      if (err < bestErr) {
        bestErr = err;
        bestPower = p;
      }
    }

    const seen = isPointRevealed(shooter.x, shooter.z);
    if (seen) {
      sfx.playMortarFire(true);
    }
    state.enemyShotCount += 1;

    if (shooter === state.enemyTank && enemyTankUnit?.yawGroup) {
      enemyTankUnit.yawGroup.rotation.y = -aimWorldRad - shooter.heading;
      if (enemyTankUnit.pitchGroup) enemyTankUnit.pitchGroup.rotation.z = elevRad;
    }

    const speed = bestPower * velMult;
    const vHoriz = speed * Math.cos(elevRad);
    const vx = vHoriz * Math.cos(aimWorldRad);
    const vz = vHoriz * Math.sin(aimWorldRad);
    const vy = speed * Math.sin(elevRad);
    const muzzleX = shooter.x + Math.cos(elevRad) * Math.cos(aimWorldRad) * 16;
    const muzzleY = shooter.y + 7 + Math.sin(elevRad) * 16;
    const muzzleZ = shooter.z + Math.cos(elevRad) * Math.sin(aimWorldRad) * 16;

    if (seen) spawnMuzzleFlash(muzzleX, muzzleY, muzzleZ, vx, vy, vz, true);

    const salvo = {
      owner: "enemy",
      shooterX: shooter.x,
      shooterZ: shooter.z,
      targetUnitName: unitLabel,
      targetX,
      targetZ,
      shotNum: state.enemyShotCount,
      shellType: "HE",
      azimuth: Math.round(((aimWorldRad * 180) / Math.PI) * 10) / 10,
      angle: elevDeg,
      power: Math.round(bestPower * 10) / 10,
      windX: state.windX,
      windZ: state.windZ,
      impacts: [],
      totalDamage: 0,
      remaining: 1,
      finalized: false,
    };

    spawnProjectile({
      owner: "enemy",
      shellType: "HE",
      x: muzzleX,
      y: muzzleY,
      z: muzzleZ,
      vx,
      vy,
      vz,
      isSubmunition: false,
      salvo,
    });

    triggerCounterBatteryRadar(`${unitLabel} LAUNCH`, shooter.x, shooter.z);
  }

  function spawnProjectile(opts) {
    const color = opts.shellType === "FLARE" ? 0xfef08a : opts.owner === "player" ? 0xfbbf24 : 0xf87171;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(opts.isSubmunition ? 1.8 : 2.6, 10, 10),
      new THREE.MeshBasicMaterial({ color })
    );
    mesh.position.set(opts.x, opts.y, opts.z);
    fxGroup.add(mesh);

    const trailMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.72 });
    const trailLine = new THREE.Line(new THREE.BufferGeometry(), trailMat);
    fxGroup.add(trailLine);

    state.projectiles.push({
      ...opts,
      mesh,
      trailLine,
      trailPoints: [new THREE.Vector3(opts.x, opts.y, opts.z)],
      splitDone: false,
      flareDeployed: false,
    });
  }

  function updateTrain(dt) {
    if (!trainGroup) return;
    if (state.train.destroyed) {
      state.train.respawnTimer -= dt;
      if (state.train.respawnTimer <= 0) {
        state.train.destroyed = false;
        state.train.hp = state.train.maxHp;
        state.train.x = -450;
        state.train.spotted = false;
        appendRadioEntry("COMMAND", "New hostile Armored Supply Train entering western rail corridor (N:+168).", "TRAIN INBOUND", "system");
      }
      return;
    }

    state.train.x += state.train.vx * dt;
    if (state.train.x > 460) {
      state.train.x = -460;
      state.train.spotted = false;
    }
    state.train.y = getTerrainHeight(state.train.x, state.train.z) + 1.4;
    const yF = getTerrainHeight(state.train.x + 8, state.train.z);
    const yB = getTerrainHeight(state.train.x - 8, state.train.z);
    trainGroup.position.set(state.train.x, state.train.y, state.train.z);
    trainGroup.rotation.z = Math.atan2(yF - yB, 16);

    state.train.steamTimer -= dt;
    if (state.train.steamTimer <= 0) {
      state.train.steamTimer = 0.28;
      if (isPointRevealed(state.train.x, state.train.z) || dom.reconToggle.checked) {
        spawn3DParticle(
          state.train.x + 22,
          state.train.y + 12,
          state.train.z,
          state.windX * 1.4,
          18 + Math.random() * 10,
          state.windZ * 1.4,
          0xe2e8f0,
          0.9,
          2.2,
          false
        );
      }
    }
  }

  function spawnSamMissile(sam, side, targetProj) {
    const accent = side === "west" ? 0x4ade80 : 0xf97316;
    const rocketGroup = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 1.05, 9.5, 8),
      new THREE.MeshBasicMaterial({ color: 0xf1f5f9 })
    );
    body.rotation.x = Math.PI / 2;

    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(1.1, 3.4, 8),
      new THREE.MeshBasicMaterial({ color: accent })
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 6.45;

    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(1.2, 4.4, 8),
      new THREE.MeshBasicMaterial({ color: 0xfef08a, transparent: true, opacity: 0.92 })
    );
    flame.rotation.x = -Math.PI / 2;
    flame.position.z = -6.9;

    rocketGroup.add(body, nose, flame);

    const sx = sam.x;
    const sy = sam.y + 8;
    const sz = sam.z;
    rocketGroup.position.set(sx, sy, sz);
    fxGroup.add(rocketGroup);

    const trailLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.85 })
    );
    fxGroup.add(trailLine);

    const speed = 310;
    const dx = targetProj.x - sx;
    const dy = targetProj.y + 18 - sy;
    const dz = targetProj.z - sz;
    const dist = Math.hypot(dx, dy, dz) || 1;
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;
    const vz = (dz / dist) * speed;
    rocketGroup.lookAt(sx + vx, sy + vy, sz + vz);

    state.samMissiles.push({
      side,
      samKey: sam.key,
      targetProj,
      x: sx,
      y: sy,
      z: sz,
      vx,
      vy,
      vz,
      speed,
      age: 0,
      mesh: rocketGroup,
      trailLine,
      trailPoints: [new THREE.Vector3(sx, sy, sz)],
    });
  }

  function removeSamMissile(idx) {
    const m = state.samMissiles[idx];
    if (!m) return;
    fxGroup.remove(m.mesh);
    fxGroup.remove(m.trailLine);
    m.trailLine.geometry.dispose();
    state.samMissiles.splice(idx, 1);
  }

  function updateSamDefenses(dt, now) {
    for (const side of ["west", "east"]) {
      const sam = state.amenities[`${side}_sam`];
      const radar = state.amenities[`${side}_radar`];
      if (!sam || sam.hp <= 0) continue;
      if (sam.cooldown > 0) sam.cooldown = Math.max(0, sam.cooldown - dt);
      if (!radar || radar.hp <= 0 || sam.cooldown > 0) continue;

      const targetOwner = side === "west" ? "enemy" : "player";
      const maxRange = 340;
      for (let i = state.projectiles.length - 1; i >= 0; i--) {
        const p = state.projectiles[i];
        if (p.owner !== targetOwner || p.shellType === "FLARE" || p.samTargeted) continue;
        if (p.vy >= 18) continue;
        const gy = getTerrainHeight(p.x, p.z);
        if (p.y <= gy + 32) continue;
        const dist = Math.hypot(p.x - sam.x, p.z - sam.z);
        if (dist > maxRange) continue;

        p.samTargeted = true;
        sam.cooldown = side === "west" ? 11.0 : 14.0;
        if (sam.turret) {
          sam.turret.rotation.y = Math.atan2(-(p.z - sam.z), p.x - sam.x);
        }
        sfx.ensure();
        sfx.playSamLaunch();

        const launchVisible =
          side === "west" || p.owner === "player" || isPointRevealed(sam.x, sam.z) || dom.reconToggle.checked;
        if (launchVisible) {
          for (let s = 0; s < 6; s++) {
            spawn3DParticle(
              sam.x + (Math.random() - 0.5) * 6,
              sam.y + 8,
              sam.z + (Math.random() - 0.5) * 6,
              (Math.random() - 0.5) * 24,
              18 + Math.random() * 24,
              (Math.random() - 0.5) * 24,
              s % 2 === 0 ? 0xe2e8f0 : side === "west" ? 0x4ade80 : 0xf97316,
              0.55,
              2.6,
              false
            );
          }
        }

        spawnSamMissile(sam, side, p);
        break;
      }
    }

    for (let i = state.samMissiles.length - 1; i >= 0; i--) {
      const m = state.samMissiles[i];
      const p = m.targetProj;
      const pIdx = state.projectiles.indexOf(p);
      if (pIdx === -1) {
        removeSamMissile(i);
        continue;
      }

      m.age += dt;
      const dxRaw = p.x - m.x;
      const dyRaw = p.y - m.y;
      const dzRaw = p.z - m.z;
      const distRaw = Math.hypot(dxRaw, dyRaw, dzRaw) || 1;
      const leadT = Math.min(0.45, distRaw / m.speed);
      const aimX = p.x + p.vx * leadT;
      const aimY = p.y + p.vy * leadT - 0.5 * G * leadT * leadT;
      const aimZ = p.z + p.vz * leadT;

      const lx = aimX - m.x;
      const ly = aimY - m.y;
      const lz = aimZ - m.z;
      const lDist = Math.hypot(lx, ly, lz) || 1;
      m.vx = (lx / lDist) * m.speed;
      m.vy = (ly / lDist) * m.speed;
      m.vz = (lz / lDist) * m.speed;

      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.z += m.vz * dt;

      const missileVisible =
        m.side === "west" || p.owner === "player" || isPointRevealed(m.x, m.z) || dom.reconToggle.checked;
      m.mesh.visible = missileVisible;
      m.trailLine.visible = missileVisible;
      m.mesh.position.set(m.x, m.y, m.z);
      m.mesh.lookAt(m.x + m.vx, m.y + m.vy, m.z + m.vz);

      m.trailPoints.push(new THREE.Vector3(m.x, m.y, m.z));
      if (m.trailPoints.length > 36) m.trailPoints.shift();
      m.trailLine.geometry.setFromPoints(m.trailPoints);

      if (missileVisible && Math.random() < 0.75) {
        spawn3DParticle(
          m.x - (m.vx / m.speed) * 6,
          m.y - (m.vy / m.speed) * 6,
          m.z - (m.vz / m.speed) * 6,
          (Math.random() - 0.5) * 12,
          4 + Math.random() * 10,
          (Math.random() - 0.5) * 12,
          Math.random() < 0.45 ? 0xfbbf24 : 0xe2e8f0,
          0.38,
          2.1,
          false
        );
      }

      const distToShell = Math.hypot(m.x - p.x, m.y - p.y, m.z - p.z);
      const pGy = getTerrainHeight(p.x, p.z);
      if (distToShell <= 15 || p.y <= pGy + 18) {
        const accent = m.side === "west" ? 0x4ade80 : 0xf97316;
        const blastVisible =
          missileVisible || isPointRevealed(p.x, p.z) || dom.reconToggle.checked;
        if (blastVisible) {
          sfx.ensure();
          sfx.playExplosion(0.75);
          spawnBlastFX(p.x, p.y, p.z, accent, 20, true);
          state.lastShellFocus.set(p.x, p.y, p.z);
          state.shellCamHoldUntil = now + 650;
        }

        if (m.side === "west") {
          appendRadioEntry(
            "WEST SAM-1",
            `Radar-guided SAM missile intercepted incoming hostile shell mid-air at E:${Math.round(p.x)} N:${Math.round(-p.z)}!`,
            "SAM INTERCEPT (RADAR LOCK)",
            "system"
          );
        } else {
          const eRadar = state.amenities.east_radar;
          const eSam = state.amenities.east_sam;
          const coordKey = eRadar?.discovered ? "radar" : eSam?.discovered ? "sam" : null;
          appendRadioEntry(
            "COMMAND",
            "East SAM launched a radar-guided missile and intercepted our descending shell mid-air! Knock out East Radar Dish to blind their SAM battery!",
            "HOSTILE SAM INTERCEPT — BLIND RADAR",
            "alert",
            coordKey
          );
        }

        if (p.salvo) {
          p.salvo.impacts.push({
            x: p.x,
            y: p.y,
            z: p.z,
            hitRidge: false,
            interceptedBySam: true,
            observedImpact: isPointRevealed(p.x, p.z) || dom.reconToggle.checked,
            observedByTank: false,
          });
          p.salvo.remaining -= 1;
          if (p.salvo.remaining <= 0) finalizeSalvo(p.salvo);
        }
        const curIdx = state.projectiles.indexOf(p);
        if (curIdx !== -1) removeProjectile(curIdx);
        removeSamMissile(i);
      }
    }
  }

  function updateBelltowerSnipers(dt, now) {
    const eastTower = state.amenities.east_tower;
    if (eastTower && eastTower.hp > 0) {
      if (eastTower.cooldown > 0) eastTower.cooldown = Math.max(0, eastTower.cooldown - dt);
      if (state.recon.hp > 0 && eastTower.cooldown <= 0) {
        const d = Math.hypot(state.recon.x - eastTower.x, state.recon.z - eastTower.z);
        if (d <= 225 && hasLineOfSight3D(eastTower.x, eastTower.y + 26, eastTower.z, state.recon.x, state.recon.y + 5, state.recon.z)) {
          eastTower.cooldown = 4.5;
          sfx.ensure();
          sfx.playSniperCrack();
          state.recon.hp = Math.max(0, state.recon.hp - 5);
          state.recon.pinnedUntil = now + 5500;
          if (isPointRevealed(state.recon.x, state.recon.z)) {
            spawn3DParticle(state.recon.x, state.recon.y + 6, state.recon.z, (Math.random() - 0.5) * 18, 22, (Math.random() - 0.5) * 18, 0xf43f5e, 0.35, 1.8, false);
          }
          if (!state.recon.wasPinned) {
            state.recon.wasPinned = true;
            appendRadioEntry(
              "BRAVO-2",
              "Taking sniper fire from East Belltower! Pinned down — belltower snipers cannot call coords, and our radio coords are blocked until East Tower is knocked out!",
              "BRAVO-2 PINNED BY SNIPER",
              "alert"
            );
          }
          if (state.recon.hp <= 0) {
            reconUnit.root.visible = false;
            state.recon.waypoint = null;
            updateWaypointVisuals();
            appendRadioEntry("BRAVO-2", "Binocular Recon Crew neutralized by East Belltower sniper fire!", "RECON LOST", "alert");
            if (state.activeUnit === "recon") setActiveUnit(state.tank.hp > 0 ? "tank" : "mortar");
          }
          updateHUD();
        }
      }
    }

    const westTower = state.amenities.west_tower;
    if (westTower && westTower.hp > 0) {
      if (westTower.cooldown > 0) westTower.cooldown = Math.max(0, westTower.cooldown - dt);
      if (state.enemyScout.hp > 0 && westTower.cooldown <= 0) {
        const d = Math.hypot(state.enemyScout.x - westTower.x, state.enemyScout.z - westTower.z);
        if (d <= 225 && hasLineOfSight3D(westTower.x, westTower.y + 26, westTower.z, state.enemyScout.x, state.enemyScout.y + 5, state.enemyScout.z)) {
          westTower.cooldown = 4.5;
          sfx.ensure();
          sfx.playSniperCrack();
          state.enemyScout.hp = Math.max(0, state.enemyScout.hp - 6);
          state.enemyScout.pinnedUntil = now + 5500;
          if (!state.enemyScout.wasPinned) {
            state.enemyScout.wasPinned = true;
            appendRadioEntry(
              "WEST TOWER",
              "Friendly sniper overwatch pinning hostile SHADOW-3 scouts near bridgehead (snipers hold overwatch only — cannot call in artillery coords).",
              "WEST SNIPER OVERWATCH",
              "system"
            );
          }
          if (state.enemyScout.hp <= 0) {
            enemyScoutUnit.root.visible = false;
            appendRadioEntry("WEST TOWER", "Hostile SHADOW-3 binocular scout crew neutralized by West Sniper Tower.", "ENEMY SCOUT LOST", "system");
          }
        }
      }
    }
  }

  /* ---------------- MAIN LOOP ---------------- */
  let lastTime = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;

    stepTankDriving(dt);
    stepReconCrew(dt, now);
    update(dt, now);
    updateCamera(dt, now);
    updateEntityAndMistVisibility(now);
    renderer.render(scene, camera);
    updateLandmarkScreenLabels();

    requestAnimationFrame(loop);
  }

  function update(dt, now) {
    for (const lm of state.landmarks) {
      if (lm.spinner) lm.spinner.rotation.y += dt * 0.9;
    }
    for (const am of Object.values(state.amenities)) {
      if (am.hp > 0 && am.spinner) am.spinner.rotation.y += dt * 1.1;
    }

    if (waypointRing && waypointRing.visible) {
      waypointRing.rotation.z += dt * 1.8;
    }
    if (reconWaypointRing && reconWaypointRing.visible) {
      reconWaypointRing.rotation.z -= dt * 1.8;
    }
    updateRadarZoneVisual(now);

    if (now > state.laserActiveUntil) {
      laserBeamLine.visible = false;
      laserTargetDot.visible = false;
    }

    if (state.phase === "RTS_ACTIVE") {
      state.player.cooldown = Math.max(0, state.player.cooldown - dt);
      state.tank.cooldown = Math.max(0, state.tank.cooldown - dt);
      state.radar.cooldown = Math.max(0, state.radar.cooldown - dt);
      const combatActive = state.playerShotCount > 0 || state.enemy.spotted;
      if (combatActive) {
        state.enemy.cooldown = Math.max(0, state.enemy.cooldown - dt);
      }

      stepEnemyForces(dt, now);
      updateTrain(dt);
      updateSamDefenses(dt, now);
      updateBelltowerSnipers(dt, now);

      if (state.recon.wasPinned && now >= state.recon.pinnedUntil && state.recon.hp > 0) {
        state.recon.wasPinned = false;
        state.recon.wasPinnedWarned = false;
        appendRadioEntry("BRAVO-2", "Clear of sniper fire — binocular coordinate call-ins back online!", "UNPINNED", "system");
        syncSpottedDirectHitSpecs(true, true);
      }

      state.windTimer -= dt;
      state.hudTimer += dt;
      if (state.windTimer <= 0) {
        state.windTimer = 15.0;
        state.windX = Number(Math.max(-12, Math.min(12, state.windX + (Math.random() - 0.5) * 3.0)).toFixed(1));
        state.windZ = Number(Math.max(-8, Math.min(8, state.windZ + (Math.random() - 0.5) * 2.4)).toFixed(1));
        if (isTargetKnown(state.activeTargetKey)) {
          syncSpottedDirectHitSpecs(true, true);
        } else {
          updateHUD();
        }
      } else if (state.hudTimer >= 0.1) {
        state.hudTimer = 0;
        updateHUD();
      }

      if (combatActive && state.enemy.hp > 0 && state.enemy.cooldown <= 0 && !state.enemy.thinking) {
        state.enemy.thinking = true;
        state.enemy.cooldown = state.train.destroyed ? 26.0 : 18.0;
        triggerEnemyCounterBattery();
      }

      let fogExpired = false;
      for (let i = state.smokePlumes.length - 1; i >= 0; i--) {
        state.smokePlumes[i].timeLeft -= dt;
        if (state.smokePlumes[i].timeLeft <= 0) {
          state.smokePlumes.splice(i, 1);
        }
      }
      for (let i = state.flares.length - 1; i >= 0; i--) {
        state.flares[i].timeLeft -= dt;
        if (state.flares[i].timeLeft <= 0) {
          fxGroup.remove(state.flares[i].group);
          state.flares.splice(i, 1);
          fogExpired = true;
        }
      }
      for (let i = state.revealZones.length - 1; i >= 0; i--) {
        state.revealZones[i].timeLeft -= dt;
        if (state.revealZones[i].timeLeft <= 0) {
          state.revealZones.splice(i, 1);
          fogExpired = true;
        }
      }
      if (fogExpired) {
        refreshFogAndTerrain();
      }
    }

    if (snowPoints.visible) {
      const arr = snowPoints.geometry.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] += (state.windX * 3 + 4) * dt;
        arr[i + 1] -= 26 * dt;
        arr[i + 2] += state.windZ * 3 * dt;
        if (arr[i + 1] < 0) arr[i + 1] = 260;
        if (arr[i] > WORLD_W / 2) arr[i] -= WORLD_W;
        if (arr[i] < -WORLD_W / 2) arr[i] += WORLD_W;
        if (arr[i + 2] > WORLD_D / 2) arr[i + 2] -= WORLD_D;
        if (arr[i + 2] < -WORLD_D / 2) arr[i + 2] += WORLD_D;
      }
      snowPoints.geometry.attributes.position.needsUpdate = true;
    }

    if (muzzleLight.intensity > 0) {
      muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 14);
    }

    aimDotsGroup.visible = state.phase === "RTS_ACTIVE";
    if (aimDotsGroup.visible) {
      const isTank = state.activeUnit === "tank";
      const u = isTank ? state.tank : state.player;
      const velMult = isTank ? TANK_VEL : MORTAR_VEL;
      const azimRad = (u.azimuth * Math.PI) / 180;
      const elevRad = (u.angle * Math.PI) / 180;
      const speed = u.power * velMult;
      const vH = speed * Math.cos(elevRad);

      const barrelLen = isTank ? 16 : 14;
      const heightOff = isTank ? 7 : 3;
      let x = u.x + Math.cos(elevRad) * Math.cos(azimRad) * barrelLen;
      let y = u.y + heightOff + Math.sin(elevRad) * barrelLen;
      let z = u.z + Math.cos(elevRad) * Math.sin(azimRad) * barrelLen;

      let vx = vH * Math.cos(azimRad);
      let vz = vH * Math.sin(azimRad);
      let vy = speed * Math.sin(elevRad);

      aimDotsGroup.children.forEach((dot) => {
        const step = 0.045;
        vx += (state.windX * WIND_ACCEL - vx * DRAG) * step;
        vz += (state.windZ * WIND_ACCEL - vz * DRAG) * step;
        vy += (-G - vy * DRAG) * step;
        x += vx * step;
        y += vy * step;
        z += vz * step;
        dot.position.set(x, y, z);
        dot.visible = isPointRevealed(x, z);
      });
    }

    for (const f of state.flares) {
      if (!f.landed) {
        f.x += state.windX * 1.8 * dt;
        f.z += state.windZ * 1.8 * dt;
        f.y -= 24 * dt;
        const gy = getTerrainHeight(f.x, f.z);
        if (f.y <= gy + 4) {
          f.y = gy + 4;
          f.landed = true;
          if (f.chute) f.chute.visible = false;
        }
        f.group.position.set(f.x, f.y, f.z);
        refreshFogAndTerrain();
      }
      f.light.intensity = 2.6 + Math.sin(now * 0.015) * 0.4;
    }

    for (const sp of state.smokePlumes) {
      if (Math.random() < 0.35 && (isPointRevealed(sp.x, sp.z) || getExploredAt(sp.x, sp.z) >= 0.1)) {
        spawn3DParticle(
          sp.x + (Math.random() - 0.5) * 12,
          sp.y + 4,
          sp.z + (Math.random() - 0.5) * 12,
          state.windX * 1.8 + (Math.random() - 0.5) * 6,
          18 + Math.random() * 14,
          state.windZ * 1.8 + (Math.random() - 0.5) * 6,
          0xe2e8f0,
          1.4,
          6.5,
          false
        );
      }
    }

    const substeps = 3;
    const subDt = dt / substeps;
    for (let i = state.projectiles.length - 1; i >= 0; i--) {
      const p = state.projectiles[i];
      let removed = false;

      for (let s = 0; s < substeps; s++) {
        const prevVy = p.vy;
        p.vx += (state.windX * WIND_ACCEL - p.vx * DRAG) * subDt;
        p.vz += (state.windZ * WIND_ACCEL - p.vz * DRAG) * subDt;
        p.vy += (-G - p.vy * DRAG) * subDt;
        p.x += p.vx * subDt;
        p.y += p.vy * subDt;
        p.z += p.vz * subDt;

        if (prevVy >= 0 && p.vy < 0 && !p.isSubmunition && p.shellType !== "FLARE" && isPointRevealed(p.x, p.z)) {
          sfx.playShellWhistle();
        }

        if (p.shellType === "CLUSTER" && !p.splitDone && p.vy < -16) {
          p.splitDone = true;
          if (isPointRevealed(p.x, p.z)) {
            sfx.playExplosion(0.45);
            spawnBlastFX(p.x, p.y, p.z, 0xfbbf24, 14, false);
          }
          const offsets = [
            [-18, -14],
            [18, -14],
            [0, 0],
            [-14, 18],
            [14, 18],
          ];
          if (p.salvo) {
            p.salvo.remaining += offsets.length - 1;
          }
          offsets.forEach(([dvx, dvz]) => {
            spawnProjectile({
              owner: p.owner,
              shellType: "CLUSTER_SUB",
              x: p.x,
              y: p.y,
              z: p.z,
              vx: p.vx + dvx,
              vy: p.vy + (Math.random() - 0.5) * 10,
              vz: p.vz + dvz,
              isSubmunition: true,
              salvo: p.salvo,
            });
          });
          removeProjectile(i);
          removed = true;
          break;
        }

        if (p.shellType === "FLARE" && !p.flareDeployed && p.vy < -14) {
          p.flareDeployed = true;
          const cx = Math.max(-WORLD_W / 2 + 25, Math.min(WORLD_W / 2 - 25, p.x));
          const cz = Math.max(-WORLD_D / 2 + 25, Math.min(WORLD_D / 2 - 25, p.z));
          spawnParachuteFlare(cx, p.y, cz);
          state.lastShellFocus.set(cx, p.y, cz);
          state.shellCamHoldUntil = now + 700;
          refreshFogAndTerrain();
          sfx.playRadioSquelch();
          if (p.salvo) {
            p.salvo.impacts.push({ x: cx, y: p.y, z: cz, hitRidge: false, observedImpact: true, observedByTank: false });
            p.salvo.remaining -= 1;
            if (p.salvo.remaining <= 0) finalizeSalvo(p.salvo);
          }
          removeProjectile(i);
          removed = true;
          break;
        }

        if (Math.abs(p.x) > WORLD_W / 2 + 40 || Math.abs(p.z) > WORLD_D / 2 + 40 || p.y < -40) {
          const cx = Math.max(-WORLD_W / 2 + 10, Math.min(WORLD_W / 2 - 10, p.x));
          const cz = Math.max(-WORLD_D / 2 + 10, Math.min(WORLD_D / 2 - 10, p.z));
          if (p.salvo) {
            p.salvo.impacts.push({ x: cx, y: 0, z: cz, hitRidge: false, observedImpact: false, observedByTank: false });
            p.salvo.remaining -= 1;
            if (p.salvo.remaining <= 0) finalizeSalvo(p.salvo);
          }
          removeProjectile(i);
          removed = true;
          break;
        }

        const gy = getTerrainHeight(p.x, p.z);
        if (p.y <= gy) {
          handleImpact3D(p, p.x, gy, p.z, now);
          removeProjectile(i);
          removed = true;
          break;
        }
      }

      if (!removed) {
        const revealed = isPointRevealed(p.x, p.z);
        p.mesh.visible = p.owner === "player" ? revealed || getExploredAt(p.x, p.z) >= 0.08 : revealed || dom.reconToggle.checked;
        p.trailLine.visible = p.mesh.visible;
        p.mesh.position.set(p.x, p.y, p.z);
        p.trailPoints.push(new THREE.Vector3(p.x, p.y, p.z));
        if (p.trailPoints.length > 48) p.trailPoints.shift();
        p.trailLine.geometry.setFromPoints(p.trailPoints);
        if (p.owner === "player" || revealed) {
          state.lastShellFocus.set(p.x, p.y, p.z);
        }
      }
    }

    for (let i = state.flashes.length - 1; i >= 0; i--) {
      const fl = state.flashes[i];
      fl.age += dt;
      const t = fl.age / fl.duration;
      if (t >= 1) {
        fxGroup.remove(fl.mesh);
        if (fl.light) fxGroup.remove(fl.light);
        state.flashes.splice(i, 1);
      } else {
        const s = 1 + t * fl.maxScale;
        fl.mesh.scale.set(s, s, s);
        fl.mesh.material.opacity = (1 - t) * 0.9;
        if (fl.light) fl.light.intensity = (1 - t) * 4.5;
      }
    }

    for (let i = state.particles.length - 1; i >= 0; i--) {
      const pt = state.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        fxGroup.remove(pt.mesh);
        state.particles.splice(i, 1);
      } else {
        if (pt.gravity) pt.vy -= G * 0.75 * dt;
        pt.mesh.position.x += pt.vx * dt;
        pt.mesh.position.y += pt.vy * dt;
        pt.mesh.position.z += pt.vz * dt;
        pt.mesh.material.opacity = Math.max(0, pt.life / pt.maxLife);
      }
    }
  }

  function removeProjectile(idx) {
    const p = state.projectiles[idx];
    fxGroup.remove(p.mesh);
    fxGroup.remove(p.trailLine);
    p.trailLine.geometry.dispose();
    state.projectiles.splice(idx, 1);
  }

  function hasActiveFlareNear(wx, wz) {
    return state.flares.some((f) => Math.hypot(wx - f.x, wz - f.z) <= 220);
  }

  function handleImpact3D(proj, wx, wy, wz, now) {
    let blastRadius = 40;
    let craterRadius = 28;
    let maxDmg = 48;

    const observedByTank = tankHasLOS(wx, wy + 8, wz);
    const observedByRecon = reconHasLOS(wx, wy + 8, wz) && now >= state.recon.pinnedUntil;
    const litByFlare = hasActiveFlareNear(wx, wz);
    const areaRevealed = isPointRevealed(wx, wz);
    const observedImpact = observedByTank || observedByRecon || litByFlare || dom.reconToggle.checked;
    const showBlast = observedImpact || areaRevealed;

    if (proj.shellType === "SMOKE") {
      blastRadius = 20;
      craterRadius = 9;
      maxDmg = 10;
      state.smokePlumes.push({ x: wx, y: wy, z: wz, timeLeft: 28 });
      state.revealZones.push({ x: wx, z: wz, radius: 130, timeLeft: 28 });
      if (showBlast || proj.owner === "player") sfx.playExplosion(0.5);
      if (showBlast) spawnBlastFX(wx, wy, wz, 0xe2e8f0, 18, observedImpact);
    } else if (proj.shellType === "CLUSTER_SUB") {
      blastRadius = 26;
      craterRadius = 16;
      maxDmg = 22;
      if (observedImpact) {
        state.revealZones.push({ x: wx, z: wz, radius: 55, timeLeft: 10 });
      }
      if (showBlast) {
        sfx.playExplosion(0.65);
        spawnBlastFX(wx, wy, wz, 0xfb923c, 16, observedImpact);
      }
    } else {
      if (observedImpact) {
        state.revealZones.push({ x: wx, z: wz, radius: 55, timeLeft: 10 });
      }
      if (showBlast) {
        sfx.playExplosion(1.0);
        spawnBlastFX(wx, wy, wz, 0xfbbf24, 26, observedImpact);
      }
    }

    carveCrater3D(wx, wz, craterRadius);

    let dealt = 0;
    if (state.enemy.hp > 0) {
      const distEnemy = Math.hypot(wx - state.enemy.x, wz - state.enemy.z);
      if (distEnemy <= blastRadius) {
        const dmg = Math.max(5, Math.round(maxDmg * (1 - distEnemy / (blastRadius + 6))));
        state.enemy.hp = Math.max(0, state.enemy.hp - dmg);
        dealt += dmg;
      }
    }

    if (state.enemyTank.hp > 0) {
      const distET = Math.hypot(wx - state.enemyTank.x, wz - state.enemyTank.z);
      if (distET <= blastRadius + 4) {
        const dmg = Math.max(6, Math.round(maxDmg * (1 - distET / (blastRadius + 10))));
        state.enemyTank.hp = Math.max(0, state.enemyTank.hp - dmg);
        if (proj.owner === "player") dealt += dmg;
        if (state.enemyTank.hp <= 0) {
          enemyTankUnit.root.visible = false;
          appendRadioEntry("RECON", "Hostile KRONOS-2 Battle Tank destroyed!", "ENEMY ARMOR DESTROYED", "alert");
        }
      }
    }

    if (state.enemyScout.hp > 0) {
      const distES = Math.hypot(wx - state.enemyScout.x, wz - state.enemyScout.z);
      if (distES <= blastRadius) {
        const dmg = Math.max(5, Math.round(maxDmg * (1 - distES / (blastRadius + 6))));
        state.enemyScout.hp = Math.max(0, state.enemyScout.hp - dmg);
        if (proj.owner === "player") dealt += dmg;
        if (state.enemyScout.hp <= 0) {
          enemyScoutUnit.root.visible = false;
          appendRadioEntry("RECON", "Hostile SHADOW-3 binocular scout squad eliminated!", "ENEMY SCOUT LOST", "system");
        }
      }
    }

    if (!state.train.destroyed) {
      if (Math.abs(wx - state.train.x) <= blastRadius + 24 && Math.abs(wz - state.train.z) <= blastRadius + 12) {
        const dmg = Math.max(12, Math.round(maxDmg * 0.95));
        state.train.hp = Math.max(0, state.train.hp - dmg);
        if (proj.owner === "player") dealt += dmg;
        if (state.train.hp <= 0) {
          state.train.destroyed = true;
          state.train.respawnTimer = 45;
          state.enemy.cooldown += 8.0;
          spawnBlastFX(state.train.x, state.train.y + 5, state.train.z, 0xf97316, 28, true);
          appendRadioEntry("COMMAND", "Armored Supply Train derailed & destroyed! Enemy artillery resupply slowed (+8s reload delay).", "SUPPLY TRAIN DESTROYED", "alert");
        }
      }
    }

    for (const tree of state.trees) {
      if (tree.alive && Math.hypot(wx - tree.x, wz - tree.z) <= blastRadius * 0.9) {
        tree.alive = false;
        tree.group.visible = false;
      }
    }

    for (const am of Object.values(state.amenities)) {
      if (am.hp <= 0) continue;
      const dAm = Math.hypot(wx - am.x, wz - am.z);
      if (dAm <= blastRadius + 6) {
        const dmg = Math.max(6, Math.round(maxDmg * (1 - dAm / (blastRadius + 12))));
        am.hp = Math.max(0, am.hp - dmg);
        if ((proj.owner === "player" && am.side === "east") || (proj.owner === "enemy" && am.side === "west")) {
          dealt += dmg;
        }
        if (am.hp <= 0) {
          am.group.scale.set(1, 0.28, 1);
          if (am.spinner) am.spinner.visible = false;
          am.labelEl.textContent = `${am.name} [DESTROYED]`;
          am.labelEl.classList.add("pinned-tag");
          if (am.key === "east_radar") {
            appendRadioEntry("COMMAND", "East Radar Dish DESTROYED! Hostile East SAM defense is now BLIND and OFFLINE!", "ENEMY SAM BLINDED", "alert");
          } else if (am.key === "west_radar") {
            appendRadioEntry("SENTINEL-R1", "West Counter-Battery Radar DESTROYED! Our SAM defense and launch triangulation are now OFFLINE!", "FRIENDLY RADAR LOST", "alert");
          } else if (am.key === "east_sam") {
            appendRadioEntry("COMMAND", "East SAM Defense battery destroyed!", "ENEMY SAM DESTROYED", "alert");
          } else if (am.key === "west_sam") {
            appendRadioEntry("COMMAND", "West SAM Defense battery destroyed by hostile fire!", "FRIENDLY SAM LOST", "alert");
          } else if (am.key === "east_depot") {
            appendRadioEntry("COMMAND", "East Fuel Base obliterated! Hostile tank KRONOS-2 can NO LONGER REFUEL.", "ENEMY FUEL BASE DESTROYED", "alert");
          } else if (am.key === "west_depot") {
            appendRadioEntry("VIPER-1", "West Fuel Base blown up! VIPER-1 cannot refuel — conserve fuel!", "FRIENDLY FUEL BASE LOST", "alert");
          } else if (am.key === "east_tower") {
            state.recon.pinnedUntil = 0;
            state.recon.wasPinned = false;
            state.recon.wasPinnedWarned = false;
            appendRadioEntry("BRAVO-2", "East Sniper Belltower toppled! Sniper pinning cleared — binocular call-ins open.", "ENEMY TOWER DESTROYED", "alert");
          } else if (am.key === "west_tower") {
            appendRadioEntry("WEST TOWER", "West Sniper Belltower destroyed!", "FRIENDLY TOWER LOST", "alert");
          }
        }
      }
    }

    if (state.player.hp > 0) {
      const distPlayer = Math.hypot(wx - state.player.x, wz - state.player.z);
      if (distPlayer <= blastRadius) {
        const dmg = Math.max(5, Math.round(maxDmg * (1 - distPlayer / (blastRadius + 6))));
        state.player.hp = Math.max(0, state.player.hp - dmg);
        if (proj.owner === "enemy") dealt += dmg;
        if (state.player.hp <= 0) {
          playerUnit.root.visible = false;
          appendRadioEntry("VIPER-1", "ALPHA-1 mortar pit took a direct hit and is out of action!", "UNIT LOST", "alert");
        }
      }
    }

    if (state.tank.hp > 0) {
      const distTank = Math.hypot(wx - state.tank.x, wz - state.tank.z);
      if (distTank <= blastRadius) {
        const dmg = Math.max(5, Math.round(maxDmg * (1 - distTank / (blastRadius + 6))));
        state.tank.hp = Math.max(0, state.tank.hp - dmg);
        if (proj.owner === "enemy") dealt += dmg;
        if (state.tank.hp <= 0) {
          tankUnit.root.visible = false;
          state.tank.waypoint = null;
          updateWaypointVisuals();
          appendRadioEntry("COMMAND", "VIPER-1 Recon Tank has been knocked out! Tank spotting optics offline.", "SPOTTER LOST", "alert");
        }
      }
    }

    if (state.recon.hp > 0) {
      const distRecon = Math.hypot(wx - state.recon.x, wz - state.recon.z);
      if (distRecon <= blastRadius) {
        const dmg = Math.max(5, Math.round(maxDmg * (1 - distRecon / (blastRadius + 6))));
        state.recon.hp = Math.max(0, state.recon.hp - dmg);
        if (proj.owner === "enemy") dealt += dmg;
        if (state.recon.hp <= 0) {
          reconUnit.root.visible = false;
          state.recon.waypoint = null;
          updateWaypointVisuals();
          appendRadioEntry("COMMAND", "BRAVO-2 Binocular Recon Crew was knocked out!", "RECON LOST", "alert");
          if (state.activeUnit === "recon") setActiveUnit(state.tank.hp > 0 ? "tank" : "mortar");
        }
      }
    }

    // Only spawn impact marker if observed via VIPER-1/BRAVO-2 LOS, Flare, or Recon Satellite
    if (proj.owner === "player" && observedImpact) {
      spawnImpactMarker(wx, getTerrainHeight(wx, wz) + 1.5, wz);
    }

    if (showBlast) {
      state.lastShellFocus.set(wx, wy + 8, wz);
      state.shellCamHoldUntil = now + 650;
    }

    if (proj.salvo) {
      const hitRidge = proj.owner === "player" && wx >= -85 && wx <= 85 && wy > 70;
      proj.salvo.impacts.push({ x: wx, y: wy, z: wz, hitRidge, observedImpact, observedByTank: observedByTank || observedByRecon });
      proj.salvo.totalDamage += dealt;
      proj.salvo.remaining -= 1;
      if (proj.salvo.remaining <= 0) {
        finalizeSalvo(proj.salvo);
      }
    }

    if (state.enemy.hp <= 0 && state.phase === "RTS_ACTIVE") {
      endBattle(true);
    } else if (state.player.hp <= 0 && state.tank.hp <= 0 && state.phase === "RTS_ACTIVE") {
      endBattle(false);
    } else {
      updateHUD();
    }
  }

  function carveCrater3D(wx, wz, radius) {
    const r2 = radius * radius;
    const minIx = Math.max(0, Math.floor((wx - radius + WORLD_W / 2) / CELL));
    const maxIx = Math.min(COLS - 1, Math.ceil((wx + radius + WORLD_W / 2) / CELL));
    const minIz = Math.max(0, Math.floor((wz - radius + WORLD_D / 2) / CELL));
    const maxIz = Math.min(ROWS - 1, Math.ceil((wz + radius + WORLD_D / 2) / CELL));

    for (let iz = minIz; iz <= maxIz; iz++) {
      const z = -WORLD_D / 2 + iz * CELL;
      for (let ix = minIx; ix <= maxIx; ix++) {
        const x = -WORLD_W / 2 + ix * CELL;
        const d2 = (x - wx) * (x - wx) + (z - wz) * (z - wz);
        if (d2 < r2) {
          const factor = 1 - d2 / r2;
          const idx = iz * COLS + ix;
          state.heightGrid[idx] = Math.max(0, state.heightGrid[idx] - radius * 0.42 * factor);
          state.scorchGrid[idx] = Math.min(1, state.scorchGrid[idx] + factor * 0.95);
        }
      }
    }

    refreshFogAndTerrain();
    updateUnitTransforms();
  }

  function spawnMuzzleFlash(x, y, z, vx, vy, vz) {
    muzzleLight.position.set(x, y + 6, z);
    muzzleLight.intensity = 4.2;
    const len = Math.hypot(vx, vy, vz) || 1;
    for (let i = 0; i < 12; i++) {
      spawn3DParticle(
        x,
        y,
        z,
        (vx / len) * (40 + Math.random() * 55) + (Math.random() - 0.5) * 35,
        (vy / len) * (40 + Math.random() * 55) + (Math.random() - 0.5) * 35,
        (vz / len) * (40 + Math.random() * 55) + (Math.random() - 0.5) * 35,
        i % 2 === 0 ? 0xfbbf24 : 0xcbd5e1,
        0.45,
        2.2,
        false
      );
    }
  }

  function spawnBlastFX(x, y, z, color, count, withLight) {
    const flashMesh = new THREE.Mesh(
      new THREE.SphereGeometry(5, 12, 12),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 })
    );
    flashMesh.position.set(x, y + 2, z);
    fxGroup.add(flashMesh);

    let light = null;
    if (withLight) {
      light = new THREE.PointLight(color, 4.5, 220);
      light.position.set(x, y + 12, z);
      fxGroup.add(light);
    }
    state.flashes.push({ mesh: flashMesh, light, age: 0, duration: 0.48, maxScale: 4.5 });

    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 25 + Math.random() * 95;
      spawn3DParticle(
        x,
        y + 2,
        z,
        Math.cos(a) * spd,
        25 + Math.random() * 75,
        Math.sin(a) * spd,
        i % 3 === 0 ? 0xf87171 : color,
        0.65 + Math.random() * 0.45,
        2.6 + Math.random() * 2,
        true
      );
    }
  }

  function spawn3DParticle(x, y, z, vx, vy, vz, color, life, size, gravity) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 })
    );
    mesh.position.set(x, y, z);
    fxGroup.add(mesh);
    state.particles.push({ mesh, vx, vy, vz, life, maxLife: life, gravity });
  }

  function spawnParachuteFlare(x, y, z) {
    const group = new THREE.Group();
    group.position.set(x, y, z);

    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    const chute = new THREE.Mesh(
      new THREE.ConeGeometry(8, 5, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xf8fafc, side: THREE.DoubleSide })
    );
    chute.position.y = 11;
    const light = new THREE.PointLight(0xfef08a, 3.0, 340);
    group.add(orb, chute, light);
    fxGroup.add(group);

    state.flares.push({ group, chute, light, x, y, z, timeLeft: 28, landed: false });
  }

  function spawnImpactMarker(x, y, z) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(4.5, 7, 16),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, side: THREE.DoubleSide, transparent: true, opacity: 0.85 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y, z);
    fxGroup.add(ring);
    state.impactMarkers.push(ring);
  }

  /* ---------------- CAMERA & ENTITY VISIBILITY ---------------- */
  function updateCamera(dt, now) {
    const lerpSpeed = Math.min(1, dt * 6.5);
    const desiredPos = new THREE.Vector3();
    const desiredLook = new THREE.Vector3();
    const reconOn = dom.reconToggle.checked || state.phase === "GAME_OVER";

    const activeProj = state.projectiles[0];
    const useShellCam =
      dom.shellCamToggle.checked && (activeProj || now < state.shellCamHoldUntil);

    if (useShellCam) {
      if (activeProj) {
        const revealed = isPointRevealed(activeProj.x, activeProj.z);
        if (!reconOn && activeProj.owner === "player" && activeProj.x > -10 && !revealed) {
          desiredPos.set(-10, state.ridgePeakY + 38, state.player.z * 0.4 + 35);
          desiredLook.set(220, 20, activeProj.z * 0.65);
        } else {
          const hSpd = Math.hypot(activeProj.vx, activeProj.vz) || 1;
          const bx = activeProj.x - (activeProj.vx / hSpd) * 52;
          const bz = activeProj.z - (activeProj.vz / hSpd) * 52;
          const by = Math.max(getTerrainHeight(bx, bz) + 18, activeProj.y + 22);
          desiredPos.set(reconOn ? bx : Math.min(-10, bx), by, bz);
          desiredLook.set(activeProj.x, activeProj.y, activeProj.z);
        }
      } else {
        const f = state.lastShellFocus;
        if (!reconOn && !isPointRevealed(f.x, f.z)) {
          desiredPos.set(-10, state.ridgePeakY + 38, 35);
          desiredLook.set(200, 20, f.z * 0.5);
        } else {
          desiredPos.set(f.x - 65, f.y + 52, f.z + 55);
          desiredLook.copy(f);
        }
      }
      camera.position.lerp(desiredPos, lerpSpeed);
      camera.lookAt(desiredLook);
      return;
    }

    if (state.camMode === "pit") {
      if (state.activeUnit === "recon" && state.recon.hp > 0) {
        const r = state.recon;
        const fwdX = Math.cos(r.heading);
        const fwdZ = -Math.sin(r.heading);
        const camX = r.x - fwdX * 48;
        const camZ = r.z - fwdZ * 48 + 12;
        const camY = Math.max(r.y + 18, getTerrainHeight(camX, camZ) + 12);
        desiredPos.set(camX, camY, camZ);
        desiredLook.set(r.x + fwdX * 220, r.y + 22, r.z + fwdZ * 220);
      } else {
        const u = state.activeUnit === "tank" ? state.tank : state.player;
        const az = (u.azimuth * Math.PI) / 180;
        const camX = u.x - Math.cos(az) * 58;
        const camZ = u.z - Math.sin(az) * 58 + 14;
        const camY = Math.max(u.y + 21, getTerrainHeight(camX, camZ) + 14);
        desiredPos.set(camX, camY, camZ);
        desiredLook.set(u.x + Math.cos(az) * 240, u.y + 34, u.z + Math.sin(az) * 240);
      }
    } else if (state.camMode === "bino") {
      if (state.activeUnit === "recon" && state.recon.hp > 0) {
        const r = state.recon;
        const fwdX = Math.cos(r.heading);
        const fwdZ = -Math.sin(r.heading);
        desiredPos.set(r.x, r.y + 7.5, r.z);
        desiredLook.set(r.x + fwdX * 260, r.y + 8, r.z + fwdZ * 260);
      } else {
        // First-person VIPER-1 Tank Periscope Optics (from roof cupola along turret azimuth)
        const t = state.tank;
        const az = (t.azimuth * Math.PI) / 180;
        const pitchDeg = Math.max(-14, Math.min(18, (t.angle - 34) * 0.35 - 4));
        const pitchRad = (pitchDeg * Math.PI) / 180;
        desiredPos.set(t.x, t.y + 10.6, t.z);
        desiredLook.set(
          t.x + Math.cos(az) * Math.cos(pitchRad) * 250,
          t.y + 10.6 + Math.sin(pitchRad) * 250,
          t.z + Math.sin(az) * Math.cos(pitchRad) * 250
        );
      }
      camera.position.copy(desiredPos);
      camera.lookAt(desiredLook);
      return;
    } else {
      const { yaw, pitch, dist } = state.orbit;
      const targetX = reconOn ? 0 : -45;
      const clampedPitch = reconOn ? pitch : Math.max(0.22, Math.min(1.22, pitch));
      const clampedDist = reconOn ? dist : Math.min(920, dist);

      const px = targetX + Math.sin(yaw) * Math.cos(clampedPitch) * clampedDist;
      const py = 35 + Math.sin(clampedPitch) * clampedDist;
      const pz = Math.cos(yaw) * Math.cos(clampedPitch) * clampedDist;

      desiredPos.set(px, py, pz);
      desiredLook.set(targetX, 24, 0);
    }

    camera.position.lerp(desiredPos, lerpSpeed);
    camera.lookAt(desiredLook);
  }

  function updateEntityAndMistVisibility(now) {
    const reconOn = dom.reconToggle.checked || state.phase === "GAME_OVER";

    playerUnit.root.visible = state.player.hp > 0;
    tankUnit.root.visible = state.tank.hp > 0;
    reconUnit.root.visible = state.recon.hp > 0;

    enemyUnit.root.visible = state.enemy.hp > 0 && (reconOn || isPointRevealed(state.enemy.x, state.enemy.z));
    enemyTankUnit.root.visible = state.enemyTank.hp > 0 && (reconOn || isPointRevealed(state.enemyTank.x, state.enemyTank.z));
    enemyScoutUnit.root.visible = state.enemyScout.hp > 0 && (reconOn || isPointRevealed(state.enemyScout.x, state.enemyScout.z));
    trainGroup.visible = !state.train.destroyed && (reconOn || isPointRevealed(state.train.x, state.train.z));

    for (const lm of state.landmarks) {
      lm.group.visible = reconOn || lm.discovered;
    }
    for (const am of Object.values(state.amenities)) {
      am.group.visible = reconOn || am.discovered || getExploredAt(am.x, am.z) >= 0.12;
    }
    for (const seg of state.riverSegments) {
      seg.mesh.visible = reconOn || getExploredAt(seg.x, seg.z) >= 0.08;
    }
    for (const b of state.bridgeGroups) {
      b.group.visible = reconOn || getExploredAt(b.x, b.z) >= 0.08;
    }
    for (const r of state.railSegments) {
      r.group.visible = reconOn || getExploredAt(r.x, r.z) >= 0.08;
    }
    for (const t of state.trees) {
      t.group.visible = t.alive && (reconOn || getExploredAt(t.x, t.z) >= 0.08);
    }
    for (const m of state.impactMarkers) {
      m.visible = reconOn || getExploredAt(m.position.x, m.position.z) >= 0.1;
    }

    // Soft valley mist appears only over explored shadowed valleys, never inside black unexplored shroud
    mistGroup.visible = !reconOn;
    if (mistGroup.visible) {
      for (const ms of state.mistSprites) {
        const exp = getExploredAt(ms.x, ms.z);
        const vis = computeVisibilityAt(ms.x, ms.z);
        const targetOp = exp < 0.08 || vis > 0.3 ? 0 : (1 - vis / 0.3) * 0.38;
        ms.mesh.material.opacity += (targetOp - ms.mesh.material.opacity) * 0.12;
        ms.mesh.visible = ms.mesh.material.opacity > 0.02;
        ms.mesh.position.y = getTerrainHeight(ms.x, ms.z) + 18 + Math.sin(now * 0.0008 + ms.phase) * 2.5;
      }
    }
  }

  function updateLandmarkScreenLabels() {
    const w = dom.viewport3d.clientWidth || 1000;
    const h = dom.viewport3d.clientHeight || 420;
    const v = new THREE.Vector3();
    const reconOn = dom.reconToggle.checked || state.phase === "GAME_OVER";
    const visibleLabels = [];

    const queueLabel = (el, wx, wy, wz) => {
      v.set(wx, wy, wz);
      v.project(camera);
      if (v.z > 1 || v.z < -1) {
        el.style.display = "none";
        return;
      }
      const sx = (v.x * 0.5 + 0.5) * w;
      const sy = (-v.y * 0.5 + 0.5) * h;
      if (sx < 10 || sx > w - 10 || sy < 20 || sy > h - 10) {
        el.style.display = "none";
        return;
      }
      visibleLabels.push({ el, sx, sy });
    };

    for (const lm of state.landmarks) {
      if (!reconOn && !lm.discovered) {
        lm.labelEl.style.display = "none";
        continue;
      }
      queueLabel(lm.labelEl, lm.x, lm.y + 34, lm.z);
    }

    for (const am of Object.values(state.amenities)) {
      if (!reconOn && !am.discovered && getExploredAt(am.x, am.z) < 0.12) {
        am.labelEl.style.display = "none";
        continue;
      }
      if (am.hp > 0) {
        const blindTag = am.kind === "sam" && state.amenities[`${am.side}_radar`]?.hp <= 0 ? " [BLIND]" : "";
        am.labelEl.textContent = `${am.name}${blindTag}`;
      }
      queueLabel(am.labelEl, am.x, am.y + (am.hp > 0 ? 28 : 12), am.z);
    }

    if (state.radarLabelEl) {
      if (radarZoneGroup && radarZoneGroup.visible) {
        state.radarLabelEl.textContent = `RADAR LAUNCH EST (±${state.radar.radius}m)`;
        queueLabel(state.radarLabelEl, state.radar.estX, Math.max(18, getTerrainHeight(state.radar.estX, state.radar.estZ) + 28), state.radar.estZ);
      } else {
        state.radarLabelEl.style.display = "none";
      }
    }

    // Resolve screen-space collisions so 3D floating tags never stack over each other
    visibleLabels.sort((a, b) => a.sy - b.sy);
    for (let pass = 0; pass < 3; pass++) {
      let movedAny = false;
      for (let i = 1; i < visibleLabels.length; i++) {
        const cur = visibleLabels[i];
        for (let j = 0; j < i; j++) {
          const prev = visibleLabels[j];
          if (Math.abs(cur.sx - prev.sx) < 126 && cur.sy - prev.sy < 20) {
            cur.sy = prev.sy + 20;
            movedAny = true;
          }
        }
      }
      if (!movedAny) break;
      visibleLabels.sort((a, b) => a.sy - b.sy);
    }

    for (const item of visibleLabels) {
      item.el.style.display = "block";
      item.el.style.left = `${item.sx}px`;
      item.el.style.top = `${Math.min(h - 36, Math.max(24, item.sy))}px`;
    }
  }

  /* ---------------- TURN COMPLETION & AI INTEGRATION ---------------- */
  function compute3DError(shooterX, shooterZ, targetX, targetZ, impactX, impactZ) {
    const dxT = targetX - shooterX;
    const dzT = targetZ - shooterZ;
    const distT = Math.hypot(dxT, dzT) || 1;
    const fwdX = dxT / distT;
    const fwdZ = dzT / distT;
    const rightX = -fwdZ;
    const rightZ = fwdX;

    const ex = impactX - targetX;
    const ez = impactZ - targetZ;
    const rangeError = ex * fwdX + ez * fwdZ;
    const lateralError = ex * rightX + ez * rightZ;
    return { rangeError, lateralError };
  }

  async function finalizeSalvo(salvo) {
    if (!salvo || salvo.finalized || salvo.impacts.length === 0) return;
    salvo.finalized = true;

    const avgX = salvo.impacts.reduce((acc, i) => acc + i.x, 0) / salvo.impacts.length;
    const avgY = salvo.impacts.reduce((acc, i) => acc + i.y, 0) / salvo.impacts.length;
    const avgZ = salvo.impacts.reduce((acc, i) => acc + i.z, 0) / salvo.impacts.length;
    const hitRidge = salvo.impacts.some((i) => i.hitRidge);
    const samIntercepted = salvo.impacts.every((i) => i.interceptedBySam);
    const hasVisual =
      salvo.impacts.some((i) => i.observedImpact) || salvo.shellType === "FLARE" || salvo.shellType === "SMOKE";
    const tankObserved = salvo.impacts.some((i) => i.observedByTank);
    const activeTgt = getTargetInfo(state.activeTargetKey) || state.enemy;
    const tankHasTargetLOS =
      tankHasLOS(activeTgt.x, activeTgt.y + 6, activeTgt.z) ||
      (reconHasLOS(activeTgt.x, activeTgt.y + 6, activeTgt.z) && performance.now() >= state.recon.pinnedUntil);

    if (salvo.owner === "player") {
      const { rangeError, lateralError } = compute3DError(
        salvo.shooterX,
        salvo.shooterZ,
        activeTgt.x,
        activeTgt.z,
        avgX,
        avgZ
      );

      state.playerHistory.push({
        unit: salvo.firingUnit,
        shot: salvo.shotNum,
        azimuth: salvo.azimuth,
        angle: salvo.angle,
        power: salvo.power,
        windX: salvo.windX,
        windZ: salvo.windZ,
        rangeError: hasVisual && !samIntercepted ? Math.round(rangeError) : null,
        lateralError: hasVisual && !samIntercepted ? Math.round(lateralError) : null,
        shell: salvo.shellType,
      });

      const whoBadge = salvo.firingUnit === "VIPER-1" ? "TNK" : "MRT";
      appendShotRow(whoBadge, salvo.shotNum, salvo.azimuth, salvo.angle, salvo.power, rangeError, lateralError, hasVisual, samIntercepted);

      if (samIntercepted) {
        updateHUD();
        return;
      }

      if (tankObserved && state.tank.hp > 0) {
        fireLaserDesignator(avgX, avgY + 2, avgZ, 1800);
        sfx.playLaserPing();
      }

      const nearestLandmark = findNearestLandmark(avgX, avgZ);
      const report = await gemini.getSpotterReport({
        firingUnit: salvo.firingUnit,
        hasVisual,
        tankHasTargetLOS,
        shotNumber: salvo.shotNum,
        shellType: salvo.shellType,
        rangeError,
        lateralError,
        damageDealt: salvo.totalDamage,
        enemyHp: state.enemy.hp,
        windX: state.windX,
        windZ: state.windZ,
        nearestLandmark,
        hitRidge,
        history: state.playerHistory,
      });

      sfx.playRadioSquelch();
      appendRadioEntry(
        report.callsign || "VIPER-1",
        report.radio_message,
        `${report.correction_summary} · TARGET: ${report.target_status}`,
        !hasVisual ? "system" : salvo.totalDamage > 0 ? "alert" : ""
      );
      speakRadio(report.radio_message);

      if (report._source === "simulated_fallback") {
        appendRadioEntry("SYSTEM", `Gemini API fallback: ${report._error}`, "", "alert");
      }
    } else {
      const { rangeError, lateralError } = compute3DError(
        salvo.shooterX ?? state.enemy.x,
        salvo.shooterZ ?? state.enemy.z,
        salvo.targetX,
        salvo.targetZ,
        avgX,
        avgZ
      );

      state.enemyHistory.push({
        targetUnit: salvo.targetUnitName,
        shot: salvo.shotNum,
        azimuth: salvo.azimuth,
        angle: salvo.angle,
        power: salvo.power,
        windX: salvo.windX,
        windZ: salvo.windZ,
        rangeError: Math.round(rangeError),
        lateralError: Math.round(lateralError),
      });

      const splashSeen = isPointRevealed(avgX, avgZ) || dom.reconToggle.checked;
      appendShotRow("AI", salvo.shotNum, salvo.azimuth, salvo.angle, salvo.power, rangeError, lateralError, splashSeen, samIntercepted);

      if (state.activeUnit === "mortar" && state.player.hp <= 0 && state.tank.hp > 0) {
        setActiveUnit("tank");
      } else if (state.activeUnit === "tank" && state.tank.hp <= 0 && state.player.hp > 0) {
        setActiveUnit("mortar");
      }
      updateHUD();
    }
  }

  async function triggerEnemyCounterBattery() {
    if (state.phase !== "RTS_ACTIVE" || state.enemy.hp <= 0) {
      state.enemy.thinking = false;
      return;
    }

    let targetUnitName = state.lastFiringUnit;
    let targetUnit = targetUnitName === "VIPER-1" ? state.tank : state.player;
    if (targetUnit.hp <= 0) {
      targetUnitName = state.tank.hp > 0 ? "VIPER-1" : "ALPHA-1";
      targetUnit = state.tank.hp > 0 ? state.tank : state.player;
    }
    if (targetUnit.hp <= 0) {
      state.enemy.thinking = false;
      return;
    }

    try {
      const enemyDecision = await gemini.getEnemyShot({
        enemyName: state.mission.enemy_name || "IRON VULTURE-4",
        targetUnitName,
        enemyX: state.enemy.x,
        enemyZ: state.enemy.z,
        playerX: targetUnit.x,
        playerZ: targetUnit.z,
        ridgeHeight: state.ridgePeakY,
        windX: state.windX,
        windZ: state.windZ,
        enemyHp: state.enemy.hp,
        playerHp: targetUnit.hp,
        previousShots: state.enemyHistory,
      });

      if (state.phase !== "RTS_ACTIVE" || state.enemy.hp <= 0) return;

      enemyDecision.targetUnitName = targetUnitName;
      enemyDecision.targetX = targetUnit.x;
      enemyDecision.targetZ = targetUnit.z;

      const enemyKnown = dom.reconToggle.checked || state.enemy.spotted;
      dom.enemyReasoning.textContent = enemyKnown
        ? enemyDecision.internal_reasoning
        : state.radar.active
          ? `Counter-Battery Radar triangulated launch from E:~${state.radar.estX} N:~${-state.radar.estZ} (±${state.radar.radius}m) — inbound toward ${targetUnitName}.`
          : `Encrypted ballistic pulse intercepted from unexplored eastern shroud — inbound toward ${targetUnitName}.`;
      dom.enemyTaunt.textContent = enemyKnown ? enemyDecision.radio_intercept : "Encrypted transmission from shroud...";

      if (enemyDecision._source === "simulated_fallback") {
        appendRadioEntry("SYSTEM", `Enemy AI fallback: ${enemyDecision._error}`, "", "alert");
      }

      fireEnemyMortar(enemyDecision);
    } finally {
      state.enemy.thinking = false;
    }
  }

  function endBattle(playerWon) {
    state.phase = "GAME_OVER";
    state.tank.waypoint = null;
    state.recon.waypoint = null;
    state.enemy.spotted = true;
    dom.reconToggle.checked = true;
    updateWaypointVisuals();
    refreshFogAndTerrain(true);
    updateHUD();

    if (playerWon) {
      const battleScore = Math.max(150, Math.round(1000 - Math.max(0, state.playerShotCount - 1) * 60 + state.player.hp * 2 + state.tank.hp * 2));
      try {
        const prevBest = parseInt(localStorage.getItem("mortar-spotter-best") || "0", 10) || 0;
        if (battleScore > prevBest) {
          localStorage.setItem("mortar-spotter-best", String(battleScore));
        }
      } catch (e) {}
      dom.turnBanner.textContent = "VICTORY — HOSTILE BATTERY DESTROYED";
      dom.turnBanner.className = "turn-banner victory";
      appendRadioEntry(
        "COMMAND",
        `3D target neutralized in ${state.playerShotCount} rounds (Score: ${battleScore}). Click NEW BATTLE or generate a new AI scenario.`,
        "MISSION COMPLETE",
        "system"
      );
    } else {
      dom.turnBanner.textContent = "DEFEAT — ALL FRIENDLY GUNS DESTROYED";
      dom.turnBanner.className = "turn-banner enemy-turn";
      appendRadioEntry(
        "VIPER-1",
        "Both ALPHA-1 and VIPER-1 have been knocked out! Hit NEW BATTLE to redeploy.",
        "FORCE LOST",
        "alert"
      );
    }
  }

  function findNearestLandmark(wx, wz) {
    if (!state.landmarks.length) return null;
    let best = state.landmarks[0];
    let bestD = Math.hypot(wx - best.x, wz - best.z);
    for (const lm of state.landmarks) {
      const d = Math.hypot(wx - lm.x, wz - lm.z);
      if (d < bestD) {
        best = lm;
        bestD = d;
      }
    }
    return bestD <= 150 ? { name: best.name, type: best.type } : null;
  }

  /* ---------------- HUD & TELEMETRY ---------------- */
  function updateHUD() {
    const now = performance.now();
    const reconOn = dom.reconToggle.checked || state.phase === "GAME_OVER";

    dom.playerHpBar.style.width = `${state.player.hp}%`;
    dom.playerHpText.textContent = `${state.player.hp} HP · E:${Math.round(state.player.x)} N:${Math.round(-state.player.z)}`;
    dom.hudUnitMortar.classList.toggle("active", state.activeUnit === "mortar");
    dom.hudUnitMortar.classList.toggle("destroyed", state.player.hp <= 0);
    dom.selectMortarBtn.disabled = state.player.hp <= 0;

    const tankPct = (state.tank.hp / state.tank.maxHp) * 100;
    const fuelPct = state.tank.hp > 0 ? Math.max(0, Math.round((state.tank.fuel / state.tank.maxFuel) * 100)) : 0;
    const westDepotAlive = (state.amenities.west_depot?.hp ?? 0) > 0;
    dom.tankHpBar.style.width = `${tankPct}%`;
    dom.tankHpText.textContent = `${state.tank.hp} HP · E:${Math.round(state.tank.x)} N:${Math.round(-state.tank.z)}`;
    dom.tankFuelBar.style.width = `${fuelPct}%`;
    dom.tankFuelText.textContent =
      state.tank.hp <= 0
        ? "OFFLINE"
        : state.tank.fuel <= 0
          ? westDepotAlive ? "0% REFUELING" : "EMPTY (DEPOT LOST)"
          : !westDepotAlive
            ? `FUEL ${fuelPct}% (DEPOT LOST)`
            : state.tank.waypoint
              ? `FUEL ${fuelPct}% · EN ROUTE`
              : `FUEL ${fuelPct}% · REFUEL OK`;
    dom.hudUnitTank.classList.toggle("active", state.activeUnit === "tank");
    dom.hudUnitTank.classList.toggle("destroyed", state.tank.hp <= 0);
    dom.selectTankBtn.disabled = state.tank.hp <= 0;

    const reconPct = (state.recon.hp / state.recon.maxHp) * 100;
    const reconPinned = now < state.recon.pinnedUntil;
    const reconBoosted = now < state.recon.binoBoostUntil;
    dom.reconStatusBar.style.width = `${reconPct}%`;
    dom.reconHpText.textContent = `${state.recon.hp} HP · E:${Math.round(state.recon.x)} N:${Math.round(-state.recon.z)}`;
    dom.reconStatusText.textContent =
      state.recon.hp <= 0
        ? "OFFLINE"
        : reconPinned
          ? "PINNED BY SNIPER (NO COORDS)"
          : reconBoosted
            ? "600m BINO BOOST"
            : "520m BINO READY";
    dom.hudUnitRecon.classList.toggle("active", state.activeUnit === "recon");
    dom.hudUnitRecon.classList.toggle("destroyed", state.recon.hp <= 0);
    dom.selectReconBtn.disabled = state.recon.hp <= 0;

    const wr = (state.amenities.west_radar?.hp ?? 0) > 0;
    const ws = (state.amenities.west_sam?.hp ?? 0) > 0;
    const wd = westDepotAlive;
    const wt = (state.amenities.west_tower?.hp ?? 0) > 0;
    dom.friendlyAmenitiesText.textContent = `RDR:${wr ? "OK" : "X"} SAM:${ws ? (wr ? "OK" : "BLIND") : "X"} FUEL:${wd ? "OK" : "X"} TWR:${wt ? "OK" : "X"}`;

    const fmtEnemyAm = (key) => {
      const a = state.amenities[key];
      if (!a) return "?";
      if (!(reconOn || a.discovered)) return "?";
      return a.hp > 0 ? "UP" : "X";
    };
    const eRadar = state.amenities.east_radar;
    const eSam = state.amenities.east_sam;
    const eRadarDown = eRadar && (reconOn || eRadar.discovered) && eRadar.hp <= 0;
    const eSamStatus = !eSam || !(reconOn || eSam.discovered) ? "?" : eSam.hp <= 0 ? "X" : eRadarDown ? "BLIND" : "UP";
    const trainStatus = !(reconOn || state.train.spotted) ? "?" : state.train.destroyed ? "DELAY" : "RUN";
    dom.enemyAmenitiesText.textContent = `RDR:${fmtEnemyAm("east_radar")} SAM:${eSamStatus} FUEL:${fmtEnemyAm("east_depot")} TWR:${fmtEnemyAm("east_tower")} TRN:${trainStatus}`;

    const isReconCtrl = state.activeUnit === "recon";
    const canDrive = state.phase === "RTS_ACTIVE" && (isReconCtrl ? state.recon.hp > 0 : state.tank.hp > 0);
    dom.drivePadPanel.classList.toggle("disabled", !canDrive);
    dom.driveFwdBtn.disabled = !canDrive;
    dom.driveRevBtn.disabled = !canDrive;
    dom.driveLeftBtn.disabled = !canDrive;
    dom.driveRightBtn.disabled = !canDrive;
    if (isReconCtrl) {
      dom.driveStatusNote.textContent =
        state.recon.hp <= 0
          ? "BRAVO-2 destroyed"
          : reconPinned
            ? "PINNED by East Sniper Tower! Slowed & coords blocked"
            : state.recon.waypoint
              ? `BRAVO-2 moving -> E:${Math.round(state.recon.waypoint.x)} N:${Math.round(-state.recon.waypoint.z)} (${getReconMaxRange()}m bino)`
              : `Click terrain or WASD to move BRAVO-2 (${getReconMaxRange()}m bino)`;
    } else {
      dom.driveStatusNote.textContent =
        state.tank.hp <= 0
          ? "VIPER-1 destroyed"
          : state.tank.fuel <= 0
            ? westDepotAlive ? "Out of fuel — stationary refueling at West Depot" : "No fuel & West Depot lost — VIPER-1 immobilized"
            : state.tank.waypoint
              ? `Autopilot -> E:${Math.round(state.tank.waypoint.x)} N:${Math.round(-state.tank.waypoint.z)} (${state.tank.y > 55 ? "480m CREST" : "380m LOS"})`
              : `Click terrain or WASD (${state.tank.y > 55 ? "480m CREST LOS" : "380m LOS"})`;
    }

    const tgt = getTargetInfo(state.activeTargetKey) || getTargetInfo("mortar");
    const enemyKnown = isTargetKnown(tgt.key) || (tgt.hp <= 0 && (tgt.spotted || reconOn));
    if (tgt.isRadarEst && state.radar.active) {
      dom.enemyNameLabel.textContent = "TARGET: RADAR LAUNCH ESTIMATE";
      dom.enemyHpBar.style.width = "0%";
      dom.enemyHpText.textContent = "HP: ??? / ???";
      dom.enemyPosText.textContent = `RADAR FIX: E:~${Math.round(tgt.x)} N:~${Math.round(-tgt.z)} (±${state.radar.radius}m)`;
    } else if (enemyKnown) {
      dom.enemyNameLabel.textContent = `TARGET: ${tgt.label}`;
      dom.enemyHpBar.style.width = `${Math.max(0, (tgt.hp / tgt.maxHp) * 100)}%`;
      dom.enemyHpText.textContent = `${tgt.hp} / ${tgt.maxHp} HP`;
      dom.enemyPosText.textContent = `E:${Math.round(tgt.x)} N:${Math.round(-tgt.z)}`;
    } else if (state.radar.active && tgt.key === "mortar") {
      dom.enemyNameLabel.textContent = "HOSTILE CONTACT (RADAR TRIANGULATED)";
      dom.enemyHpBar.style.width = "0%";
      dom.enemyHpText.textContent = "HP: ??? / ???";
      dom.enemyPosText.textContent = `RADAR FIX: E:~${state.radar.estX} N:~${-state.radar.estZ} (±${state.radar.radius}m)`;
    } else {
      dom.enemyNameLabel.textContent = "HOSTILE CONTACT (UNSPOTTED IN SHROUD)";
      dom.enemyHpBar.style.width = "0%";
      dom.enemyHpText.textContent = "HP: ??? / ???";
      dom.enemyPosText.textContent = "LOC: UNEXPLORED — SCOUT WITH VIPER-1 / BRAVO-2";
    }

    const wMag = Math.hypot(state.windX, state.windZ);
    const wDeg = (Math.atan2(state.windZ, state.windX) * 180) / Math.PI;
    dom.windArrow.style.transform = `rotate(${wDeg}deg)`;
    dom.windVal.textContent = `${wMag.toFixed(1)} m/s (${state.windX >= 0 ? "+" : ""}${state.windX.toFixed(1)}E, ${state.windZ >= 0 ? "+" : ""}${state.windZ.toFixed(1)}S)`;

    const isTank = state.activeUnit === "tank";
    const activeU = isTank ? state.tank : state.player;
    if (isReconCtrl) {
      dom.fireBtn.disabled = state.phase !== "RTS_ACTIVE" || state.recon.hp <= 0;
      dom.fireBtn.textContent = reconPinned ? "PINNED BY SNIPER (NO COORDS)" : "BINOCULAR SPOT & CALL COORDS (SPACE)";
    } else {
      dom.fireBtn.disabled = state.phase !== "RTS_ACTIVE" || activeU.hp <= 0 || activeU.cooldown > 0;
      if (activeU.cooldown > 0 && state.phase === "RTS_ACTIVE") {
        dom.fireBtn.textContent = isTank
          ? `RELOADING 105MM (${activeU.cooldown.toFixed(1)}s)`
          : `RELOADING MORTAR (${activeU.cooldown.toFixed(1)}s)`;
      } else {
        dom.fireBtn.textContent = isTank ? "FIRE 105MM HOWITZER (SPACE)" : "FIRE MORTAR (SPACE)";
      }
    }
    dom.laserSpotBtn.disabled = state.phase !== "RTS_ACTIVE" || (state.tank.hp <= 0 && state.recon.hp <= 0);
    dom.radarSweepBtn.disabled = state.phase !== "RTS_ACTIVE" || !wr;
    dom.advanceReconBtn.disabled = state.phase !== "RTS_ACTIVE" || state.recon.hp <= 0;
    if (dom.sendTankCoordsBtn) {
      dom.sendTankCoordsBtn.disabled = state.phase !== "RTS_ACTIVE" || (state.tank.hp <= 0 && state.recon.hp <= 0) || getCalledInCoordsList().length === 0;
    }
    renderCalledInCoordsUI();

    if (state.phase === "RTS_ACTIVE") {
      const unitLabel = isReconCtrl ? "BRAVO-2" : isTank ? "VIPER-1" : "ALPHA-1";
      const moveTxt = isReconCtrl
        ? state.recon.waypoint ? "BRAVO-2 ADVANCING" : "CLICK TERRAIN TO MOVE BRAVO-2"
        : state.tank.waypoint ? "VIPER-1 MOVING TO WAYPOINT" : "CLICK TERRAIN TO MOVE VIPER-1";
      dom.turnBanner.textContent = `RTS LIVE (${unitLabel}) — ${moveTxt} · SPACE TO FIRE`;
      dom.turnBanner.className = "turn-banner";
    }
  }

  function appendRadioEntry(callsign, message, correction, variant = "", coordKey = null) {
    const entry = document.createElement("div");
    entry.className = `radio-entry ${variant}`.trim();
    const time = new Date().toLocaleTimeString([], { hour12: false, minute: "2-digit", second: "2-digit" });
    entry.innerHTML = `
      <div class="radio-meta">
        <span>[${escapeHtml(callsign)}]</span>
        <span>${time}</span>
      </div>
      <div class="radio-msg">${escapeHtml(message)}</div>
      ${correction ? `<div class="radio-correction">&gt; ${escapeHtml(correction)}</div>` : ""}
    `;
    if (coordKey) {
      const tgt = getTargetInfo(coordKey);
      if (tgt) {
        const actions = document.createElement("div");
        actions.className = "radio-coord-actions";

        const aimBtn = document.createElement("button");
        aimBtn.type = "button";
        aimBtn.className = "radio-action-btn";
        aimBtn.textContent = `AIM MORTAR (${tgt.shortLabel || tgt.label})`;
        aimBtn.addEventListener("click", () => selectCalledInCoord(coordKey, { switchUnit: "mortar", announce: true }));

        const tankBtn = document.createElement("button");
        tankBtn.type = "button";
        tankBtn.className = "radio-action-btn tank-action";
        tankBtn.textContent = `SEND TANK (${tgt.shortLabel || tgt.label})`;
        tankBtn.addEventListener("click", () => sendTankToCoord(coordKey));

        actions.append(aimBtn, tankBtn);
        entry.appendChild(actions);
      }
    }
    dom.spotterLog.appendChild(entry);
    dom.spotterLog.scrollTop = dom.spotterLog.scrollHeight;
  }

  function appendShotRow(who, shotNum, azimuth, angle, power, rangeError, lateralError, observed = true, samIntercepted = false) {
    const tr = document.createElement("tr");
    tr.className = who === "AI" ? "row-enemy" : who === "TNK" ? "row-tank" : "row-player";
    const absR = Math.abs(Math.round(rangeError));
    const absL = Math.abs(Math.round(lateralError));
    const errText = samIntercepted
      ? "SAM INT"
      : !observed
        ? "NO VISUAL"
        : absR <= 10 && absL <= 10
          ? "HIT!"
          : `${absL}m${lateralError >= 0 ? "R" : "L"} ${absR}m${rangeError >= 0 ? "OVR" : "SHT"}`;

    const fmt = (n) => (Number.isInteger(Number(n)) ? Number(n).toFixed(0) : Number(n).toFixed(1));
    tr.innerHTML = `
      <td>${who} #${shotNum}</td>
      <td>${azimuth >= 0 ? "+" : ""}${fmt(azimuth)}°</td>
      <td>${fmt(angle)}°</td>
      <td>${fmt(power)}%</td>
      <td>${errText}</td>
    `;
    dom.shotHistoryBody.prepend(tr);
  }

  function speakRadio(text) {
    if (!dom.ttsToggle.checked || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.08;
      utter.pitch = 0.92;
      window.speechSynthesis.speak(utter);
    } catch (_) {}
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  init();
})();
