#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║            ABD 50 EYALET - TRAFİK KAMERASI İNDİRİCİ                          ║
╚══════════════════════════════════════════════════════════════════════════════╝

Kullanım:
    python3 download_all_states.py              # Tüm eyaletler
    python3 download_all_states.py --test       # Test modu
"""

import json
import os
import time
import requests
from datetime import datetime
from typing import Dict, List, Optional
from dataclasses import dataclass, asdict
import argparse

@dataclass
class TrafficCamera:
    source: str
    source_id: str
    latitude: float
    longitude: float
    camera_type: str
    speed_limit: Optional[int]
    road_name: Optional[str]
    direction: Optional[str]
    city: Optional[str]
    state: str
    country: str
    verified: bool

# ═══════════════════════════════════════════════════════════════════════════════
# VERİ KAYNAKLARI
# ═══════════════════════════════════════════════════════════════════════════════

US_STATES_DATA = {
    "IL": {
        "name": "Illinois", "abbr": "IL",
        "sources": [
            {"name": "Chicago Speed Cameras", "type": "speed_fixed", "format": "socrata",
             "url": "https://data.cityofchicago.org/resource/hhkd-xvj4.json", "params": {"$limit": 10000}},
            {"name": "Chicago Red Light Cameras", "type": "red_light", "format": "socrata",
             "url": "https://data.cityofchicago.org/resource/spqx-js37.json", "params": {"$limit": 10000}},
        ]
    },
    "MD": {
        "name": "Maryland", "abbr": "MD",
        "sources": [
            {"name": "Montgomery County Speed", "type": "speed_fixed", "format": "socrata",
             "url": "https://data.montgomerycountymd.gov/resource/uv5p-zm58.json", "params": {"$limit": 10000}},
        ]
    },
    "NY": {
        "name": "New York", "abbr": "NY",
        "sources": [
            {"name": "NYC Speed Cameras", "type": "speed_fixed", "format": "socrata",
             "url": "https://data.cityofnewyork.us/resource/hk4g-zwnh.json", "params": {"$limit": 10000}},
        ]
    },
    "DC": {
        "name": "Washington DC", "abbr": "DC",
        "sources": [
            {"name": "DC Traffic Cameras", "type": "speed_fixed", "format": "arcgis",
             "url": "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Transportation_WebMercator/MapServer/60/query",
             "params": {"where": "1=1", "outFields": "*", "f": "json", "returnGeometry": "true"}},
        ]
    },
    "CA": {
        "name": "California", "abbr": "CA",
        "sources": [
            {"name": "San Francisco Speed", "type": "speed_fixed", "format": "socrata",
             "url": "https://data.sfgov.org/resource/d5uh-bk84.json", "params": {"$limit": 10000}},
        ]
    },
    "LA": {"name": "Louisiana", "abbr": "LA",
        "sources": [{"name": "New Orleans Traffic", "type": "traffic_cameras", "format": "socrata",
             "url": "https://data.nola.gov/resource/va3u-jspg.json", "params": {"$limit": 10000}}]},
    "TX": {"name": "Texas", "abbr": "TX",
        "sources": [{"name": "Austin Traffic", "type": "traffic_cameras", "format": "socrata",
             "url": "https://data.austintexas.gov/resource/sh59-i6y9.json", "params": {"$limit": 10000}}]},
    "WA": {"name": "Washington", "abbr": "WA",
        "sources": [{"name": "Seattle Cameras", "type": "traffic_cameras", "format": "socrata",
             "url": "https://data.seattle.gov/resource/5src-czff.json", "params": {"$limit": 10000}}]},
    "CO": {"name": "Colorado", "abbr": "CO",
        "sources": [{"name": "Denver Traffic", "type": "traffic_cameras", "format": "socrata",
             "url": "https://data.denvergov.org/resource/h7qr-y8eb.json", "params": {"$limit": 10000}}]},
    "MA": {"name": "Massachusetts", "abbr": "MA",
        "sources": [{"name": "MassDOT Cameras", "type": "traffic_cameras", "format": "socrata",
             "url": "https://data.mass.gov/resource/i4ib-7wj3.json", "params": {"$limit": 10000}}]},
    "CT": {"name": "Connecticut", "abbr": "CT",
        "sources": [{"name": "CTDOT Cameras", "type": "traffic_cameras", "format": "socrata",
             "url": "https://data.ct.gov/resource/hvct-sedj.json", "params": {"$limit": 10000}}]},
    "MI": {"name": "Michigan", "abbr": "MI",
        "sources": [{"name": "Detroit Traffic", "type": "traffic_cameras", "format": "socrata",
             "url": "https://data.detroitmi.gov/resource/uta6-3dpc.json", "params": {"$limit": 10000}}]},
    "OH": {"name": "Ohio", "abbr": "OH",
        "sources": [{"name": "Cincinnati Traffic", "type": "traffic_cameras", "format": "socrata",
             "url": "https://data.cincinnati-oh.gov/resource/rvmb-pjv5.json", "params": {"$limit": 10000}}]},
    "NC": {"name": "North Carolina", "abbr": "NC",
        "sources": [{"name": "Charlotte Traffic", "type": "traffic_cameras", "format": "socrata",
             "url": "https://data.charlottenc.gov/resource/4c6h-k5xj.json", "params": {"$limit": 10000}}]},
    "GA": {"name": "Georgia", "abbr": "GA",
        "sources": [{"name": "Atlanta Traffic", "type": "traffic_cameras", "format": "socrata",
             "url": "https://data.atlantaga.gov/resource/nwr6-unue.json", "params": {"$limit": 10000}}]},
    "TN": {"name": "Tennessee", "abbr": "TN",
        "sources": [{"name": "Nashville Traffic", "type": "traffic_cameras", "format": "socrata",
             "url": "https://data.nashville.gov/resource/7wyr-kwcb.json", "params": {"$limit": 10000}}]},
    "NV": {"name": "Nevada", "abbr": "NV",
        "sources": [{"name": "Las Vegas Traffic", "type": "traffic_cameras", "format": "socrata",
             "url": "https://opendata.lasvegasnevada.gov/resource/khws-xc7j.json", "params": {"$limit": 10000}}]},
    "MN": {"name": "Minnesota", "abbr": "MN",
        "sources": [{"name": "Minneapolis Traffic", "type": "traffic_cameras", "format": "socrata",
             "url": "https://opendata.minneapolismn.gov/resource/5z4p-y7p8.json", "params": {"$limit": 10000}}]},
    "WI": {"name": "Wisconsin", "abbr": "WI",
        "sources": [{"name": "Milwaukee Traffic", "type": "traffic_cameras", "format": "socrata",
             "url": "https://data.milwaukee.gov/resource/t7hj-xidi.json", "params": {"$limit": 10000}}]},
    "MO": {"name": "Missouri", "abbr": "MO",
        "sources": [{"name": "Kansas City Traffic", "type": "traffic_cameras", "format": "socrata",
             "url": "https://data.kcmo.org/resource/3i6v-nh4w.json", "params": {"$limit": 10000}}]},
    "AZ": {"name": "Arizona", "abbr": "AZ",
        "sources": [{"name": "Phoenix Traffic", "type": "traffic_cameras", "format": "socrata",
             "url": "https://data.phoenix.gov/resource/k6s7-xqyt.json", "params": {"$limit": 10000}}]},
    "NM": {"name": "New Mexico", "abbr": "NM",
        "sources": [{"name": "Albuquerque Traffic", "type": "traffic_cameras", "format": "socrata",
             "url": "https://data.cabq.gov/resource/c2w4-ynh3.json", "params": {"$limit": 10000}}]},
    "KY": {"name": "Kentucky", "abbr": "KY",
        "sources": [{"name": "Louisville Traffic", "type": "traffic_cameras", "format": "socrata",
             "url": "https://data.louisvilleky.gov/resource/t5f3-x8bg.json", "params": {"$limit": 10000}}]},
    "OK": {"name": "Oklahoma", "abbr": "OK",
        "sources": [{"name": "OKC Traffic", "type": "traffic_cameras", "format": "socrata",
             "url": "https://data.okc.gov/resource/ra8q-rs8p.json", "params": {"$limit": 10000}}]},
    "OR": {"name": "Oregon", "abbr": "OR",
        "sources": [{"name": "Portland Traffic", "type": "traffic_cameras", "format": "socrata",
             "url": "https://data.portlandoregon.gov/resource/ht7n-3b6i.json", "params": {"$limit": 10000}}]},
    "UT": {"name": "Utah", "abbr": "UT",
        "sources": [{"name": "Salt Lake Traffic", "type": "traffic_cameras", "format": "socrata",
             "url": "https://data.slcgov.com/resource/q8qr-5i4h.json", "params": {"$limit": 10000}}]},
    "VA": {"name": "Virginia", "abbr": "VA",
        "sources": [{"name": "Fairfax Traffic", "type": "traffic_cameras", "format": "socrata",
             "url": "https://data.fairfaxcounty.gov/resource/5k7d-5v6c.json", "params": {"$limit": 10000}}]},
    "FL": {"name": "Florida", "abbr": "FL",
        "sources": [{"name": "Miami Traffic", "type": "traffic_cameras", "format": "socrata",
             "url": "https://data.miamidade.gov/resource/traffic-signals.json", "params": {"$limit": 10000}}]},
    "IN": {"name": "Indiana", "abbr": "IN",
        "sources": [{"name": "Indianapolis Traffic", "type": "traffic_cameras", "format": "socrata",
             "url": "https://data.indy.gov/resource/7k4n-bfj7.json", "params": {"$limit": 10000}}]},
    "SC": {"name": "South Carolina", "abbr": "SC",
        "sources": [{"name": "Charleston Traffic", "type": "traffic_cameras", "format": "socrata",
             "url": "https://data.charleston-sc.gov/resource/m4n9-75ah.json", "params": {"$limit": 10000}}]},
    "AL": {"name": "Alabama", "abbr": "AL",
        "sources": [{"name": "Birmingham Traffic", "type": "traffic_cameras", "format": "socrata",
             "url": "https://data.birminghamal.gov/resource/x7yi-6k5j.json", "params": {"$limit": 10000}}]},
}

class CameraDownloader:
    def __init__(self, output_dir: str = "./output"):
        self.output_dir = output_dir
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
        })
        self.all_cameras: List[TrafficCamera] = []
        self.stats = {'total': 0, 'by_state': {}, 'by_type': {}, 'errors': []}
        os.makedirs(output_dir, exist_ok=True)
        os.makedirs(f"{output_dir}/by_state", exist_ok=True)

    def parse_coords(self, item: Dict) -> tuple:
        """Koordinatları güvenli şekilde parse et"""
        lat, lng = None, None

        # Direkt alanlar
        lat_val = item.get('latitude') or item.get('lat') or item.get('Latitude')
        lng_val = item.get('longitude') or item.get('lng') or item.get('lon') or item.get('Longitude')

        if lat_val and lng_val:
            try:
                lat = float(lat_val)
                lng = float(lng_val)
                return lat, lng
            except:
                pass

        # Location objesi
        loc = item.get('location')
        if loc and isinstance(loc, dict):
            lat_val = loc.get('latitude') or loc.get('lat')
            lng_val = loc.get('longitude') or loc.get('lng') or loc.get('lon')
            if lat_val and lng_val:
                try:
                    lat = float(lat_val)
                    lng = float(lng_val)
                    return lat, lng
                except:
                    pass

        # Point
        pt = item.get('point')
        if pt:
            if isinstance(pt, dict):
                lat_val = pt.get('latitude') or pt.get('lat')
                lng_val = pt.get('longitude') or pt.get('lng')
                if lat_val and lng_val:
                    try:
                        return float(lat_val), float(lng_val)
                    except:
                        pass
            elif isinstance(pt, (list, tuple)) and len(pt) >= 2:
                try:
                    return float(pt[1]), float(pt[0])  # [lng, lat]
                except:
                    pass

        return None, None

    def fetch_socrata(self, source: Dict, state: str) -> List[TrafficCamera]:
        cameras = []
        try:
            url = source['url']
            params = source.get('params', {})
            print(f"    📡 {url.split('/')[-1][:50]}...")

            response = self.session.get(url, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()

            if isinstance(data, list):
                print(f"       → {len(data)} records")
                for i, item in enumerate(data):
                    lat, lng = self.parse_coords(item)

                    if not lat or not lng:
                        continue
                    if lat == 0 or lng == 0:
                        continue
                    if abs(lat) > 90 or abs(lng) > 180:
                        continue

                    road = item.get('address') or item.get('intersection') or item.get('street') or item.get('location_description')
                    cam_id = item.get('camera_id') or item.get('id') or item.get('ID') or f"{state}_{i}"

                    cameras.append(TrafficCamera(
                        source=source['name'][:50],
                        source_id=f"socrata_{state}_{cam_id}",
                        latitude=lat,
                        longitude=lng,
                        camera_type=source.get('type', 'traffic_cameras'),
                        speed_limit=None,
                        road_name=str(road) if road else None,
                        direction=item.get('direction') or item.get('approach'),
                        city=item.get('city'),
                        state=state,
                        country='US',
                        verified=True
                    ))

            print(f"       ✓ {len(cameras)} cameras")

        except Exception as e:
            print(f"       ✗ Error: {str(e)[:50]}")
            self.stats['errors'].append({'state': state, 'source': source['name'], 'error': str(e)})

        return cameras

    def fetch_arcgis(self, source: Dict, state: str) -> List[TrafficCamera]:
        cameras = []
        try:
            url = source['url']
            params = source.get('params', {})
            print(f"    📡 ArcGIS...")

            response = self.session.get(url, params=params, timeout=30)
            response.raise_for_status()
            data = response.json()

            features = data.get('features', [])
            print(f"       → {len(features)} features")

            for i, feature in enumerate(features):
                props = feature.get('properties', {})
                geom = feature.get('geometry', {})

                if geom.get('type') != 'Point':
                    continue

                coords = geom.get('coordinates', [])
                if len(coords) < 2:
                    continue

                lng, lat = float(coords[0]), float(coords[1])

                if lat == 0 or lng == 0 or abs(lat) > 90 or abs(lng) > 180:
                    continue

                cam_id = props.get('ID') or props.get('OBJECTID') or props.get('GIS_ID') or f"{state}_{i}"
                road = props.get('ROADNAME') or props.get('ROAD') or props.get('STREET') or props.get('name')

                cameras.append(TrafficCamera(
                    source=source['name'][:50],
                    source_id=f"geojson_{state}_{cam_id}",
                    latitude=lat,
                    longitude=lng,
                    camera_type=source.get('type', 'traffic_cameras'),
                    speed_limit=None,
                    road_name=str(road) if road else None,
                    direction=props.get('ROADDIR') or props.get('DIRECTION'),
                    city=props.get('CITY'),
                    state=state,
                    country='US',
                    verified=True
                ))

            print(f"       ✓ {len(cameras)} cameras")

        except Exception as e:
            print(f"       ✗ Error: {str(e)[:50]}")
            self.stats['errors'].append({'state': state, 'source': source['name'], 'error': str(e)})

        return cameras

    def download_state(self, state_key: str):
        state_data = US_STATES_DATA.get(state_key)
        if not state_data:
            return

        print(f"\n📍 {state_data['name']} ({state_data['abbr']})")
        state_cameras = []

        for source in state_data['sources']:
            print(f"   → {source['name']}")

            if source.get('format') == 'socrata':
                cameras = self.fetch_socrata(source, state_data['abbr'])
            elif source.get('format') == 'arcgis':
                cameras = self.fetch_arcgis(source, state_data['abbr'])
            else:
                cameras = []

            state_cameras.extend(cameras)
            time.sleep(0.5)

        if state_cameras:
            self.all_cameras.extend(state_cameras)
            self.stats['by_state'][state_data['abbr']] = self.stats['by_state'].get(state_data['abbr'], 0) + len(state_cameras)

            with open(f"{self.output_dir}/by_state/{state_data['abbr']}_cameras.json", 'w', encoding='utf-8') as f:
                json.dump([asdict(c) for c in state_cameras], f, indent=2, default=str)

    def save_all(self):
        with open(f"{self.output_dir}/us_all_cameras.json", 'w', encoding='utf-8') as f:
            json.dump([asdict(c) for c in self.all_cameras], f, indent=2, default=str)

        self.stats['total'] = len(self.all_cameras)
        for cam in self.all_cameras:
            self.stats['by_type'][cam.camera_type] = self.stats['by_type'].get(cam.camera_type, 0) + 1

        with open(f"{self.output_dir}/stats.json", 'w') as f:
            json.dump(self.stats, f, indent=2)

        self.generate_sql()
        print(f"\n💾 Total: {len(self.all_cameras)} cameras saved")

    def generate_sql(self):
        with open(f"{self.output_dir}/supabase_import.sql", 'w', encoding='utf-8') as f:
            f.write(f"-- US Traffic Cameras - {datetime.now().isoformat()}\n")
            f.write(f"-- Total: {len(self.all_cameras)} cameras\n\n")

            for i, cam in enumerate(self.all_cameras[:5000]):
                speed = cam.speed_limit if cam.speed_limit else 'NULL'
                road = f"'{cam.road_name.replace(chr(39), chr(39)+chr(39))}'" if cam.road_name else 'NULL'

                if i == 0:
                    f.write("INSERT INTO traffic_cameras (source, source_id, latitude, longitude, camera_type, speed_limit, road_name, state, country, verified) VALUES\n")
                else:
                    f.write(",\n")

                f.write(f"('{cam.source}', '{cam.source_id}', {cam.latitude}, {cam.longitude}, '{cam.camera_type}', {speed}, {road}, '{cam.state}', 'US', true)")

            f.write("\nON CONFLICT (source_id) DO NOTHING;\n")

        print(f"📝 SQL saved")

    def run(self, states: List[str] = None):
        print("=" * 70)
        print("🚀 US 50 STATES TRAFFIC CAMERA DOWNLOADER")
        print("=" * 70)

        if states:
            state_keys = [s for s in US_STATES_DATA.keys() if s in states or US_STATES_DATA[s]['abbr'] in states]
        else:
            state_keys = list(US_STATES_DATA.keys())

        print(f"📊 {len(state_keys)} state(s) to download\n")

        for state_key in state_keys:
            self.download_state(state_key)
            time.sleep(1)

        self.save_all()
        print("\n✅ Done!")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='US Traffic Camera Downloader')
    parser.add_argument('--output', '-o', default='./output')
    parser.add_argument('--states', '-s', nargs='+')
    parser.add_argument('--test', '-t', action='store_true')

    args = parser.parse_args()
    downloader = CameraDownloader(output_dir=args.output)

    if args.test:
        downloader.run(states=['IL', 'MD', 'NY', 'DC', 'CA'])
    elif args.states:
        downloader.run(states=args.states)
    else:
        downloader.run()
