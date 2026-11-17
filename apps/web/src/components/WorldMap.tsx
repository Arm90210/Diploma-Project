import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon } from './Icon';

// Interactive world map (Natural Earth 1:50m, public domain; Equal Earth projection; built by
// scripts/build-world-map.py). Countries are coloured by the parent; clicking selects one.
// Drag to pan, buttons to zoom; markers keep small countries clickable. The map is a visual
// aid: every selection is also available from an accessible list next to it.
type Shape = { code: string | null; name: string; d: string; cx: number; cy: number };
type MapData = { width: number; height: number; countries: Shape[] };
let cache: Promise<MapData> | null = null;
const loadMap = () => cache ??= fetch('/geo/countries.json').then(response => { if (!response.ok) throw new Error('map'); return response.json() as Promise<MapData>; });
export const HIDDEN_FILL = '#332c3a';

function bounds(d: string) {
  const numbers = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i + 1 < numbers.length; i += 2) { minX = Math.min(minX, numbers[i]!); maxX = Math.max(maxX, numbers[i]!); minY = Math.min(minY, numbers[i + 1]!); maxY = Math.max(maxY, numbers[i + 1]!); }
  return { minX, minY, maxX, maxY };
}

export function WorldMap({ fill, selected, onSelect, markers = [], label, describe }: {
  fill: (code: string) => string | undefined;          // undefined → hidden / no data
  selected: string | null;
  onSelect: (code: string) => void;
  markers?: string[];                                   // codes that get a clickable dot (only drawn for small countries)
  label: string;
  describe?: (code: string, name: string) => string;    // hover text
}) {
  const [map, setMap] = useState<MapData | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState({ x: 0, y: 0, w: 1000 });
  const [hover, setHover] = useState<{ code: string; name: string } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; view: { x: number; y: number; w: number }; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => { loadMap().then(data => { setMap(data); setView({ x: 0, y: 0, w: data.width }); }).catch(() => setFailed(true)); }, []);

  const width = map?.width ?? 1000, height = map?.height ?? 445;
  const ratio = height / width;
  const clamp = (next: { x: number; y: number; w: number }) => {
    const w = Math.min(width, Math.max(width / 14, next.w));
    return { w, x: Math.min(width - w, Math.max(0, next.x)), y: Math.min(height - w * ratio, Math.max(0, next.y)) };
  };
  const zoom = (factor: number) => setView(current => { const w = current.w / factor; return clamp({ w, x: current.x + (current.w - w) / 2, y: current.y + (current.w - w) * ratio / 2 }); });
  // Selecting a small country (e.g. from the list) zooms to it.
  useEffect(() => {
    if (!map || !selected) return;
    const shape = map.countries.find(country => country.code === selected);
    if (!shape) return;
    const box = bounds(shape.d);
    const span = Math.max(box.maxX - box.minX, (box.maxY - box.minY) / ratio);
    if (span > width / 8) return;
    setView(current => current.w <= span * 6 ? current : clamp({ w: Math.max(span * 5, width / 12), x: shape.cx - Math.max(span * 5, width / 12) / 2, y: shape.cy - Math.max(span * 5, width / 12) * ratio / 2 }));
  }, [map, selected]);

  // Dots only where a country is too small to click comfortably (e.g. Armenia, Iceland, Malta).
  const smallCountries = useMemo(() => new Set((map?.countries ?? []).filter(country => { const box = bounds(country.d); return country.code && Math.max(box.maxX - box.minX, box.maxY - box.minY) < (map?.width ?? 1000) / 45; }).map(country => country.code!)), [map]);
  const toUnits = (pixels: number) => { const rect = svg.current?.getBoundingClientRect(); return rect && rect.width ? pixels * (view.w / rect.width) : 0; };
  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => { drag.current = { x: event.clientX, y: event.clientY, view, moved: false }; };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const start = drag.current;
    if (!start) return;
    const dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < 4) return;
    if (!start.moved) { start.moved = true; svg.current?.setPointerCapture(event.pointerId); }
    setView(clamp({ w: start.view.w, x: start.view.x - toUnits(dx), y: start.view.y - toUnits(dy) }));
  };
  const onPointerUp = () => { suppressClick.current = !!drag.current?.moved; drag.current = null; };
  const choose = (code: string | null) => { if (code && !suppressClick.current) onSelect(code); suppressClick.current = false; };

  if (failed) return <p className="muted small" role="alert">The map could not be loaded. Use the country list instead.</p>;
  if (!map) return <div className="world-map loading" role="status" aria-label="Loading map"/>;
  const markerRadius = 5 * view.w / width;
  const chosen = selected ? map.countries.find(country => country.code === selected) : undefined;
  const hoverText = hover ? (describe ? describe(hover.code, hover.name) : hover.name) : '';
  return <div className="world-map">
    <svg ref={svg} viewBox={`${view.x} ${view.y} ${view.w} ${view.w * ratio}`} role="img" aria-label={label}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={() => { drag.current = null; setHover(null); }}>
      <rect x={0} y={0} width={width} height={height} className="map-ocean"/>
      {map.countries.map(country => <path key={country.code ?? country.name} d={country.d}
        fill={country.code ? fill(country.code) ?? HIDDEN_FILL : '#27222c'}
        className={country.code ? 'map-country' : 'map-country disabled'}
        onPointerEnter={() => country.code && setHover({ code: country.code, name: country.name })}
        onClick={() => choose(country.code)}/>)}
      {chosen && <path d={chosen.d} className="map-selected" pointerEvents="none"/>}
      {markers.filter(code => smallCountries.has(code)).map(code => { const country = map.countries.find(item => item.code === code); return country && <circle key={code} cx={country.cx} cy={country.cy} r={code === selected ? markerRadius * 1.35 : markerRadius} className={`map-marker ${code === selected ? 'selected' : ''}`}
        fill={fill(code) ?? HIDDEN_FILL} onPointerEnter={() => setHover({ code, name: country.name })} onClick={() => choose(code)}/>; })}
    </svg>
    <div className="map-controls"><button className="icon-button" onClick={() => zoom(1.6)} aria-label="Zoom in">+</button><button className="icon-button" onClick={() => zoom(1 / 1.6)} aria-label="Zoom out">−</button><button className="icon-button" onClick={() => setView({ x: 0, y: 0, w: width })} aria-label="Show the whole world"><Icon name="globe" size={15}/></button></div>
    <p className="map-hover" aria-live="polite">{hoverText || 'Hover over a country for details · drag to move · click to select'}</p>
  </div>;
}
