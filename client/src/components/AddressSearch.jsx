import { useState, useEffect } from 'react';

export default function AddressSearch({ onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        // FREE - uses OpenStreetMap, biased to South Africa
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=za&limit=5&addressdetails=1`
        );
        const data = await res.json();
        setResults(data);
        setShow(true);
      } catch (e) { console.error(e); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (place) => {
    setQuery(place.display_name);
    setShow(false);
    onSelect({
      address: place.display_name,
      lat: parseFloat(place.lat),
      lng: parseFloat(place.lon),
      raw: place
    });
  };

  const highlightMatch = (text) => {
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.substring(0, idx)}
        <b style={{ color: '#E67E22' }}>{text.substring(idx, idx + query.length)}</b>
        {text.substring(idx + query.length)}
      </>
    );
  };

  return (
    <div style={{ position: 'relative', width: '100%', fontFamily: 'Inter, sans-serif' }}>
      <label style={{ fontWeight: 700, fontSize: '16px', display: 'block' }}>Address search</label>
      <p style={{ fontSize: '14px', color: '#666', margin: '2px 0 8px 0' }}>
        Enter your street name or house number to find your full address.
      </p>
      
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}>🔍</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. 123 Main Road"
          style={{
            width: '100%',
            padding: '14px 14px 14px 38px',
            border: '1.5px solid #111',
            borderRadius: '8px',
            fontSize: '15px',
            outline: 'none'
          }}
        />
      </div>

      {show && results.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: '#fff',
          border: '1px solid #ddd',
          borderTop: 'none',
          borderRadius: '0 0 8px 8px',
          boxShadow: '0 8px 20px rgba(0,0,0,0.1)',
          zIndex: 1000,
          overflow: 'hidden'
        }}>
          {results.map((place) => (
            <div
              key={place.place_id}
              onClick={() => handleSelect(place)}
              style={{
                padding: '14px 16px',
                cursor: 'pointer',
                borderBottom: '1px solid #f0f0f0',
                fontSize: '14px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#f9f9f9'}
              onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
            >
              {highlightMatch(place.display_name)}
            </div>
          ))}
          <div style={{
            padding: '10px',
            textAlign: 'center',
            fontSize: '13px',
            color: '#888',
            background: '#fafafa'
          }}>
            Can't find the address? <span style={{ color: '#E67E22', cursor: 'pointer' }}>Please enter it manually {'>'}</span>
          </div>
        </div>
      )}
    </div>
  );
}