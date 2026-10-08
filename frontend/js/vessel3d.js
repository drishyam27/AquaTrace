/**
 * AquaTrace — Ultra-Realistic 3D Maritime & SAR Radar Simulation
 * High-fidelity Three.js simulation featuring:
 * - Oceanic Gerstner swells with procedural water normal glint & dynamic foam crests
 * - Master-crafted container vessel with continuous flared bow, sheer curve,
 *   crisp boot-topping stripe, cargo hold coamings, and detailed accommodation block
 * - Buoyant hydrodynamics: realistic wave heave, pitch, and roll responding to swells
 * - Trailing propeller wash, wake foam, and iridescent SAR-correlated oil slick plume
 * - Volumetric Sentinel-1 SAR scanning radar cone with tactical HUD
 */

(function () {
  'use strict';

  if (typeof THREE === 'undefined') {
    console.warn('[AquaTrace 3D] Three.js not loaded. Retrying on load...');
    window.addEventListener('load', initWhenReady);
    return;
  }

  function initWhenReady() {
    if (typeof THREE !== 'undefined') initSimulation();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSimulation);
  } else {
    initSimulation();
  }

  function initSimulation() {
    const container = document.getElementById('vessel-3d-canvas-container');
    if (!container) return;

    let width = container.clientWidth || 400;
    let height = container.clientHeight || 320;

    // --- Scene & Atmospheric Marine Fog ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07192a);
    scene.fog = new THREE.FogExp2(0x07192a, 0.015);

    // --- Camera & View Presets ---
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 600);
    const cameraPresets = {
      tactical: { pos: new THREE.Vector3(16, 9.0, 16.5), look: new THREE.Vector3(0, 1.4, 0) },
      bowChase: { pos: new THREE.Vector3(11.5, 3.6, 6.2), look: new THREE.Vector3(-1.0, 1.8, 0) },
      satellite: { pos: new THREE.Vector3(0.01, 28, 0.01), look: new THREE.Vector3(0, 0, 0) }
    };
    let currentPresetKey = 'tactical';
    camera.position.copy(cameraPresets.tactical.pos);
    camera.lookAt(cameraPresets.tactical.look);

    let currentLookAt = cameraPresets.tactical.look.clone();
    let targetCameraPos = cameraPresets.tactical.pos.clone();
    let targetLookAt = cameraPresets.tactical.look.clone();

    // --- Renderer (WebGL PBR) ---
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    container.appendChild(renderer.domElement);

    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';

    // --- Maritime Lighting ---
    // Deep ocean skylight (ambient)
    const ambientLight = new THREE.AmbientLight(0x244a70, 1.4);
    scene.add(ambientLight);

    // Warm Key Sunlight (casts crisp shadows)
    const sunLight = new THREE.DirectionalLight(0xfff5ea, 1.9);
    sunLight.position.set(26, 36, 20);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 100;
    sunLight.shadow.camera.left = -18;
    sunLight.shadow.camera.right = 18;
    sunLight.shadow.camera.top = 18;
    sunLight.shadow.camera.bottom = -18;
    sunLight.shadow.bias = -0.0008;
    scene.add(sunLight);

    // Cool Sky-Blue Fill Light from horizon
    const horizonFill = new THREE.DirectionalLight(0x00a8e8, 0.95);
    horizonFill.position.set(-20, 8, -20);
    scene.add(horizonFill);

    // Deck Point Light for atmospheric warmth
    const deckLight = new THREE.PointLight(0xffedd5, 0.65, 20);
    deckLight.position.set(0, 4.5, 0);
    scene.add(deckLight);

    // =========================================================================
    // 1. PROCEDURAL OCEAN WATER SHADER & GERSTNER SWELL ENGINE
    // =========================================================================
    // Generate Procedural Water Ripple Normal Map for glistening sunlight
    function createWaterNormalCanvas() {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      const imgData = ctx.createImageData(256, 256);
      const data = imgData.data;

      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
          const u = (x / 256) * Math.PI * 4;
          const v = (y / 256) * Math.PI * 4;
          // Perpendicular wave slopes
          const nx = Math.sin(u) * 0.4 + Math.sin(u * 2.3 + v * 1.5) * 0.25;
          const ny = Math.cos(v) * 0.4 + Math.cos(v * 2.1 - u * 1.7) * 0.25;
          const nz = 1.0;
          const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

          const idx = (y * 256 + x) * 4;
          data[idx] = Math.floor(((nx / len) * 0.5 + 0.5) * 255);
          data[idx + 1] = Math.floor(((ny / len) * 0.5 + 0.5) * 255);
          data[idx + 2] = Math.floor(((nz / len) * 0.5 + 0.5) * 255);
          data[idx + 3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(16, 16);
      return texture;
    }

    const waterNormalMap = createWaterNormalCanvas();

    const oceanSize = 84;
    const oceanSegs = 96; // 96x96 dense mesh for smooth organic fluid curvature
    const oceanGeo = new THREE.PlaneGeometry(oceanSize, oceanSize, oceanSegs, oceanSegs);
    oceanGeo.rotateX(-Math.PI / 2);

    const origPositions = oceanGeo.attributes.position.array.slice();
    const vertexColors = new Float32Array(oceanGeo.attributes.position.count * 3);
    oceanGeo.setAttribute('color', new THREE.BufferAttribute(vertexColors, 3));

    // PBR Physical Ocean Water Material (glossy, reflective, translucent)
    const oceanMat = new THREE.MeshPhysicalMaterial({
      color: 0x093049,
      roughness: 0.10,
      metalness: 0.12,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      normalMap: waterNormalMap,
      normalScale: new THREE.Vector2(0.25, 0.25),
      reflectivity: 0.90,
      transmission: 0.22,
      vertexColors: true,
      flatShading: false
    });
    const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    oceanMesh.receiveShadow = true;
    scene.add(oceanMesh);

    // Natural Ocean Wave Harmonics (Primary swells + cross chop)
    const waves = [
      { dx: 1.0, dz: 0.2, len: 18.0, amp: 0.24, spd: 1.5 },
      { dx: 0.7, dz: 0.7, len: 10.0, amp: 0.15, spd: 2.0 },
      { dx: -0.3, dz: 0.9, len: 5.5, amp: 0.08, spd: 2.7 },
      { dx: 0.9, dz: -0.4, len: 3.2, amp: 0.04, spd: 3.4 }
    ];

    function evaluateWave(x, z, time) {
      let y = 0;
      let dxAccum = 0;
      let dzAccum = 0;

      for (let i = 0; i < waves.length; i++) {
        const w = waves[i];
        const k = (2 * Math.PI) / w.len;
        const phase = k * (w.dx * x + w.dz * z) - (w.spd * time);
        const sinP = Math.sin(phase);
        const cosP = Math.cos(phase);

        y += w.amp * cosP;
        const q = 0.20; // Natural peaked crests
        dxAccum += q * w.amp * w.dx * sinP;
        dzAccum += q * w.amp * w.dz * sinP;
      }
      return { y, dx: dxAccum, dz: dzAccum };
    }

    // Tactical Radar Range Rings on Ocean
    const ringGeo1 = new THREE.RingGeometry(6, 6.08, 64);
    ringGeo1.rotateX(-Math.PI / 2);
    const ringMat1 = new THREE.MeshBasicMaterial({ color: 0x00a8e8, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
    const radarRing1 = new THREE.Mesh(ringGeo1, ringMat1);
    radarRing1.position.y = 0.04;
    scene.add(radarRing1);

    const ringGeo2 = new THREE.RingGeometry(14, 14.12, 64);
    ringGeo2.rotateX(-Math.PI / 2);
    const ringMat2 = new THREE.MeshBasicMaterial({ color: 0x00a8e8, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
    const radarRing2 = new THREE.Mesh(ringGeo2, ringMat2);
    radarRing2.position.y = 0.04;
    scene.add(radarRing2);

    // =========================================================================
    // 2. IRIDESCENT OIL SLICK PLUME ON WATER
    // =========================================================================
    const slickShape = new THREE.Shape();
    slickShape.moveTo(-3.0, -0.5);
    slickShape.bezierCurveTo(-5.5, -1.8, -10.0, -2.6, -16.0, -1.5);
    slickShape.bezierCurveTo(-19.0, -0.4, -18.5, 1.4, -15.5, 2.0);
    slickShape.bezierCurveTo(-9.5, 2.7, -5.5, 1.5, -3.0, 0.5);
    slickShape.closePath();

    const slickGeo = new THREE.ShapeGeometry(slickShape, 28);
    slickGeo.rotateX(-Math.PI / 2);
    const slickMat = new THREE.MeshStandardMaterial({
      color: 0x020810,
      roughness: 0.03,
      metalness: 0.95,
      transparent: true,
      opacity: 0.88,
      side: THREE.DoubleSide
    });
    const slickMesh = new THREE.Mesh(slickGeo, slickMat);
    slickMesh.position.y = 0.06;
    scene.add(slickMesh);

    // =========================================================================
    // 3. MASTER-CRAFTED 3D SHIP (REALISTIC CONTAINER VESSEL)
    // =========================================================================
    const shipGroup = new THREE.Group();
    scene.add(shipGroup);

    // --- Procedural Hull Geometries (Flared Bow, Sheer Line, Knife Stem) ---
    // Utility to sculpt authentic naval ship curves from a multi-segment box
    function createSculptedHullGeometry(length, height, width, isLower) {
      const geo = new THREE.BoxGeometry(length, height, width, 18, 2, 4);
      const pos = geo.attributes.position;
      const halfL = length / 2;

      for (let i = 0; i < pos.count; i++) {
        let x = pos.getX(i);
        let y = pos.getY(i);
        let z = pos.getZ(i);

        // 1. Tapering along the waterline
        if (x > 0) {
          const frac = x / halfL; // 0 to 1
          // Smooth cosine entrance tapering towards sharp vertical stem
          const taper = Math.cos(frac * Math.PI * 0.5);
          z = z * (0.05 + 0.95 * taper);
        } else {
          // Aft stern taper to clean flat transom
          const frac = -x / halfL;
          z = z * (1.0 - frac * 0.16);
        }

        // 2. Sheer Line (bow rises gracefully to slice through swells)
        if (x > 1.0 && !isLower) {
          const bowFrac = (x - 1.0) / (halfL - 1.0);
          y += Math.pow(bowFrac, 2) * 0.35;
        }

        // 3. Forefoot curve (underwater keel curves up to meet the stem)
        if (x > 2.0 && isLower) {
          const bowFrac = (x - 2.0) / (halfL - 2.0);
          y += Math.pow(bowFrac, 2) * 0.22;
        }

        // 4. Bow Flare (widens outward at top of gunwale to deflect spray)
        if (x > 2.5 && !isLower && y > 0) {
          const flare = Math.sin(((x - 2.5) / (halfL - 2.5)) * Math.PI * 0.5) * 0.14;
          z += (z > 0 ? 1 : -1) * flare;
        }

        pos.setXYZ(i, x, y, z);
      }
      geo.computeVertexNormals();
      return geo;
    }

    // --- Hull Materials ---
    const hullRedMat = new THREE.MeshStandardMaterial({ color: 0x861c16, roughness: 0.45, metalness: 0.12 });
    const hullNavyMat = new THREE.MeshStandardMaterial({ color: 0x121d28, roughness: 0.28, metalness: 0.25 });
    const stripeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf5f7fa, roughness: 0.35 });
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x273440, roughness: 0.65 });
    const superstructureMat = new THREE.MeshStandardMaterial({ color: 0xe6ebf0, roughness: 0.32, metalness: 0.10 });
    const windowGlassMat = new THREE.MeshPhysicalMaterial({ color: 0x050f18, roughness: 0.05, metalness: 0.92, clearcoat: 1.0 });

    // A. Lower Red Anti-Fouling Hull
    const lowerHullGeo = createSculptedHullGeometry(11.6, 0.9, 2.75, true);
    const lowerHull = new THREE.Mesh(lowerHullGeo, hullRedMat);
    lowerHull.position.y = 0.45;
    lowerHull.castShadow = true;
    lowerHull.receiveShadow = true;
    shipGroup.add(lowerHull);

    // Streamlined Bulbous Bow tucked underwater under the stem
    const bulbousGeo = new THREE.SphereGeometry(0.36, 16, 12);
    bulbousGeo.scale(1.2, 0.8, 0.7);
    const bulbousBow = new THREE.Mesh(bulbousGeo, hullRedMat);
    bulbousBow.position.set(5.1, 0.28, 0);
    bulbousBow.castShadow = true;
    shipGroup.add(bulbousBow);

    // B. Crisp Waterline Boot-topping Stripe
    const stripeGeo = createSculptedHullGeometry(11.62, 0.14, 2.78, false);
    const stripeMesh = new THREE.Mesh(stripeGeo, stripeWhiteMat);
    stripeMesh.position.y = 0.95;
    shipGroup.add(stripeMesh);

    // C. Upper Dark Navy Topsides Hull
    const upperHullGeo = createSculptedHullGeometry(11.6, 1.25, 2.76, false);
    const upperHull = new THREE.Mesh(upperHullGeo, hullNavyMat);
    upperHull.position.y = 1.62;
    upperHull.castShadow = true;
    upperHull.receiveShadow = true;
    shipGroup.add(upperHull);

    // D. Main Weather Deck
    const mainDeckGeo = createSculptedHullGeometry(11.4, 0.06, 2.68, false);
    const mainDeck = new THREE.Mesh(mainDeckGeo, deckMat);
    mainDeck.position.y = 2.26;
    mainDeck.receiveShadow = true;
    shipGroup.add(mainDeck);

    // Breakwater V-wedge on forecastle (deflects sea spray)
    const breakwaterGeo = new THREE.BoxGeometry(0.1, 0.32, 2.1);
    breakwaterGeo.rotateY(0.45);
    const breakwater = new THREE.Mesh(breakwaterGeo, new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5 }));
    breakwater.position.set(4.2, 2.45, 0);
    shipGroup.add(breakwater);

    // Jackstaff on the bow tip
    const jackstaffGeo = new THREE.CylinderGeometry(0.02, 0.03, 1.0, 6);
    const jackstaff = new THREE.Mesh(jackstaffGeo, new THREE.MeshStandardMaterial({ color: 0xffffff }));
    jackstaff.position.set(5.7, 2.9, 0);
    shipGroup.add(jackstaff);

    // E. Shipping Container Stacks with Hold Coamings
    const containerGroup = new THREE.Group();
    const cW = 1.62;
    const cH = 0.74;
    const cD = 1.02;

    const lineColors = [
      0x00a8e8, // AquaTrace Sky
      0x1b5e3c, // Evergreen Green
      0xd85a2a, // Hapag Orange
      0x0f2537, // Dark Navy
      0x4a90e2, // Maersk Blue
      0xf1f3f5  // White
    ];

    for (let bay = 0; bay < 4; bay++) {
      const posX = 2.6 - bay * 1.82;

      // Raised Cargo Hold Coaming
      const coamingGeo = new THREE.BoxGeometry(cW + 0.1, 0.18, cD * 2 + 0.3);
      const coaming = new THREE.Mesh(coamingGeo, new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 }));
      coaming.position.set(posX, 2.36, 0);
      coaming.castShadow = true;
      containerGroup.add(coaming);

      for (let row = 0; row < 2; row++) {
        const posZ = row === 0 ? -0.63 : 0.63;
        const tiers = (bay === 0 || bay === 3) ? 2 : 3;

        for (let tier = 0; tier < tiers; tier++) {
          const col = lineColors[(bay * 4 + row * 2 + tier) % lineColors.length];
          const cGeo = new THREE.BoxGeometry(cW, cH, cD);
          const cMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.42, metalness: 0.22 });
          const cBox = new THREE.Mesh(cGeo, cMat);
          cBox.position.set(posX, 2.42 + (cH / 2) + tier * (cH + 0.02), posZ);
          cBox.castShadow = true;
          cBox.receiveShadow = true;
          containerGroup.add(cBox);

          // Subtle container edge frame
          const cFrameGeo = new THREE.BoxGeometry(cW + 0.01, cH + 0.01, cD + 0.01);
          const cEdges = new THREE.EdgesGeometry(cFrameGeo);
          const cFrame = new THREE.LineSegments(cEdges, new THREE.LineBasicMaterial({ color: 0x000000, opacity: 0.25, transparent: true }));
          cFrame.position.copy(cBox.position);
          containerGroup.add(cFrame);
        }
      }
    }
    shipGroup.add(containerGroup);

    // F. Modern Accommodation Block & Bridge Tower (Aft)
    const bridgeGroup = new THREE.Group();
    bridgeGroup.position.set(-4.0, 2.28, 0);

    // 4-Story Tiered Deckhouse
    const deckhouse = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.95, 2.5), superstructureMat);
    deckhouse.position.y = 0.98;
    deckhouse.castShadow = true;
    bridgeGroup.add(deckhouse);

    // Bridge Navigation Deck with Extended Wings
    const wheelhouse = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.75, 3.35), superstructureMat);
    wheelhouse.position.y = 2.32;
    wheelhouse.castShadow = true;
    bridgeGroup.add(wheelhouse);

    // Panoramic Smoked Tinted Glass Windows
    const bridgeWindows = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.26, 3.37), windowGlassMat);
    bridgeWindows.position.y = 2.38;
    bridgeGroup.add(bridgeWindows);

    // White Sun-Visor Brow over Windows
    const browMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.76, 0.08, 3.42),
      superstructureMat
    );
    browMesh.position.y = 2.54;
    bridgeGroup.add(browMesh);

    // Lifeboats on Davits (Safety Orange)
    const lifeboatGeo = new THREE.CylinderGeometry(0.2, 0.2, 1.1, 8);
    lifeboatGeo.rotateZ(Math.PI / 2);
    const lifeboatMat = new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.3 });
    const starLifeboat = new THREE.Mesh(lifeboatGeo, lifeboatMat);
    starLifeboat.position.set(0, 1.3, 1.38);
    bridgeGroup.add(starLifeboat);

    const portLifeboat = new THREE.Mesh(lifeboatGeo, lifeboatMat);
    portLifeboat.position.set(0, 1.3, -1.38);
    bridgeGroup.add(portLifeboat);

    // Aerodynamic Smokestack Funnel
    const funnelGeo = new THREE.CylinderGeometry(0.30, 0.40, 1.55, 16);
    funnelGeo.scale(1.3, 1, 0.75);
    const funnel = new THREE.Mesh(funnelGeo, new THREE.MeshStandardMaterial({ color: 0x0f2537, roughness: 0.3 }));
    funnel.position.set(-0.62, 2.65, 0);
    funnel.rotation.z = -0.18;
    funnel.castShadow = true;
    bridgeGroup.add(funnel);

    // Funnel AquaTrace Sky-Blue Insignia Stripe
    const funnelBandGeo = new THREE.CylinderGeometry(0.31, 0.37, 0.35, 16);
    funnelBandGeo.scale(1.32, 1, 0.77);
    const funnelBand = new THREE.Mesh(funnelBandGeo, new THREE.MeshStandardMaterial({ color: 0x00a8e8, roughness: 0.2 }));
    funnelBand.position.set(-0.62, 2.65, 0);
    funnelBand.rotation.z = -0.18;
    bridgeGroup.add(funnelBand);

    // Communications Lattice Mast
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 2.0, 8), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 }));
    mast.position.set(0.25, 3.35, 0);
    bridgeGroup.add(mast);

    // Dual Commercial Marine Radar Scanners
    const sBandGeo = new THREE.BoxGeometry(0.08, 0.05, 0.95);
    const sBandScanner = new THREE.Mesh(sBandGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 }));
    sBandScanner.position.set(0.25, 4.30, 0);
    bridgeGroup.add(sBandScanner);

    const xBandGeo = new THREE.BoxGeometry(0.06, 0.04, 0.65);
    const xBandScanner = new THREE.Mesh(xBandGeo, new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3 }));
    xBandScanner.position.set(0.25, 3.85, 0);
    bridgeGroup.add(xBandScanner);

    // Satellite Comms Radome
    const radome = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.15 }));
    radome.position.set(-0.3, 3.05, 0.8);
    bridgeGroup.add(radome);

    // Navigation Sidelights (Port Red, Starboard Green)
    const starGreen = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshBasicMaterial({ color: 0x00ff66 }));
    starGreen.position.set(0.65, 2.32, 1.70);
    bridgeGroup.add(starGreen);

    const portRed = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    portRed.position.set(0.65, 2.32, -1.70);
    bridgeGroup.add(portRed);

    shipGroup.add(bridgeGroup);

    // =========================================================================
    // 4. HYDRODYNAMIC WAKE FOAM & PROPELLER WASH
    // =========================================================================
    const washGeo = new THREE.PlaneGeometry(16, 4.2, 18, 6);
    washGeo.rotateX(-Math.PI / 2);
    washGeo.translate(-13, 0.05, 0);
    const washMat = new THREE.MeshBasicMaterial({
      color: 0xd8effd,
      transparent: true,
      opacity: 0.40,
      side: THREE.DoubleSide
    });
    const washMesh = new THREE.Mesh(washGeo, washMat);
    scene.add(washMesh);

    // =========================================================================
    // 5. SENTINEL-1 SATELLITE & SAR VOLUMETRIC BEAM
    // =========================================================================
    const satelliteGroup = new THREE.Group();
    satelliteGroup.position.set(2, 23, -2);
    scene.add(satelliteGroup);

    // Satellite Main Bus
    const satBus = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 1.5, 0.9),
      new THREE.MeshStandardMaterial({ color: 0xd4a373, metalness: 0.85, roughness: 0.2 })
    );
    satelliteGroup.add(satBus);

    // Solar Wings
    const solarWings = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.9, 4.2),
      new THREE.MeshStandardMaterial({ color: 0x0055bb, metalness: 0.7, roughness: 0.2 })
    );
    satelliteGroup.add(solarWings);

    // C-Band SAR Antenna
    const satAnt = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.1, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.1 })
    );
    satAnt.position.y = -0.8;
    satelliteGroup.add(satAnt);

    // Glowing Volumetric Radar Beam
    const coneH = 23;
    const coneR = 8.5;
    const radarConeGeo = new THREE.ConeGeometry(coneR, coneH, 32, 1, true);
    radarConeGeo.translate(0, -coneH / 2, 0);
    const radarConeMat = new THREE.MeshBasicMaterial({
      color: 0x00a8e8,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const radarCone = new THREE.Mesh(radarConeGeo, radarConeMat);
    radarCone.position.set(2, 22.5, -2);
    scene.add(radarCone);

    // Concentric Sweep Pulse Ring
    const pulseGeo = new THREE.RingGeometry(0.2, 0.4, 64);
    pulseGeo.rotateX(-Math.PI / 2);
    const pulseMat = new THREE.MeshBasicMaterial({
      color: 0x00a8e8,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide
    });
    const pulseMesh = new THREE.Mesh(pulseGeo, pulseMat);
    pulseMesh.position.set(0, 0.12, 0);
    scene.add(pulseMesh);

    let pulseRadius = 0.5;

    // =========================================================================
    // 6. MINIMAL TACTICAL CORNER BRACKETS (NO CLUNKY BOX CAGE)
    // =========================================================================
    const reticleGroup = new THREE.Group();
    scene.add(reticleGroup);

    const bracketMat = new THREE.LineBasicMaterial({ color: 0x00a8e8, transparent: true, opacity: 0.70 });
    function makeCorner(x, y, z, dx, dy) {
      const g = new THREE.BufferGeometry();
      const v = new Float32Array([
        x, y, z,
        x + dx, y, z,
        x, y, z,
        x, y + dy, z
      ]);
      g.setAttribute('position', new THREE.BufferAttribute(v, 3));
      return new THREE.LineSegments(g, bracketMat);
    }
    reticleGroup.add(makeCorner(6.0, 0.9, 1.5, -1.2, 0.8));
    reticleGroup.add(makeCorner(6.0, 0.9, -1.5, -1.2, 0.8));
    reticleGroup.add(makeCorner(-5.6, 0.9, 1.5, 1.2, 0.8));
    reticleGroup.add(makeCorner(-5.6, 0.9, -1.5, 1.2, 0.8));

    // =========================================================================
    // 7. INTERACTIVE CONTROLS
    // =========================================================================
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let sphericalTheta = 0.82;
    let sphericalPhi = 1.15;
    let sphericalRadius = 24.5;
    let autoRotate = true;
    let idleTimer = null;

    function updateCameraFromSpherical() {
      if (currentPresetKey !== 'tactical') return;
      sphericalPhi = Math.max(0.18, Math.min(Math.PI / 2 - 0.04, sphericalPhi));
      targetCameraPos.x = sphericalRadius * Math.sin(sphericalPhi) * Math.sin(sphericalTheta);
      targetCameraPos.y = sphericalRadius * Math.cos(sphericalPhi);
      targetCameraPos.z = sphericalRadius * Math.sin(sphericalPhi) * Math.cos(sphericalTheta);
    }

    container.addEventListener('mousedown', (e) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
      autoRotate = false;
      if (idleTimer) clearTimeout(idleTimer);
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const deltaX = e.clientX - prevMouseX;
      const deltaY = e.clientY - prevMouseY;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;

      sphericalTheta -= deltaX * 0.007;
      sphericalPhi -= deltaY * 0.007;
      updateCameraFromSpherical();
    });

    window.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      idleTimer = setTimeout(() => { autoRotate = true; }, 5000);
    });

    // Touch Support
    container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        isDragging = true;
        prevMouseX = e.touches[0].clientX;
        prevMouseY = e.touches[0].clientY;
        autoRotate = false;
        if (idleTimer) clearTimeout(idleTimer);
      }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (!isDragging || e.touches.length !== 1) return;
      const deltaX = e.touches[0].clientX - prevMouseX;
      const deltaY = e.touches[0].clientY - prevMouseY;
      prevMouseX = e.touches[0].clientX;
      prevMouseY = e.touches[0].clientY;

      sphericalTheta -= deltaX * 0.007;
      sphericalPhi -= deltaY * 0.007;
      updateCameraFromSpherical();
    }, { passive: true });

    window.addEventListener('touchend', () => {
      isDragging = false;
      idleTimer = setTimeout(() => { autoRotate = true; }, 5000);
    });

    // View Switcher Button
    const btnCamMode = document.getElementById('toggle-3d-cam-mode');
    if (btnCamMode) {
      btnCamMode.addEventListener('click', () => {
        if (currentPresetKey === 'tactical') {
          currentPresetKey = 'bowChase';
          targetCameraPos.copy(cameraPresets.bowChase.pos);
          targetLookAt.copy(cameraPresets.bowChase.look);
          btnCamMode.innerHTML = '<i class="fa-solid fa-camera-rotate mr-1"></i> View: Bow Wave Chase';
        } else if (currentPresetKey === 'bowChase') {
          currentPresetKey = 'satellite';
          targetCameraPos.copy(cameraPresets.satellite.pos);
          targetLookAt.copy(cameraPresets.satellite.look);
          btnCamMode.innerHTML = '<i class="fa-solid fa-camera-rotate mr-1"></i> View: SAR Satellite Orbit';
        } else {
          currentPresetKey = 'tactical';
          updateCameraFromSpherical();
          targetLookAt.copy(cameraPresets.tactical.look);
          btnCamMode.innerHTML = '<i class="fa-solid fa-camera-rotate mr-1"></i> View: Tactical 3D';
        }
      });
    }

    // Pulse Radar Scan Button
    const btnPulseRadar = document.getElementById('toggle-3d-radar-scan');
    if (btnPulseRadar) {
      btnPulseRadar.addEventListener('click', () => {
        pulseRadius = 0.5;
        radarConeMat.opacity = 0.36;
        setTimeout(() => { radarConeMat.opacity = 0.14; }, 700);
      });
    }

    function onResize() {
      if (!container) return;
      width = container.clientWidth;
      height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    }
    window.addEventListener('resize', onResize);

    let isVisible = true;
    if ('IntersectionObserver' in window) {
      const obs = new IntersectionObserver((entries) => {
        isVisible = entries[0].isIntersecting;
      }, { threshold: 0.1 });
      obs.observe(container);
    }

    // =========================================================================
    // 8. SIMULATION LOOP (60 FPS PBR)
    // =========================================================================
    const clock = new THREE.Clock();

    let curPitch = 0;
    let curRoll = 0;
    let curHeave = 0;

    function animate() {
      requestAnimationFrame(animate);
      if (!isVisible) return;

      const delta = clock.getDelta();
      const time = clock.getElapsedTime();

      // Animate water normal map ripple offset
      if (waterNormalMap) {
        waterNormalMap.offset.x = time * 0.035;
        waterNormalMap.offset.y = time * 0.025;
      }

      // Update Gerstner Waves & Dynamic Crest Foam
      const pos = oceanGeo.attributes.position;
      const cols = oceanGeo.attributes.color;

      for (let i = 0; i < pos.count; i++) {
        const ox = origPositions[i * 3];
        const oz = origPositions[i * 3 + 2];
        const wRes = evaluateWave(ox, oz, time);

        pos.setX(i, ox + wRes.dx);
        pos.setY(i, wRes.y);
        pos.setZ(i, oz + wRes.dz);

        // Dynamic foam on wave peaks
        const crestRatio = Math.max(0, Math.min(1, (wRes.y - 0.18) / 0.28));
        cols.setXYZ(
          i,
          0.04 + crestRatio * 0.80,
          0.18 + crestRatio * 0.76,
          0.28 + crestRatio * 0.72
        );
      }
      pos.needsUpdate = true;
      cols.needsUpdate = true;
      oceanGeo.computeVertexNormals();

      // Hydrodynamic Buoyancy Kinematics for Ship
      const bowH = evaluateWave(5.2, 0, time).y;
      const sternH = evaluateWave(-4.8, 0, time).y;
      const midH = evaluateWave(0, 0, time).y;
      const portH = evaluateWave(0, -1.35, time).y;
      const starH = evaluateWave(0, 1.35, time).y;

      const targetPitch = Math.atan2(bowH - sternH, 10.0) * 0.80;
      const targetRoll = Math.atan2(starH - portH, 2.7) * 0.60;
      const targetHeave = midH + 0.14;

      // Realistic inertial momentum damping
      curPitch += (targetPitch - curPitch) * 0.08;
      curRoll += (targetRoll - curRoll) * 0.08;
      curHeave += (targetHeave - curHeave) * 0.10;

      shipGroup.position.y = curHeave;
      shipGroup.rotation.z = curPitch;
      shipGroup.rotation.x = curRoll;

      reticleGroup.position.y = shipGroup.position.y;
      reticleGroup.rotation.z = shipGroup.rotation.z;
      reticleGroup.rotation.x = shipGroup.rotation.x;

      // Update wash and oil slick to ocean surface
      washMesh.position.y = evaluateWave(-13, 0, time).y + 0.06;
      washMat.opacity = 0.32 + Math.sin(time * 3.0) * 0.06;

      slickMesh.position.y = evaluateWave(-9.0, 0, time).y + 0.05;

      // Rotate Dual Marine Radar Antennas
      if (sBandScanner) sBandScanner.rotation.y += 0.045; // 24 RPM
      if (xBandScanner) xBandScanner.rotation.y += 0.090; // 48 RPM

      // Camera Smooth Orbit
      if (autoRotate && currentPresetKey === 'tactical') {
        sphericalTheta += 0.0022;
        updateCameraFromSpherical();
      }
      camera.position.lerp(targetCameraPos, 0.055);
      currentLookAt.lerp(targetLookAt, 0.055);
      camera.lookAt(currentLookAt);

      // Pulse Radar Ping
      pulseRadius += delta * 14.0;
      if (pulseRadius > 26) pulseRadius = 0.5;
      pulseMesh.scale.set(pulseRadius, pulseRadius, 1);
      pulseMat.opacity = Math.max(0, 0.75 - (pulseRadius / 26));

      // Satellite Orbital Track
      satelliteGroup.position.x = 2 + Math.sin(time * 0.4) * 1.8;
      satelliteGroup.position.z = -2 + Math.cos(time * 0.4) * 1.8;
      radarCone.position.x = satelliteGroup.position.x;
      radarCone.position.z = satelliteGroup.position.z;

      renderer.render(scene, camera);
    }

    animate();
    console.log('[AquaTrace 3D] Ultra-realistic maritime simulation running.');
  }

})();
