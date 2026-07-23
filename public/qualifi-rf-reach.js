// RF Reach tab ("cross-report" in DOM ids/CSS). Cross-product comparison
// charts built from raw LANforge text-csv-0.csv rows served by
// /api/rf-reach-data. Chart set by data regime:
//   boresight RvR (atten sweep, no rotation):
//     chart_rssi_heatmap_render, chart_tput_heatmap_render,
//     chart_iphone_bars_render, chart_tput_vs_atten_render,
//     chart_eirp_tput_deviation_render (paired EIRP | throughput bars)
//   rotation sweep (360deg_tx, atten + rotation):
//     chart_eirp_tput_deviation_azimuth_render,
//     chart_iphone_bars_rotation_render
//   antenna pattern (360deg_noatten, rotation only):
//     chart_polar_render (falls back to 360deg_tx at lowest atten)
// Cohort baseline = currently loaded server reports only: if the user loaded
// a report, they want to see it.

// U-NII subdivision derived locally from frequency_mhz. The server still emits
// the coarse band ('2.4' / '5L' / '5H' / '6') from band_classify(), but for the
// cross-report charts we want to (a) display friendlier labels and (b) treat
// DFS bands separately from non-DFS bands when comparing EIRP. Keys here are
// the canonical sort/group keys used inside this module.
const RF_REACH_UNII_ORDER = {
	'2.4':       0,
	'U-NII-1':   1,
	'U-NII-2A':  2,
	'U-NII-2C':  3,
	'U-NII-3':   4,
	'6':         5
};
const RF_REACH_UNII_DISPLAY = {
	'2.4':       '2.4 GHz',
	'U-NII-1':   '5 GHz U-NII-1',
	'U-NII-2A':  '5 GHz U-NII-2A (DFS)',
	'U-NII-2C':  '5 GHz U-NII-2C (DFS)',
	'U-NII-3':   '5 GHz U-NII-3',
	'6':         '6 GHz'
};
const RF_REACH_DFS_UNII = new Set(['U-NII-2A', 'U-NII-2C']);
// Filter chips operate on the fine unii_band (computed client-side from
// frequency), not the server's coarse band: the coarse 5L/5H split straddles
// the DFS boundary, so a coarse chip could never isolate DFS from non-DFS.
const RF_REACH_BAND_FILTERS = [
	{ key: '2.4',      label: '2.4G', dfs: false },
	{ key: 'U-NII-1',  label: 'U1',   dfs: false },
	{ key: 'U-NII-2A', label: 'U2A',  dfs: true },
	{ key: 'U-NII-2C', label: 'U2C',  dfs: true },
	{ key: 'U-NII-3',  label: 'U3',   dfs: false },
	{ key: '6',        label: '6G',   dfs: false }
];
const RF_REACH_BANDS_STORE_KEY = 'qualifi_rf_bands';
const RF_REACH_VENDOR_SLOTS_STORE_KEY = 'qualifi_rf_vendor_slots';
const RF_REACH_FOCUS_STORE_KEY = 'qualifi_rf_focus_product';
const RF_REACH_BASELINE_STORE_KEY = 'qualifi_rf_baseline';
const RF_REACH_DEEMPH = 'rgba(112, 112, 112, 0.55)';

// Atten window over which the EIRP-proxy median is taken, per coarse band.
// Lower bound (5 dB) is roughly where AGC stops saturating across the cohort.
// Upper bound varies by band because path loss + LPI EIRP caps push 6 GHz
// into the noise floor far sooner than 5 GHz, which itself reaches noise
// sooner than 2.4 GHz. Sample chamber sweeps cap at:
//   2.4 GHz: ~88-90 dB atten
//   5 GHz:   ~72 dB atten
//   6 GHz:   ~50-54 dB atten
// Per-band upper bounds keep all useful linear samples without admitting
// near-floor RSSI that would bias weaker devices' medians downward.
const RF_REACH_EIRP_WINDOW_BY_BAND = {
	'2.4': [5, 75],
	'5':   [5, 65],
	'6':   [5, 50]
};

function rf_reach_eirp_window_for(row) {
	if (row.band === '2.4') return RF_REACH_EIRP_WINDOW_BY_BAND['2.4'];
	if (row.band === '5L' || row.band === '5H') return RF_REACH_EIRP_WINDOW_BY_BAND['5'];
	if (row.band === '6') return RF_REACH_EIRP_WINDOW_BY_BAND['6'];
	return null;
}

function rf_reach_eirp_in_window(row) {
	const win = rf_reach_eirp_window_for(row);
	if (!win) return false;
	return row.atten_db >= win[0] && row.atten_db <= win[1];
}

// iPhone's WiFi status-bar icon has three arcs, so bars range 0..3. Thresholds
// align with Apple's documented -70 dBm WiFi roaming trigger and standard
// signal-quality bands. See metrics.py::iphone_bars_compute for the canonical
// definition; both must stay in sync.
const RF_REACH_BARS_THRESHOLDS = [-65, -75, -85];

// Sequential colorscales come from the shared theme layer (qualifi-theme.js):
// single hue each, light = high on the dark surface, distinct hues so the two
// heatmaps are not conflated when rendered side-by-side.
const RF_REACH_RSSI_COLORSCALE = RAMP_BLUE;
const RF_REACH_RSSI_ZRANGE = [-100, -20];
const RF_REACH_TPUT_COLORSCALE = RAMP_ORANGE;

// Step colorscale: each integer bar value maps to exactly one color block, no
// gradient between them. Boundaries at 1/6, 3/6, 5/6 are the midpoints between
// values 0,1,2,3 normalized to [0,1]. Colors are the reserved status scale
// (signal bars carry good/bad meaning, not series identity).
const RF_REACH_BARS_COLORSCALE = [
	[0.0,     BARS_COLORS[0]],
	[1.0 / 6, BARS_COLORS[0]],
	[1.0 / 6, BARS_COLORS[1]],
	[3.0 / 6, BARS_COLORS[1]],
	[3.0 / 6, BARS_COLORS[2]],
	[5.0 / 6, BARS_COLORS[2]],
	[5.0 / 6, BARS_COLORS[3]],
	[1.0,     BARS_COLORS[3]]
];

// Plotly draws to canvas/SVG and does NOT resolve CSS variables in font.family,
// so we read the design-token values at chart render time. The font tracks the
// font loader IIFE (Berkeley Mono if installed, IBM Plex Mono otherwise).
function rf_reach_css_var(name, fallback) {
	const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	return value || fallback || '';
}

function rf_reach_mono_font() {
	return rf_reach_css_var('--mono-font', "'IBM Plex Mono', 'SF Mono', monospace");
}

function rf_reach_palette() {
	return {
		text_primary: rf_reach_css_var('--text-primary', '#ffffff'),
		text_secondary: rf_reach_css_var('--text-secondary', '#a0a0a0'),
		text_tertiary: rf_reach_css_var('--text-tertiary', '#707070'),
		grid: rf_reach_css_var('--border-subtle', '#2a2a2a'),
		line: rf_reach_css_var('--border-default', '#333333'),
		zero_line: rf_reach_css_var('--border-strong', '#525252'),
		tooltip_bg: rf_reach_css_var('--bg-tooltip', '#1f1f1f'),
		accent: '#ffffff',
		danger: rf_reach_css_var('--accent-danger', '#ff3b30'),
		success: rf_reach_css_var('--accent-success', '#00c896')
	};
}

function rf_reach_axis_base() {
	const p = rf_reach_palette();
	const f = rf_reach_mono_font();
	return {
		color: p.text_secondary,
		gridcolor: p.grid,
		linecolor: p.line,
		zerolinecolor: p.zero_line,
		tickfont: { color: p.text_tertiary, family: f, size: 11 },
		automargin: true
	};
}

function rf_reach_title_font() {
	return {
		color: rf_reach_palette().text_primary,
		size: 14,
		family: rf_reach_mono_font()
	};
}

function rf_reach_colorbar_base() {
	const p = rf_reach_palette();
	return {
		tickfont: { color: p.text_tertiary, family: rf_reach_mono_font(), size: 10 },
		outlinecolor: p.line,
		outlinewidth: 1,
		thickness: 12,
		len: 0.85,
		x: 1.02
	};
}

function rf_reach_layout_base() {
	const p = rf_reach_palette();
	const f = rf_reach_mono_font();
	return {
		paper_bgcolor: 'transparent',
		plot_bgcolor: 'transparent',
		font: { color: p.text_secondary, family: f, size: 12 },
		margin: { l: 200, r: 80, t: 56, b: 60 },
		hoverlabel: {
			bgcolor: p.tooltip_bg,
			bordercolor: p.line,
			font: { color: p.text_primary, family: f, size: 12 }
		}
	};
}

// Plotly fires hover synchronously and gives no built-in dwell or
// per-point highlight. We layer both on top via plotly_hover/plotly_unhover:
// the .hoverlayer is hidden via a class on the chart div until the dwell
// timer (RF_REACH_HOVER_DWELL_MS) fires, then the tooltip appears together
// with a per-trace-type highlight (rect for heatmaps, marker outline for
// bars, marker enlargement for scatter/scatterpolar). Re-attach after every
// Plotly.newPlot - newPlot purges .on() listeners so there is no leak.
const RF_REACH_HOVER_DWELL_MS = 150;
const RF_REACH_HOVER_HIDDEN_CLASS = 'rf-hover-dwell-hidden';

function rf_reach_hover_xstep_compute(div) {
	const data = div.data;
	if (!data || !data.length || !data[0].x || data[0].x.length < 2) return 5;
	const step = data[0].x[1] - data[0].x[0];
	return Number.isFinite(step) && step > 0 ? step : 5;
}

function rf_reach_hover_target_key(p) {
	const t = p.data && p.data.type;
	if (t === 'heatmap') return `h|${p.curveNumber}|${p.pointNumber[0]}|${p.pointNumber[1]}`;
	if (t === 'bar') return `b|${p.curveNumber}|${p.pointNumber}`;
	if (t === 'scatterpolar') return `p|${p.curveNumber}|${p.pointIndex}`;
	if (t === 'scatter') return `s|${p.curveNumber}|${p.pointIndex}`;
	return null;
}

function rf_reach_hover_highlight_apply(div, p, state) {
	const t = p.data && p.data.type;
	if (!document.body.contains(div) || typeof Plotly === 'undefined') return;
	const palette = rf_reach_palette();
	try {
		if (t === 'heatmap') {
			// Persistent shapes (e.g. the focus-row outline) live on
			// div.__baseShapes; the hover rect is appended on top of them.
			Plotly.relayout(div, { shapes: [...(div.__baseShapes || []), {
				type: 'rect', xref: 'x', yref: 'y',
				x0: p.x - state.xStep / 2, x1: p.x + state.xStep / 2,
				y0: p.pointNumber[0] - 0.5, y1: p.pointNumber[0] + 0.5,
				line: { color: palette.accent, width: 2 },
				fillcolor: 'rgba(0,0,0,0)', layer: 'above'
			}]});
		} else if (t === 'bar') {
			const n = (p.data.x && p.data.x.length) || 0;
			const widths = new Array(n).fill(0);
			if (p.pointNumber >= 0 && p.pointNumber < n) widths[p.pointNumber] = 3;
			Plotly.restyle(div, {
				'marker.line.width': [widths],
				'marker.line.color': [palette.accent]
			}, [p.curveNumber]);
		} else if (t === 'scatterpolar') {
			const n = (p.data.theta && p.data.theta.length) || 0;
			const rest = (p.data.meta && p.data.meta.restingSize) || 4;
			const hover = (p.data.meta && p.data.meta.hoverSize) || 10;
			const sizes = new Array(n).fill(rest);
			if (p.pointIndex >= 0 && p.pointIndex < n) sizes[p.pointIndex] = hover;
			Plotly.restyle(div, { 'marker.size': [sizes] }, [p.curveNumber]);
		} else if (t === 'scatter') {
			const n = (p.data.x && p.data.x.length) || 0;
			const rest = (p.data.meta && p.data.meta.restingSize) || 4;
			const hover = (p.data.meta && p.data.meta.hoverSize) || 10;
			const sizes = new Array(n).fill(rest);
			if (p.pointIndex >= 0 && p.pointIndex < n) sizes[p.pointIndex] = hover;
			Plotly.restyle(div, { 'marker.size': [sizes] }, [p.curveNumber]);
		}
	} catch (_) { /* plot detached or restyle conflict */ }
}

function rf_reach_hover_highlight_clear(div, p) {
	const t = p && p.data && p.data.type;
	if (!document.body.contains(div) || typeof Plotly === 'undefined') return;
	try {
		if (t === 'heatmap') {
			Plotly.relayout(div, { shapes: div.__baseShapes || [] });
		} else if (t === 'bar') {
			Plotly.restyle(div, { 'marker.line.width': [0] }, [p.curveNumber]);
		} else if (t === 'scatterpolar') {
			const rest = (p.data.meta && p.data.meta.restingSize) || 4;
			Plotly.restyle(div, { 'marker.size': [rest] }, [p.curveNumber]);
		} else if (t === 'scatter') {
			const rest = (p.data.meta && p.data.meta.restingSize) || 4;
			Plotly.restyle(div, { 'marker.size': [rest] }, [p.curveNumber]);
		}
	} catch (_) { /* plot detached or restyle conflict */ }
}

function rf_reach_hover_cancel_full(div) {
	const state = div.__rfHover;
	if (!state) return;
	if (state.timer !== null) {
		clearTimeout(state.timer);
		state.timer = null;
	}
	div.classList.remove(RF_REACH_HOVER_HIDDEN_CLASS);
	if (state.last_point) rf_reach_hover_highlight_clear(div, state.last_point);
	state.active = null;
	state.last_point = null;
}

function rf_reach_hover_attach(div) {
	const state = { timer: null, active: null, last_point: null, xStep: rf_reach_hover_xstep_compute(div) };
	div.__rfHover = state;
	div.on('plotly_hover', (ev) => {
		if (!ev || !ev.points || !ev.points.length) return;
		const p = ev.points[0];
		const key = rf_reach_hover_target_key(p);
		if (!key) return;
		if (state.active === key && state.timer === null) return;
		if (state.timer !== null) clearTimeout(state.timer);
		if (state.last_point) rf_reach_hover_highlight_clear(div, state.last_point);
		state.active = null;
		state.last_point = null;
		div.classList.add(RF_REACH_HOVER_HIDDEN_CLASS);
		state.timer = setTimeout(() => {
			state.timer = null;
			div.classList.remove(RF_REACH_HOVER_HIDDEN_CLASS);
			rf_reach_hover_highlight_apply(div, p, state);
			state.active = key;
			state.last_point = p;
		}, RF_REACH_HOVER_DWELL_MS);
	});
	div.on('plotly_unhover', () => rf_reach_hover_cancel_full(div));
	div.addEventListener('mouseleave', () => rf_reach_hover_cancel_full(div));
}

function rf_reach_heatmap_height_compute(y_count) {
	return Math.max(260, 60 + 28 * y_count);
}

let rf_reach_last_facet_divs = [];
let rf_reach_active_bands = rf_reach_bands_load();
let rf_reach_cached_context = null;

function rf_reach_bands_load() {
	const all = RF_REACH_BAND_FILTERS.map(b => b.key);
	try {
		const stored = JSON.parse(localStorage.getItem(RF_REACH_BANDS_STORE_KEY));
		if (Array.isArray(stored)) {
			const valid = stored.filter(k => all.includes(k));
			if (valid.length > 0) return new Set(valid);
		}
	} catch (_) { /* corrupted store falls back to all-on */ }
	return new Set(all);
}

function rf_reach_bands_save() {
	try {
		localStorage.setItem(RF_REACH_BANDS_STORE_KEY, JSON.stringify(Array.from(rf_reach_active_bands)));
	} catch (_) { /* private mode */ }
}



function rf_reach_iphone_bars_compute(rssi_dbm) {
	if (rssi_dbm === null || rssi_dbm === undefined || Number.isNaN(rssi_dbm)) return null;
	if (rssi_dbm >= RF_REACH_BARS_THRESHOLDS[0]) return 3;
	if (rssi_dbm >= RF_REACH_BARS_THRESHOLDS[1]) return 2;
	if (rssi_dbm >= RF_REACH_BARS_THRESHOLDS[2]) return 1;
	return 0;
}

function rf_reach_unii_classify(frequency_mhz) {
	if (frequency_mhz === null || frequency_mhz === undefined || !Number.isFinite(frequency_mhz)) return null;
	if (frequency_mhz >= 2400 && frequency_mhz <= 2500) return '2.4';
	if (frequency_mhz >= 5150 && frequency_mhz <  5250) return 'U-NII-1';
	if (frequency_mhz >= 5250 && frequency_mhz <= 5350) return 'U-NII-2A';
	if (frequency_mhz >= 5470 && frequency_mhz <  5725) return 'U-NII-2C';
	if (frequency_mhz >= 5725 && frequency_mhz <= 5895) return 'U-NII-3';
	if (frequency_mhz >= 5925 && frequency_mhz <= 7125) return '6';
	return null;
}

function rf_reach_facet_label(unii, bw_mhz) {
	const bw_str = (bw_mhz === null || bw_mhz === undefined || Number.isNaN(bw_mhz)) ? '?' : `${Math.round(bw_mhz)}MHz`;
	const band_str = RF_REACH_UNII_DISPLAY[unii] || unii || '?';
	return `${band_str} / ${bw_str}`;
}

function rf_reach_facet_sort_key(unii, bw_mhz) {
	const band_idx = unii in RF_REACH_UNII_ORDER ? RF_REACH_UNII_ORDER[unii] : 9;
	return band_idx * 1000 + (Number.isFinite(bw_mhz) ? bw_mhz : 9999);
}

function rf_reach_paths_collect() {
	const paths = [];
	let local_count = 0;
	loaded_files.forEach((entry) => {
		if (entry.from_server && entry.server_path) {
			paths.push(entry.server_path.replace(/\/report\.xlsx$/i, ''));
		} else {
			local_count += 1;
		}
	});
	return { paths, local_count };
}

function rf_reach_band_filter_init() {
	const wrap = document.getElementById('rfReachBandFilters');
	if (!wrap || wrap.dataset.initialized === '1') return;
	wrap.dataset.initialized = '1';
	wrap.innerHTML = RF_REACH_BAND_FILTERS.map(b => {
		const active = rf_reach_active_bands.has(b.key);
		const dfs_class = b.dfs ? ' rf-chip-dfs' : '';
		const dfs_title = b.dfs
			? ' title="DFS band: always excluded from the EIRP/throughput deviation math regardless of this filter"'
			: '';
		return `
		<button type="button" class="rf-band-filter-chip${dfs_class}${active ? ' active' : ''}"
			data-band="${b.key}" aria-pressed="${active}"${dfs_title}>
			${b.label}
		</button>
	`;
	}).join('');
	wrap.querySelectorAll('.rf-band-filter-chip').forEach(btn => {
		btn.addEventListener('click', () => {
			const band = btn.dataset.band;
			if (!band) return;
			if (rf_reach_active_bands.has(band)) {
				rf_reach_active_bands.delete(band);
			} else {
				rf_reach_active_bands.add(band);
			}
			rf_reach_bands_save();
			btn.classList.toggle('active', rf_reach_active_bands.has(band));
			btn.setAttribute('aria-pressed', rf_reach_active_bands.has(band) ? 'true' : 'false');
			rf_reach_render_cached();
		});
	});
}

function rf_reach_band_filter_apply(rows) {
	return rows.filter(r => rf_reach_active_bands.has(r.unii_band));
}

function rf_reach_selected_band_labels() {
	return RF_REACH_BAND_FILTERS
		.filter(b => rf_reach_active_bands.has(b.key))
		.map(b => b.label);
}

function rf_reach_charts_clear(message) {
	const ids = [
		'reachLeaderboardDiv', 'reachLeaderboardTable',
		'rssiHeatmapDiv', 'tputHeatmapDiv', 'iphoneBarsDiv', 'tputVsAttenDiv',
		'eirpTputDeviationDiv', 'eirpTputDeviationAzimuthDiv',
		'iphoneBarsRotationDiv', 'polarDiv'
	];
	ids.forEach(id => {
		const el = document.getElementById(id);
		if (el) el.innerHTML = `<div class="cross-report-empty">${message}</div>`;
	});
	const tiles = document.getElementById('rfReachTiles');
	if (tiles) tiles.textContent = '';
}

function rf_reach_normalize(rows) {
	const out = [];
	for (const r of rows) {
		if (r.direction !== 'DUT-TX') continue;
		if (r.rssi_dbm === null) continue;
		const unii = rf_reach_unii_classify(r.frequency_mhz);
		if (unii === null) continue;
		r.unii_band = unii;
		out.push(r);
	}
	return out;
}

function rf_reach_filter_rvr(rows) {
	return rows.filter(r => r.atten_db !== null && r.rotation_deg === null);
}

function rf_reach_filter_azimuth(rows) {
	return rows.filter(r => r.atten_db !== null && r.rotation_deg !== null);
}

function rf_reach_filter_polar(rows) {
	return rows.filter(r => r.atten_db === null && r.rotation_deg !== null);
}

function rf_reach_model_label_map(rows) {
	const sw_per_model = new Map();
	for (const r of rows) {
		const key = `${r.vendor}/${r.model}`;
		if (!sw_per_model.has(key)) sw_per_model.set(key, new Set());
		sw_per_model.get(key).add(r.sw_version);
	}
	const labeller = (row) => {
		const key = `${row.vendor}/${row.model}`;
		const sw_set = sw_per_model.get(key);
		if (sw_set && sw_set.size > 1) return `${key} ${row.sw_version}`;
		return key;
	};
	return labeller;
}

function rf_reach_percentile(sorted_values, p) {
	if (sorted_values.length === 0) return null;
	const pos = (sorted_values.length - 1) * p / 100;
	const lo = Math.floor(pos);
	const hi = Math.ceil(pos);
	if (lo === hi) return sorted_values[lo];
	return sorted_values[lo] + (sorted_values[hi] - sorted_values[lo]) * (pos - lo);
}

function rf_reach_window_for_unii(unii) {
	if (unii === '2.4') return RF_REACH_EIRP_WINDOW_BY_BAND['2.4'];
	if (unii === '6') return RF_REACH_EIRP_WINDOW_BY_BAND['6'];
	if (unii) return RF_REACH_EIRP_WINDOW_BY_BAND['5'];
	return null;
}

function rf_reach_ols_slope(points) {
	if (points.length < 3) return null;
	const n = points.length;
	let sx = 0, sy = 0, sxx = 0, sxy = 0;
	for (const p of points) {
		sx += p.atten;
		sy += p.value;
		sxx += p.atten * p.atten;
		sxy += p.atten * p.value;
	}
	const denom = n * sxx - sx * sx;
	if (denom === 0) return null;
	return (n * sxy - sx * sy) / denom;
}

// Per (product, unii_band, BW) reach metrics from boresight RvR rows.
// Crossings are interpolated over ALL atten steps (reach can land beyond the
// EIRP window); EIRP stats keep the window + DFS rules so they match the
// deviation charts. slope checks the -1 dB/dB assumption the EIRP proxy
// rests on: a chamber sweep whose RSSI-vs-atten slope strays from -1 has a
// nonlinearity (AGC, saturation, interference) that biases the proxy.
function rf_reach_product_metrics_compute(rvr_rows) {
	const groups = new Map();
	const group_get = (r) => {
		const key = `${r.model_label}|${r.unii_band}|${r.bandwidth_mhz}`;
		if (!groups.has(key)) {
			groups.set(key, {
				key,
				label: r.model_label, vendor: r.vendor, model: r.model,
				unii_band: r.unii_band, bw_mhz: r.bandwidth_mhz,
				eirp_values: [], rssi_cells: new Map(), tput_cells: new Map()
			});
		}
		return groups.get(key);
	};
	for (const r of rvr_rows) {
		if (r.atten_db === null || r.atten_db === undefined) continue;
		const g = group_get(r);
		const rc = g.rssi_cells.get(r.atten_db) || { sum: 0, n: 0 };
		rc.sum += r.rssi_dbm;
		rc.n += 1;
		g.rssi_cells.set(r.atten_db, rc);
		if (r.tput_mbps !== null && Number.isFinite(r.tput_mbps)) {
			const tc = g.tput_cells.get(r.atten_db) || { sum: 0, n: 0 };
			tc.sum += r.tput_mbps;
			tc.n += 1;
			g.tput_cells.set(r.atten_db, tc);
		}
		if (!RF_REACH_DFS_UNII.has(r.unii_band) && rf_reach_eirp_in_window(r)) {
			g.eirp_values.push(r.rssi_dbm + r.atten_db);
		}
	}
	const metrics = new Map();
	for (const g of groups.values()) {
		const cell_points = (cells) => Array.from(cells.entries())
			.map(([atten, c]) => ({ atten, value: c.sum / c.n }))
			.sort((a, b) => a.atten - b.atten);
		const rssi_points = cell_points(g.rssi_cells);
		const tput_points = cell_points(g.tput_cells);
		const eirp_sorted = [...g.eirp_values].sort((a, b) => a - b);
		const win = rf_reach_window_for_unii(g.unii_band);
		const in_win = (p) => win && p.atten >= win[0] && p.atten <= win[1];
		const win_rssi = rssi_points.filter(in_win);
		const win_tput = tput_points.filter(in_win).map(p => p.value);
		const slope = rf_reach_ols_slope(win_rssi);
		metrics.set(g.key, {
			label: g.label, vendor: g.vendor, model: g.model,
			unii_band: g.unii_band, bw_mhz: g.bw_mhz,
			n_steps: rssi_points.length,
			eirp_med: eirp_sorted.length ? rf_reach_median(eirp_sorted) : null,
			eirp_p25: rf_reach_percentile(eirp_sorted, 25),
			eirp_p75: rf_reach_percentile(eirp_sorted, 75),
			tput_med: win_tput.length ? rf_reach_median([...win_tput]) : null,
			reach10: atten_at_threshold(tput_points, 10),
			reach100: atten_at_threshold(tput_points, 100),
			reach_bars2: atten_at_threshold(rssi_points, RF_REACH_BARS_THRESHOLDS[1]),
			slope,
			slope_ok: slope === null ? null : Math.abs(slope + 1) <= 0.15
		});
	}
	return metrics;
}

// Rank value in dB: interpolated atten where mean throughput crosses 10 Mbps,
// falling back to the RSSI 2-bars crossing for reports without throughput.
// A censored crossing (sweep ended above threshold) outranks an uncensored
// crossing at the same atten.
function rf_reach_rank_value(m) {
	const crossing = m.reach10 || m.reach_bars2;
	if (!crossing) return null;
	return crossing.atten + (crossing.censored ? 0.5 : 0);
}

function rf_reach_product_scores_compute(metrics) {
	const facets = new Map();
	for (const m of metrics.values()) {
		const v = rf_reach_rank_value(m);
		if (v === null) continue;
		const fk = `${m.unii_band}|${m.bw_mhz}`;
		if (!facets.has(fk)) facets.set(fk, []);
		facets.get(fk).push({ label: m.label, v });
	}
	const scores = new Map();
	for (const items of facets.values()) {
		items.sort((a, b) => b.v - a.v);
		const n = items.length;
		items.forEach((item, idx) => {
			const pct = n === 1 ? 1 : 1 - idx / (n - 1);
			const s = scores.get(item.label) || { sum: 0, n: 0 };
			s.sum += pct;
			s.n += 1;
			scores.set(item.label, s);
		});
	}
	const out = new Map();
	for (const [label, s] of scores.entries()) out.set(label, s.sum / s.n);
	return out;
}

function rf_reach_vendor_slots_load() {
	try {
		const stored = JSON.parse(localStorage.getItem(RF_REACH_VENDOR_SLOTS_STORE_KEY));
		if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
			const valid = {};
			for (const [vendor, slot] of Object.entries(stored)) {
				if (Number.isInteger(slot) && slot >= 0 && slot < SLOT_SHADES.length) valid[vendor] = slot;
			}
			return valid;
		}
	} catch (_) { /* corrupted store resets assignments */ }
	return {};
}

function rf_reach_vendor_slots_save(slots) {
	try {
		localStorage.setItem(RF_REACH_VENDOR_SLOTS_STORE_KEY, JSON.stringify(slots));
	} catch (_) { /* private mode */ }
}

// One identity per product, shared by every chart on the tab. Hue encodes the
// vendor (sticky across sessions via localStorage so a vendor never changes
// color between visits), shade + marker encode the model within its vendor,
// and dash separates software versions of one model (newest solid). Built on
// the unfiltered cohort so band filtering never repaints or reorders anything.
function rf_reach_product_index_build(rows, metrics) {
	const vendors = new Map();
	for (const r of rows) {
		if (!vendors.has(r.vendor)) vendors.set(r.vendor, new Map());
		const models = vendors.get(r.vendor);
		if (!models.has(r.model)) models.set(r.model, new Map());
		models.get(r.model).set(r.model_label, r.sw_version);
	}
	const slots = rf_reach_vendor_slots_load();
	let slots_dirty = false;
	// Slots persisted for vendors not currently loaded stay reserved, so a
	// vendor keeps its hue when it comes back.
	const reserved = new Set(Object.values(slots));
	for (const vendor of Array.from(vendors.keys()).sort()) {
		if (slots[vendor] !== undefined) continue;
		let slot = 0;
		while (slot < SLOT_SHADES.length && reserved.has(slot)) slot++;
		if (slot >= SLOT_SHADES.length) slot = -1;
		if (slot >= 0) {
			slots[vendor] = slot;
			reserved.add(slot);
			slots_dirty = true;
		}
	}
	if (slots_dirty) rf_reach_vendor_slots_save(slots);
	const version_cmp = (a, b) => typeof compare_versions === 'function'
		? compare_versions(String(a), String(b))
		: String(a).localeCompare(String(b), undefined, { numeric: true });
	const scores = rf_reach_product_scores_compute(metrics);
	const overflow = rf_reach_css_var('--chart-cat-overflow', '#8a8a8a');
	const products = new Map();
	for (const [vendor, models] of vendors.entries()) {
		const slot = slots[vendor] !== undefined ? slots[vendor] : -1;
		Array.from(models.keys()).sort().forEach((model, model_idx) => {
			// Cycle shades rather than capping: with the marker also advancing,
			// (shade, marker) pairs stay unique until 24 models per vendor.
			const shade_idx = model_idx % SLOT_SHADES[0].length;
			const color = slot >= 0 ? SLOT_SHADES[slot][shade_idx] : overflow;
			const marker = MODEL_MARKERS[model_idx % MODEL_MARKERS.length];
			const versions = Array.from(models.get(model).entries())
				.sort((a, b) => version_cmp(a[1], b[1]));
			versions.forEach(([label, sw], version_idx) => {
				products.set(label, {
					vendor, model, label, slot, shade_idx, color, marker,
					dash: version_idx === versions.length - 1 ? 'solid' : 'dash',
					score: scores.has(label) ? scores.get(label) : -1
				});
			});
		});
	}
	const order = Array.from(products.keys()).sort((a, b) => {
		const pa = products.get(a);
		const pb = products.get(b);
		if (pb.score !== pa.score) return pb.score - pa.score;
		return a.localeCompare(b);
	});
	return { products, order };
}

let rf_reach_focus_key = null;
let rf_reach_baseline_mode = 'cohort';

function rf_reach_prefs_load() {
	try {
		rf_reach_focus_key = localStorage.getItem(RF_REACH_FOCUS_STORE_KEY) || null;
		const baseline = localStorage.getItem(RF_REACH_BASELINE_STORE_KEY);
		rf_reach_baseline_mode = baseline === 'focus' ? 'focus' : 'cohort';
	} catch (_) { /* private mode */ }
}
rf_reach_prefs_load();

// All software versions of the focus (vendor, model) count as "yours".
function rf_reach_focus_labels() {
	const index = rf_reach_cached_context && rf_reach_cached_context.product_index;
	const labels = new Set();
	if (!index || !rf_reach_focus_key) return labels;
	for (const p of index.products.values()) {
		if (`${p.vendor}|${p.model}` === rf_reach_focus_key) labels.add(p.label);
	}
	return labels;
}

function rf_reach_focus_active() {
	return rf_reach_focus_labels().size > 0;
}

function rf_reach_focus_change() {
	const select = document.getElementById('rfReachFocusSelect');
	if (!select) return;
	rf_reach_focus_key = select.value || null;
	try {
		if (rf_reach_focus_key) localStorage.setItem(RF_REACH_FOCUS_STORE_KEY, rf_reach_focus_key);
		else localStorage.removeItem(RF_REACH_FOCUS_STORE_KEY);
	} catch (_) { /* private mode */ }
	rf_reach_render_cached();
}

function rf_reach_baseline_change(mode) {
	rf_reach_baseline_mode = mode === 'focus' ? 'focus' : 'cohort';
	try {
		localStorage.setItem(RF_REACH_BASELINE_STORE_KEY, rf_reach_baseline_mode);
	} catch (_) { /* private mode */ }
	document.querySelectorAll('.rf-baseline-btn').forEach(b =>
		b.classList.toggle('active', b.dataset.baseline === rf_reach_baseline_mode));
	rf_reach_render_cached();
}

function rf_reach_focus_select_render() {
	const select = document.getElementById('rfReachFocusSelect');
	const index = rf_reach_cached_context && rf_reach_cached_context.product_index;
	if (!select || !index) return;
	const products = new Map();
	for (const p of index.products.values()) {
		products.set(`${p.vendor}|${p.model}`, `${p.vendor}/${p.model}`);
	}
	select.textContent = '';
	const none = document.createElement('option');
	none.value = '';
	none.textContent = 'None';
	select.appendChild(none);
	for (const [key, name] of Array.from(products.entries()).sort((a, b) => a[1].localeCompare(b[1]))) {
		const opt = document.createElement('option');
		opt.value = key;
		opt.textContent = name;
		select.appendChild(opt);
	}
	select.value = rf_reach_focus_key && products.has(rf_reach_focus_key) ? rf_reach_focus_key : '';
	document.querySelectorAll('.rf-baseline-btn').forEach(b =>
		b.classList.toggle('active', b.dataset.baseline === rf_reach_baseline_mode));
}

function rf_reach_product_style(label) {
	const index = rf_reach_cached_context && rf_reach_cached_context.product_index;
	const p = index && index.products.get(label);
	if (p) return p;
	return {
		color: rf_reach_css_var('--chart-cat-overflow', '#8a8a8a'),
		marker: 'circle',
		dash: 'solid'
	};
}

// Global cohort order (best overall reach first) restricted to the labels
// present in one chart or facet. Unknown labels append alphabetically so a
// chart never drops a product the index missed.
function rf_reach_order_filter(labels_present) {
	const index = rf_reach_cached_context && rf_reach_cached_context.product_index;
	const present = labels_present instanceof Set ? labels_present : new Set(labels_present);
	if (!index) return Array.from(present).sort();
	const ordered = index.order.filter(l => present.has(l));
	const missing = Array.from(present).filter(l => !ordered.includes(l)).sort();
	return ordered.concat(missing);
}

function rf_reach_facets_collect(rows) {
	const groups = new Map();
	for (const r of rows) {
		const key = `${r.unii_band}|${r.bandwidth_mhz}`;
		if (!groups.has(key)) groups.set(key, { unii_band: r.unii_band, bw_mhz: r.bandwidth_mhz, rows: [] });
		groups.get(key).rows.push(r);
	}
	return Array.from(groups.values()).sort((a, b) =>
		rf_reach_facet_sort_key(a.unii_band, a.bw_mhz) - rf_reach_facet_sort_key(b.unii_band, b.bw_mhz)
	);
}

function rf_reach_pivot_mean(rows, value_fn) {
	const cells = new Map();
	const y_set = new Set();
	const x_set = new Set();
	for (const r of rows) {
		const v = value_fn(r);
		if (v === null || v === undefined || Number.isNaN(v)) continue;
		const yk = r.model_label;
		const xk = r.atten_db;
		y_set.add(yk);
		x_set.add(xk);
		const key = `${yk}|${xk}`;
		const bucket = cells.get(key) || { sum: 0, n: 0 };
		bucket.sum += v;
		bucket.n += 1;
		cells.set(key, bucket);
	}
	const x_keys = Array.from(x_set).sort((a, b) => a - b);
	const y_keys_array = Array.from(y_set);
	return { y_keys: y_keys_array, x_keys, cells };
}

function rf_reach_y_order_global(rows, label_fn) {
	return rf_reach_order_filter(rows.map(label_fn));
}

function rf_reach_x_keys_global(rows) {
	const set = new Set();
	for (const r of rows) {
		if (r.atten_db !== null && r.atten_db !== undefined) set.add(r.atten_db);
	}
	return Array.from(set).sort((a, b) => a - b);
}

function rf_reach_z_matrix_build(y_keys_ordered, x_keys, cells) {
	const z = [];
	for (const yk of y_keys_ordered) {
		const row = [];
		for (const xk of x_keys) {
			const bucket = cells.get(`${yk}|${xk}`);
			row.push(bucket ? bucket.sum / bucket.n : null);
		}
		z.push(row);
	}
	return z;
}

function rf_reach_facet_grid_make(container, facet_count, height_per_facet, max_cols) {
	container.innerHTML = '';
	const grid = document.createElement('div');
	const cols_cap = max_cols || 2;
	const narrow = window.innerWidth <= 1024;
	const cols = (facet_count === 1 || narrow) ? 1 : Math.min(cols_cap, facet_count);
	grid.style.cssText = `display: grid; gap: 24px; padding: 12px; grid-template-columns: ${cols === 1 ? '1fr' : `repeat(${cols}, 1fr)`};`;
	const divs = [];
	const h = height_per_facet || 380;
	for (let i = 0; i < facet_count; i++) {
		const d = document.createElement('div');
		d.style.cssText = `height: ${h}px; width: 100%;`;
		grid.appendChild(d);
		divs.push(d);
	}
	container.appendChild(grid);
	return divs;
}

function rf_reach_median(arr) {
	const sorted = [...arr].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid] : 0.5 * (sorted[mid - 1] + sorted[mid]);
}

// Generic deviation-baseline finalisation. Each summary item must carry
// { model_label, unii_band, bw_mhz, value }; the function annotates each item
// with cohort_value (the facet baseline), deviation (value - baseline), and
// baseline_kind ('cohort' | 'focus'). Baseline is the facet's cohort median,
// or, when the baseline toggle is on "vs focus" and the focus product has
// data in the facet, the focus product's own value (newest version wins when
// several are loaded); facets without focus data fall back to the cohort
// median. Reads the module focus/baseline state directly so the four
// deviation computes and the CSV builder all agree without opts threading.
function rf_reach_deviation_summary_finalize(summary) {
	const cohort_keyed = new Map();
	for (const s of summary) {
		const fk = `${s.unii_band}|${s.bw_mhz}`;
		if (!cohort_keyed.has(fk)) cohort_keyed.set(fk, []);
		cohort_keyed.get(fk).push(s.value);
	}
	const cohort_median = new Map();
	for (const [fk, arr] of cohort_keyed.entries()) cohort_median.set(fk, rf_reach_median(arr));
	const focus_baseline = new Map();
	if (rf_reach_baseline_mode === 'focus') {
		const focus = rf_reach_focus_labels();
		for (const s of summary) {
			if (!focus.has(s.model_label)) continue;
			const fk = `${s.unii_band}|${s.bw_mhz}`;
			const cur = focus_baseline.get(fk);
			const solid = rf_reach_product_style(s.model_label).dash === 'solid';
			if (!cur || solid) focus_baseline.set(fk, s.value);
		}
	}
	for (const s of summary) {
		const fk = `${s.unii_band}|${s.bw_mhz}`;
		if (focus_baseline.has(fk)) {
			s.cohort_value = focus_baseline.get(fk);
			s.baseline_kind = 'focus';
		} else {
			s.cohort_value = cohort_median.get(fk);
			s.baseline_kind = 'cohort';
		}
		s.deviation = s.value - s.cohort_value;
	}
	return summary;
}

// Boresight EIRP-proxy: each (product, atten) cell has a single RSSI sample.
// Median EIRP = RSSI + Atten across atten steps in the per-band window
// (RF_REACH_EIRP_WINDOW_BY_BAND). DFS bands are excluded, see metrics.py
// rationale.
function rf_reach_eirp_deviation_compute(rows) {
	const windowed = rows.filter(r =>
		!RF_REACH_DFS_UNII.has(r.unii_band)
		&& rf_reach_eirp_in_window(r)
	);
	const groups = new Map();
	for (const r of windowed) {
		const eirp = r.rssi_dbm + r.atten_db;
		const key = `${r.vendor}|${r.model}|${r.unii_band}|${r.bandwidth_mhz}`;
		const bucket = groups.get(key) || {
			vendor: r.vendor, model: r.model, model_label: r.model_label,
			unii_band: r.unii_band, bw_mhz: r.bandwidth_mhz, values: []
		};
		bucket.values.push(eirp);
		groups.set(key, bucket);
	}
	const summary = [];
	for (const g of groups.values()) {
		if (g.values.length === 0) continue;
		summary.push({ ...g, value: rf_reach_median(g.values) });
	}
	return rf_reach_deviation_summary_finalize(summary);
}

// Azimuth-averaged EIRP-proxy: per (product, atten) cell, mean RSSI across all
// rotation samples first, then EIRP = mean_RSSI + atten, then median across
// atten steps in the per-band window (RF_REACH_EIRP_WINDOW_BY_BAND). Captures
// the EIRP an arbitrarily-oriented client would see on average. DFS still
// excluded.
function rf_reach_eirp_deviation_azimuth_compute(rows) {
	const windowed = rows.filter(r =>
		!RF_REACH_DFS_UNII.has(r.unii_band)
		&& rf_reach_eirp_in_window(r)
	);
	const cells = new Map();
	for (const r of windowed) {
		const key = `${r.vendor}|${r.model}|${r.unii_band}|${r.bandwidth_mhz}|${r.atten_db}`;
		const bucket = cells.get(key) || {
			vendor: r.vendor, model: r.model, model_label: r.model_label,
			unii_band: r.unii_band, bw_mhz: r.bandwidth_mhz, atten_db: r.atten_db,
			sum: 0, n: 0
		};
		bucket.sum += r.rssi_dbm;
		bucket.n += 1;
		cells.set(key, bucket);
	}
	const groups = new Map();
	for (const c of cells.values()) {
		const eirp = (c.sum / c.n) + c.atten_db;
		const key = `${c.vendor}|${c.model}|${c.unii_band}|${c.bw_mhz}`;
		const g = groups.get(key) || {
			vendor: c.vendor, model: c.model, model_label: c.model_label,
			unii_band: c.unii_band, bw_mhz: c.bw_mhz, values: []
		};
		g.values.push(eirp);
		groups.set(key, g);
	}
	const summary = [];
	for (const g of groups.values()) {
		if (g.values.length === 0) continue;
		summary.push({ ...g, value: rf_reach_median(g.values) });
	}
	return rf_reach_deviation_summary_finalize(summary);
}

// Boresight throughput deviation: same per-band atten window and DFS exclusion
// as the EIRP chart so the two are directly comparable. Per (vendor, model,
// unii_band, bw_mhz), median throughput across atten steps in window. Cohort
// median = median of those per-product medians inside each (band, BW) facet.
// Deviation = product median minus cohort median, in Mbps.
function rf_reach_tput_deviation_compute(rows) {
	const windowed = rows.filter(r =>
		!RF_REACH_DFS_UNII.has(r.unii_band)
		&& rf_reach_eirp_in_window(r)
		&& r.tput_mbps !== null && r.tput_mbps !== undefined && Number.isFinite(r.tput_mbps)
	);
	const groups = new Map();
	for (const r of windowed) {
		const key = `${r.vendor}|${r.model}|${r.unii_band}|${r.bandwidth_mhz}`;
		const bucket = groups.get(key) || {
			vendor: r.vendor, model: r.model, model_label: r.model_label,
			unii_band: r.unii_band, bw_mhz: r.bandwidth_mhz, values: []
		};
		bucket.values.push(r.tput_mbps);
		groups.set(key, bucket);
	}
	const summary = [];
	for (const g of groups.values()) {
		if (g.values.length === 0) continue;
		summary.push({ ...g, value: rf_reach_median(g.values) });
	}
	return rf_reach_deviation_summary_finalize(summary);
}

// Azimuth-averaged throughput deviation: per (product, atten) cell, mean
// throughput across all rotation samples first, then median across atten steps
// in window. Captures the throughput an arbitrarily-oriented client sees on
// average. Same DFS exclusion and per-band atten window as the EIRP variant.
function rf_reach_tput_deviation_azimuth_compute(rows) {
	const windowed = rows.filter(r =>
		!RF_REACH_DFS_UNII.has(r.unii_band)
		&& rf_reach_eirp_in_window(r)
		&& r.tput_mbps !== null && r.tput_mbps !== undefined && Number.isFinite(r.tput_mbps)
	);
	const cells = new Map();
	for (const r of windowed) {
		const key = `${r.vendor}|${r.model}|${r.unii_band}|${r.bandwidth_mhz}|${r.atten_db}`;
		const bucket = cells.get(key) || {
			vendor: r.vendor, model: r.model, model_label: r.model_label,
			unii_band: r.unii_band, bw_mhz: r.bandwidth_mhz, atten_db: r.atten_db,
			sum: 0, n: 0
		};
		bucket.sum += r.tput_mbps;
		bucket.n += 1;
		cells.set(key, bucket);
	}
	const groups = new Map();
	for (const c of cells.values()) {
		const mean_tput = c.sum / c.n;
		const key = `${c.vendor}|${c.model}|${c.unii_band}|${c.bw_mhz}`;
		const g = groups.get(key) || {
			vendor: c.vendor, model: c.model, model_label: c.model_label,
			unii_band: c.unii_band, bw_mhz: c.bw_mhz, values: []
		};
		g.values.push(mean_tput);
		groups.set(key, g);
	}
	const summary = [];
	for (const g of groups.values()) {
		if (g.values.length === 0) continue;
		summary.push({ ...g, value: rf_reach_median(g.values) });
	}
	return rf_reach_deviation_summary_finalize(summary);
}

function rf_reach_faceted_heatmap_render(container, rows, config) {
	const facets = rf_reach_facets_collect(rows);
	if (facets.length === 0) {
		container.innerHTML = '<div class="cross-report-empty">No data</div>';
		return;
	}
	const max_y = facets.reduce((m, f) => {
		const c = new Set(f.rows.map(r => r.model_label)).size;
		return c > m ? c : m;
	}, 0);
	const facet_height = rf_reach_heatmap_height_compute(max_y);
	const divs = rf_reach_facet_grid_make(container, facets.length, facet_height, 1);
	if (config.legend_fn) container.insertBefore(config.legend_fn(), container.firstChild);
	rf_reach_last_facet_divs = rf_reach_last_facet_divs.concat(divs);
	const global_x_keys = rf_reach_x_keys_global(rows);
	const x_range = global_x_keys.length ? [global_x_keys[0], global_x_keys[global_x_keys.length - 1]] : null;
	const layout_overrides = config.layout || {};
	const value_fn = config.value_fn || (r => r.rssi_dbm);
	const y_order_fn = config.y_order_fn || rf_reach_y_order_global;
	const focus = rf_reach_focus_labels();
	facets.forEach((facet, i) => {
		const order = y_order_fn(facet.rows, r => r.model_label);
		const pivot = rf_reach_pivot_mean(facet.rows, value_fn);
		const y_keys_ordered = order.filter(k => pivot.y_keys.includes(k));
		const z_raw = rf_reach_z_matrix_build(y_keys_ordered, global_x_keys, pivot.cells);
		const z = config.z_transform ? z_raw.map(row => row.map(config.z_transform)) : z_raw;
		const trace_facet_overrides = config.trace_facet_fn ? config.trace_facet_fn(facet, pivot) : {};
		const focus_shapes = [];
		y_keys_ordered.forEach((label, idx) => {
			if (!focus.has(label)) return;
			focus_shapes.push({
				type: 'rect', xref: 'paper', yref: 'y',
				x0: 0, x1: 1, y0: idx - 0.5, y1: idx + 0.5,
				line: { color: rf_reach_palette().accent, width: 1.5 },
				fillcolor: 'rgba(0,0,0,0)', layer: 'above'
			});
		});
		Plotly.newPlot(divs[i], [{
			type: 'heatmap',
			z,
			x: global_x_keys,
			y: y_keys_ordered,
			...config.trace,
			...trace_facet_overrides
		}], {
			...rf_reach_layout_base(),
			...layout_overrides,
			shapes: focus_shapes,
			title: {
				text: rf_reach_facet_label(facet.unii_band, facet.bw_mhz),
				font: rf_reach_title_font(),
				x: 0.02,
				xanchor: 'left',
				y: 0.97
			},
			xaxis: {
				...rf_reach_axis_base(),
				title: { text: 'attenuation (dB)', font: { color: rf_reach_palette().text_tertiary, family: rf_reach_mono_font(), size: 11 } },
				dtick: 5,
				range: x_range
			},
			yaxis: {
				...rf_reach_axis_base(),
				autorange: 'reversed',
				...(focus.size > 0 ? {
					tickmode: 'array',
					tickvals: y_keys_ordered,
					ticktext: y_keys_ordered.map(l => focus.has(l) ? `<b>${l}</b>` : l)
				} : {})
			}
		}, { responsive: true, displayModeBar: false });
		divs[i].__baseShapes = focus_shapes;
		rf_reach_hover_attach(divs[i]);
	});
}

function chart_rssi_heatmap_render(container, rows) {
	rf_reach_faceted_heatmap_render(container, rows, {
		trace: {
			colorscale: RF_REACH_RSSI_COLORSCALE,
			zmin: RF_REACH_RSSI_ZRANGE[0],
			zmax: RF_REACH_RSSI_ZRANGE[1],
			colorbar: {
				...rf_reach_colorbar_base(),
				title: { text: 'RSSI dBm', side: 'right', font: { color: rf_reach_palette().text_tertiary, family: rf_reach_mono_font(), size: 11 } },
				tickvals: [-100, -85, -75, -65, -50, -20]
			},
			hovertemplate: '<b>%{y}</b><br>atten %{x:.0f} dB<br>RSSI %{z:.1f} dBm<extra></extra>'
		}
	});
}

function rf_reach_bars_legend_create() {
	const t = RF_REACH_BARS_THRESHOLDS;
	const swatches = [
		{ color: BARS_COLORS[3], label: '3 bars',  detail: `&ge; ${t[0]} dBm` },
		{ color: BARS_COLORS[2], label: '2 bars',  detail: `&ge; ${t[1]} dBm` },
		{ color: BARS_COLORS[1], label: '1 bar',   detail: `&ge; ${t[2]} dBm` },
		{ color: BARS_COLORS[0], label: '0 bars',  detail: `&lt; ${t[2]} dBm` }
	];
	const wrap = document.createElement('div');
	wrap.className = 'rf-bars-legend';
	wrap.innerHTML = swatches.map(s =>
		`<span class="rf-bars-legend-chip">
			<span class="rf-bars-legend-swatch" style="background:${s.color}"></span>
			<span class="rf-bars-legend-label">${s.label}</span>
			<span class="rf-bars-legend-detail">${s.detail}</span>
		</span>`
	).join('');
	return wrap;
}

function chart_iphone_bars_render(container, rows) {
	// Mean RSSI -> bars (not mean of integer bars) yields a clean 0..3.
	rf_reach_faceted_heatmap_render(container, rows, {
		z_transform: v => v === null ? null : rf_reach_iphone_bars_compute(v),
		legend_fn: rf_reach_bars_legend_create,
		layout: { margin: { ...rf_reach_layout_base().margin, r: 24 } },
		trace: {
			colorscale: RF_REACH_BARS_COLORSCALE,
			zmin: 0,
			zmax: 3,
			showscale: false,
			hovertemplate: '<b>%{y}</b><br>atten %{x:.0f} dB → %{z:.0f} bars<extra></extra>'
		}
	});
}

// Throughput peak observed in the loaded cohort, ceiled to a clean 100 Mbps
// step so the colorbar range stays visually round. Per-render so heatmap and
// scatter scale to whatever bands are currently visible after filtering.
function rf_reach_tput_zmax_compute(rows) {
	let m = 0;
	for (const r of rows) {
		if (r.tput_mbps !== null && r.tput_mbps !== undefined && Number.isFinite(r.tput_mbps) && r.tput_mbps > m) {
			m = r.tput_mbps;
		}
	}
	if (m <= 0) return 100;
	return Math.ceil(m / 100) * 100;
}

function chart_tput_heatmap_render(container, rows) {
	const p = rf_reach_palette();
	const f = rf_reach_mono_font();
	rf_reach_faceted_heatmap_render(container, rows, {
		value_fn: r => r.tput_mbps,
		trace: {
			colorscale: RF_REACH_TPUT_COLORSCALE,
			zmin: 0,
			colorbar: {
				...rf_reach_colorbar_base(),
				title: { text: 'Mbps', side: 'right', font: { color: p.text_tertiary, family: f, size: 11 } }
			},
			hovertemplate: '<b>%{y}</b><br>atten %{x:.0f} dB<br>%{z:.0f} Mbps<extra></extra>'
		},
		trace_facet_fn: (facet) => ({ zmax: rf_reach_tput_zmax_compute(facet.rows) })
	});
}

// Throughput vs attenuation. Per (unii_band, bw_mhz) facet, one trace per
// model walking left-to-right through the atten sweep: X = atten dB, Y = mean
// throughput at that step. Plotting against atten (the controlled variable)
// rather than measured RSSI lets users compare devices at identical link-
// budget conditions; differences in EIRP show up as horizontal offsets of
// the same shape.
function chart_tput_vs_atten_render(container, rows) {
	const facets = rf_reach_facets_collect(rows);
	const non_empty = facets.filter(f => f.rows.some(r => r.tput_mbps !== null && r.tput_mbps !== undefined));
	if (non_empty.length === 0) {
		container.innerHTML = '<div class="cross-report-empty">No throughput data in loaded reports</div>';
		return;
	}
	const divs = rf_reach_facet_grid_make(container, non_empty.length, 560, 1);
	rf_reach_last_facet_divs = rf_reach_last_facet_divs.concat(divs);
	non_empty.forEach((facet, i) => {
		const facet_zmax = rf_reach_tput_zmax_compute(facet.rows);
		const cells = new Map();
		for (const r of facet.rows) {
			if (r.atten_db === null || r.atten_db === undefined) continue;
			if (r.tput_mbps === null || r.tput_mbps === undefined || Number.isNaN(r.tput_mbps)) continue;
			if (r.rssi_dbm === null || r.rssi_dbm === undefined) continue;
			const key = `${r.model_label}|${r.atten_db}`;
			const bucket = cells.get(key) || {
				model_label: r.model_label, atten_db: r.atten_db,
				rssi_sum: 0, tput_sum: 0, n: 0
			};
			bucket.rssi_sum += r.rssi_dbm;
			bucket.tput_sum += r.tput_mbps;
			bucket.n += 1;
			cells.set(key, bucket);
		}
		const per_model = new Map();
		for (const c of cells.values()) {
			if (!per_model.has(c.model_label)) per_model.set(c.model_label, []);
			per_model.get(c.model_label).push({
				atten: c.atten_db,
				rssi: c.rssi_sum / c.n,
				tput: c.tput_sum / c.n
			});
		}
		const focus = rf_reach_focus_labels();
		const focus_on = focus.size > 0;
		const traces = [];
		for (const label of rf_reach_order_filter(Array.from(per_model.keys()))) {
			const points = per_model.get(label);
			points.sort((a, b) => a.atten - b.atten);
			if (points.length === 0) continue;
			const style = rf_reach_product_style(label);
			const is_focus = focus.has(label);
			const dimmed = focus_on && !is_focus;
			const color = dimmed ? RF_REACH_DEEMPH : style.color;
			traces.push({
				type: 'scatter',
				mode: 'lines+markers',
				x: points.map(p => p.atten),
				y: points.map(p => p.tput),
				customdata: points.map(p => [p.rssi]),
				name: label,
				meta: { focus: is_focus },
				line: { color, width: is_focus ? 2.5 : (dimmed ? 1 : 1.5), dash: style.dash },
				marker: { color, size: 5, symbol: style.marker },
				hovertemplate: `<b>${label}</b><br>atten %{x:.0f} dB<br>RSSI %{customdata[0]:.1f} dBm<br>%{y:.0f} Mbps<extra></extra>`,
				showlegend: true
			});
		}
		if (focus_on) {
			traces.sort((a, b) => (a.meta.focus ? 1 : 0) - (b.meta.focus ? 1 : 0));
		}
		Plotly.newPlot(divs[i], traces, {
			...rf_reach_layout_base(),
			hovermode: 'closest',
			title: {
				text: rf_reach_facet_label(facet.unii_band, facet.bw_mhz),
				font: rf_reach_title_font(),
				x: 0.02, xanchor: 'left', y: 0.97
			},
			xaxis: {
				...rf_reach_axis_base(),
				title: { text: 'attenuation (dB)', font: { color: rf_reach_palette().text_tertiary, family: rf_reach_mono_font(), size: 11 } },
				dtick: 5
			},
			yaxis: {
				...rf_reach_axis_base(),
				title: { text: 'throughput (Mbps)', font: { color: rf_reach_palette().text_tertiary, family: rf_reach_mono_font(), size: 11 } },
				rangemode: 'tozero',
				range: [0, facet_zmax]
			},
			legend: {
				font: { color: rf_reach_palette().text_secondary, family: rf_reach_mono_font(), size: 10 },
				bgcolor: 'transparent',
				orientation: 'h',
				y: -0.25
			},
			margin: { l: 70, r: 24, t: 56, b: 100 }
		}, { responsive: true, displayModeBar: false });
		rf_reach_hover_attach(divs[i]);
	});
}

// Paired per-facet deviation charts: EIRP (dB) on the left, throughput
// (Mbps) on the right, identical row order so "transmits louder" and
// "delivers more" read bar-for-bar. Replaces the old single chart with a
// secondary y-axis overlay: two scales on one plot invent correlations.
// Each summary item must carry { model_label, unii_band, bw_mhz, value,
// deviation, cohort_value }. Near-zero deviations (|dev| < eps) render in
// the neutral color so measurement noise does not scream a sign.
function rf_reach_deviation_colors(deviations, eps) {
	const pos = rf_reach_css_var('--chart-div-pos', '#3987e5');
	const neg = rf_reach_css_var('--chart-div-neg', '#e66767');
	const neutral = rf_reach_css_var('--chart-div-neutral', '#898781');
	return deviations.map(d => {
		if (d === null || Math.abs(d) < eps) return neutral;
		return d < 0 ? neg : pos;
	});
}

function rf_reach_deviation_facets_collect(eirp_summary, tput_summary) {
	const facets = new Map();
	const facet_get = (s) => {
		const fk = `${s.unii_band}|${s.bw_mhz}`;
		if (!facets.has(fk)) {
			facets.set(fk, { unii_band: s.unii_band, bw_mhz: s.bw_mhz, eirp: [], tput: [] });
		}
		return facets.get(fk);
	};
	for (const s of eirp_summary) facet_get(s).eirp.push(s);
	for (const s of tput_summary) facet_get(s).tput.push(s);
	return Array.from(facets.values()).sort((a, b) =>
		rf_reach_facet_sort_key(a.unii_band, a.bw_mhz) - rf_reach_facet_sort_key(b.unii_band, b.bw_mhz)
	);
}

function rf_reach_deviation_chart_render(div, facet, items, order, opts) {
	if (items.length === 0) {
		div.innerHTML = `<div class="cross-report-empty">${opts.empty_message}</div>`;
		return;
	}
	const by_label = new Map(items.map(s => [s.model_label, s]));
	const devs = order.map(l => by_label.has(l) ? by_label.get(l).deviation : null);
	const abs_vals = order.map(l => by_label.has(l) ? by_label.get(l).value : null);
	const cohort_val = items[0].cohort_value;
	const baseline_word = items[0].baseline_kind === 'focus' ? 'focus baseline' : 'cohort median';
	const dec = opts.decimals;
	const cohort_dec = opts.cohort_decimals !== undefined ? opts.cohort_decimals : dec;
	const max_abs = Math.max(1.0, ...devs.filter(d => d !== null).map(Math.abs));
	const x_pad = max_abs * 0.35;
	const small = items.length < 5 ? ', small cohort' : '';
	const metrics = rf_reach_cached_context && rf_reach_cached_context.metrics;
	const slope_note = (l) => {
		const m = metrics && metrics.get(`${l}|${facet.unii_band}|${facet.bw_mhz}`);
		return m && m.slope_ok === false ? '<br>[!] RSSI slope off -1 dB/dB, proxy less reliable' : '';
	};
	const focus = rf_reach_focus_labels();
	const focus_on = focus.size > 0;
	const trace = {
		type: 'bar',
		orientation: 'h',
		y: order,
		x: devs,
		customdata: order.map((l, i) => [abs_vals[i], slope_note(l)]),
		marker: {
			color: rf_reach_deviation_colors(devs, opts.eps),
			cornerradius: 4,
			line: focus_on ? {
				width: order.map(l => focus.has(l) ? 2 : 0),
				color: rf_reach_palette().accent
			} : { width: 0 }
		},
		text: devs.map(d => d === null ? '' : `${d >= 0 ? '+' : ''}${d.toFixed(dec)}`),
		textposition: 'outside',
		textfont: { color: rf_reach_palette().text_primary, size: 11, family: rf_reach_mono_font() },
		cliponaxis: false,
		hovertemplate: `<b>%{y}</b>`
			+ `<br>deviation %{x:+.${dec}f} ${opts.unit}`
			+ `<br>absolute %{customdata[0]:.${dec}f} ${opts.unit}`
			+ `<br>${baseline_word} ${cohort_val.toFixed(cohort_dec)} ${opts.unit}`
			+ `%{customdata[1]}<extra></extra>`,
		showlegend: false,
		name: opts.metric_name
	};
	if (opts.whiskers && metrics) {
		const plus = [];
		const minus = [];
		let any = false;
		for (const l of order) {
			const m = metrics.get(`${l}|${facet.unii_band}|${facet.bw_mhz}`);
			const s = by_label.get(l);
			if (m && s && m.eirp_p25 !== null && m.eirp_p75 !== null) {
				plus.push(Math.max(0, m.eirp_p75 - s.value));
				minus.push(Math.max(0, s.value - m.eirp_p25));
				any = true;
			} else {
				plus.push(0);
				minus.push(0);
			}
		}
		if (any) {
			trace.error_x = {
				type: 'data',
				symmetric: false,
				array: plus,
				arrayminus: minus,
				color: 'rgba(255, 255, 255, 0.4)',
				thickness: 1,
				width: 3
			};
		}
	}
	Plotly.newPlot(div, [trace], {
		...rf_reach_layout_base(),
		hovermode: 'closest',
		title: {
			text: `${rf_reach_facet_label(facet.unii_band, facet.bw_mhz)} · ${opts.metric_name}`
				+ ` (${baseline_word} ${cohort_val.toFixed(cohort_dec)} ${opts.unit}, n=${items.length}${small})`,
			font: rf_reach_title_font(),
			x: 0.02,
			xanchor: 'left',
			y: 0.97
		},
		xaxis: {
			...rf_reach_axis_base(),
			title: { text: `deviation from cohort median (${opts.unit})`, font: { color: rf_reach_palette().text_tertiary, family: rf_reach_mono_font(), size: 11 } },
			zeroline: true,
			zerolinewidth: 1,
			zerolinecolor: rf_reach_palette().zero_line,
			range: [-(max_abs + x_pad), max_abs + x_pad]
		},
		yaxis: {
			...rf_reach_axis_base(),
			autorange: 'reversed',
			gridcolor: 'transparent',
			...(focus_on ? {
				tickmode: 'array',
				tickvals: order,
				ticktext: order.map(l => focus.has(l) ? `<b>${l}</b>` : l)
			} : {})
		},
		margin: { l: 200, r: 40, t: 56, b: 60 }
	}, { responsive: true, displayModeBar: false });
	rf_reach_hover_attach(div);
}

function chart_deviation_pair_render(container, eirp_summary, tput_summary, opts) {
	if (eirp_summary.length === 0 && tput_summary.length === 0) {
		container.innerHTML = `<div class="cross-report-empty">${opts.empty_message}</div>`;
		return;
	}
	const facets = rf_reach_deviation_facets_collect(eirp_summary, tput_summary);
	const max_rows = facets.reduce((m, f) => Math.max(m, f.eirp.length, f.tput.length), 0);
	const height = Math.max(280, 90 + 26 * max_rows);
	const divs = rf_reach_facet_grid_make(container, facets.length * 2, height, 2);
	rf_reach_last_facet_divs = rf_reach_last_facet_divs.concat(divs);
	facets.forEach((facet, i) => {
		const labels = new Set([...facet.eirp, ...facet.tput].map(s => s.model_label));
		const order = rf_reach_order_filter(labels);
		rf_reach_deviation_chart_render(divs[2 * i], facet, facet.eirp, order, {
			metric_name: 'EIRP dev',
			unit: 'dB',
			decimals: 2,
			cohort_decimals: 1,
			eps: 0.25,
			whiskers: true,
			empty_message: opts.eirp_empty
		});
		rf_reach_deviation_chart_render(divs[2 * i + 1], facet, facet.tput, order, {
			metric_name: 'throughput dev',
			unit: 'Mbps',
			decimals: 0,
			eps: 5,
			empty_message: opts.tput_empty
		});
	});
}

function chart_eirp_tput_deviation_render(container, rows) {
	chart_deviation_pair_render(
		container,
		rf_reach_eirp_deviation_compute(rows),
		rf_reach_tput_deviation_compute(rows),
		{
			empty_message: 'No data in per-band atten window (2.4: 5-75, 5: 5-65, 6: 5-50 dB; DFS excluded)',
			eirp_empty: 'No EIRP data in per-band atten window',
			tput_empty: 'No throughput data in per-band atten window'
		}
	);
}

function chart_eirp_tput_deviation_azimuth_render(container, rows) {
	chart_deviation_pair_render(
		container,
		rf_reach_eirp_deviation_azimuth_compute(rows),
		rf_reach_tput_deviation_azimuth_compute(rows),
		{
			empty_message: 'No 360deg_tx rotation-sweep data in per-band atten window (DFS excluded)',
			eirp_empty: 'No EIRP data in per-band atten window',
			tput_empty: 'No throughput data in per-band atten window'
		}
	);
}

function chart_iphone_bars_rotation_render(container, rows) {
	const facets = new Map();
	for (const r of rows) {
		const fk = `${r.unii_band}|${r.bandwidth_mhz}`;
		if (!facets.has(fk)) {
			facets.set(fk, {
				unii_band: r.unii_band,
				bw_mhz: r.bandwidth_mhz,
				rows: [],
				rotations: new Set(),
				attens: new Set(),
				products: new Map()
			});
		}
		const facet = facets.get(fk);
		facet.rows.push(r);
		facet.rotations.add(r.rotation_deg);
		facet.attens.add(r.atten_db);
		if (!facet.products.has(r.model_label)) {
			facet.products.set(r.model_label, { vendor: r.vendor, label: r.model_label });
		}
	}
	if (facets.size === 0) {
		container.innerHTML = '<div class="cross-report-empty">No 360deg_tx rotation-sweep data loaded</div>';
		return;
	}
	const sorted_facets = Array.from(facets.values()).sort((a, b) =>
		rf_reach_facet_sort_key(a.unii_band, a.bw_mhz) - rf_reach_facet_sort_key(b.unii_band, b.bw_mhz)
	);
	container.innerHTML = '';
	container.appendChild(rf_reach_bars_legend_create());
	const grid = document.createElement('div');
	grid.style.cssText = 'display: grid; gap: 24px; padding: 12px; grid-template-columns: 1fr;';
	container.appendChild(grid);

	for (const facet of sorted_facets) {
		const rotations = Array.from(facet.rotations).sort((a, b) => a - b);
		const attens = Array.from(facet.attens).sort((a, b) => a - b);
		const cells = new Map();
		for (const r of facet.rows) {
			const key = `${r.rotation_deg}|${r.model_label}|${r.atten_db}`;
			const bucket = cells.get(key) || { sum: 0, n: 0 };
			bucket.sum += r.rssi_dbm;
			bucket.n += 1;
			cells.set(key, bucket);
		}
		const rows_by_product = new Map();
		for (const p of facet.products.values()) {
			const product_rows = [];
			for (const rotation of rotations) {
				const bars = [];
				const customdata = [];
				for (const atten of attens) {
					const c = cells.get(`${rotation}|${p.label}|${atten}`);
					if (c) {
						const mean_rssi = c.sum / c.n;
						bars.push(rf_reach_iphone_bars_compute(mean_rssi));
						customdata.push([mean_rssi]);
					} else {
						bars.push(null);
						customdata.push([null]);
					}
				}
				if (!bars.some(v => v !== null)) continue;
				product_rows.push({ ...p, rotation, bars, customdata });
			}
			if (product_rows.length === 0) continue;
			rows_by_product.set(p.label, product_rows);
		}
		const sorted_products = rf_reach_order_filter(Array.from(rows_by_product.keys()))
			.map(label => ({ label }));
		const row_items = [];
		for (const p of sorted_products) {
			const product_rows = rows_by_product.get(p.label) || [];
			product_rows.sort((a, b) => a.rotation - b.rotation);
			row_items.push({
				label: p.label,
				rotation: null,
				y_key: `${p.label}|header`,
				y_text: p.label,
				bars: attens.map(() => null),
				customdata: attens.map(() => [null])
			});
			for (const row of product_rows) {
				row_items.push({
					...row,
					y_key: `${row.label}|${row.rotation}`,
					y_text: `   ${row.rotation}°`
				});
			}
		}
		if (row_items.length === 0) continue;
		const d = document.createElement('div');
		d.style.cssText = `height: ${Math.max(320, 80 + 22 * row_items.length)}px; width: 100%;`;
		grid.appendChild(d);
		rf_reach_last_facet_divs.push(d);
		const rotation_focus = rf_reach_focus_labels();
		const y_keys = row_items.map(item => item.y_key);
		const y_labels = row_items.map(item =>
			item.rotation === null && rotation_focus.has(item.label)
				? `<b>${item.y_text}</b>`
				: item.y_text
		);
		const z = row_items.map(item => item.bars);
		const customdata = row_items.map(item =>
			item.customdata.map(cell => [item.label, item.rotation, cell[0]])
		);
		Plotly.newPlot(d, [{
			type: 'heatmap',
			z,
			x: attens,
			y: y_keys,
			customdata,
			colorscale: RF_REACH_BARS_COLORSCALE,
			zmin: 0,
			zmax: 3,
			showscale: false,
			hoverongaps: false,
			xgap: 1,
			ygap: 1,
			hovertemplate:
				'<b>%{customdata[0]}</b><br>'
				+ 'rotation %{customdata[1]:.0f}°<br>'
				+ 'atten %{x:.0f} dB<br>'
				+ '%{z:.0f} bars<br>'
				+ 'RSSI %{customdata[2]:.1f} dBm<extra></extra>'
		}], {
			...rf_reach_layout_base(),
			margin: { ...rf_reach_layout_base().margin, r: 24 },
			hovermode: 'closest',
			title: {
				text: rf_reach_facet_label(facet.unii_band, facet.bw_mhz),
				font: rf_reach_title_font(),
				x: 0.02,
				xanchor: 'left',
				y: 0.97
			},
			xaxis: {
				...rf_reach_axis_base(),
				title: { text: 'attenuation (dB)', font: { color: rf_reach_palette().text_tertiary, family: rf_reach_mono_font(), size: 11 } },
				dtick: 5,
				range: attens.length ? [attens[0], attens[attens.length - 1]] : undefined
			},
			yaxis: {
				...rf_reach_axis_base(),
				autorange: 'reversed',
				tickmode: 'array',
				tickvals: y_keys,
				ticktext: y_labels
			}
		}, { responsive: true, displayModeBar: false });
		rf_reach_hover_attach(d);
	}
}

function rf_reach_polar_traces_collect(polar_rows, azimuth_rows) {
	// Primary: 360deg_noatten rows (atten === null, rotation set), 5deg increments.
	// Fallback: for any (vendor, model, unii_band, bw) missing from primary,
	// use the 360deg_tx rotation sweep at its lowest atten step (~45deg
	// increments). Source flag travels with the trace so the legend can mark
	// fallback entries.
	const facets = new Map();
	const facet_get = (unii_band, bw_mhz) => {
		const fk = `${unii_band}|${bw_mhz}`;
		if (!facets.has(fk)) facets.set(fk, { unii_band, bw_mhz, products: new Map() });
		return facets.get(fk);
	};
	for (const r of polar_rows) {
		const facet = facet_get(r.unii_band, r.bandwidth_mhz);
		const pk = `${r.vendor}|${r.model}`;
		if (!facet.products.has(pk)) {
			facet.products.set(pk, {
				vendor: r.vendor, model: r.model, model_label: r.model_label,
				rotations: [], rssi: [], source: 'polar'
			});
		}
		const p = facet.products.get(pk);
		p.rotations.push(r.rotation_deg);
		p.rssi.push(r.rssi_dbm);
	}
	const azimuth_per_product_facet = new Map();
	for (const r of azimuth_rows) {
		const key = `${r.vendor}|${r.model}|${r.unii_band}|${r.bandwidth_mhz}`;
		if (!azimuth_per_product_facet.has(key)) azimuth_per_product_facet.set(key, []);
		azimuth_per_product_facet.get(key).push(r);
	}
	for (const [key, rows] of azimuth_per_product_facet.entries()) {
		const [vendor, model, unii_band, bw_str] = key.split('|');
		const bw_mhz = bw_str === 'null' || bw_str === 'undefined' ? null : Number(bw_str);
		const facet = facet_get(unii_band, Number.isFinite(bw_mhz) ? bw_mhz : null);
		const pk = `${vendor}|${model}`;
		if (facet.products.has(pk)) continue;
		let min_atten = Infinity;
		for (const r of rows) if (r.atten_db < min_atten) min_atten = r.atten_db;
		const at_min = rows.filter(r => r.atten_db === min_atten);
		if (at_min.length === 0) continue;
		facet.products.set(pk, {
			vendor, model, model_label: at_min[0].model_label,
			rotations: at_min.map(r => r.rotation_deg),
			rssi: at_min.map(r => r.rssi_dbm),
			source: 'azimuth_fallback', fallback_atten_db: min_atten
		});
	}
	return Array.from(facets.values()).sort(
		(a, b) => rf_reach_facet_sort_key(a.unii_band, a.bw_mhz) - rf_reach_facet_sort_key(b.unii_band, b.bw_mhz)
	);
}

function rf_reach_polar_legend_create(products_with_source, trace_index_map) {
	const wrap = document.createElement('div');
	wrap.className = 'rf-bars-legend rf-polar-legend';
	const by_label = new Map(products_with_source.map(p => [p.label, p]));
	const sorted = rf_reach_order_filter(Array.from(by_label.keys()))
		.map(label => by_label.get(label));
	const legend_focus = rf_reach_focus_labels();
	for (const p of sorted) {
		const dimmed = legend_focus.size > 0 && !legend_focus.has(p.label);
		const color = dimmed ? RF_REACH_DEEMPH : rf_reach_product_style(p.label).color;
		const chip = document.createElement('span');
		chip.className = 'rf-bars-legend-chip rf-polar-legend-chip';
		chip.tabIndex = 0;
		chip.setAttribute('role', 'button');
		chip.setAttribute('aria-pressed', 'true');
		chip.title = 'Click to hide/show in polar plots';
		const detail = p.has_fallback
			? '<span class="rf-bars-legend-detail">fallback: 360deg_tx</span>'
			: '';
		chip.innerHTML = `
			<span class="rf-bars-legend-swatch" style="background:${color}"></span>
			<span class="rf-bars-legend-label">${p.label}</span>
			${detail}
		`;
		const toggle = () => {
			const now_hidden = chip.classList.toggle('rf-bars-legend-chip-hidden');
			chip.setAttribute('aria-pressed', now_hidden ? 'false' : 'true');
			const visible = !now_hidden;
			for (const entry of trace_index_map) {
				const idx = entry.label_to_idx[p.label];
				if (idx === undefined) continue;
				if (typeof Plotly === 'undefined' || !entry.div || !entry.div.isConnected) continue;
				try { Plotly.restyle(entry.div, { visible }, [idx]); } catch (_) { /* plot detached */ }
			}
		};
		chip.addEventListener('click', toggle);
		chip.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				toggle();
			}
		});
		wrap.appendChild(chip);
	}
	return wrap;
}

// Absolute radial values mix pattern shape with per-product reference power.
// Normalizing each trace to its own peak (0 dB at peak, negative elsewhere)
// isolates the shape, which is what the polar chart is for; absolute RSSI
// stays available in the hover.
let rf_reach_polar_normalize = false;

function chart_polar_render(container, polar_rows, azimuth_rows) {
	const facets = rf_reach_polar_traces_collect(polar_rows, azimuth_rows);
	const non_empty = facets.filter(f => f.products.size > 0);
	if (non_empty.length === 0) {
		container.innerHTML = '<div class="cross-report-empty">No 360deg rotation data loaded</div>';
		return;
	}
	const all_products = new Map();
	for (const f of non_empty) {
		for (const p of f.products.values()) {
			const cur = all_products.get(p.model_label);
			const has_fallback = p.source === 'azimuth_fallback';
			if (cur) {
				cur.has_fallback = cur.has_fallback || has_fallback;
			} else {
				all_products.set(p.model_label, {
					vendor: p.vendor, label: p.model_label, has_fallback
				});
			}
		}
	}
	const divs = rf_reach_facet_grid_make(container, non_empty.length, 800, 1);
	rf_reach_last_facet_divs = rf_reach_last_facet_divs.concat(divs);
	const trace_index_map = [];
	const focus = rf_reach_focus_labels();
	const focus_on = focus.size > 0;
	non_empty.forEach((facet, i) => {
		const traces = [];
		const label_to_idx = {};
		const all_rssi = [];
		const products = Array.from(facet.products.values());
		if (focus_on) {
			products.sort((a, b) =>
				(focus.has(a.model_label) ? 1 : 0) - (focus.has(b.model_label) ? 1 : 0));
		}
		for (const p of products) {
			const pairs = p.rotations.map((θ, idx) => ({ θ, r: p.rssi[idx] }))
				.filter(d => Number.isFinite(d.θ) && Number.isFinite(d.r))
				.sort((a, b) => a.θ - b.θ);
			if (pairs.length < 2) continue;
			const peak = Math.max(...pairs.map(d => d.r));
			for (const d of pairs) {
				d.abs = d.r;
				if (rf_reach_polar_normalize) d.r = d.r - peak;
			}
			for (const d of pairs) all_rssi.push(d.r);
			pairs.push({ θ: pairs[0].θ + 360, r: pairs[0].r, abs: pairs[0].abs });
			const style = rf_reach_product_style(p.model_label);
			// Fallback dot-dash outranks the version dash: knowing a trace came
			// from the wrong test matters more than which sw version it is.
			const dash = p.source === 'azimuth_fallback' ? 'dot' : style.dash;
			const is_focus = focus.has(p.model_label);
			const dimmed = focus_on && !is_focus;
			const color = dimmed ? RF_REACH_DEEMPH : style.color;
			label_to_idx[p.model_label] = traces.length;
			traces.push({
				type: 'scatterpolar',
				mode: 'lines+markers',
				r: pairs.map(d => d.r),
				theta: pairs.map(d => d.θ),
				customdata: pairs.map(d => [d.abs]),
				name: p.model_label + (p.source === 'azimuth_fallback' ? ` (atten ${p.fallback_atten_db} dB)` : ''),
				line: { color, width: is_focus ? 2.5 : (dimmed ? 1 : 1.5), dash },
				marker: { color, size: 4, symbol: style.marker },
				hovertemplate: rf_reach_polar_normalize
					? `<b>${p.model_label}</b><br>θ %{theta:.0f}°<br>%{r:.1f} dB below peak<br>RSSI %{customdata[0]:.1f} dBm<extra></extra>`
					: `<b>${p.model_label}</b><br>θ %{theta:.0f}°<br>RSSI %{r:.1f} dBm<extra></extra>`,
				showlegend: false
			});
		}
		trace_index_map.push({ div: divs[i], label_to_idx });
		// Zoom the radial axis to actual data range. Default Plotly autorange
		// extends to a round outer bound (often 0 dBm) leaving most of the
		// chart empty when peak RSSI is, e.g., -10 dBm. Explicit range puts
		// the strongest sample close to the outer edge so pattern shape is
		// visible. Headroom keeps the trace off the rim and the inner curves
		// off the centre dot.
		let r_range = null;
		if (all_rssi.length > 0) {
			const r_min = Math.min(...all_rssi);
			const r_max = Math.max(...all_rssi);
			r_range = [Math.floor(r_min - 5), Math.ceil(r_max + 2)];
		}
		Plotly.newPlot(divs[i], traces, {
			...rf_reach_layout_base(),
			title: {
				text: rf_reach_facet_label(facet.unii_band, facet.bw_mhz),
				font: rf_reach_title_font(),
				x: 0.02,
				xanchor: 'left',
				y: 0.97
			},
			polar: (() => {
				const p = rf_reach_palette();
				const f = rf_reach_mono_font();
				return {
					bgcolor: 'transparent',
					angularaxis: {
						direction: 'clockwise',
						rotation: 90,
						color: p.text_secondary,
						gridcolor: p.grid,
						linecolor: p.line,
						tickfont: { color: p.text_tertiary, family: f, size: 10 }
					},
					radialaxis: {
						color: p.text_secondary,
						gridcolor: p.grid,
						linecolor: p.line,
						tickfont: { color: p.text_tertiary, family: f, size: 10 },
						tickangle: 90,
						...(r_range ? { range: r_range, autorange: false } : {})
					}
				};
			})(),
			margin: { l: 40, r: 40, t: 56, b: 40 }
		}, { responsive: true, displayModeBar: false });
		rf_reach_hover_attach(divs[i]);
	});
	const legend = rf_reach_polar_legend_create(
		Array.from(all_products.values()), trace_index_map
	);
	const norm_btn = document.createElement('button');
	norm_btn.type = 'button';
	norm_btn.className = `rf-export-btn${rf_reach_polar_normalize ? ' active' : ''}`;
	norm_btn.textContent = 'normalize to peak';
	norm_btn.title = 'Rescale each trace to 0 dB at its own peak so pattern shape compares directly; absolute RSSI stays in the hover';
	norm_btn.addEventListener('click', () => {
		rf_reach_polar_normalize = !rf_reach_polar_normalize;
		rf_reach_render_cached();
	});
	legend.appendChild(norm_btn);
	container.insertBefore(legend, container.firstChild);
}

// Headline facet per band: the most-populated (unii, BW) combination, so the
// leaderboard compares the largest possible cohort. Ties prefer the wider BW.
// Every other (band, BW) facet stays reachable through the table view / CSV.
function rf_reach_leaderboard_facets(metrics) {
	const by_unii = new Map();
	for (const m of metrics.values()) {
		if (!rf_reach_active_bands.has(m.unii_band)) continue;
		if (rf_reach_rank_value(m) === null) continue;
		if (!by_unii.has(m.unii_band)) by_unii.set(m.unii_band, new Map());
		const by_bw = by_unii.get(m.unii_band);
		if (!by_bw.has(m.bw_mhz)) by_bw.set(m.bw_mhz, []);
		by_bw.get(m.bw_mhz).push(m);
	}
	const facets = [];
	for (const [unii, by_bw] of by_unii.entries()) {
		let best = null;
		for (const [bw, items] of by_bw.entries()) {
			const better = !best
				|| items.length > best.items.length
				|| (items.length === best.items.length && bw > best.bw_mhz);
			if (better) best = { bw_mhz: bw, items };
		}
		facets.push({ unii_band: unii, bw_mhz: best.bw_mhz, items: best.items });
	}
	return facets.sort((a, b) =>
		rf_reach_facet_sort_key(a.unii_band, a.bw_mhz) - rf_reach_facet_sort_key(b.unii_band, b.bw_mhz)
	);
}

function rf_reach_crossing_text(crossing, decimals) {
	if (!crossing) return null;
	const dec = decimals !== undefined ? decimals : 1;
	return `${crossing.censored ? '≥' : ''}${crossing.atten.toFixed(dec)}`;
}

function rf_reach_reach_legend_create() {
	const wrap = document.createElement('div');
	wrap.className = 'rf-bars-legend';
	wrap.innerHTML = `
		<span class="rf-bars-legend-chip">
			<span class="rf-bars-legend-swatch rf-reach-dot-solid"></span>
			<span class="rf-bars-legend-label">@10 Mbps</span>
			<span class="rf-bars-legend-detail">edge reach</span>
		</span>
		<span class="rf-bars-legend-chip">
			<span class="rf-bars-legend-swatch rf-reach-dot-open"></span>
			<span class="rf-bars-legend-label">@100 Mbps</span>
			<span class="rf-bars-legend-detail">strong-signal reach</span>
		</span>
		<span class="rf-bars-legend-chip">
			<span class="rf-bars-legend-label">&ge;</span>
			<span class="rf-bars-legend-detail">sweep ended above threshold</span>
		</span>
	`;
	return wrap;
}

function chart_reach_leaderboard_render(container, metrics) {
	const facets = rf_reach_leaderboard_facets(metrics);
	if (facets.length === 0) {
		container.innerHTML = '<div class="cross-report-empty">No reach metrics for the selected bands</div>';
		return;
	}
	const max_rows = facets.reduce((m, f) => Math.max(m, f.items.length), 0);
	const divs = rf_reach_facet_grid_make(container, facets.length, Math.max(240, 90 + 30 * max_rows), 1);
	container.insertBefore(rf_reach_reach_legend_create(), container.firstChild);
	rf_reach_last_facet_divs = rf_reach_last_facet_divs.concat(divs);
	facets.forEach((facet, i) => {
		const items = [...facet.items].sort((a, b) => rf_reach_rank_value(b) - rf_reach_rank_value(a));
		const labels = items.map(m => m.label);
		const conn_x = [];
		const conn_y = [];
		const attens = [];
		for (const m of items) {
			for (const c of [m.reach10, m.reach100, m.reach10 ? null : m.reach_bars2]) {
				if (c) attens.push(c.atten);
			}
			if (m.reach10 && m.reach100) {
				conn_x.push(m.reach100.atten, m.reach10.atten, null);
				conn_y.push(m.label, m.label, null);
			}
		}
		const edge = items.filter(m => m.reach10 || m.reach_bars2);
		const strong = items.filter(m => m.reach100);
		const traces = [];
		if (conn_x.length > 0) {
			traces.push({
				type: 'scatter',
				mode: 'lines',
				x: conn_x,
				y: conn_y,
				line: { color: rf_reach_palette().line, width: 2 },
				hoverinfo: 'skip',
				showlegend: false
			});
		}
		traces.push({
			type: 'scatter',
			mode: 'markers',
			x: strong.map(m => m.reach100.atten),
			y: strong.map(m => m.label),
			marker: {
				color: strong.map(m => rf_reach_product_style(m.label).color),
				size: 9,
				symbol: strong.map(m => `${rf_reach_product_style(m.label).marker}-open`),
				line: { width: 2 }
			},
			meta: { restingSize: 9, hoverSize: 14 },
			customdata: strong.map(m => [rf_reach_crossing_text(m.reach100)]),
			hovertemplate: '<b>%{y}</b><br>reach@100Mbps %{customdata[0]} dB<extra></extra>',
			showlegend: false
		});
		traces.push({
			type: 'scatter',
			mode: 'markers',
			x: edge.map(m => (m.reach10 || m.reach_bars2).atten),
			y: edge.map(m => m.label),
			marker: {
				color: edge.map(m => rf_reach_product_style(m.label).color),
				size: 11,
				symbol: edge.map(m => rf_reach_product_style(m.label).marker),
				line: { width: 0 }
			},
			meta: { restingSize: 11, hoverSize: 16 },
			customdata: edge.map(m => [
				m.reach10
					? `reach@10Mbps ${rf_reach_crossing_text(m.reach10)} dB`
					: `2-bars RSSI reach ${rf_reach_crossing_text(m.reach_bars2)} dB (no throughput data)`,
				m.reach100 ? `reach@100Mbps ${rf_reach_crossing_text(m.reach100)} dB` : ''
			]),
			hovertemplate: '<b>%{y}</b><br>%{customdata[0]}<br>%{customdata[1]}<extra></extra>',
			showlegend: false
		});
		const lb_focus = rf_reach_focus_labels();
		const labeled = items.filter((m, idx) =>
			(idx === 0 || lb_focus.has(m.label)) && (m.reach10 || m.reach_bars2));
		if (labeled.length > 0) {
			traces.push({
				type: 'scatter',
				mode: 'text',
				x: labeled.map(m => (m.reach10 || m.reach_bars2).atten),
				y: labeled.map(m => m.label),
				text: labeled.map(m => `${rf_reach_crossing_text(m.reach10 || m.reach_bars2)} dB`),
				textposition: 'middle right',
				textfont: {
					color: rf_reach_palette().text_primary,
					family: rf_reach_mono_font(),
					size: 11
				},
				hoverinfo: 'skip',
				showlegend: false,
				cliponaxis: false
			});
		}
		const x_min = Math.min(...attens);
		const x_max = Math.max(...attens);
		Plotly.newPlot(divs[i], traces, {
			...rf_reach_layout_base(),
			hovermode: 'closest',
			title: {
				text: `${rf_reach_facet_label(facet.unii_band, facet.bw_mhz)}  (n=${items.length})`,
				font: rf_reach_title_font(),
				x: 0.02,
				xanchor: 'left',
				y: 0.97
			},
			xaxis: {
				...rf_reach_axis_base(),
				title: { text: 'attenuation at throughput crossing (dB)', font: { color: rf_reach_palette().text_tertiary, family: rf_reach_mono_font(), size: 11 } },
				range: [Math.floor(x_min - 3), Math.ceil(x_max + 3)]
			},
			yaxis: {
				...rf_reach_axis_base(),
				autorange: 'reversed',
				categoryorder: 'array',
				categoryarray: labels,
				gridcolor: 'transparent',
				...(lb_focus.size > 0 ? {
					tickmode: 'array',
					tickvals: labels,
					ticktext: labels.map(l => lb_focus.has(l) ? `<b>${l}</b>` : l)
				} : {})
			},
			margin: { l: 200, r: 80, t: 56, b: 60 }
		}, { responsive: true, displayModeBar: false });
		rf_reach_hover_attach(divs[i]);
	});
}

// Band groups for the stat tiles: one headline per spectrum band, preferring
// non-DFS 5 GHz facets so the tile is not skewed by TPC-limited DFS numbers.
function rf_reach_tile_groups(metrics) {
	const facets = rf_reach_leaderboard_facets(metrics);
	const groups = [
		{ name: '2.4 GHz', match: (u) => u === '2.4', preferred: (u) => true },
		{ name: '5 GHz', match: (u) => u.startsWith('U-NII'), preferred: (u) => !RF_REACH_DFS_UNII.has(u) },
		{ name: '6 GHz', match: (u) => u === '6', preferred: (u) => true }
	];
	const out = [];
	for (const g of groups) {
		const candidates = facets.filter(f => g.match(f.unii_band));
		if (candidates.length === 0) continue;
		const preferred = candidates.filter(f => g.preferred(f.unii_band));
		const pool = preferred.length > 0 ? preferred : candidates;
		const facet = pool.reduce((best, f) => f.items.length > best.items.length ? f : best);
		out.push({ name: g.name, facet });
	}
	return out;
}

function rf_reach_summary_tiles_render(container, metrics) {
	if (!container) return;
	container.textContent = '';
	const focus = rf_reach_focus_labels();
	const groups = rf_reach_tile_groups(metrics);
	for (const g of groups) {
		const items = [...g.facet.items].sort((a, b) => rf_reach_rank_value(b) - rf_reach_rank_value(a));
		const leader = items[0];
		const crossing = leader.reach10 || leader.reach_bars2;
		const tile = document.createElement('div');
		tile.className = 'rf-tile';
		const band = document.createElement('div');
		band.className = 'rf-tile-band';
		band.textContent = `${g.name} · ${Math.round(g.facet.bw_mhz)} MHz · n=${items.length}`;
		const value = document.createElement('div');
		value.className = 'rf-tile-value';
		value.textContent = `${rf_reach_crossing_text(crossing)} dB`;
		const leader_el = document.createElement('div');
		leader_el.className = 'rf-tile-leader';
		leader_el.textContent = leader.label;
		const detail = document.createElement('div');
		detail.className = 'rf-tile-detail';
		if (items.length > 1) {
			const runner = rf_reach_rank_value(items[0]) - rf_reach_rank_value(items[1]);
			detail.textContent = leader.reach10
				? `@10 Mbps · +${runner.toFixed(1)} dB over #2`
				: `2-bars RSSI · +${runner.toFixed(1)} dB over #2`;
		} else {
			detail.textContent = leader.reach10 ? '@10 Mbps · only product' : '2-bars RSSI · only product';
		}
		tile.append(band, value, leader_el, detail);
		if (focus.size > 0) {
			const focus_item = items.find(m => focus.has(m.label));
			const delta_el = document.createElement('div');
			if (focus.has(leader.label)) {
				delta_el.className = 'rf-tile-delta rf-tile-delta-up';
				delta_el.textContent = '▲ yours leads this band';
				tile.appendChild(delta_el);
			} else if (focus_item) {
				const delta = rf_reach_rank_value(focus_item) - rf_reach_rank_value(leader);
				const crossing = focus_item.reach10 || focus_item.reach_bars2;
				delta_el.className = 'rf-tile-delta rf-tile-delta-down';
				delta_el.textContent = `▼ yours: ${rf_reach_crossing_text(crossing)} dB (${delta.toFixed(1)})`;
				tile.appendChild(delta_el);
			}
		}
		container.appendChild(tile);
	}
}

let rf_reach_leaderboard_view = 'chart';
let rf_reach_table_sort = { key: 'rank', asc: true };

function rf_reach_leaderboard_view_set(view) {
	rf_reach_leaderboard_view = view;
	const chart = document.getElementById('reachLeaderboardDiv');
	const table = document.getElementById('reachLeaderboardTable');
	if (chart) chart.style.display = view === 'chart' ? '' : 'none';
	if (table) table.style.display = view === 'table' ? '' : 'none';
	document.querySelectorAll('.rf-view-toggle-btn').forEach(b =>
		b.classList.toggle('active', b.dataset.view === view));
	if (view === 'chart') rf_reach_resize();
}

const RF_REACH_TABLE_COLUMNS = [
	{ key: 'rank', label: '#', numeric: true },
	{ key: 'product', label: 'Product', numeric: false },
	{ key: 'band_key', label: 'Band', numeric: true },
	{ key: 'bw_mhz', label: 'BW', numeric: true },
	{ key: 'n_steps', label: 'Steps', numeric: true },
	{ key: 'reach10_v', label: '@10 Mbps (dB)', numeric: true },
	{ key: 'reach100_v', label: '@100 Mbps (dB)', numeric: true },
	{ key: 'bars2_v', label: '2-bars (dB)', numeric: true },
	{ key: 'eirp_med', label: 'EIRP med (dBm)', numeric: true },
	{ key: 'tput_med', label: 'Tput med (Mbps)', numeric: true },
	{ key: 'slope', label: 'Slope', numeric: true }
];

function rf_reach_leaderboard_table_render(container, metrics) {
	if (!container) return;
	const rows = Array.from(metrics.values()).filter(m => rf_reach_active_bands.has(m.unii_band));
	if (rows.length === 0) {
		container.innerHTML = '<div class="cross-report-empty">No data for the selected bands</div>';
		return;
	}
	const rank = new Map(rf_reach_order_filter(new Set(rows.map(r => r.label))).map((l, i) => [l, i + 1]));
	const cv = (c) => c === null ? null : c.atten + (c.censored ? 0.001 : 0);
	const data = rows.map(m => ({
		rank: rank.get(m.label),
		product: m.label,
		band: RF_REACH_UNII_DISPLAY[m.unii_band] || m.unii_band,
		band_key: rf_reach_facet_sort_key(m.unii_band, m.bw_mhz),
		bw_mhz: m.bw_mhz,
		n_steps: m.n_steps,
		reach10_v: cv(m.reach10), reach10_t: rf_reach_crossing_text(m.reach10),
		reach100_v: cv(m.reach100), reach100_t: rf_reach_crossing_text(m.reach100),
		bars2_v: cv(m.reach_bars2), bars2_t: rf_reach_crossing_text(m.reach_bars2),
		eirp_med: m.eirp_med,
		eirp_t: m.eirp_med === null ? null
			: `${m.eirp_med.toFixed(1)} (${m.eirp_p25.toFixed(1)}..${m.eirp_p75.toFixed(1)})`,
		tput_med: m.tput_med,
		tput_t: m.tput_med === null ? null : m.tput_med.toFixed(0),
		slope: m.slope,
		slope_t: m.slope === null ? null
			: `${m.slope.toFixed(2)}${m.slope_ok === false ? ' [!]' : ''}`,
		slope_ok: m.slope_ok
	}));
	const { key, asc } = rf_reach_table_sort;
	const dir = asc ? 1 : -1;
	data.sort((a, b) => {
		const va = a[key];
		const vb = b[key];
		if (va === null && vb === null) return a.rank - b.rank;
		if (va === null) return 1;
		if (vb === null) return -1;
		if (typeof va === 'string') return dir * va.localeCompare(vb);
		return dir * (va - vb);
	});
	container.textContent = '';
	const table_focus = rf_reach_focus_labels();
	const table = document.createElement('table');
	table.className = 'rf-reach-table';
	const thead = document.createElement('thead');
	const head_row = document.createElement('tr');
	for (const col of RF_REACH_TABLE_COLUMNS) {
		const th = document.createElement('th');
		th.textContent = col.label + (key === col.key ? (asc ? ' ▴' : ' ▾') : '');
		th.addEventListener('click', () => {
			rf_reach_table_sort = {
				key: col.key,
				asc: key === col.key ? !asc : !col.numeric
			};
			rf_reach_leaderboard_table_render(container, metrics);
		});
		head_row.appendChild(th);
	}
	thead.appendChild(head_row);
	const tbody = document.createElement('tbody');
	for (const d of data) {
		const tr = document.createElement('tr');
		if (table_focus.has(d.product)) tr.classList.add('rf-focus-row');
		const cells = [
			d.rank, d.product, d.band, `${Math.round(d.bw_mhz)}`, d.n_steps,
			d.reach10_t, d.reach100_t, d.bars2_t, d.eirp_t, d.tput_t, d.slope_t
		];
		cells.forEach((c, ci) => {
			const td = document.createElement('td');
			td.textContent = c === null || c === undefined ? '—' : String(c);
			if (ci === 1) {
				const dot = document.createElement('span');
				dot.className = 'rf-table-dot';
				dot.style.background = rf_reach_product_style(d.product).color;
				td.prepend(dot);
			}
			if (ci === 10 && d.slope_ok === false) td.classList.add('rf-slope-bad');
			tr.appendChild(td);
		});
		tbody.appendChild(tr);
	}
	table.append(thead, tbody);
	container.appendChild(table);
}

function rf_reach_csv_escape(value) {
	const s = value === null || value === undefined ? '' : String(value);
	if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
	return s;
}

function rf_reach_summary_csv_build() {
	const cached = rf_reach_cached_context;
	if (!cached || !cached.metrics) return null;
	const rvr = rf_reach_filter_rvr(rf_reach_band_filter_apply(cached.normalized));
	const dev_key = (s) => `${s.model_label}|${s.unii_band}|${s.bw_mhz}`;
	const eirp_dev = new Map(rf_reach_eirp_deviation_compute(rvr).map(s => [dev_key(s), s]));
	const tput_dev = new Map(rf_reach_tput_deviation_compute(rvr).map(s => [dev_key(s), s]));
	const header = [
		'product', 'vendor', 'model', 'unii_band', 'bw_mhz', 'n_steps',
		'reach10_db', 'reach10_censored', 'reach100_db', 'reach100_censored',
		'bars2_db', 'bars2_censored',
		'eirp_med_dbm', 'eirp_p25_dbm', 'eirp_p75_dbm', 'eirp_dev_db',
		'tput_med_mbps', 'tput_dev_mbps', 'rssi_slope', 'slope_ok'
	];
	const lines = [header.join(',')];
	const num = (v, dec) => v === null || v === undefined ? '' : v.toFixed(dec);
	for (const m of cached.metrics.values()) {
		if (!rf_reach_active_bands.has(m.unii_band)) continue;
		const k = `${m.label}|${m.unii_band}|${m.bw_mhz}`;
		const ed = eirp_dev.get(k);
		const td = tput_dev.get(k);
		lines.push([
			rf_reach_csv_escape(m.label), rf_reach_csv_escape(m.vendor), rf_reach_csv_escape(m.model),
			m.unii_band, m.bw_mhz, m.n_steps,
			m.reach10 ? m.reach10.atten.toFixed(2) : '', m.reach10 ? m.reach10.censored : '',
			m.reach100 ? m.reach100.atten.toFixed(2) : '', m.reach100 ? m.reach100.censored : '',
			m.reach_bars2 ? m.reach_bars2.atten.toFixed(2) : '', m.reach_bars2 ? m.reach_bars2.censored : '',
			num(m.eirp_med, 2), num(m.eirp_p25, 2), num(m.eirp_p75, 2),
			ed ? ed.deviation.toFixed(2) : '',
			num(m.tput_med, 1),
			td ? td.deviation.toFixed(1) : '',
			num(m.slope, 3),
			m.slope_ok === null ? '' : m.slope_ok
		].join(','));
	}
	return lines.join('\n') + '\n';
}

function rf_reach_summary_csv_download() {
	const csv = rf_reach_summary_csv_build();
	if (!csv) return;
	const blob = new Blob([csv], { type: 'text/csv' });
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = 'qualifi-rf-reach-metrics.csv';
	a.click();
	URL.revokeObjectURL(a.href);
}

const RF_REACH_HEATMAP_CSV_IDS = new Set([
	'rssiHeatmapDiv', 'tputHeatmapDiv', 'iphoneBarsDiv', 'iphoneBarsRotationDiv'
]);

function rf_reach_block_png_download(chart_container) {
	const plots = Array.from(chart_container.querySelectorAll('.js-plotly-plot'));
	plots.reduce((chain, div, i) => chain.then(() =>
		Plotly.downloadImage(div, {
			format: 'png',
			scale: 2,
			filename: `qualifi-rf-${chart_container.id}-${i + 1}`
		}).catch(() => {})
	), Promise.resolve());
}

// Generic pivot CSV straight from the rendered heatmap traces, so every
// heatmap value is reachable without hovering.
function rf_reach_block_csv_download(chart_container) {
	const plots = Array.from(chart_container.querySelectorAll('.js-plotly-plot'));
	const lines = [];
	for (const div of plots) {
		const trace = div.data && div.data.find(t => t.type === 'heatmap');
		if (!trace) continue;
		const title = (div.layout && div.layout.title && div.layout.title.text) || '';
		lines.push(rf_reach_csv_escape(title));
		lines.push(['product', ...trace.x].join(','));
		const y_labels = (div.layout && div.layout.yaxis && div.layout.yaxis.ticktext) || trace.y;
		trace.z.forEach((row, ri) => {
			lines.push([
				rf_reach_csv_escape(String(y_labels[ri]).trim()),
				...row.map(v => v === null || v === undefined ? '' : v)
			].join(','));
		});
		lines.push('');
	}
	if (lines.length === 0) return;
	const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = `qualifi-rf-${chart_container.id}.csv`;
	a.click();
	URL.revokeObjectURL(a.href);
}

function rf_reach_export_buttons_init() {
	document.querySelectorAll('#crossReportPanel .cross-report-chart-block').forEach(block => {
		if (block.dataset.exportInit === '1') return;
		block.dataset.exportInit = '1';
		const head = block.querySelector('.cross-report-chart-head');
		const chart = block.querySelector('.cross-report-chart');
		if (!head || !chart) return;
		const wrap = document.createElement('div');
		wrap.className = 'rf-export-btns';
		const png = document.createElement('button');
		png.type = 'button';
		png.className = 'rf-export-btn';
		png.textContent = 'PNG';
		png.title = 'Download this chart as PNG (one file per facet)';
		png.addEventListener('click', () => rf_reach_block_png_download(chart));
		wrap.appendChild(png);
		if (RF_REACH_HEATMAP_CSV_IDS.has(chart.id)) {
			const csv = document.createElement('button');
			csv.type = 'button';
			csv.className = 'rf-export-btn';
			csv.textContent = 'CSV';
			csv.title = 'Download the heatmap values as CSV';
			csv.addEventListener('click', () => rf_reach_block_csv_download(chart));
			wrap.appendChild(csv);
		}
		head.appendChild(wrap);
	});
}

function rf_reach_status_render(div, counts, notes) {
	div.textContent = '';
	const stats = [
		{ label: 'reports', value: String(counts.reports || 0) },
		{ label: 'RvR', value: String(counts.rvr || 0) },
		{ label: 'azimuth', value: String(counts.azimuth || 0) },
		{ label: 'polar', value: String(counts.polar || 0) },
	];
	for (const { label, value } of stats) {
		const chip = document.createElement('span');
		chip.className = 'cross-report-status-chip';
		const label_el = document.createElement('span');
		label_el.className = 'cross-report-status-chip-label';
		label_el.textContent = label;
		const value_el = document.createElement('span');
		value_el.className = 'cross-report-status-chip-value';
		value_el.textContent = value;
		chip.append(label_el, value_el);
		div.appendChild(chip);
	}
	for (const note of notes || []) {
		if (!note) continue;
		const chip = document.createElement('span');
		chip.className = 'cross-report-status-chip cross-report-status-chip--warn';
		chip.textContent = note;
		div.appendChild(chip);
	}
}

function rf_reach_status_notes_collect(local_count, err_count) {
	const notes = [];
	if (local_count > 0) notes.push(`${local_count} local file${local_count === 1 ? '' : 's'} skipped`);
	if (err_count > 0) notes.push(`${err_count} report${err_count === 1 ? '' : 's'} skipped`);
	return notes;
}

function rf_reach_render_cached() {
	const status_div = document.getElementById('crossReportStatus');
	if (!rf_reach_cached_context) return;

	rf_reach_last_facet_divs = [];
	const { normalized, paths, local_count, err_count } = rf_reach_cached_context;
	const notes = rf_reach_status_notes_collect(local_count, err_count);
	const slope_bad = Array.from((rf_reach_cached_context.metrics || new Map()).values())
		.filter(m => rf_reach_active_bands.has(m.unii_band) && m.slope_ok === false).length;
	if (slope_bad > 0) {
		notes.push(`${slope_bad} sweep(s) RSSI slope off -1 dB/dB, EIRP proxy less reliable`);
	}
	rf_reach_focus_select_render();
	const selected_labels = rf_reach_selected_band_labels();
	if (selected_labels.length === 0) {
		rf_reach_status_render(status_div, { reports: paths.length }, ['no bands selected', ...notes]);
		rf_reach_charts_clear('No bands selected');
		return;
	}

	const filtered = rf_reach_band_filter_apply(normalized);
	const rvr_rows = rf_reach_filter_rvr(filtered);
	const azimuth_rows = rf_reach_filter_azimuth(filtered);
	const polar_rows = rf_reach_filter_polar(filtered);
	rf_reach_status_render(status_div, {
		reports: paths.length,
		rvr: rvr_rows.length,
		azimuth: azimuth_rows.length,
		polar: polar_rows.length,
	}, notes);

	const metrics = rf_reach_cached_context.metrics || new Map();
	rf_reach_summary_tiles_render(document.getElementById('rfReachTiles'), metrics);
	chart_reach_leaderboard_render(document.getElementById('reachLeaderboardDiv'), metrics);
	rf_reach_leaderboard_table_render(document.getElementById('reachLeaderboardTable'), metrics);
	rf_reach_leaderboard_view_set(rf_reach_leaderboard_view);
	chart_rssi_heatmap_render(document.getElementById('rssiHeatmapDiv'), rvr_rows);
	chart_tput_heatmap_render(document.getElementById('tputHeatmapDiv'), rvr_rows);
	chart_iphone_bars_render(document.getElementById('iphoneBarsDiv'), rvr_rows);
	chart_tput_vs_atten_render(document.getElementById('tputVsAttenDiv'), rvr_rows);
	chart_eirp_tput_deviation_render(document.getElementById('eirpTputDeviationDiv'), rvr_rows);
	chart_eirp_tput_deviation_azimuth_render(document.getElementById('eirpTputDeviationAzimuthDiv'), azimuth_rows);
	chart_iphone_bars_rotation_render(document.getElementById('iphoneBarsRotationDiv'), azimuth_rows);
	chart_polar_render(document.getElementById('polarDiv'), polar_rows, azimuth_rows);
}

function rf_reach_render() {
	rf_reach_band_filter_init();
	rf_reach_export_buttons_init();
	const status_div = document.getElementById('crossReportStatus');
	const { paths, local_count } = rf_reach_paths_collect();
	const base_notes = rf_reach_status_notes_collect(local_count, 0);

	if (paths.length === 0) {
		rf_reach_cached_context = null;
		rf_reach_status_render(status_div, {}, base_notes);
		rf_reach_charts_clear('No data');
		return;
	}

	rf_reach_status_render(status_div, { reports: paths.length }, base_notes);
	rf_reach_last_facet_divs = [];

	const url = window.QUALIFI_BASE + 'api/rf-reach-data?paths=' + encodeURIComponent(paths.join(','));
	fetch(url)
		.then(r => {
			if (!r.ok) throw new Error(`HTTP ${r.status}`);
			return r.json();
		})
		.then(data => {
			const errs = (data.errors || []).filter(Boolean);
			const all_rows = data.rows || [];
			const normalized = rf_reach_normalize(all_rows);
			const labeller = rf_reach_model_label_map(normalized);
			for (const r of normalized) r.model_label = labeller(r);

			const metrics = rf_reach_product_metrics_compute(rf_reach_filter_rvr(normalized));
			rf_reach_cached_context = {
				normalized, paths, local_count, err_count: errs.length, metrics
			};
			rf_reach_cached_context.product_index = rf_reach_product_index_build(normalized, metrics);
			rf_reach_render_cached();

			if (errs.length > 0) console.warn('rf-reach data errors:', errs);
		})
		.catch(err => {
			console.error('rf-reach data fetch failed:', err);
			rf_reach_cached_context = null;
			rf_reach_status_render(status_div, {}, [`error: ${err.message}`, ...base_notes]);
			rf_reach_charts_clear(`Error: ${err.message}`);
		});
}

function rf_reach_resize() {
	for (const div of rf_reach_last_facet_divs) {
		if (div && div.isConnected && typeof Plotly !== 'undefined' && Plotly.Plots) {
			try { Plotly.Plots.resize(div); } catch (_) { /* ignore detached plots */ }
		}
	}
}

let rf_reach_resize_timeout = null;
window.addEventListener('resize', () => {
	clearTimeout(rf_reach_resize_timeout);
	rf_reach_resize_timeout = setTimeout(rf_reach_resize, 150);
});
