import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import { calculateSpeed, getNearestPlace, formatTime } from '../utils';

// Custom ISS icon
const issIcon = L.divIcon({
  className: '',
  html: `<div style="font-size:28px;filter:drop-shadow(0 0 8px #3b82f6);animation:float 2s ease-in-out infinite;">🛸</div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
});

// ─── ISS Orbital Simulation Fallback ────────────────────────────────────────
// If all APIs fail, simulate ISS position using real orbital parameters.
// ISS orbital period ~92.68 min, inclination ~51.6°, altitude ~420 km.
function getSimulatedISS() {
  const now = Date.now() / 1000;
  const period = 92.68 * 60; // seconds
  const angle = ((now % period) / period) * 2 * Math.PI;
  const inclination = 51.6 * (Math.PI / 180);
  const lat = Math.asin(Math.sin(inclination) * Math.sin(angle)) * (180 / Math.PI);
  const lng = ((now / period) * 360 + Math.atan2(Math.cos(inclination) * Math.sin(angle), Math.cos(angle)) * (180 / Math.PI)) % 360;
  return { lat, lng: lng > 180 ? lng - 360 : lng, speed: 27600 + Math.sin(angle * 3) * 200, simulated: true };
}

export default function ISSTracker({ onDataUpdate }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const polylineRef = useRef(null);
  const intervalRef = useRef(null);
  const lastPosRef = useRef(null);
  const lastTimeRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [peopleError, setPeopleError] = useState(null);
  const [isSimulated, setIsSimulated] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [issData, setIssData] = useState({ lat: 0, lng: 0, speed: 0, place: '', positions: [], people: null });

  // Init map once
  useEffect(() => {
    if (mapInstanceRef.current) return;
    const map = L.map(mapRef.current, { zoomControl: true, attributionControl: true }).setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    mapInstanceRef.current = map;
    return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; } };
  }, []);

  const fetchISS = useCallback(async () => {
    let lat = 0, lng = 0, apiSpeed = 27600;
    let fetched = false;

    // 1. wheretheiss.at (CORS-enabled, most reliable)
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 5000);
      const r = await fetch('https://api.wheretheiss.at/v1/satellites/25544', { signal: controller.signal });
      clearTimeout(tid);
      if (r.ok) {
        const d = await r.json();
        if (d.latitude !== undefined) {
          lat = parseFloat(d.latitude);
          lng = parseFloat(d.longitude);
          apiSpeed = d.velocity ? d.velocity * 3.6 : apiSpeed;
          fetched = true;
        }
      }
    } catch {
      // Try the next ISS source.
    }

    // 2. open-notify via corsproxy.io
    if (!fetched) {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 5000);
        const r = await fetch('https://corsproxy.io/?https://api.open-notify.org/iss-now.json', { signal: controller.signal });
        clearTimeout(tid);
        if (r.ok) {
          const d = await r.json();
          if (d.iss_position) {
            lat = parseFloat(d.iss_position.latitude);
            lng = parseFloat(d.iss_position.longitude);
            fetched = true;
          }
        }
      } catch {
        // Try the next ISS source.
      }
    }

    // 3. allorigins proxy
    if (!fetched) {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 5000);
        const r = await fetch('https://api.allorigins.win/get?url=' + encodeURIComponent('https://api.open-notify.org/iss-now.json'), { signal: controller.signal });
        clearTimeout(tid);
        if (r.ok) {
          const outer = await r.json();
          const d = JSON.parse(outer.contents);
          if (d.iss_position) {
            lat = parseFloat(d.iss_position.latitude);
            lng = parseFloat(d.iss_position.longitude);
            fetched = true;
          }
        }
      } catch {
        // Try the next ISS source.
      }
    }

    // 4. thingproxy as last resort
    if (!fetched) {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 5000);
        const r = await fetch('https://thingproxy.freeboard.io/fetch/https://api.wheretheiss.at/v1/satellites/25544', { signal: controller.signal });
        clearTimeout(tid);
        if (r.ok) {
          const d = await r.json();
          if (d.latitude !== undefined) {
            lat = parseFloat(d.latitude);
            lng = parseFloat(d.longitude);
            apiSpeed = d.velocity ? d.velocity * 3.6 : apiSpeed;
            fetched = true;
          }
        }
      } catch {
        // Fall back to simulation below.
      }
    }

    // 5. ULTIMATE FALLBACK: orbital simulation — always works, clearly labeled
    if (!fetched) {
      const sim = getSimulatedISS();
      lat = sim.lat;
      lng = sim.lng;
      apiSpeed = sim.speed;
      setIsSimulated(true);
      setError(null);
    } else {
      setIsSimulated(false);
      setError(null);
    }

    const now = Date.now();
    let speed = apiSpeed;
    if (lastPosRef.current && lastTimeRef.current) {
      const timeDiff = (now - lastTimeRef.current) / 1000;
      if (timeDiff > 0) {
        const calcSpeed = calculateSpeed(lastPosRef.current, { lat, lng }, timeDiff);
        if (calcSpeed > 1000 && calcSpeed < 35000) speed = calcSpeed;
      }
    }

    lastPosRef.current = { lat, lng };
    lastTimeRef.current = now;

    const place = await getNearestPlace(lat, lng);

    setIssData(prev => {
      const newPositions = [...prev.positions, { lat, lng, time: formatTime(now), speed }].slice(-30);
      const newData = { lat, lng, speed, place, positions: newPositions, people: prev.people };
      onDataUpdate && onDataUpdate(newData);

      const map = mapInstanceRef.current;
      if (map) {
        const popup = `<b>ISS ${fetched ? 'Live' : 'Simulated'} Position</b><br>${lat.toFixed(3)}, ${lng.toFixed(3)}<br>${place}`;
        if (!markerRef.current) {
          markerRef.current = L.marker([lat, lng], { icon: issIcon })
            .addTo(map)
            .bindPopup(popup)
            .bindTooltip(`ISS: ${lat.toFixed(3)}, ${lng.toFixed(3)} · ${speed.toFixed(0)} km/h`);
          map.panTo([lat, lng]);
        } else {
          markerRef.current.setLatLng([lat, lng]);
          markerRef.current.setPopupContent(popup);
          markerRef.current.setTooltipContent(`ISS: ${lat.toFixed(3)}, ${lng.toFixed(3)} · ${speed.toFixed(0)} km/h`);
        }
        if (polylineRef.current) map.removeLayer(polylineRef.current);
        if (newPositions.length > 1) {
          const trajectory = newPositions.slice(-15);
          polylineRef.current = L.polyline(
            trajectory.map(p => [p.lat, p.lng]),
            { color: fetched ? '#3b82f6' : '#f59e0b', weight: 2, opacity: 0.8, dashArray: '5,5' }
          ).addTo(map);
        }
      }
      return newData;
    });

    setLoading(false);
  }, [onDataUpdate]);

  const fetchPeople = useCallback(async () => {
    let crewData = null;
    let lastError = null;

    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 5000);
      const r = await fetch('https://corquaid.github.io/international-space-station-APIs/JSON/people-in-space.json', { signal: controller.signal });
      clearTimeout(tid);
      if (r.ok) {
        const d = await r.json();
        if (d.people) {
          crewData = {
            number: d.number || d.people.length,
            people: d.people.map(p => ({
              name: p.name,
              craft: p.craft || p.spacecraft || (p.iss ? 'ISS' : 'Spacecraft'),
            })),
            source: 'People in Space JSON',
          };
        }
      }
    } catch (e) {
      lastError = e;
    }

    if (!crewData) {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 5000);
        const r = await fetch('https://api.open-notify.org/astros.json', { signal: controller.signal });
        clearTimeout(tid);
        if (r.ok) {
          const d = await r.json();
          if (d.people) crewData = d;
        }
      } catch (e) {
        lastError = e;
      }
    }

    if (!crewData) {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 5000);
        const r = await fetch('https://corsproxy.io/?https://api.open-notify.org/astros.json', { signal: controller.signal });
        clearTimeout(tid);
        if (r.ok) {
          const d = await r.json();
          if (d.people) crewData = d;
        }
      } catch (e) {
        lastError = e;
      }
    }

    if (!crewData) {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 5000);
        const r = await fetch('https://api.allorigins.win/get?url=' + encodeURIComponent('https://api.open-notify.org/astros.json'), { signal: controller.signal });
        clearTimeout(tid);
        if (r.ok) {
          const outer = await r.json();
          const d = JSON.parse(outer.contents);
          if (d.people) crewData = d;
        }
      } catch (e) {
        lastError = e;
      }
    }

    if (!crewData) {
      setPeopleError(lastError ? 'Unable to load astronaut data right now.' : 'Astronaut data is unavailable.');
      return;
    }
    setPeopleError(null);
    setIssData(prev => {
      const next = { ...prev, people: crewData };
      onDataUpdate?.(next);
      return next;
    });
  }, [onDataUpdate]);

  useEffect(() => {
    queueMicrotask(() => {
      fetchISS();
      fetchPeople();
    });
  }, [fetchISS, fetchPeople]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchISS, 15000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [autoRefresh, fetchISS]);

  const statCards = [
    { label: 'Latitude / Longitude', value: `${issData.lat.toFixed(3)}, ${issData.lng.toFixed(3)}`, color: 'accent', mono: true },
    { label: 'Speed', value: `${issData.speed.toFixed(0)} km/h`, color: 'green' },
    { label: 'Nearest Place', value: issData.place || '—', color: '' },
    { label: 'Tracked Positions', value: issData.positions.length, color: 'yellow' },
  ];

  return (
    <div className="card section">
      <div className="card-header">
        <div className="card-title">
          <span className="icon">🛸</span> ISS Live Tracking
          {isSimulated && (
            <span className="badge badge-yellow" style={{ marginLeft: 8, fontSize: 10 }}>
              Simulated fallback
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={fetchISS} disabled={loading}>
            {loading ? <span className="spinner" /> : '↻'} Refresh Now
          </button>
          <button
            className={`btn btn-sm ${autoRefresh ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setAutoRefresh(v => !v)}
          >
            Auto-Refresh: {autoRefresh ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {error && (
        <div className="error-state" style={{ marginBottom: 16 }}>
          <div className="error-icon">⚠️</div>
          <p>{error}</p>
          <button className="btn btn-primary btn-sm" onClick={fetchISS}>Retry</button>
        </div>
      )}

      {isSimulated && (
        <div style={{
          padding: '8px 14px', marginBottom: 12,
          background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: 8, fontSize: 12, color: 'var(--yellow)', display: 'flex', alignItems: 'center', gap: 6
        }}>
          Live ISS APIs are rate-limited or unavailable. Showing an approximate orbital simulation until a live source responds.
        </div>
      )}

      <div className="grid-4" style={{ marginBottom: 16 }}>
        {statCards.map((s, i) => (
          <div className="stat-card" key={i}>
            <div className="stat-label">{s.label}</div>
            {loading
              ? <div className="skeleton" style={{ height: 28, width: '80%' }} />
              : <div className={`stat-value ${s.color} ${s.mono ? 'mono' : ''}`} style={{ fontSize: 16 }}>{s.value}</div>
            }
          </div>
        ))}
      </div>

      <div className="map-container">
        <div ref={mapRef} id="iss-map" />
      </div>

      {/* People in Space */}
      {peopleError && (
        <div className="error-state compact-error" style={{ marginTop: 16 }}>
          <p>{peopleError}</p>
          <button className="btn btn-primary btn-sm" onClick={fetchPeople}>Retry crew data</button>
        </div>
      )}

      {issData.people && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 16 }}>👨‍🚀</span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>People in Space Right Now</span>
            <span className="badge badge-blue">{issData.people.number}</span>
          </div>
          <div className="astronaut-list">
            {issData.people.people?.map((p, i) => (
              <div className="astronaut-tag" key={i}>
                <span>👤</span> {p.name}
                <span className="badge badge-green" style={{ marginLeft: 4 }}>{p.craft}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
