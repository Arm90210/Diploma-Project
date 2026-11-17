#!/usr/bin/env python3
"""Builds the MusicSphere world map from Natural Earth (public domain).

Usage:
  1. Download ne_50m_admin_0_countries.geojson from
     https://github.com/nvkelso/natural-earth-vector/tree/master/geojson
  2. python3 scripts/build-world-map.py path/to/ne_50m_admin_0_countries.geojson

Writes:
  apps/web/public/geo/countries.json          projected SVG paths + marker points
  apps/api/src/modules/analytics/countries.ts country codes and names for the Region table

Projection: Equal Earth (Šavrič, Patterson & Jenny, 2018), an equal-area projection
suited to thematic world maps. Outlines are simplified (Douglas–Peucker, 0.35 px) and
rounded to 0.1 px. Antarctica is omitted. Features without an ISO 3166-1 alpha-2 code
(e.g. Somaliland, N. Cyprus) are drawn but not selectable. Boundaries follow Natural
Earth's de-facto depiction and imply no political position.
"""
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WIDTH = 1000.0
TOLERANCE = 0.35
MIN_RING_AREA = 0.6  # px², smaller islands are dropped unless they are a country's largest ring
NAME_FIXES = {
    'Kingdom of eSwatini': 'Eswatini', 'Republic of Cabo Verde': 'Cabo Verde', 'Federated States of Micronesia': 'Micronesia',
    'Dem. Rep. Korea': 'North Korea', 'Republic of Korea': 'South Korea', 'Lao PDR': 'Laos', 'Russian Federation': 'Russia',
    'Brunei Darussalam': 'Brunei', 'Czech Republic': 'Czechia',
}

A1, A2, A3, A4 = 1.340264, -0.081106, 0.000893, 0.003796
M = math.sqrt(3) / 2


def equal_earth(lon, lat):
    lam, phi = math.radians(lon), math.radians(lat)
    theta = math.asin(M * math.sin(phi))
    t2 = theta * theta
    t6 = t2 * t2 * t2
    x = 2 * math.sqrt(3) * lam * math.cos(theta) / (3 * (9 * A4 * t6 * t2 + 7 * A3 * t6 + 3 * A2 * t2 + A1))
    y = theta * (A4 * t6 * t2 + A3 * t6 + A2 * t2 + A1)
    return x, -y  # SVG y grows downwards


def simplify(points, tolerance):
    if len(points) < 4:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        (x1, y1), (x2, y2) = points[first], points[last]
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy) or 1e-12
        best, index = -1.0, -1
        for i in range(first + 1, last):
            x0, y0 = points[i]
            distance = abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / length
            if distance > best:
                best, index = distance, i
        if best > tolerance:
            keep[index] = True
            stack += [(first, index), (index, last)]
    return [p for p, k in zip(points, keep) if k]


def simplify_ring(ring, tolerance):
    # A closed ring starts and ends at the same point, which gives Douglas–Peucker a zero-length
    # baseline. Split it at the vertex farthest from the start and simplify both halves.
    if len(ring) < 4:
        return ring
    x0, y0 = ring[0]
    far = max(range(len(ring)), key=lambda i: (ring[i][0] - x0) ** 2 + (ring[i][1] - y0) ** 2)
    if far in (0, len(ring) - 1):
        return ring
    return simplify(ring[:far + 1], tolerance)[:-1] + simplify(ring[far:], tolerance)


def area_and_centroid(ring):
    area = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
        cross = x0 * y1 - x1 * y0
        area += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    area /= 2
    if abs(area) < 1e-12:
        xs, ys = zip(*ring)
        return 0.0, (sum(xs) / len(xs), sum(ys) / len(ys))
    return abs(area), (cx / (6 * area), cy / (6 * area))


def main(source):
    features = json.loads(Path(source).read_text())['features']
    raw = []
    for feature in features:
        props = feature['properties']
        if props.get('ISO_A2_EH') == 'AQ' or props.get('NAME') == 'Antarctica':
            continue
        code = props.get('ISO_A2_EH')
        code = code if isinstance(code, str) and len(code) == 2 and code.isalpha() else None
        name = NAME_FIXES.get(props.get('NAME_LONG') or '', props.get('NAME_LONG') or props.get('NAME'))
        geometry = feature['geometry']
        polygons = geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else [geometry['coordinates']]
        rings = [[equal_earth(lon, lat) for lon, lat in ring] for polygon in polygons for ring in polygon]
        raw.append({'code': code, 'name': name, 'rings': rings, 'type': props.get('TYPE')})

    xs = [x for item in raw for ring in item['rings'] for x, _ in ring]
    ys = [y for item in raw for ring in item['rings'] for _, y in ring]
    min_x, max_x, min_y, max_y = min(xs), max(xs), min(ys), max(ys)
    scale = WIDTH / (max_x - min_x)
    height = round((max_y - min_y) * scale, 1)

    merged = {}
    for item in raw:
        key = item['code'] or f"none:{item['name']}"
        entry = merged.setdefault(key, {'code': item['code'], 'name': item['name'], 'rings': [], 'main': None})
        # Same code (e.g. Australia and its dependencies): keep the sovereign country's name.
        if item['type'] in ('Country', 'Sovereign country', 'Sovereignty') or entry['main'] is None:
            entry['name'] = item['name'] if entry['main'] is None or item['type'] in ('Country', 'Sovereign country') else entry['name']
            entry['main'] = entry['main'] or item['type']
        entry['rings'] += [[((x - min_x) * scale, (y - min_y) * scale) for x, y in ring] for ring in item['rings']]

    countries = []
    for entry in merged.values():
        measured = sorted(((area_and_centroid(ring), ring) for ring in entry['rings']), key=lambda r: -r[0][0])
        largest_centroid = measured[0][0][1]
        parts = []
        for index, ((area, _), ring) in enumerate(measured):
            if index > 0 and area < MIN_RING_AREA:
                continue
            points = simplify_ring(ring, TOLERANCE)
            if len(points) < 3:
                points = ring[:3] if len(ring) >= 3 else ring
            parts.append('M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in points) + 'Z')
        countries.append({'code': entry['code'], 'name': entry['name'], 'd': ''.join(parts), 'cx': round(largest_centroid[0], 1), 'cy': round(largest_centroid[1], 1)})
    countries.sort(key=lambda c: (c['name'] or '').lower())

    web = ROOT / 'apps/web/public/geo/countries.json'
    web.parent.mkdir(parents=True, exist_ok=True)
    web.write_text(json.dumps({
        'source': 'Natural Earth 1:50m Admin 0 – Countries (public domain), Equal Earth projection',
        'width': WIDTH, 'height': height, 'countries': countries,
    }, ensure_ascii=False, separators=(',', ':')))

    selectable = [c for c in countries if c['code']]
    lines = ['// Generated by scripts/build-world-map.py from Natural Earth (public domain). Do not edit by hand.',
             '// ISO 3166-1 alpha-2 codes and English names of the countries drawn on the MusicSphere map.',
             'export const COUNTRIES: { code: string; name: string }[] = [']
    lines += [f"  {{ code: '{c['code']}', name: {json.dumps(c['name'], ensure_ascii=False)} }}," for c in selectable]
    lines.append('];')
    api = ROOT / 'apps/api/src/modules/analytics/countries.ts'
    api.write_text('\n'.join(lines) + '\n')
    print(f'{len(countries)} shapes ({len(selectable)} selectable), {web.stat().st_size // 1024} KiB → {web.relative_to(ROOT)}; {api.relative_to(ROOT)}')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
