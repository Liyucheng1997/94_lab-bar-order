// 顾客端 / 商家端共用：酒杯线稿插画 + UI 图标
(function () {
  const STROKE = 'stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';
  const ICE = 'fill="rgba(255,255,255,.16)" stroke="rgba(255,255,255,.55)" stroke-width="1.2"';
  const bubbles = (pts) => pts.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="rgba(255,255,255,.55)"/>`).join('');

  const GLASSES = {
    highball: (t) => `
      <path d="M35.4 40 L36.8 85 Q37 88.5 40 88.5 L60 88.5 Q63 88.5 63.2 85 L64.6 40 Z" fill="${t}" opacity=".88"/>
      <rect x="41" y="45" width="11" height="11" rx="2" transform="rotate(-12 46 50)" ${ICE}/>
      <rect x="49" y="58" width="11" height="11" rx="2" transform="rotate(10 54 63)" ${ICE}/>
      <rect x="40" y="70" width="10" height="10" rx="2" transform="rotate(-4 45 75)" ${ICE}/>
      ${bubbles([[58, 50, 1.1], [44, 66, 0.9], [57, 79, 1.2]])}
      <path d="M58 10 L49 74" ${STROKE} opacity=".85"/>
      <path d="M34 22 L36 86 Q36 90.5 40.5 90.5 L59.5 90.5 Q64 90.5 64 86 L66 22" fill="none" ${STROKE}/>
      <circle cx="67" cy="24" r="8" fill="${t}" stroke="currentColor" stroke-width="1.6" opacity=".95"/>
      <path d="M67 16 V32 M59 24 H75 M61.5 18.5 L72.5 29.5 M72.5 18.5 L61.5 29.5" stroke="rgba(255,255,255,.55)" stroke-width="1"/>`,

    rocks: (t) => `
      <path d="M27.6 58 L29.3 81 L70.7 81 L72.4 58 Z" fill="${t}" opacity=".9"/>
      <rect x="38" y="50" width="23" height="23" rx="3.5" transform="rotate(-8 49.5 61.5)" ${ICE}/>
      ${bubbles([[33, 72, 1], [66, 66, 1.1]])}
      <path d="M26 44 L29 86 Q29.5 90.5 34 90.5 L66 90.5 Q70.5 90.5 71 86 L74 44" fill="none" ${STROKE}/>
      <path d="M30 82.5 H70" ${STROKE} opacity=".5"/>
      <path d="M61 46 Q70 35 81 41 Q73 47 63 49 Z" fill="#e08a3c" stroke="currentColor" stroke-width="1.4"/>`,

    coupe: (t) => `
      <path d="M22.5 39 Q25 59 50 59 Q75 59 77.5 39 Z" fill="${t}" opacity=".9"/>
      <path d="M24 40 Q40 43 76 40" stroke="rgba(255,255,255,.5)" stroke-width="1.2" fill="none"/>
      <path d="M20 33 Q22 62 50 62 Q78 62 80 33" fill="none" ${STROKE}/>
      <path d="M20 33 H80" ${STROKE} opacity=".35"/>
      <path d="M50 62 V86" ${STROKE}/>
      <path d="M35 89 Q50 84.5 65 89" fill="none" ${STROKE}/>
      <path d="M71 26 Q79 22 83 30 Q78 33 74 34" fill="none" stroke="#e8c650" stroke-width="2.4" stroke-linecap="round"/>`,

    martini: (t) => `
      <path d="M24.5 31.5 L50 56 L75.5 31.5 Z" fill="${t}" opacity=".92"/>
      <path d="M25.5 32 H74.5" stroke="#e8d3b0" stroke-width="3.2" stroke-linecap="round" opacity=".75"/>
      <ellipse cx="44" cy="31" rx="3.2" ry="2" fill="#2a1a10" stroke="currentColor" stroke-width="1"/>
      <ellipse cx="50.5" cy="30" rx="3.2" ry="2" fill="#2a1a10" stroke="currentColor" stroke-width="1"/>
      <ellipse cx="57" cy="31" rx="3.2" ry="2" fill="#2a1a10" stroke="currentColor" stroke-width="1"/>
      <path d="M17 25 L50 58 L83 25" fill="none" ${STROKE}/>
      <path d="M17 25 H83" ${STROKE} opacity=".35"/>
      <path d="M50 58 V86" ${STROKE}/>
      <path d="M35 89 Q50 84.5 65 89" fill="none" ${STROKE}/>`,

    pint: (t) => `
      <path d="M33.3 30 L36 85.5 L64 85.5 L66.7 30 Z" fill="${t}" opacity=".9"/>
      ${bubbles([[42, 50, 1], [55, 42, 1.2], [47, 66, 0.9], [59, 72, 1.1], [44, 78, 1]])}
      <path d="M32.7 31 Q29 22 36 19.5 Q40 11 48 15.5 Q54 9.5 61 15 Q70 14 67.3 31 Z" fill="#f4ead7" stroke="currentColor" stroke-width="1.4"/>
      <path d="M32 16 L35 86 Q35.5 90.5 40 90.5 L60 90.5 Q64.5 90.5 65 86 L68 16" fill="none" ${STROKE}/>`,

    bottle: (t) => `
      <path d="M38 46 Q38 38 44.5 33 L44.5 18 L55.5 18 L55.5 33 Q62 38 62 46 L62 86 Q62 90.5 57.5 90.5 L42.5 90.5 Q38 90.5 38 86 Z" fill="${t}" opacity=".7"/>
      <rect x="38" y="56" width="24" height="17" fill="#f4ead7" opacity=".9"/>
      <path d="M43 62 H57 M45 67 H55" stroke="${t}" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M38 46 Q38 38 44.5 33 L44.5 18 L55.5 18 L55.5 33 Q62 38 62 46 L62 86 Q62 90.5 57.5 90.5 L42.5 90.5 Q38 90.5 38 86 Z" fill="none" ${STROKE}/>
      <rect x="43.5" y="12.5" width="13" height="5.5" rx="1.2" fill="currentColor" opacity=".9"/>
      <path d="M48 13 Q52 4 60 8 Q56 13 51 14" fill="#9ccf6a" stroke="currentColor" stroke-width="1.2"/>`,

    bowl: (t) => `
      <circle cx="31" cy="54" r="7.5" fill="${t}" stroke="rgba(0,0,0,.25)"/>
      <circle cx="42" cy="47" r="8.5" fill="${t}" stroke="rgba(0,0,0,.25)"/>
      <circle cx="57" cy="48" r="8.5" fill="${t}" stroke="rgba(0,0,0,.25)"/>
      <circle cx="69" cy="54" r="7.5" fill="${t}" stroke="rgba(0,0,0,.25)"/>
      <circle cx="49.5" cy="55" r="7" fill="${t}" stroke="rgba(0,0,0,.25)"/>
      <circle cx="40" cy="44" r="2" fill="rgba(255,255,255,.4)"/>
      <circle cx="55" cy="45" r="2" fill="rgba(255,255,255,.4)"/>
      <path d="M17 56 Q19 84 50 84 Q81 84 83 56 Z" fill="#221c16" ${STROKE}/>
      <path d="M24 64 Q50 70 76 64" stroke="rgba(255,255,255,.12)" stroke-width="1.5" fill="none"/>
      <path d="M40 88 H60" ${STROKE}/>`,

    plate: (t) => `
      <ellipse cx="50" cy="70" rx="37" ry="13" fill="#221c16" ${STROKE}/>
      <ellipse cx="50" cy="69" rx="26" ry="8" fill="none" stroke="currentColor" stroke-width="1" opacity=".35"/>
      <ellipse cx="40" cy="60" rx="11" ry="6" transform="rotate(-22 40 60)" fill="${t}" stroke="rgba(0,0,0,.3)"/>
      <ellipse cx="59" cy="59" rx="11" ry="6" transform="rotate(18 59 59)" fill="${t}" stroke="rgba(0,0,0,.3)"/>
      <ellipse cx="50" cy="66" rx="11" ry="6" transform="rotate(-4 50 66)" fill="${t}" stroke="rgba(0,0,0,.3)"/>
      <path d="M36 57 Q40 55 44 57 M55 56 Q59 54 63 57" stroke="rgba(255,255,255,.35)" stroke-width="1.2" fill="none"/>
      <circle cx="30" cy="68" r="2" fill="#8fc46a"/><circle cx="70" cy="67" r="2" fill="#8fc46a"/><circle cx="66" cy="72" r="1.6" fill="#8fc46a"/>`,
  };

  const GLASS_NAMES = {
    highball: '高球杯', rocks: '古典杯', coupe: '碟形杯', martini: '马天尼杯',
    pint: '品脱杯', bottle: '瓶装', bowl: '小食碗', plate: '餐盘',
  };

  function drinkArt(glass, tint) {
    const fn = GLASSES[glass] || GLASSES.rocks;
    return `<svg viewBox="0 0 100 100" aria-hidden="true">${fn(tint || '#c9a46a')}</svg>`;
  }

  // 线性 UI 图标（24×24）
  const P = {
    bag: '<path d="M6 8h12l-1 12H7L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    bell: '<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    seat: '<path d="M7 11V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v5"/><path d="M5 11h14v4H5zM7 15v5M17 15v5"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    back: '<path d="m15 6-6 6 6 6"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    glass: '<path d="M6 4h12l-6 8-6-8Z"/><path d="M12 12v8M8.5 20h7"/>',
    shaker: '<path d="M8 9h8l-1 11H9L8 9Z"/><path d="M8.5 9 9 6h6l.5 3M10.5 6V4h3v2"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
    card: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h3"/>',
    water: '<path d="M12 3.5s6 6.5 6 10.5a6 6 0 0 1-12 0c0-4 6-10.5 6-10.5Z"/>',
    note: '<path d="M5 4h10l4 4v12H5V4Z"/><path d="M15 4v4h4M8 12h8M8 16h5"/>',
    trash: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>',
    printer: '<path d="M7 9V4h10v5"/><rect x="4" y="9" width="16" height="7" rx="1.5"/><path d="M7 14h10v6H7z"/>',
    orders: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    history: '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 4v4.5h4.5M12 8v4l3 2"/>',
    menu: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z"/><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6"/>',
    qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2M16 16h2v2"/>',
    chart: '<path d="M4 20h16"/><rect x="6" y="11" width="3" height="6" rx=".8"/><rect x="11" y="6" width="3" height="11" rx=".8"/><rect x="16" y="9" width="3" height="8" rx=".8"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7"/>',
    logout: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
    volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
    download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
    flame: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.3 2.4-5.4 3.6-8.3.8 1.6 1.3 2.7 2.6 3.4.3-2.6 1.3-4.6 3.3-6.4.2 3.2 3.5 6 3.5 10.6 0 3.9-2.6 6.9-6.5 6.9Z"/>',
  };

  function icon(name, size) {
    const s = size || 20;
    return `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
  }

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // 价格格式：整数不带小数
  function money(n) {
    const v = Math.round(Number(n) * 100) / 100;
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }

  window.BarUI = { drinkArt, icon, esc, money, GLASS_NAMES };
})();
