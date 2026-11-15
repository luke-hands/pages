/**
 * GeminiService (3D LOS Spotter Tank Edition)
 * Connects Mortar Spotter 3D to Google's Gemini REST API (v1beta) with
 * structured JSON output schemas, plus a deterministic 3D LOS-aware
 * simulated fallback when no API key is entered.
 */
class GeminiService {
  constructor() {
    this.apiKey = "";
    this.model = "gemini-2.5-flash";
    this.endpointBase = "https://generativelanguage.googleapis.com/v1beta/models";
  }

  setConfig({ apiKey, model }) {
    if (typeof apiKey === "string") {
      this.apiKey = apiKey.trim();
    }
    if (typeof model === "string" && model.trim()) {
      this.model = model.trim();
    }
  }

  isLive() {
    return Boolean(this.apiKey && this.apiKey.length > 8);
  }

  async _callGemini({ systemInstruction, userPrompt, responseSchema, temperature = 0.7 }) {
    const url = `${this.endpointBase}/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const payload = {
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: userPrompt }],
        },
      ],
      generationConfig: {
        temperature,
        responseMimeType: "application/json",
        responseSchema,
      },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let errText = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        errText = errJson?.error?.message || errText;
      } catch (_) {}
      throw new Error(errText);
    }

    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      throw new Error("Empty response from Gemini API");
    }

    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    return JSON.parse(cleaned);
  }

  /**
   * 1) AI Forward Observer Spotter ("VIPER-1 RECON TANK") — LOS-Dependent 3D Corrections
   * Returns { callsign, radio_message, correction_summary, target_status }
   */
  async getSpotterReport(telemetry) {
    if (!this.isLive()) {
      return {
        ...this._simulateSpotterReport(telemetry),
        _source: "simulated",
      };
    }

    const schema = {
      type: "OBJECT",
      properties: {
        callsign: { type: "STRING" },
        radio_message: { type: "STRING" },
        correction_summary: { type: "STRING" },
        target_status: { type: "STRING" },
      },
      required: ["callsign", "radio_message", "correction_summary", "target_status"],
    };

    const systemInstruction = [
      "You are the commander of VIPER-1, a mobile reconnaissance tank acting as the forward artillery spotter for ALPHA-1 Mortar.",
      "CRITICAL LOS RULE: If tank_has_visual is false, the ridge blocked your tank turret optics! You ONLY heard a muffled blast over the ridge—DO NOT reveal exact meters or errors; instead tell the player to drive VIPER-1 up onto the ridge crest or fire a Flare so you can spot their splash (correction_summary: 'NO VISUAL — DRIVE TANK TO RIDGE').",
      "If tank_has_visual is true, your laser rangefinder tracked the splash! Give exact 1m corrections:",
      "range_error_m > 0 means LONG (DROP Xm); range_error_m < 0 means SHORT (ADD Xm).",
      "lateral_error_m > 0 means RIGHT (LEFT Xm); lateral_error_m < 0 means LEFT (RIGHT Xm).",
      "Keep correction_summary crisp, e.g. 'LEFT 18m, ADD 74m — LASER LOCK' or 'ON LINE, DROP 30m — LASER LOCK'.",
    ].join(" ");

    const userPrompt = JSON.stringify({
      firing_unit: telemetry.firingUnit || "ALPHA-1",
      tank_has_visual: Boolean(telemetry.hasVisual),
      tank_has_target_los: Boolean(telemetry.tankHasTargetLOS),
      shot_number: telemetry.shotNumber,
      shell_type: telemetry.shellType,
      range_error_m: telemetry.hasVisual ? Math.round(telemetry.rangeError) : null,
      lateral_error_m: telemetry.hasVisual ? Math.round(telemetry.lateralError) : null,
      damage_dealt: telemetry.hasVisual ? telemetry.damageDealt : null,
      enemy_hp_remaining: telemetry.hasVisual ? telemetry.enemyHp : null,
      wind_east_mps: Number(telemetry.windX.toFixed(1)),
      wind_cross_mps: Number(telemetry.windZ.toFixed(1)),
      nearest_landmark: telemetry.hasVisual ? telemetry.nearestLandmark : null,
      hit_ridge_early: telemetry.hitRidge,
    });

    try {
      const result = await this._callGemini({
        systemInstruction,
        userPrompt,
        responseSchema: schema,
        temperature: 0.65,
      });
      return { ...result, _source: "gemini" };
    } catch (err) {
      return {
        ...this._simulateSpotterReport(telemetry),
        _source: "simulated_fallback",
        _error: err.message,
      };
    }
  }

  /**
   * 2) Thinking Enemy Artillery Commander (3D Azimuth + Elevation + Power)
   * Targets whichever friendly unit (ALPHA-1 or VIPER-1) fired most recently
   * Returns { internal_reasoning, radio_intercept, azimuth, angle, power }
   */
  async getEnemyShot(enemyState) {
    if (!this.isLive()) {
      return {
        ...this._simulateEnemyShot(enemyState),
        _source: "simulated",
      };
    }

    const schema = {
      type: "OBJECT",
      properties: {
        internal_reasoning: { type: "STRING" },
        radio_intercept: { type: "STRING" },
        azimuth: { type: "NUMBER" },
        angle: { type: "NUMBER" },
        power: { type: "NUMBER" },
      },
      required: ["internal_reasoning", "radio_intercept", "azimuth", "angle", "power"],
    };

    const systemInstruction = [
      "You command an enemy mortar battery on the East side (+X) of a 1000m x 600m 3D valley, firing Westward (-X) at either ALPHA-1 (mortar) or VIPER-1 (mobile recon tank).",
      "Physics: G = 60 m/s^2, speed V = power * 2.55 m/s, wind acceleration ax = wind_east * 0.65, az = wind_cross * 0.65, drag = 0.018.",
      "Controls: azimuth (-35 to +35 deg, where +azimuth aims RIGHT/North and -azimuth aims LEFT/South from your West-facing perspective),",
      "angle (35 to 82 deg elevation to clear the central ridge), power (15 to 100%).",
      "Note: VIPER-1 is a mobile recon tank and may relocate along the ridge! Analyze your previous shots against the active target coordinates.",
      "Provide 2-3 sentences of ballistic reasoning in internal_reasoning, a short radio_intercept taunt, and numeric azimuth, angle, power.",
    ].join(" ");

    const userPrompt = JSON.stringify({
      enemy_name: enemyState.enemyName,
      target_unit: enemyState.targetUnitName || "ALPHA-1",
      enemy_pos: { x: Math.round(enemyState.enemyX), z: Math.round(enemyState.enemyZ) },
      target_pos: { x: Math.round(enemyState.playerX), z: Math.round(enemyState.playerZ) },
      direct_distance_m: Math.round(Math.hypot(enemyState.enemyX - enemyState.playerX, enemyState.enemyZ - enemyState.playerZ)),
      ridge_peak_height_m: Math.round(enemyState.ridgeHeight),
      wind_east_mps: Number(enemyState.windX.toFixed(1)),
      wind_cross_mps: Number(enemyState.windZ.toFixed(1)),
      enemy_hp: enemyState.enemyHp,
      target_hp: enemyState.playerHp,
      previous_enemy_shots: enemyState.previousShots.slice(-5),
    });

    try {
      const result = await this._callGemini({
        systemInstruction,
        userPrompt,
        responseSchema: schema,
        temperature: 0.4,
      });
      return {
        internal_reasoning: String(result.internal_reasoning || "Adjusting 3D traverse and charge."),
        radio_intercept: String(result.radio_intercept || "Battery, fire!"),
        azimuth: this._clamp(Number(result.azimuth) || 0, -35, 35),
        angle: this._clamp(Number(result.angle) || 60, 35, 82),
        power: this._clamp(Number(result.power) || 72, 15, 100),
        _source: "gemini",
      };
    } catch (err) {
      return {
        ...this._simulateEnemyShot(enemyState),
        _source: "simulated_fallback",
        _error: err.message,
      };
    }
  }

  /**
   * 3) AI Mission Generator
   */
  async generateMission(promptText) {
    if (!this.isLive()) {
      return {
        ...this._simulateMission(promptText),
        _source: "simulated",
      };
    }

    const schema = {
      type: "OBJECT",
      properties: {
        operation_name: { type: "STRING" },
        briefing: { type: "STRING" },
        theme: { type: "STRING" },
        ridge_height: { type: "NUMBER" },
        roughness: { type: "NUMBER" },
        base_wind: { type: "NUMBER" },
        enemy_name: { type: "STRING" },
        landmarks: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              name: { type: "STRING" },
              type: { type: "STRING" },
            },
            required: ["name", "type"],
          },
        },
      },
      required: [
        "operation_name",
        "briefing",
        "theme",
        "ridge_height",
        "roughness",
        "base_wind",
        "enemy_name",
        "landmarks",
      ],
    };

    const systemInstruction = [
      "You design tactical 3D valley artillery scenarios for Mortar Spotter 3D.",
      "Choose theme strictly from: 'desert', 'alpine', 'night', 'verdant'.",
      "ridge_height must be between 80 and 210 (meters).",
      "roughness must be between 0.2 and 0.95.",
      "base_wind must be between -12 and 12 (m/s).",
      "Provide 3 or 4 landmarks with short names and type from: 'tower', 'depot', 'radar', 'bunker', 'ruins'.",
    ].join(" ");

    try {
      const result = await this._callGemini({
        systemInstruction,
        userPrompt: `Create a 3D recon-tank + mortar mission based on: "${promptText || "mountain artillery duel at dawn"}"`,
        responseSchema: schema,
        temperature: 0.85,
      });

      const allowedThemes = ["desert", "alpine", "night", "verdant"];
      const theme = allowedThemes.includes(result.theme) ? result.theme : "desert";
      return {
        operation_name: String(result.operation_name || "OP: THUNDER RIDGE").toUpperCase(),
        briefing: String(result.briefing || "Drive VIPER-1 Recon Tank onto the ridge crest to gain LOS and direct ALPHA-1 mortar fire."),
        theme,
        ridge_height: this._clamp(Number(result.ridge_height) || 140, 80, 210),
        roughness: this._clamp(Number(result.roughness) || 0.55, 0.2, 0.95),
        base_wind: this._clamp(Number(result.base_wind) || 0, -12, 12),
        enemy_name: String(result.enemy_name || "IRON VULTURE-4"),
        landmarks:
          Array.isArray(result.landmarks) && result.landmarks.length
            ? result.landmarks.slice(0, 4)
            : [
                { name: "Old Belltower", type: "tower" },
                { name: "Fuel Depot", type: "depot" },
                { name: "Radar Dish", type: "radar" },
              ],
        _source: "gemini",
      };
    } catch (err) {
      return {
        ...this._simulateMission(promptText),
        _source: "simulated_fallback",
        _error: err.message,
      };
    }
  }

  /* ---------------- LOCAL 3D LOS-AWARE SIMULATED FALLBACKS ---------------- */

  _simulateSpotterReport(t) {
    const unit = t.firingUnit || "ALPHA-1";

    if (t.enemyHp <= 0) {
      return {
        callsign: "VIPER-1",
        radio_message: `${unit}, direct hit confirmed! Secondary blasts lighting up the valley floor—enemy battery destroyed!`,
        correction_summary: "TARGET DESTROYED",
        target_status: "DESTROYED",
      };
    }

    if (t.hitRidge) {
      return {
        callsign: "VIPER-1",
        radio_message: `${unit}, round slammed into the central ridge! Raise elevation or reposition VIPER-1 up the slope to clear the crest.`,
        correction_summary: "RAISE ELEVATION / CLEAR CREST",
        target_status: "UNHARMED",
      };
    }

    // Case B: Tank LOS is blocked (and no Flare) -> Blind / acoustic-only report
    if (!t.hasVisual) {
      return {
        callsign: "VIPER-1",
        radio_message:
          "Heard detonation beyond the ridge, but the hill is blocking our turret optics! Drive VIPER-1 up to the ridge crest or fire a Flare so we can spot your splash!",
        correction_summary: "NO VISUAL — DRIVE TANK TO RIDGE",
        target_status: "UNOBSERVED",
      };
    }

    // Case A: Clear LOS or Flare illumination -> 1m precision laser-locked corrections
    const absRange = Math.abs(Math.round(t.rangeError));
    const absLat = Math.abs(Math.round(t.lateralError));
    const isLong = t.rangeError > 0;
    const landedRight = t.lateralError > 0;
    const landmarkNote = t.nearestLandmark ? `near ${t.nearestLandmark.name}` : "in the eastern valley";

    const latCorrection = absLat < 8 ? "ON LINE" : `${landedRight ? "LEFT" : "RIGHT"} ${absLat}m`;
    const rngCorrection = absRange < 8 ? "RANGE GOOD" : `${isLong ? "DROP" : "ADD"} ${absRange}m`;
    const corrSummary =
      absLat < 8 && absRange < 8 ? "FIRE FOR EFFECT! — LASER LOCK" : `${latCorrection}, ${rngCorrection} — LASER LOCK`;

    if (t.shellType === "FLARE") {
      return {
        callsign: "VIPER-1",
        radio_message: `${unit}, parachute flare burning bright above ${landmarkNote}, illuminating the eastern valley for our optics.`,
        correction_summary: corrSummary,
        target_status: "ILLUMINATED",
      };
    }

    if (t.shellType === "SMOKE") {
      return {
        callsign: "VIPER-1",
        radio_message: `${unit}, laser lock on WP smoke ${landmarkNote}: ${absLat}m ${landedRight ? "right" : "left"}, ${absRange}m ${isLong ? "long" : "short"} of target.`,
        correction_summary: corrSummary,
        target_status: "MARKED",
      };
    }

    if (t.damageDealt >= 25) {
      return {
        callsign: "VIPER-1",
        radio_message: `${unit}, laser-spotted hit ${landmarkNote}! Shrapnel shredded their pit—${absLat}m ${landedRight ? "right" : "left"}, ${absRange}m ${isLong ? "long" : "short"}.`,
        correction_summary: corrSummary,
        target_status: "DAMAGED",
      };
    }

    if (t.damageDealt > 0) {
      return {
        callsign: "VIPER-1",
        radio_message: `${unit}, close splash ${landmarkNote}! Laser reads ${absLat}m ${landedRight ? "right" : "left"}, ${absRange}m ${isLong ? "long" : "short"}.`,
        correction_summary: corrSummary,
        target_status: "SUPPRESSED",
      };
    }

    const obsLat = absLat < 8 ? "on bearing" : `${absLat}m ${landedRight ? "right" : "left"}`;
    const obsRng = absRange < 8 ? "good range" : `${absRange}m ${isLong ? "long" : "short"}`;
    return {
      callsign: "VIPER-1",
      radio_message: `${unit}, laser lock on splash ${landmarkNote}—${obsLat}, ${obsRng}. Adjust ${latCorrection.toLowerCase()}, ${rngCorrection.toLowerCase()}.`,
      correction_summary: corrSummary,
      target_status: "INTACT",
    };
  }

  _simulateEnemyShot(state) {
    const targetName = state.targetUnitName || "ALPHA-1";
    const dx = state.enemyX - state.playerX;
    const dz = state.enemyZ - state.playerZ;
    const dist = Math.hypot(dx, dz);
    const prev = (state.previousShots || []).filter((s) => s.targetUnit === targetName);
    const G = 60;

    const trueAzim = (Math.atan2(dz, dx) * 180) / Math.PI;
    const chosenAngle = prev.length ? prev[prev.length - 1].angle : Math.round(58 + Math.random() * 10);
    const rad = (chosenAngle * Math.PI) / 180;
    const sin2 = Math.sin(2 * rad);

    let idealV = Math.sqrt((dist * G) / Math.max(0.25, sin2));
    idealV += state.windX * 1.45 + 6;
    let basePower = idealV / 2.55;
    let baseAzim = trueAzim - state.windZ * 0.45;

    let reasoning = "";
    let taunt = "";

    if (prev.length === 0) {
      const pJitter = (Math.random() > 0.5 ? 1 : -1) * (4 + Math.random() * 5);
      const aJitter = (Math.random() - 0.5) * 9;
      basePower = this._clamp(basePower + pJitter, 20, 99);
      baseAzim = this._clamp(baseAzim + aJitter, -35, 35);
      reasoning = `Counter-battery radar locked ${targetName} across ${Math.round(dist)}m valley. Firing ${baseAzim.toFixed(1)}° azimuth, ${chosenAngle}° elevation to clear ${Math.round(state.ridgeHeight)}m crest.`;
      taunt = `"Detected firing signature from ${targetName}. Sending counter-battery!"`;
    } else {
      const last = prev[prev.length - 1];
      const powerFix = -(last.rangeError / 18) + (state.windX - last.windX) * 0.55;
      const azimFix = -((last.lateralError / Math.max(250, dist)) * (180 / Math.PI) * 0.9) - (state.windZ - last.windZ) * 0.4;
      const pNoise = (Math.random() - 0.5) * (Math.abs(last.rangeError) < 35 ? 1.2 : 2.5);
      const aNoise = (Math.random() - 0.5) * (Math.abs(last.lateralError) < 25 ? 0.9 : 2.2);

      basePower = this._clamp(last.power + powerFix + pNoise, 18, 99);
      baseAzim = this._clamp(last.azimuth + azimFix + aNoise, -35, 35);

      reasoning = `Last salvo vs ${targetName} was ${Math.abs(Math.round(last.rangeError))}m ${last.rangeError > 0 ? "long" : "short"} and ${Math.abs(Math.round(last.lateralError))}m ${last.lateralError > 0 ? "right" : "left"}. Adjusting azimuth ${azimFix >= 0 ? "+" : ""}${azimFix.toFixed(1)}° and charge ${powerFix >= 0 ? "+" : ""}${powerFix.toFixed(1)}%.`;
      taunt =
        Math.hypot(last.rangeError, last.lateralError) < 55
          ? `"${targetName} bracketed! Fire for effect!"`
          : `"Tracking ${targetName}—tightening 3D dispersion."`;
    }

    return {
      internal_reasoning: reasoning,
      radio_intercept: taunt,
      azimuth: Number(baseAzim.toFixed(1)),
      angle: chosenAngle,
      power: Number(basePower.toFixed(1)),
    };
  }

  _simulateMission(promptText) {
    const p = (promptText || "").toLowerCase();
    let theme = "desert";
    if (p.includes("snow") || p.includes("alpine") || p.includes("ice") || p.includes("winter")) {
      theme = "alpine";
    } else if (p.includes("night") || p.includes("dark") || p.includes("midnight") || p.includes("flare")) {
      theme = "night";
    } else if (p.includes("forest") || p.includes("jungle") || p.includes("green") || p.includes("valley")) {
      theme = "verdant";
    }

    const strongWind = p.includes("wind") || p.includes("storm") || p.includes("gale") || p.includes("gust");
    const tallCliffs = p.includes("tall") || p.includes("cliff") || p.includes("peak") || p.includes("mountain");

    const names = {
      desert: "OP: SCORCHED BASIN",
      alpine: "OP: FROST CREST",
      night: "OP: NIGHTWATCH FLARE",
      verdant: "OP: EMERALD RAVINE",
    };

    return {
      operation_name: names[theme],
      briefing: promptText
        ? `3D LOS Theater from brief: "${promptText}". Drive VIPER-1 Recon Tank onto the ridge crest to gain real-time LOS over the valley and laser-spot splashes for ALPHA-1.`
        : "3D Line-of-Sight Theater: Drive VIPER-1 Recon Tank onto the ridge crest to gain real-time LOS over the valley and laser-spot splashes for ALPHA-1 Mortar.",
      theme,
      ridge_height: tallCliffs ? 165 : 125,
      roughness: tallCliffs ? 0.78 : 0.52,
      base_wind: strongWind ? (Math.random() > 0.5 ? 8.5 : -8.5) : Number(((Math.random() - 0.5) * 6).toFixed(1)),
      enemy_name: theme === "alpine" ? "FROSTHOUND-6" : theme === "night" ? "SPECTRE-3" : "IRON VULTURE-4",
      landmarks: [
        { name: "Old Belltower", type: "tower" },
        { name: "Fuel Depot", type: "depot" },
        { name: "Radar Dish", type: "radar" },
        { name: "Stone Bunker", type: "bunker" },
      ],
    };
  }

  _clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }
}

window.GeminiService = GeminiService;
