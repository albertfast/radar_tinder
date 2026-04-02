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
    .maplibregl-ctrl-bottom-right { right: 12px !important; bottom: 154px !important; }
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
    var overlayMarkerData = [];
    var overlayMarkerRegistry = {};

    var map = new maplibregl.Map({
      container: 'map',
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [-74.006, 40.7128],
      zoom: 14,
      pitch: 0,
      bearing: 0,
      maxPitch: 0,
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

    function resolveOverlayKind(marker) {
      if (marker && marker.markerKind) return marker.markerKind;
      if (!marker) return 'camera';
      if (marker.type === 'red_light') return 'red_light';
      if (marker.type === 'police') return 'police';
      if (marker.type === 'mobile') return 'mobile';
      if (marker.type === 'traffic_enforcement') return 'traffic_enforcement';
      return 'camera';
    }

    function createOverlayMarkerElement(marker) {
      var kind = resolveOverlayKind(marker);
      var wrapper = document.createElement('button');
      wrapper.type = 'button';
      wrapper.setAttribute('aria-label', kind + '-marker');
      wrapper.style.cssText = 'border:none;padding:0;background:transparent;cursor:pointer;';

      var bg = '#6A2915';
      var border = '#FFB074';
      var innerRing = 'rgba(255, 213, 178, 0.42)';
      var icon = ''
        + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">'
        + '  <path d="M7 8.4A1.4 1.4 0 0 1 8.4 7h.8l1-1.15c.36-.43.89-.67 1.45-.67h2.82c.56 0 1.09.24 1.45.67l1 1.15h.8A1.4 1.4 0 0 1 19 8.4v6.2a1.4 1.4 0 0 1-1.4 1.4H8.4A1.4 1.4 0 0 1 7 14.6V8.4Z" fill="#FFF2E8"/>'
        + '  <circle cx="12" cy="11.5" r="3.05" fill="#6A2915"/>'
        + '  <circle cx="12" cy="11.5" r="1.5" fill="#FFF2E8"/>'
        + '</svg>';

      if (kind === 'red_light') {
        wrapper.innerHTML = ''
          + '<div style="position:relative;width:40px;height:52px;filter:drop-shadow(0 12px 16px rgba(0,0,0,0.32));">'
          + '  <svg width="40" height="52" viewBox="0 0 40 52" fill="none" xmlns="http://www.w3.org/2000/svg">'
          + '    <path d="M20 1.5C10.2 1.5 2.4 9.15 2.4 18.74C2.4 31.57 20 49 20 49s17.6-17.43 17.6-30.26C37.6 9.15 29.8 1.5 20 1.5Z" fill="#C0212E" stroke="#FF6E78" stroke-width="2.4"/>'
          + '    <circle cx="20" cy="19.2" r="10.2" fill="#5C0B12" stroke="rgba(255,255,255,0.14)" stroke-width="1.2"/>'
          + '    <rect x="16.2" y="12.7" width="7.6" height="13.9" rx="3.2" fill="#220308" stroke="#FFDDE1" stroke-width="1.2"/>'
          + '    <circle cx="20" cy="16.1" r="1.5" fill="#FF6B6B"/>'
          + '    <circle cx="20" cy="19.6" r="1.5" fill="#F59E0B"/>'
          + '    <circle cx="20" cy="23.1" r="1.5" fill="#4ADE80"/>'
          + '  </svg>'
          + '</div>';
      } else if (kind === 'police') {
        bg = '#12385E';
        border = '#7AC5FF';
        innerRing = 'rgba(180, 223, 255, 0.38)';
        icon = ''
          + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">'
          + '  <path d="M12 4l5.7 2.65v3.75c0 3.56-2.22 6.65-5.7 7.8-3.48-1.15-5.7-4.24-5.7-7.8V6.65L12 4Z" fill="#EAF6FF"/>'
          + '  <path d="M12 7.2l.92 1.84 2.03.3-1.47 1.43.35 2.03L12 11.88l-1.83.92.35-2.03-1.47-1.43 2.03-.3L12 7.2Z" fill="#12385E"/>'
          + '</svg>';
      } else if (kind === 'mobile') {
        bg = '#533011';
        border = '#FFC86B';
        innerRing = 'rgba(255, 214, 145, 0.34)';
        icon = ''
          + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">'
          + '  <path d="M6.5 11A3.5 3.5 0 0 1 10 7.5h4A3.5 3.5 0 0 1 17.5 11v2H6.5v-2Z" fill="#FEF3C7"/>'
          + '  <circle cx="9" cy="14.5" r="1.7" fill="#F59E0B"/>'
          + '  <circle cx="15" cy="14.5" r="1.7" fill="#F59E0B"/>'
          + '</svg>';
      } else if (kind === 'traffic_enforcement') {
        bg = '#4A1020';
        border = '#FF8EA2';
        innerRing = 'rgba(255, 196, 208, 0.34)';
        icon = ''
          + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">'
          + '  <path d="M12 4.2l5.5 2.9v3.5c0 3.9-2.4 6.8-5.5 8.1-3.1-1.3-5.5-4.2-5.5-8.1V7.1L12 4.2Z" fill="#FFE4E6"/>'
          + '  <path d="M12 8v4.1" stroke="#3A0D17" stroke-width="2" stroke-linecap="round"/>'
          + '  <circle cx="12" cy="14.9" r="1.2" fill="#3A0D17"/>'
          + '</svg>';
      }

      if (kind !== 'red_light') {
        wrapper.innerHTML = ''
          + '<div style="position:relative;width:44px;height:44px;border-radius:22px;background:' + bg + ';border:2px solid ' + border + ';display:flex;align-items:center;justify-content:center;box-shadow:0 12px 24px rgba(0,0,0,0.36);">'
          + '  <div style="position:absolute;inset:4px;border-radius:999px;border:1.2px solid ' + innerRing + ';"></div>'
          + '  <div style="position:relative;z-index:1;display:flex;align-items:center;justify-content:center;">'
          +      icon
          + '  </div>'
          + '</div>';
      }

      wrapper.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        send('overlayMarkerPress', { id: marker.id });
      });

      return wrapper;
    }

    function clearOverlayMarkers() {
      Object.keys(overlayMarkerRegistry).forEach(function (id) {
        overlayMarkerRegistry[id].marker.remove();
        delete overlayMarkerRegistry[id];
      });
    }

    function getOverlayPriority(marker) {
      var kind = resolveOverlayKind(marker);
      if (kind === 'red_light') return 5;
      if (kind === 'camera') return 4;
      if (kind === 'police') return 3;
      if (kind === 'traffic_enforcement') return 2;
      if (kind === 'mobile') return 1;
      return 0;
    }

    function getOverlayMinPixelDistance(zoom) {
      if (zoom >= 16.8) return 0;
      if (zoom >= 15.8) return 18;
      if (zoom >= 14.8) return 24;
      if (zoom >= 13.8) return 34;
      return 44;
    }

    function getOverlayMaxVisibleCount(zoom) {
      if (zoom >= 16.8) return 56;
      if (zoom >= 15.8) return 42;
      if (zoom >= 14.8) return 30;
      if (zoom >= 13.8) return 22;
      return 16;
    }

    function selectVisibleOverlayMarkers(markers) {
      var zoom = map.getZoom();
      var minPixelDistance = getOverlayMinPixelDistance(zoom);
      var maxVisibleCount = getOverlayMaxVisibleCount(zoom);

      if (minPixelDistance <= 0) {
        return markers.slice(0, maxVisibleCount);
      }

      var chosen = [];

      markers.forEach(function (marker, index) {
        var point = map.project([Number(marker.longitude), Number(marker.latitude)]);
        var priority = getOverlayPriority(marker);
        var overlapIndex = -1;

        for (var i = 0; i < chosen.length; i += 1) {
          var other = chosen[i];
          var dx = point.x - other.point.x;
          var dy = point.y - other.point.y;
          if (Math.sqrt(dx * dx + dy * dy) < minPixelDistance) {
            overlapIndex = i;
            break;
          }
        }

        if (overlapIndex === -1) {
          chosen.push({
            marker: marker,
            point: point,
            priority: priority,
            index: index,
          });
          return;
        }

        var current = chosen[overlapIndex];
        if (
          priority > current.priority ||
          (priority === current.priority && index < current.index)
        ) {
          chosen[overlapIndex] = {
            marker: marker,
            point: point,
            priority: priority,
            index: index,
          };
        }
      });

      chosen.sort(function (left, right) {
        if (right.priority !== left.priority) {
          return right.priority - left.priority;
        }
        return left.index - right.index;
      });

      return chosen.slice(0, maxVisibleCount).map(function (entry) {
        return entry.marker;
      });
    }

    function renderOverlayMarkers() {
      var markers = selectVisibleOverlayMarkers(overlayMarkerData);
      var nextIds = {};

      markers.forEach(function (marker) {
        if (!marker || marker.id === undefined || marker.id === null) return;

        var id = String(marker.id);
        var lat = Number(marker.latitude);
        var lng = Number(marker.longitude);
        if (!isFinite(lat) || !isFinite(lng)) return;

        var kind = resolveOverlayKind(marker);
        var existing = overlayMarkerRegistry[id];

        if (!existing || existing.kind !== kind) {
          if (existing) {
            existing.marker.remove();
          }

          overlayMarkerRegistry[id] = {
            kind: kind,
            marker: new maplibregl.Marker({
              element: createOverlayMarkerElement(marker),
              anchor: kind === 'red_light' ? 'bottom' : 'center',
            })
              .setLngLat([lng, lat])
              .addTo(map),
          };
        } else {
          existing.marker.setLngLat([lng, lat]);
        }

        nextIds[id] = true;
      });

      Object.keys(overlayMarkerRegistry).forEach(function (id) {
        if (nextIds[id]) return;
        overlayMarkerRegistry[id].marker.remove();
        delete overlayMarkerRegistry[id];
      });
    }

    function updateOverlayMarkers(payload) {
      overlayMarkerData = Array.isArray(payload && payload.markers) ? payload.markers : [];
      renderOverlayMarkers();
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
        bearing: 0,
        pitch: 0,
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
      send('mapReady');
    });

    map.on('click', function (event) {
      send('mapClick', {
        lat: event.lngLat.lat,
        lng: event.lngLat.lng,
      });
    });

    map.on('moveend', function () {
      if (overlayMarkerData.length > 0) {
        renderOverlayMarkers();
      }
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
          case 'updateOverlays':
            updateOverlayMarkers(message.payload);
            break;
          case 'clearOverlays':
            clearOverlayMarkers();
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
