import React, { useMemo, useState } from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { WebView } from 'react-native-webview';
import { RadarAnimation } from './RadarAnimation';

interface NebulaCore3DViewProps extends ViewProps {
  signalLevel?: number;
  dangerLevel?: number;
  paused?: boolean;
}

const buildNebulaHtml = (signalLevel: number, dangerLevel: number, paused: boolean) => `
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
        radial-gradient(circle at 48% 45%, rgba(34,211,238,.18), transparent 26%),
        radial-gradient(circle at 70% 64%, rgba(255,45,123,.18), transparent 32%),
        linear-gradient(180deg, #020617 0%, #050816 64%, #14062a 100%);
    }
    #scanlines {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 4;
      opacity: .38;
      background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,.16) 3px);
      mix-blend-mode: multiply;
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
  </style>
</head>
<body>
  <div id="stage"></div>
  <div id="fallback"></div>
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

      var signalLevel = ${signalLevel.toFixed(3)};
      var dangerLevel = ${dangerLevel.toFixed(3)};
      var paused = ${paused ? 'true' : 'false'};
      var stage = document.getElementById('stage');
      var fallback = document.getElementById('fallback');
      if (fallback) fallback.style.display = 'none';

      var scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x020617, 0.05);

      var camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.set(0, 1.55, 6.6);
      camera.lookAt(0, 0, 0);

      var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.65));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      stage.appendChild(renderer.domElement);

      var COLORS = {
        purple: 0x7c3aed,
        blue: 0x22d3ee,
        pink: 0xff2d7b,
        gold: 0xfacc15,
        teal: 0x4ecdc4
      };

      scene.add(new THREE.AmbientLight(0x172554, 0.74));
      var coreLight = new THREE.PointLight(COLORS.blue, 2.6 + signalLevel * 1.9, 14);
      scene.add(coreLight);
      var alertLight = new THREE.PointLight(dangerLevel > 0.42 ? COLORS.pink : COLORS.gold, 1.1 + dangerLevel * 2.1, 13);
      scene.add(alertLight);

      var coreGeo = new THREE.IcosahedronGeometry(0.86, 1);
      var coreMat = new THREE.MeshPhysicalMaterial({
        color: COLORS.purple,
        emissive: COLORS.blue,
        emissiveIntensity: 0.48 + signalLevel * 0.85,
        transparent: true,
        opacity: 0.82,
        roughness: 0.12,
        metalness: 0.82,
        clearcoat: 1
      });
      var core = new THREE.Mesh(coreGeo, coreMat);
      core.position.y = -0.08;
      scene.add(core);

      var wire = new THREE.LineSegments(
        new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(0.9, 1)),
        new THREE.LineBasicMaterial({ color: COLORS.blue, transparent: true, opacity: 0.62 })
      );
      core.add(wire);

      var glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 16, 16),
        new THREE.MeshBasicMaterial({ color: COLORS.blue, transparent: true, opacity: 0.28 + signalLevel * 0.22 })
      );
      core.add(glow);

      var ringGroup = new THREE.Group();
      function createRing(radius, tube, color, opacity) {
        return new THREE.Mesh(
          new THREE.TorusGeometry(radius, tube, 16, 120),
          new THREE.MeshPhysicalMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.58,
            transparent: true,
            opacity: opacity,
            roughness: 0.2,
            metalness: 0.72,
            side: THREE.DoubleSide
          })
        );
      }
      var ring1 = createRing(1.68, 0.025, COLORS.blue, 0.68);
      ring1.rotation.x = Math.PI * 0.5;
      var ring2 = createRing(2.12, 0.021, dangerLevel > 0.45 ? COLORS.pink : COLORS.teal, 0.62);
      ring2.rotation.x = Math.PI * 0.35;
      ring2.rotation.z = Math.PI * 0.25;
      var ring3 = createRing(2.52, 0.017, COLORS.gold, 0.54);
      ring3.rotation.x = Math.PI * 0.7;
      ring3.rotation.z = -Math.PI * 0.16;
      ringGroup.add(ring1, ring2, ring3);
      ringGroup.position.y = -0.12;
      scene.add(ringGroup);

      var particleGroup = new THREE.Group();
      var particleColors = [COLORS.blue, COLORS.teal, COLORS.pink, COLORS.purple, COLORS.gold];
      var particles = [];
      var count = Math.round(54 + signalLevel * 44 + dangerLevel * 18);
      for (var i = 0; i < count; i += 1) {
        var color = particleColors[Math.floor(Math.random() * particleColors.length)];
        var mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.025 + Math.random() * 0.045, 7, 7),
          new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.54 + Math.random() * 0.36 })
        );
        var arm = Math.floor(Math.random() * 3);
        var dist = 1.05 + Math.random() * 2.6;
        var angle = (arm / 3) * Math.PI * 2 + dist * 1.65;
        mesh.userData = {
          dist: dist,
          angle: angle,
          speed: 0.006 + Math.random() * 0.012,
          y: (Math.random() - 0.5) * 1.08,
          phase: Math.random() * Math.PI * 2
        };
        mesh.position.set(Math.cos(angle) * dist, mesh.userData.y, Math.sin(angle) * dist);
        particles.push(mesh);
        particleGroup.add(mesh);
      }
      particleGroup.position.y = -0.1;
      scene.add(particleGroup);

      var shardGroup = new THREE.Group();
      for (var s = 0; s < 5; s += 1) {
        var shard = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.12 + Math.random() * 0.12, 0),
          new THREE.MeshPhysicalMaterial({
            color: s % 2 ? COLORS.pink : COLORS.blue,
            emissive: s % 2 ? COLORS.pink : COLORS.blue,
            emissiveIntensity: 0.34,
            transparent: true,
            opacity: 0.54,
            metalness: 0.86,
            roughness: 0.08,
            wireframe: true
          })
        );
        var shardAngle = (s / 5) * Math.PI * 2;
        shard.userData = {
          angle: shardAngle,
          dist: 2.25 + Math.random() * 0.75,
          speed: 0.0025 + Math.random() * 0.003,
          baseY: (Math.random() - 0.5) * 1.2
        };
        shardGroup.add(shard);
      }
      scene.add(shardGroup);

      var floorGeo = new THREE.PlaneGeometry(8.5, 5.2, 1, 1);
      var floorMat = new THREE.MeshBasicMaterial({
        color: 0x7e22ce,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide
      });
      var floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI * 0.5;
      floor.position.y = -1.08;
      floor.position.z = -0.65;
      scene.add(floor);

      var clock = new THREE.Clock();
      function tick() {
        if (!paused) requestAnimationFrame(tick);
        var elapsed = clock.getElapsedTime();
        var now = Date.now();
        core.rotation.y += 0.008 + signalLevel * 0.006;
        core.rotation.x += 0.0025;
        var coreScale = 1 + Math.sin(now * 0.0028) * (0.05 + dangerLevel * 0.04);
        core.scale.set(coreScale, coreScale, coreScale);
        glow.scale.setScalar(0.78 + Math.sin(now * 0.004) * 0.16);
        coreLight.intensity = 2.4 + Math.sin(now * 0.003) * 0.8 + signalLevel * 1.2;

        ring1.rotation.z += 0.008;
        ring2.rotation.y += 0.005 + dangerLevel * 0.004;
        ring2.rotation.z += 0.003;
        ring3.rotation.z -= 0.006;
        ring3.rotation.x += 0.002;
        ringGroup.rotation.y += 0.0012;

        particles.forEach(function (p) {
          p.userData.angle += p.userData.speed;
          p.position.x = Math.cos(p.userData.angle) * p.userData.dist;
          p.position.z = Math.sin(p.userData.angle) * p.userData.dist;
          p.position.y = p.userData.y + Math.sin(now * 0.003 + p.userData.phase) * 0.36;
        });
        particleGroup.rotation.y += 0.0018;

        shardGroup.children.forEach(function (shard) {
          var d = shard.userData;
          d.angle += d.speed;
          shard.position.x = Math.cos(d.angle) * d.dist;
          shard.position.z = Math.sin(d.angle) * d.dist;
          shard.position.y = d.baseY + Math.sin(now * 0.0025 + d.angle) * 0.35;
          shard.rotation.x += 0.01;
          shard.rotation.y += 0.014;
        });

        var camAngle = elapsed * 0.13;
        camera.position.x = Math.sin(camAngle) * 1.28;
        camera.position.z = Math.cos(camAngle) * 6.1;
        camera.position.y = 1.35 + Math.sin(elapsed * 0.28) * 0.24;
        camera.lookAt(0, -0.05, 0);
        alertLight.position.set(Math.sin(elapsed * 0.7) * 3.2, 1.2, Math.cos(elapsed * 0.62) * 3.2);

        renderer.render(scene, camera);
      }
      tick();

      window.addEventListener('resize', function () {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      });
    })();
  </script>
</body>
</html>`;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const NebulaCore3DView = ({
  style,
  signalLevel = 0.55,
  dangerLevel = 0.15,
  paused = false,
}: NebulaCore3DViewProps) => {
  const [webFailed, setWebFailed] = useState(false);
  const html = useMemo(
    () => buildNebulaHtml(clamp01(signalLevel), clamp01(dangerLevel), paused),
    [dangerLevel, paused, signalLevel]
  );

  if (webFailed) {
    return (
      <View style={[style, styles.fallback]} pointerEvents="none">
        <RadarAnimation
          size={230}
          rendererMode="life3d"
          signalLevel={signalLevel}
          dangerLevel={dangerLevel}
          paused={paused}
        />
      </View>
    );
  }

  return (
    <View style={[style, styles.container]} pointerEvents="none">
      <WebView
        source={{ html }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled={false}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        mixedContentMode="always"
        allowsInlineMediaPlayback
        setSupportMultipleWindows={false}
        onMessage={(event) => {
          if (event.nativeEvent.data === 'missing-three') {
            setWebFailed(true);
          }
        }}
        onError={() => setWebFailed(true)}
        onHttpError={() => setWebFailed(true)}
        style={styles.webview}
        containerStyle={styles.webviewContainer}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#020617',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  webviewContainer: {
    backgroundColor: 'transparent',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#020617',
  },
});

export default NebulaCore3DView;
