import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

type UnitSystem = 'metric' | 'imperial';

interface SpeedometerAnimationProps extends ViewProps {
  speed: number;
  size?: number;
  unitSystem?: UnitSystem;
  speedLimit?: number | null;
  maxSpeed?: number;
  showDigitalReadout?: boolean;
  onReady?: () => void;
}

const clampNumber = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
};

const buildSpeedometerHtml = ({
  maxSpeed,
  initialSpeed,
  initialLimit,
  unitLabel,
  showDigitalReadout,
}: {
  maxSpeed: number;
  initialSpeed: number;
  initialLimit: number | null;
  unitLabel: string;
  showDigitalReadout: boolean;
}) => `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=0" />
  <style>
    * { box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: #020617;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    #stage {
      position: fixed;
      inset: 0;
      overflow: hidden;
      background:
        radial-gradient(circle at 50% 64%, rgba(34,211,238,.34), transparent 30%),
        radial-gradient(circle at 75% 18%, rgba(255,45,123,.20), transparent 30%),
        radial-gradient(circle at 22% 26%, rgba(139,92,246,.15), transparent 32%),
        linear-gradient(180deg, #030712 0%, #050a1d 48%, #08051d 100%);
    }
    #fallback {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      color: rgba(226,232,240,.7);
      font-size: 11px;
      letter-spacing: 2px;
    }
    canvas {
      display: block;
      width: 100vw;
      height: 100vh;
    }
    #speed-display {
      position: fixed;
      left: 50%;
      bottom: 9%;
      z-index: 8;
      transform: translateX(-50%);
      text-align: center;
      pointer-events: none;
      display: ${showDigitalReadout ? 'block' : 'none'};
    }
    #speed-value {
      color: #22d3ee;
      font-family: "Courier New", monospace;
      font-size: clamp(34px, 16vw, 54px);
      font-weight: 900;
      line-height: .9;
      letter-spacing: 3px;
      text-shadow: 0 0 18px rgba(34,211,238,.68), 0 0 42px rgba(34,211,238,.30);
    }
    #speed-unit {
      margin-top: 6px;
      color: rgba(103,232,249,.74);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 5px;
      text-transform: uppercase;
    }
    #limit-pill {
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 9;
      min-width: 78px;
      border-radius: 999px;
      border: 1px solid rgba(148,163,184,.24);
      padding: 6px 10px;
      background: rgba(3,7,18,.72);
      color: #e2e8f0;
      font-size: 10px;
      font-weight: 900;
      letter-spacing: 1px;
      text-align: center;
      text-transform: uppercase;
      box-shadow: 0 0 20px rgba(34,211,238,.12);
    }
    .hud-corner {
      position: fixed;
      z-index: 7;
      width: 24px;
      height: 24px;
      pointer-events: none;
      border-color: rgba(34,211,238,.24);
      border-style: solid;
      border-width: 0;
    }
    .hud-corner.tl { top: 8px; left: 8px; border-top-width: 1px; border-left-width: 1px; }
    .hud-corner.tr { top: 8px; right: 8px; border-top-width: 1px; border-right-width: 1px; }
    .hud-corner.bl { bottom: 8px; left: 8px; border-bottom-width: 1px; border-left-width: 1px; }
    .hud-corner.br { bottom: 8px; right: 8px; border-bottom-width: 1px; border-right-width: 1px; }
    #scanlines {
      position: fixed;
      inset: 0;
      z-index: 6;
      pointer-events: none;
      opacity: .2;
      background: repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,.14) 4px);
      mix-blend-mode: multiply;
    }
  </style>
</head>
<body>
  <div id="stage"></div>
  <div id="fallback">SPEED</div>
  <div class="hud-corner tl"></div>
  <div class="hud-corner tr"></div>
  <div class="hud-corner bl"></div>
  <div class="hud-corner br"></div>
  <div id="limit-pill"></div>
  <div id="speed-display">
    <div id="speed-value">0</div>
    <div id="speed-unit"></div>
  </div>
  <div id="scanlines"></div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
  <script>
    (function () {
      function postStatus(status) {
        try {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(status);
          }
        } catch (error) {}
      }

      if (!window.THREE) {
        postStatus('missing-three');
        return;
      }

      postStatus('ready');

      var maxSpeed = ${maxSpeed};
      var currentSpeed = ${initialSpeed};
      var targetSpeed = ${initialSpeed};
      var speedLimit = ${initialLimit === null ? 'null' : initialLimit};
      var unitLabel = ${JSON.stringify(unitLabel)};
      var gaugeArc = Math.PI * 1.5;
      var gaugeStart = Math.PI * 0.75;
      var stage = document.getElementById('stage');
      var fallback = document.getElementById('fallback');
      var speedValueEl = document.getElementById('speed-value');
      var speedUnitEl = document.getElementById('speed-unit');
      var limitPillEl = document.getElementById('limit-pill');
      if (fallback) fallback.style.display = 'none';
      speedUnitEl.textContent = unitLabel;

      var scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x020617, 0.036);

      var camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 500);
      camera.position.set(0, 6.25, 8.65);
      camera.lookAt(0, 0.02, 0);

      var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.18;
      stage.appendChild(renderer.domElement);

      var COLORS = {
        teal: 0x22d3ee,
        mint: 0x4ecdc4,
        amber: 0xfacc15,
        orange: 0xf59e0b,
        red: 0xff4d5f,
        pink: 0xff2d7b,
        purple: 0x8b5cf6,
        white: 0xe2e8f0
      };

      function colorHexForSpeed(value) {
        if (speedLimit && speedLimit > 0) {
          var ratio = value / speedLimit;
          if (ratio <= 1) return COLORS.mint;
          if (ratio <= 1.2) return COLORS.amber;
          return COLORS.red;
        }
        if (value >= maxSpeed * 0.84) return COLORS.pink;
        if (value >= maxSpeed * 0.67) return COLORS.orange;
        return COLORS.teal;
      }

      function cssColorForSpeed(value) {
        var color = colorHexForSpeed(value);
        if (color === COLORS.red || color === COLORS.pink) return '#ff4d5f';
        if (color === COLORS.amber || color === COLORS.orange) return '#facc15';
        if (color === COLORS.mint) return '#4ecdc4';
        return '#22d3ee';
      }

      function updateLimitPill() {
        if (!speedLimit || speedLimit <= 0) {
          limitPillEl.style.display = 'none';
          return;
        }
        limitPillEl.style.display = 'block';
        limitPillEl.textContent = 'LIMIT ' + Math.round(speedLimit) + ' ' + unitLabel;
        limitPillEl.style.borderColor = 'rgba(78,205,196,.28)';
      }

      scene.add(new THREE.AmbientLight(0x1e3a8a, 0.68));
      var coreGlow = new THREE.PointLight(COLORS.teal, 2.8, 13);
      coreGlow.position.set(0, 0.1, 0.5);
      scene.add(coreGlow);
      var dangerLight = new THREE.PointLight(COLORS.red, 0, 8);
      dangerLight.position.set(0, 0.1, 0.5);
      scene.add(dangerLight);
      var rimLight = new THREE.PointLight(COLORS.purple, 1.45, 15);
      rimLight.position.set(0, 3, -4);
      scene.add(rimLight);

      var gaugeGroup = new THREE.Group();
      gaugeGroup.rotation.x = -Math.PI * 0.34;
      gaugeGroup.position.y = -0.32;
      gaugeGroup.scale.set(0.92, 0.92, 0.92);
      scene.add(gaugeGroup);

      var disc = new THREE.Mesh(
        new THREE.CylinderGeometry(4.15, 4.15, 0.13, 72),
        new THREE.MeshPhysicalMaterial({
          color: 0x060817,
          emissive: 0x030712,
          emissiveIntensity: 0.2,
          roughness: 0.54,
          metalness: 0.82,
          transparent: true,
          opacity: 0.94
        })
      );
      disc.rotation.x = Math.PI / 2;
      gaugeGroup.add(disc);

      var bezelMat = new THREE.MeshPhysicalMaterial({
        color: 0x111833,
        emissive: 0x0a0f28,
        emissiveIntensity: 0.34,
        roughness: 0.18,
        metalness: 1,
        clearcoat: 1
      });
      gaugeGroup.add(new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.105, 16, 144), bezelMat));

      var innerRing = new THREE.Mesh(
        new THREE.TorusGeometry(3.58, 0.025, 8, 144),
        new THREE.MeshBasicMaterial({ color: COLORS.teal, transparent: true, opacity: 0.34 })
      );
      gaugeGroup.add(innerRing);

      function makeTextSprite(text, color) {
        var canvas = document.createElement('canvas');
        canvas.width = 96;
        canvas.height = 44;
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = color;
        ctx.font = '900 24px Courier New';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.fillText(String(text), 48, 22);
        var texture = new THREE.CanvasTexture(canvas);
        var mat = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.88 });
        var sprite = new THREE.Sprite(mat);
        sprite.scale.set(0.76, 0.35, 1);
        return sprite;
      }

      var tickGroup = new THREE.Group();
      for (var mark = 0; mark <= maxSpeed; mark += 10) {
        var fraction = mark / maxSpeed;
        var angle = gaugeStart - fraction * gaugeArc;
        var isMajor = mark % 20 === 0;
        var color = cssColorForSpeed(mark);
        var tickLength = isMajor ? 0.42 : 0.19;
        var innerR = 3.36;
        var outerR = innerR + tickLength;
        var points = [
          new THREE.Vector3(Math.cos(angle) * innerR, Math.sin(angle) * innerR, 0.11),
          new THREE.Vector3(Math.cos(angle) * outerR, Math.sin(angle) * outerR, 0.11)
        ];
        tickGroup.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: isMajor ? 0.96 : 0.46 })
        ));
        if (isMajor) {
          var labelR = innerR - 0.36;
          var sprite = makeTextSprite(mark, color);
          sprite.position.set(Math.cos(angle) * labelR, Math.sin(angle) * labelR, 0.15);
          tickGroup.add(sprite);
        }
      }
      gaugeGroup.add(tickGroup);

      var arcSegments = [];
      var glowArcSegments = [];
      var arcGroup = new THREE.Group();
      var glowArcGroup = new THREE.Group();
      var arcSegmentCount = 120;
      for (var i = 0; i < arcSegmentCount; i += 1) {
        var startFraction = i / arcSegmentCount;
        var endFraction = (i + 1) / arcSegmentCount;
        var angle1 = gaugeStart - startFraction * gaugeArc;
        var angle2 = gaugeStart - endFraction * gaugeArc;
        var arcR = 3.77;
        var speedAtSegment = startFraction * maxSpeed;
        var segmentPoints = [
          new THREE.Vector3(Math.cos(angle1) * arcR, Math.sin(angle1) * arcR, 0.09),
          new THREE.Vector3(Math.cos(angle2) * arcR, Math.sin(angle2) * arcR, 0.09)
        ];
        var segmentColor = colorHexForSpeed(speedAtSegment);
        var segment = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(segmentPoints),
          new THREE.LineBasicMaterial({ color: segmentColor, transparent: true, opacity: 0.16 })
        );
        segment.userData = { index: i, speedAtSegment: speedAtSegment };
        arcSegments.push(segment);
        arcGroup.add(segment);

        var glowSegment = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(segmentPoints),
          new THREE.LineBasicMaterial({ color: segmentColor, transparent: true, opacity: 0 })
        );
        glowSegment.userData = { index: i, speedAtSegment: speedAtSegment };
        glowArcSegments.push(glowSegment);
        glowArcGroup.add(glowSegment);
      }
      gaugeGroup.add(arcGroup);
      gaugeGroup.add(glowArcGroup);

      function refreshArcColors() {
        arcSegments.forEach(function (segment) {
          segment.material.color.setHex(colorHexForSpeed(segment.userData.speedAtSegment));
        });
        glowArcSegments.forEach(function (segment) {
          segment.material.color.setHex(colorHexForSpeed(segment.userData.speedAtSegment));
        });
      }

      var limitMarkerGroup = new THREE.Group();
      gaugeGroup.add(limitMarkerGroup);
      function rebuildLimitMarker() {
        while (limitMarkerGroup.children.length) {
          var child = limitMarkerGroup.children.pop();
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        }
        if (!speedLimit || speedLimit <= 0) return;
        var clampedLimit = Math.max(0, Math.min(maxSpeed, speedLimit));
        var angle = gaugeStart - (clampedLimit / maxSpeed) * gaugeArc;
        var points = [
          new THREE.Vector3(Math.cos(angle) * 2.72, Math.sin(angle) * 2.72, 0.18),
          new THREE.Vector3(Math.cos(angle) * 4.12, Math.sin(angle) * 4.12, 0.18)
        ];
        limitMarkerGroup.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({ color: COLORS.white, transparent: true, opacity: 0.55 })
        ));
      }

      var needleGroup = new THREE.Group();
      var needleMat = new THREE.MeshPhysicalMaterial({
        color: COLORS.teal,
        emissive: COLORS.teal,
        emissiveIntensity: 0.56,
        roughness: 0.1,
        metalness: 0.9
      });
      var needle = new THREE.Mesh(new THREE.ConeGeometry(0.075, 3.2, 4), needleMat);
      needle.rotation.z = Math.PI;
      needle.position.y = 1.6;
      needleGroup.add(needle);
      var trailMat = new THREE.MeshBasicMaterial({ color: COLORS.teal, transparent: true, opacity: 0.12 });
      var trail = new THREE.Mesh(new THREE.ConeGeometry(0.15, 2.9, 4), trailMat);
      trail.rotation.z = Math.PI;
      trail.position.y = 1.45;
      needleGroup.add(trail);
      var capMat = new THREE.MeshPhysicalMaterial({
        color: 0x11243a,
        emissive: COLORS.teal,
        emissiveIntensity: 0.54,
        roughness: 0,
        metalness: 1,
        clearcoat: 1
      });
      needleGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.25, 18, 18), capMat));
      var capGlowMat = new THREE.MeshBasicMaterial({ color: COLORS.teal, transparent: true, opacity: 0.5 });
      needleGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), capGlowMat));
      needleGroup.position.z = 0.2;
      gaugeGroup.add(needleGroup);

      var orbitParticles = [];
      var orbitGroup = new THREE.Group();
      for (var p = 0; p < 42; p += 1) {
        var particleColor = [COLORS.teal, COLORS.purple, COLORS.pink, COLORS.amber][Math.floor(Math.random() * 4)];
        var particle = new THREE.Mesh(
          new THREE.SphereGeometry(0.018 + Math.random() * 0.035, 6, 6),
          new THREE.MeshBasicMaterial({ color: particleColor, transparent: true, opacity: 0.55 + Math.random() * 0.32 })
        );
        var radius = 4.5 + Math.random() * 1.35;
        var particleAngle = Math.random() * Math.PI * 2;
        particle.position.set(Math.cos(particleAngle) * radius, (Math.random() - 0.5) * 1.35, Math.sin(particleAngle) * radius);
        particle.userData = {
          speed: 0.004 + Math.random() * 0.011,
          angle: particleAngle,
          radius: radius,
          baseY: particle.position.y
        };
        orbitParticles.push(particle);
        orbitGroup.add(particle);
      }
      gaugeGroup.add(orbitGroup);

      var starsGroup = new THREE.Group();
      for (var starIndex = 0; starIndex < 150; starIndex += 1) {
        var star = new THREE.Mesh(
          new THREE.SphereGeometry(0.008 + Math.random() * 0.02, 4, 4),
          new THREE.MeshBasicMaterial({ color: Math.random() > 0.84 ? COLORS.teal : 0xffffff, transparent: true, opacity: 0.18 + Math.random() * 0.45 })
        );
        var theta = Math.random() * Math.PI * 2;
        var phi = Math.acos(2 * Math.random() - 1);
        var distance = 22 + Math.random() * 36;
        star.position.set(
          distance * Math.sin(phi) * Math.cos(theta),
          distance * Math.sin(phi) * Math.sin(theta),
          distance * Math.cos(phi)
        );
        starsGroup.add(star);
      }
      scene.add(starsGroup);

      var warningMat = new THREE.MeshBasicMaterial({ color: COLORS.red, transparent: true, opacity: 0, side: THREE.DoubleSide });
      var warningOverlay = new THREE.Mesh(new THREE.RingGeometry(3.0, 4.15, 72, 1, 0, gaugeArc), warningMat);
      warningOverlay.rotation.z = -(gaugeStart - gaugeArc) + Math.PI;
      warningOverlay.position.z = 0.05;
      gaugeGroup.add(warningOverlay);

      var sweepMat = new THREE.MeshBasicMaterial({
        color: COLORS.teal,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });
      var sweepOverlay = new THREE.Mesh(new THREE.RingGeometry(2.45, 4.05, 96, 1, 0, Math.PI * 0.16), sweepMat);
      sweepOverlay.position.z = 0.17;
      gaugeGroup.add(sweepOverlay);

      updateLimitPill();
      rebuildLimitMarker();

      window.setSpeedometerState = function (nextState) {
        if (!nextState) return;
        if (typeof nextState.speed === 'number' && isFinite(nextState.speed)) {
          targetSpeed = Math.max(0, Math.min(maxSpeed, nextState.speed));
        }
        if (typeof nextState.unitLabel === 'string' && nextState.unitLabel.length) {
          unitLabel = nextState.unitLabel;
          speedUnitEl.textContent = unitLabel;
        }
        if (typeof nextState.speedLimit === 'number' && isFinite(nextState.speedLimit) && nextState.speedLimit > 0) {
          speedLimit = nextState.speedLimit;
        } else {
          speedLimit = null;
        }
        updateLimitPill();
        rebuildLimitMarker();
        refreshArcColors();
      };

      var clock = new THREE.Clock();
      function animate() {
        requestAnimationFrame(animate);
        var now = Date.now();
        var elapsed = clock.getElapsedTime();
        var speedDiff = targetSpeed - currentSpeed;
        currentSpeed += speedDiff * 0.055;
        currentSpeed = Math.max(0, Math.min(maxSpeed, currentSpeed));

        var speedFraction = Math.max(0, Math.min(1, currentSpeed / maxSpeed));
        var needleAngle = gaugeStart - speedFraction * gaugeArc;
        var activeColor = colorHexForSpeed(currentSpeed);
        var activeCssColor = cssColorForSpeed(currentSpeed);
        var isRed = activeColor === COLORS.red || activeColor === COLORS.pink;
        var isAmber = activeColor === COLORS.amber || activeColor === COLORS.orange;

        needleGroup.rotation.z = needleAngle - Math.PI / 2;
        needleMat.color.setHex(activeColor);
        needleMat.emissive.setHex(activeColor);
        needleMat.emissiveIntensity = isRed ? 0.9 + Math.sin(now * 0.01) * 0.25 : isAmber ? 0.72 : 0.52;
        trailMat.color.setHex(activeColor);
        trailMat.opacity = isRed ? 0.32 : isAmber ? 0.22 : 0.13;
        capMat.emissive.setHex(activeColor);
        capGlowMat.color.setHex(activeColor);

        if (isRed) {
          var shakeAmount = 0.018;
          needleGroup.position.x = (Math.random() - 0.5) * shakeAmount;
          needleGroup.position.y = (Math.random() - 0.5) * shakeAmount;
        } else {
          needleGroup.position.x = 0;
          needleGroup.position.y = 0;
        }

        arcSegments.forEach(function (segment) {
          var segmentFraction = segment.userData.index / arcSegmentCount;
          if (segmentFraction <= speedFraction) {
            var proximity = 1 - Math.abs(segmentFraction - speedFraction) * 5;
            segment.material.opacity = 0.64 + Math.max(0, proximity) * 0.28;
          } else {
            segment.material.opacity = 0.08;
          }
        });

        glowArcSegments.forEach(function (segment) {
          var segmentFraction = segment.userData.index / arcSegmentCount;
          var dist = Math.abs(segmentFraction - speedFraction);
          if (dist < 0.09 && segmentFraction <= speedFraction) {
            segment.material.opacity = (1 - dist / 0.09) * 0.48;
          } else {
            segment.material.opacity = 0;
          }
        });

        coreGlow.color.setHex(activeColor);
        coreGlow.intensity = 2.0 + speedFraction * 3.1;
        dangerLight.color.setHex(activeColor);
        dangerLight.intensity = isRed ? 2.1 : isAmber ? 0.9 : 0;
        warningMat.color.setHex(activeColor);
        warningMat.opacity = isRed ? 0.05 + Math.sin(now * 0.008) * 0.035 : isAmber ? 0.02 : 0;
        sweepMat.color.setHex(activeColor);
        sweepMat.opacity = 0.14 + speedFraction * 0.12 + (Math.sin(now * 0.004) + 1) * 0.035;
        sweepOverlay.rotation.z -= 0.012 + speedFraction * 0.01;
        bezelMat.emissive.setHex(isRed || isAmber ? activeColor : 0x0a0f28);
        bezelMat.emissiveIntensity = isRed ? 0.52 + Math.sin(now * 0.008) * 0.18 : isAmber ? 0.42 : 0.32;

        var particleSpeed = 1 + speedFraction * 2.8;
        orbitParticles.forEach(function (particle) {
          var data = particle.userData;
          data.angle += data.speed * particleSpeed;
          particle.position.x = Math.cos(data.angle) * data.radius;
          particle.position.z = Math.sin(data.angle) * data.radius;
          particle.position.y = data.baseY + Math.sin(now * 0.002 + data.angle) * 0.26;
          particle.material.opacity = (0.28 + speedFraction * 0.62) * (0.55 + Math.sin(now * 0.005 + data.angle * 3) * 0.45);
        });

        gaugeGroup.rotation.y = Math.sin(elapsed * 0.32) * 0.045;
        innerRing.rotation.z += 0.002 + speedFraction * 0.004;
        starsGroup.rotation.y += 0.0001;
        camera.position.y = 6.25 + Math.sin(elapsed * 0.4) * 0.12;
        camera.lookAt(0, 0.02, 0);

        speedValueEl.textContent = String(Math.round(currentSpeed));
        speedValueEl.style.color = activeCssColor;
        speedValueEl.style.textShadow = '0 0 18px ' + activeCssColor + ', 0 0 42px rgba(34,211,238,.22)';

        renderer.render(scene, camera);
      }

      animate();

      window.addEventListener('resize', function () {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      });
    })();
  </script>
</body>
</html>
`;

export function SpeedometerAnimation({
  speed,
  size = 300,
  unitSystem = 'metric',
  speedLimit = null,
  maxSpeed,
  showDigitalReadout = true,
  onReady,
  style,
  ...viewProps
}: SpeedometerAnimationProps) {
  const webViewRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const [useFallback, setUseFallback] = useState(false);
  const unitLabel = unitSystem === 'imperial' ? 'MPH' : 'KM/H';
  const resolvedMaxSpeed = maxSpeed ?? (unitSystem === 'imperial' ? 160 : 240);
  const displaySpeed = clampNumber(Math.round(speed), 0, resolvedMaxSpeed);
  const displayLimit =
    typeof speedLimit === 'number' && speedLimit > 0
      ? clampNumber(Math.round(speedLimit), 1, resolvedMaxSpeed)
      : null;
  const bootStateRef = useRef({
    maxSpeed: resolvedMaxSpeed,
    speed: displaySpeed,
    speedLimit: displayLimit,
    unitLabel,
    showDigitalReadout,
  });

  if (
    bootStateRef.current.maxSpeed !== resolvedMaxSpeed ||
    bootStateRef.current.unitLabel !== unitLabel ||
    bootStateRef.current.showDigitalReadout !== showDigitalReadout
  ) {
    bootStateRef.current = {
      maxSpeed: resolvedMaxSpeed,
      speed: displaySpeed,
      speedLimit: displayLimit,
      unitLabel,
      showDigitalReadout,
    };
  }

  const html = useMemo(
    () => {
      const bootState = bootStateRef.current;
      return buildSpeedometerHtml({
        maxSpeed: bootState.maxSpeed,
        initialSpeed: bootState.speed,
        initialLimit: bootState.speedLimit,
        unitLabel: bootState.unitLabel,
        showDigitalReadout: bootState.showDigitalReadout,
      });
    },
    [resolvedMaxSpeed, showDigitalReadout, unitLabel],
  );

  const injectState = useCallback(() => {
    if (!readyRef.current || useFallback) return;
    const payload = JSON.stringify({
      speed: displaySpeed,
      speedLimit: displayLimit,
      unitLabel,
    });
    webViewRef.current?.injectJavaScript(`window.setSpeedometerState && window.setSpeedometerState(${payload}); true;`);
  }, [displayLimit, displaySpeed, unitLabel, useFallback]);

  useEffect(() => {
    injectState();
  }, [injectState]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const status = event.nativeEvent.data;
      if (status === 'ready') {
        readyRef.current = true;
        onReady?.();
        injectState();
        return;
      }
      if (status === 'missing-three') {
        setUseFallback(true);
      }
    },
    [injectState, onReady],
  );

  const fallbackTone =
    displayLimit && displaySpeed > displayLimit * 1.2
      ? '#FF4D5F'
      : displayLimit && displaySpeed > displayLimit
        ? '#FACC15'
        : '#4ECDC4';
  const fallbackProgress = Math.max(0.04, Math.min(1, displaySpeed / resolvedMaxSpeed));
  const fallbackRotation = 135 + fallbackProgress * 270;

  return (
    <View
      {...viewProps}
      pointerEvents="none"
      style={[styles.container, { width: size, height: size }, style]}
    >
      {useFallback ? (
        <LinearGradient
          colors={['rgba(2,6,23,0.98)', 'rgba(8,13,31,0.96)']}
          style={styles.fallbackCard}
        >
          <View style={[styles.fallbackDial, { borderColor: `${fallbackTone}88` }]}>
            <View
              style={[
                styles.fallbackNeedle,
                {
                  backgroundColor: fallbackTone,
                  transform: [{ rotate: `${fallbackRotation}deg` }],
                },
              ]}
            />
            <View style={styles.fallbackCenter}>
              <Text style={[styles.fallbackSpeed, { color: fallbackTone }]}>{displaySpeed}</Text>
              <Text style={styles.fallbackUnit}>{unitLabel}</Text>
              {displayLimit ? (
                <Text style={styles.fallbackLimit}>LIMIT {displayLimit}</Text>
              ) : null}
            </View>
          </View>
        </LinearGradient>
      ) : (
        <WebView
          ref={webViewRef}
          source={{ html }}
          originWhitelist={['*']}
          javaScriptEnabled
          scrollEnabled={false}
          bounces={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          setSupportMultipleWindows={false}
          onLoadStart={() => {
            readyRef.current = false;
          }}
          onMessage={handleMessage}
          onError={() => setUseFallback(true)}
          style={styles.webView}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: 22,
    backgroundColor: '#020617',
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  fallbackCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackDial: {
    width: '78%',
    aspectRatio: 1,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,12,26,0.86)',
  },
  fallbackNeedle: {
    position: 'absolute',
    width: '38%',
    height: 4,
    borderRadius: 3,
    left: '50%',
    top: '50%',
  },
  fallbackCenter: {
    width: '60%',
    aspectRatio: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2,6,23,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
  },
  fallbackSpeed: {
    fontSize: 46,
    lineHeight: 50,
    fontWeight: '900',
  },
  fallbackUnit: {
    color: '#94A3B8',
    marginTop: 2,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  fallbackLimit: {
    color: '#CBD5E1',
    marginTop: 8,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
