const MAP_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
  />
  <script src="https://unpkg.com/maplibre-gl@5.21.1/dist/maplibre-gl.js"><\/script>
  <link href="https://unpkg.com/maplibre-gl@5.21.1/dist/maplibre-gl.css" rel="stylesheet" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
    body { background: #06111d; }
    .maplibregl-ctrl-top-left,
    .maplibregl-ctrl-top-right,
    .maplibregl-ctrl-bottom-left { display: none !important; }
    .maplibregl-ctrl-bottom-right { right: 12px !important; bottom: 20px !important; }
    .maplibregl-ctrl-group {
      border-radius: 14px !important;
      overflow: hidden;
      border: 1px solid rgba(138, 166, 211, 0.14) !important;
      box-shadow: 0 14px 30px rgba(0, 0, 0, 0.35) !important;
      background: rgba(9, 20, 37, 0.9) !important;
      backdrop-filter: blur(14px);
    }
    .maplibregl-ctrl-group button {
      width: 42px !important;
      height: 42px !important;
      background: transparent !important;
    }
    .maplibregl-ctrl-group button span {
      filter: brightness(0) saturate(100%) invert(88%) sepia(4%) saturate(1211%) hue-rotate(181deg) brightness(98%) contrast(92%) !important;
    }
    .maplibregl-ctrl-attrib {
      right: auto !important;
      left: 12px !important;
      bottom: 12px !important;
      background: rgba(9, 20, 37, 0.74) !important;
      border-radius: 10px !important;
      padding: 2px 8px !important;
      color: #9bb0cb !important;
      font-size: 10px !important;
      box-shadow: 0 8px 18px rgba(0, 0, 0, 0.24) !important;
    }
    .maplibregl-ctrl-attrib a { color: #c7d5ea !important; }
    .maplibregl-popup { display: none !important; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var cameraState = { bearing: 0, navigation: false };
    var userMarker = null;
    var userMarkerElement = null;
    var destMarker = null;

    var map = new maplibregl.Map({
      container: 'map',
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [-74.006, 40.7128],
      zoom: 14,
      pitch: 0,
      bearing: 0,
      maxPitch: 68,
      attributionControl: true,
      canvasContextAttributes: { antialias: true },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');

    function send(type, payload) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, payload: payload }));
      }
    }

    function normalizeBearing(value) {
      return ((value % 360) + 360) % 360;
    }

    function smoothBearing(current, target, factor) {
      if (typeof current !== 'number' || !isFinite(current)) {
        return normalizeBearing(target);
      }

      var delta = ((target - current + 540) % 360) - 180;
      return normalizeBearing(current + delta * factor);
    }

    function resolveBearing(heading, routeHeading) {
      var nextBearing = typeof heading === 'number' && isFinite(heading) && heading > 0
        ? heading
        : (typeof routeHeading === 'number' && isFinite(routeHeading) ? routeHeading : cameraState.bearing);

      cameraState.bearing = smoothBearing(cameraState.bearing || nextBearing || 0, nextBearing || 0, 0.28);
      return cameraState.bearing;
    }

    function getNavigationPadding() {
      var height = Math.max(window.innerHeight || 0, 720);
      return {
        top: 134,
        bottom: Math.round(height * 0.35),
        left: 24,
        right: 24,
      };
    }

    function getBrowsePadding() {
      return {
        top: 126,
        bottom: 304,
        left: 28,
        right: 28,
      };
    }

    function getCameraZoom(speed, explicitZoom) {
      if (typeof explicitZoom === 'number' && isFinite(explicitZoom)) {
        return explicitZoom;
      }

      var currentSpeed = typeof speed === 'number' && isFinite(speed) ? speed : 0;
      if (currentSpeed > 24) return 15.4;
      if (currentSpeed > 18) return 15.8;
      if (currentSpeed > 12) return 16.15;
      if (currentSpeed > 6) return 16.55;
      return 16.95;
    }

    function ensureUserMarker() {
      if (userMarkerElement) {
        return userMarkerElement;
      }

      var wrapper = document.createElement('div');
      wrapper.innerHTML = ''
        + '<div style="position:relative;width:40px;height:40px;">'
        + '  <div style="position:absolute;inset:0;border-radius:999px;background:rgba(96,165,250,0.16);animation:mapflowPulse 2.2s ease-out infinite;"></div>'
        + '  <div style="position:absolute;left:50%;top:6px;margin-left:-7px;width:14px;height:18px;transform-origin:50% 75%;" data-marker-arrow>'
        + '    <svg width="14" height="18" viewBox="0 0 14 18" fill="none" xmlns="http://www.w3.org/2000/svg">'
        + '      <path d="M7 0L14 14H8.9L7 18L5.1 14H0L7 0Z" fill="#5b6ef7"/>'
        + '    </svg>'
        + '  </div>'
        + '  <div style="position:absolute;left:50%;top:50%;width:18px;height:18px;margin-left:-9px;margin-top:-9px;border-radius:999px;background:#5b6ef7;border:3px solid white;box-shadow:0 8px 18px rgba(91,110,247,0.38);"></div>'
        + '</div>'
        + '<style>@keyframes mapflowPulse { 0% { transform: scale(0.45); opacity: 0.95; } 100% { transform: scale(1.95); opacity: 0; } }</style>';

      userMarkerElement = wrapper.firstChild;
      userMarker = new maplibregl.Marker({ element: userMarkerElement, anchor: 'center' })
        .setLngLat([-74.006, 40.7128])
        .addTo(map);

      return userMarkerElement;
    }

    function updateUserLocation(payload) {
      if (!payload) return;

      ensureUserMarker();
      userMarker.setLngLat([payload.lng, payload.lat]);

      var arrow = userMarkerElement.querySelector('[data-marker-arrow]');
      var arrowBearing = resolveBearing(payload.heading, payload.routeHeading);
      if (arrow) {
        arrow.style.transform = 'rotate(' + arrowBearing + 'deg)';
      }
    }

    function updateDestination(payload) {
      if (!payload) return;

      if (destMarker) {
        destMarker.remove();
      }

      var element = document.createElement('div');
      element.innerHTML = ''
        + '<div style="width:30px;height:38px;">'
        + '  <svg width="30" height="38" viewBox="0 0 30 38" fill="none" xmlns="http://www.w3.org/2000/svg">'
        + '    <path d="M15 0C6.716 0 0 6.716 0 15c0 11.25 15 23 15 23s15-11.75 15-23C30 6.716 23.284 0 15 0Z" fill="#f97316"/>'
        + '    <circle cx="15" cy="15" r="6.5" fill="white"/>'
        + '  </svg>'
        + '</div>';

      destMarker = new maplibregl.Marker({ element: element, anchor: 'bottom' })
        .setLngLat([payload.lng, payload.lat])
        .addTo(map);
    }

    function ensureRouteLayers(geojson) {
      var source = map.getSource('route');
      if (source) {
        source.setData(geojson);
        return;
      }

      map.addSource('route', { type: 'geojson', data: geojson });
      map.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#60a5fa', 'line-width': 16, 'line-opacity': 0.18 },
      });
      map.addLayer({
        id: 'route-shadow',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#283a99', 'line-width': 10, 'line-opacity': 0.56 },
      });
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#6f7cff', 'line-width': 6, 'line-opacity': 0.98 },
      });
    }

    function fitRoute(geometry) {
      var bounds = new maplibregl.LngLatBounds();
      geometry.forEach(function (coordinate) { bounds.extend(coordinate); });
      map.fitBounds(bounds, {
        padding: { top: 112, bottom: 336, left: 42, right: 42 },
        duration: 1100,
        maxZoom: 17,
      });
    }

    function updateRoute(payload) {
      if (!payload || !Array.isArray(payload.geometry) || payload.geometry.length < 2) {
        return;
      }

      var geojson = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: payload.geometry,
        },
      };

      ensureRouteLayers(geojson);

      if (!cameraState.navigation) {
        fitRoute(payload.geometry);
      }
    }

    function clearRoute() {
      ['route-line', 'route-shadow', 'route-glow'].forEach(function (id) {
        if (map.getLayer(id)) {
          map.removeLayer(id);
        }
      });

      if (map.getSource('route')) {
        map.removeSource('route');
      }

      if (destMarker) {
        destMarker.remove();
        destMarker = null;
      }

      cameraState.navigation = false;
    }

    function moveCamera(payload, followMode) {
      if (!payload) return;

      cameraState.navigation = Boolean(payload.navigation || followMode);

      map.easeTo({
        center: [payload.lng, payload.lat],
        bearing: resolveBearing(payload.heading, payload.routeHeading),
        pitch: cameraState.navigation ? (payload.pitch || 58) : (payload.pitch || 0),
        zoom: getCameraZoom(payload.speed, payload.zoom),
        padding: cameraState.navigation ? getNavigationPadding() : getBrowsePadding(),
        duration: followMode ? 850 : 1000,
        essential: true,
        easing: function (t) {
          if (followMode) {
            return 1 - Math.pow(1 - t, 2);
          }
          return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        },
      });
    }

    function add3DBuildings() {
      if (map.getLayer('mapflow-3d-buildings')) {
        return;
      }

      if (!map.getSource('mapflow-openmaptiles')) {
        map.addSource('mapflow-openmaptiles', {
          type: 'vector',
          tiles: ['https://basemaps.cartocdn.com/tiles/v3/assets/openmaptiles/{z}/{x}/{y}.pbf'],
          minzoom: 0,
          maxzoom: 14,
        });
      }

      var labelLayer = null;
      var layers = map.getStyle().layers || [];
      for (var index = 0; index < layers.length; index += 1) {
        if (layers[index].type === 'symbol') {
          labelLayer = layers[index].id;
          break;
        }
      }

      if (!map.getLayer('mapflow-water')) {
        map.addLayer({
          id: 'mapflow-water',
          source: 'mapflow-openmaptiles',
          'source-layer': 'water',
          type: 'fill',
          paint: {
            'fill-color': '#143f6b',
            'fill-opacity': 0.98,
          }
        }, labelLayer || undefined);
      }

      if (!map.getLayer('mapflow-park')) {
        map.addLayer({
          id: 'mapflow-park',
          source: 'mapflow-openmaptiles',
          'source-layer': 'park',
          type: 'fill',
          paint: {
            'fill-color': '#1d6d40',
            'fill-opacity': 0.94,
          }
        }, labelLayer || undefined);
      }

      if (!map.getLayer('mapflow-landcover')) {
        map.addLayer({
          id: 'mapflow-landcover',
          source: 'mapflow-openmaptiles',
          'source-layer': 'landcover',
          type: 'fill',
          paint: {
            'fill-color': [
              'match',
              ['get', 'class'],
              'wood', '#1a5e3a',
              'grass', '#236540',
              'scrub', '#315d46',
              'crop', '#4b6430',
              '#132438'
            ],
            'fill-opacity': 0.76,
          }
        }, labelLayer || undefined);
      }

      if (!map.getLayer('mapflow-waterway')) {
        map.addLayer({
          id: 'mapflow-waterway',
          source: 'mapflow-openmaptiles',
          'source-layer': 'waterway',
          type: 'line',
          paint: {
            'line-color': '#2f7bc1',
            'line-width': 1.4,
            'line-opacity': 0.92,
          }
        }, labelLayer || undefined);
      }

      if (!map.getLayer('mapflow-road-major-casing')) {
        map.addLayer({
          id: 'mapflow-road-major-casing',
          source: 'mapflow-openmaptiles',
          'source-layer': 'transportation',
          type: 'line',
          filter: [
            'match',
            ['get', 'class'],
            ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'],
            true,
            false
          ],
          paint: {
            'line-color': '#101e34',
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, 2.2,
              13, 3.5,
              16, 7.2
            ],
            'line-opacity': 0.94,
          }
        }, labelLayer || undefined);
      }

      if (!map.getLayer('mapflow-road-major')) {
        map.addLayer({
          id: 'mapflow-road-major',
          source: 'mapflow-openmaptiles',
          'source-layer': 'transportation',
          type: 'line',
          filter: [
            'match',
            ['get', 'class'],
            ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'],
            true,
            false
          ],
          paint: {
            'line-color': '#4775b7',
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              10, 1.4,
              13, 2.5,
              16, 5.2
            ],
            'line-opacity': 0.97,
          }
        }, labelLayer || undefined);
      }

      if (!map.getLayer('mapflow-road-minor-casing')) {
        map.addLayer({
          id: 'mapflow-road-minor-casing',
          source: 'mapflow-openmaptiles',
          'source-layer': 'transportation',
          type: 'line',
          filter: [
            'match',
            ['get', 'class'],
            ['street', 'street_limited', 'residential', 'service', 'living_street'],
            true,
            false
          ],
          paint: {
            'line-color': '#0d192c',
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              12, 1.2,
              14, 1.8,
              17, 3.4
            ],
            'line-opacity': 0.9,
          }
        }, labelLayer || undefined);
      }

      if (!map.getLayer('mapflow-road-minor')) {
        map.addLayer({
          id: 'mapflow-road-minor',
          source: 'mapflow-openmaptiles',
          'source-layer': 'transportation',
          type: 'line',
          filter: [
            'match',
            ['get', 'class'],
            ['street', 'street_limited', 'residential', 'service', 'living_street'],
            true,
            false
          ],
          paint: {
            'line-color': '#31547f',
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              12, 0.85,
              14, 1.4,
              17, 2.7
            ],
            'line-opacity': 0.94,
          }
        }, labelLayer || undefined);
      }

      map.addLayer({
        id: 'mapflow-3d-buildings',
        source: 'mapflow-openmaptiles',
        'source-layer': 'building',
        type: 'fill-extrusion',
        minzoom: 14,
        paint: {
          'fill-extrusion-color': [
            'interpolate',
            ['linear'],
            ['get', 'render_height'],
            0, '#102139',
            120, '#173254',
            260, '#24456e',
            560, '#356299'
          ],
          'fill-extrusion-height': [
            'interpolate',
            ['linear'],
            ['zoom'],
            14, 0,
            15, ['get', 'render_height']
          ],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.46
        }
      }, labelLayer || undefined);
    }

    function applyDarkNavigationPalette() {
      var layers = map.getStyle().layers || [];

      layers.forEach(function (layer) {
        var sourceLayer = layer['source-layer'];

        try {
          if (layer.type === 'background') {
            map.setPaintProperty(layer.id, 'background-color', '#07121f');
          }

          if (sourceLayer === 'water' && layer.type === 'fill') {
            map.setPaintProperty(layer.id, 'fill-color', '#153c63');
            map.setPaintProperty(layer.id, 'fill-opacity', 0.96);
          }

          if (sourceLayer === 'waterway' && layer.type === 'line') {
            map.setPaintProperty(layer.id, 'line-color', '#2f78bf');
            map.setPaintProperty(layer.id, 'line-opacity', 0.9);
          }

          if (sourceLayer === 'park' && layer.type === 'fill') {
            map.setPaintProperty(layer.id, 'fill-color', '#1b6b3c');
            map.setPaintProperty(layer.id, 'fill-opacity', 0.96);
          }

          if (sourceLayer === 'landcover' && layer.type === 'fill') {
            map.setPaintProperty(layer.id, 'fill-color', [
              'match',
              ['get', 'class'],
              'wood', '#1a5d3a',
              'grass', '#24633f',
              'scrub', '#315b46',
              'crop', '#4d6031',
              '#14253a'
            ]);
            map.setPaintProperty(layer.id, 'fill-opacity', 0.72);
          }

          if (sourceLayer === 'transportation' && layer.type === 'line') {
            map.setPaintProperty(layer.id, 'line-color', [
              'match',
              ['get', 'class'],
              'motorway', '#628ad3',
              'trunk', '#5d84ca',
              'primary', '#4b73b6',
              'secondary', '#40659f',
              'tertiary', '#365887',
              'street', '#28456e',
              'street_limited', '#28456e',
              'residential', '#233c60',
              'service', '#203554',
              'living_street', '#203554',
              '#263a57'
            ]);
            map.setPaintProperty(layer.id, 'line-opacity', 0.86);
          }

          if (sourceLayer === 'boundary' && layer.type === 'line') {
            map.setPaintProperty(layer.id, 'line-color', '#22415f');
            map.setPaintProperty(layer.id, 'line-opacity', 0.28);
          }

          if (sourceLayer === 'building' && layer.type === 'fill') {
            map.setPaintProperty(layer.id, 'fill-color', '#15253d');
            map.setPaintProperty(layer.id, 'fill-opacity', 0.62);
          }

          if (layer.type === 'symbol' && map.getLayoutProperty(layer.id, 'text-field')) {
            if (sourceLayer === 'place' || sourceLayer === 'transportation_name' || sourceLayer === 'poi') {
              map.setPaintProperty(layer.id, 'text-color', '#d6e4fb');
              map.setPaintProperty(layer.id, 'text-halo-color', '#08111e');
              map.setPaintProperty(layer.id, 'text-halo-width', 1.1);
            } else {
              map.setPaintProperty(layer.id, 'text-color', '#8ea8cb');
              map.setPaintProperty(layer.id, 'text-halo-color', '#06111d');
              map.setPaintProperty(layer.id, 'text-halo-width', 0.9);
            }
          }
        } catch (error) {
          // Ignore style layers that don't expose the property we're trying to tint.
        }
      });
    }

    map.on('load', function () {
      applyDarkNavigationPalette();
      add3DBuildings();
      send('mapReady');
    });

    map.on('click', function (event) {
      send('mapClick', {
        lat: event.lngLat.lat,
        lng: event.lngLat.lng,
      });
    });

    window.addEventListener('message', function (event) {
      try {
        var message = JSON.parse(event.data);
        switch (message.type) {
          case 'updateLocation':
            updateUserLocation(message.payload);
            break;
          case 'updateDestination':
            updateDestination(message.payload);
            break;
          case 'updateRoute':
            updateRoute(message.payload);
            break;
          case 'flyTo':
            moveCamera(message.payload, false);
            break;
          case 'followUser':
            moveCamera(message.payload || {}, true);
            break;
          case 'clearRoute':
            clearRoute();
            break;
        }
      } catch (error) {
        // Ignore malformed bridge payloads.
      }
    });
  <\/script>
</body>
</html>`;

export default MAP_HTML;
