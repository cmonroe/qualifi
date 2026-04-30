// Cross-Report Analysis tab. Mirrors six charts from
// qualifi/tools/rf_reach_analysis/charts.py against currently-loaded server reports:
//   chart_rssi_heatmap        -> chart_rssi_heatmap_render             (boresight RvR)
//   chart_iphone_bars_heatmap -> chart_iphone_bars_render              (boresight RvR)
//   chart_median_deviation    -> chart_eirp_deviation_render           (boresight RvR)
//   (no Python equivalent)    -> chart_eirp_deviation_azimuth_render   (rotation-sweep avg)
//   (no Python equivalent)    -> chart_iphone_bars_rotation_render     (per-rotation bars)
//   chart_polar_360           -> chart_polar_render                    (antenna pattern)
// Cohort baseline = currently loaded reports only. EXCLUDED_MODELS is intentionally
// not honoured: if the user loaded a report, they want to see it.

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
const RF_REACH_BAND_FILTERS = [
	{ key: '2.4', label: '2.4G' },
	{ key: '5L', label: '5GL' },
	{ key: '5H', label: '5GH' },
	{ key: '6', label: '6G' }
];

const RF_REACH_EIRP_WINDOW = [5, 50];

// iPhone's WiFi status-bar icon has three arcs, so bars range 0..3. Thresholds
// align with Apple's documented -70 dBm WiFi roaming trigger and standard
// signal-quality bands. See metrics.py::iphone_bars_compute for the canonical
// definition; both must stay in sync.
const RF_REACH_BARS_THRESHOLDS = [-65, -75, -85];

// Colorscales are tuned for the SmartOS dark surface
// (--bg-primary #0b0f19, --bg-card #151c2c, --bg-card-hover #1a2236). Avoid
// near-black stops that blend with the chart background. RSSI uses a cool
// blue->teal->mint ramp (continuous physical signal); bars uses a stoplight
// red/amber/green ramp (perceptual buckets). Different palettes prevent the
// two charts from being visually conflated.
const RF_REACH_RSSI_COLORSCALE = [
	[0.0, '#1e3a5f'],   // ~-100 dBm: deep blue, visible against #1a2236
	[0.2, '#0369a1'],   // ~-84 dBm: steel blue
	[0.4, '#0891b2'],   // ~-68 dBm: cyan
	[0.6, '#14b8a6'],   // ~-52 dBm: teal
	[0.8, '#5eead4'],   // ~-36 dBm: light mint
	[1.0, '#a7f3d0']    // ~-20 dBm: pale mint-green
];
const RF_REACH_RSSI_ZRANGE = [-100, -20];

// Step colorscale: each integer bar value maps to exactly one color block, no
// gradient between them. Boundaries at 1/6, 3/6, 5/6 are the midpoints between
// values 0,1,2,3 normalized to [0,1].
const RF_REACH_BARS_COLORSCALE = [
	[0.0,     '#5a1a2a'],   // 0 bars: deep wine
	[1.0 / 6, '#5a1a2a'],
	[1.0 / 6, '#dc2626'],
	[3.0 / 6, '#dc2626'],   // 1 bar: red
	[3.0 / 6, '#f59e0b'],
	[5.0 / 6, '#f59e0b'],   // 2 bars: amber
	[5.0 / 6, '#22c55e'],
	[1.0,     '#22c55e']    // 3 bars: green
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

function rf_reach_heatmap_height_compute(y_count) {
	return Math.max(260, 60 + 28 * y_count);
}

let rf_reach_last_facet_divs = [];
let rf_reach_active_bands = new Set(RF_REACH_BAND_FILTERS.map(b => b.key));
let rf_reach_cached_context = null;



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
	wrap.innerHTML = RF_REACH_BAND_FILTERS.map(b => `
		<button type="button" class="rf-band-filter-chip active" data-band="${b.key}" aria-pressed="true">
			${b.label}
		</button>
	`).join('');
	wrap.querySelectorAll('.rf-band-filter-chip').forEach(btn => {
		btn.addEventListener('click', () => {
			const band = btn.dataset.band;
			if (!band) return;
			if (rf_reach_active_bands.has(band)) {
				rf_reach_active_bands.delete(band);
			} else {
				rf_reach_active_bands.add(band);
			}
			btn.classList.toggle('active', rf_reach_active_bands.has(band));
			btn.setAttribute('aria-pressed', rf_reach_active_bands.has(band) ? 'true' : 'false');
			rf_reach_render_cached();
		});
	});
}

function rf_reach_band_filter_apply(rows) {
	return rows.filter(r => rf_reach_active_bands.has(r.band));
}

function rf_reach_selected_band_labels() {
	return RF_REACH_BAND_FILTERS
		.filter(b => rf_reach_active_bands.has(b.key))
		.map(b => b.label);
}

function rf_reach_charts_clear(message) {
	const ids = [
		'rssiHeatmapDiv', 'iphoneBarsDiv', 'eirpDeviationDiv',
		'eirpDeviationAzimuthDiv', 'iphoneBarsRotationDiv', 'polarDiv'
	];
	ids.forEach(id => {
		const el = document.getElementById(id);
		if (el) el.innerHTML = `<div class="cross-report-empty">${message}</div>`;
	});
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

function rf_reach_y_order_by_mean_rssi(rows, label_fn) {
	const sums = new Map();
	for (const r of rows) {
		const k = label_fn(r);
		const bucket = sums.get(k) || { sum: 0, n: 0 };
		bucket.sum += r.rssi_dbm;
		bucket.n += 1;
		sums.set(k, bucket);
	}
	return Array.from(sums.entries())
		.map(([k, v]) => ({ k, mean: v.sum / v.n }))
		.sort((a, b) => b.mean - a.mean)
		.map(o => o.k);
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

function rf_reach_eirp_summary_finalize(summary) {
	const cohort_keyed = new Map();
	for (const s of summary) {
		const fk = `${s.unii_band}|${s.bw_mhz}`;
		if (!cohort_keyed.has(fk)) cohort_keyed.set(fk, []);
		cohort_keyed.get(fk).push(s.median);
	}
	const cohort_median = new Map();
	for (const [fk, arr] of cohort_keyed.entries()) cohort_median.set(fk, rf_reach_median(arr));
	for (const s of summary) {
		s.all_median = cohort_median.get(`${s.unii_band}|${s.bw_mhz}`);
		s.deviation_db = s.median - s.all_median;
	}
	return summary;
}

// Boresight EIRP-proxy: each (product, atten) cell has a single RSSI sample.
// Median EIRP = RSSI + Atten across atten steps in the [5, 50] dB window.
// DFS bands are excluded, see metrics.py rationale.
function rf_reach_eirp_deviation_compute(rows) {
	const windowed = rows.filter(r =>
		r.atten_db >= RF_REACH_EIRP_WINDOW[0]
		&& r.atten_db <= RF_REACH_EIRP_WINDOW[1]
		&& !RF_REACH_DFS_UNII.has(r.unii_band)
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
		summary.push({ ...g, median: rf_reach_median(g.values) });
	}
	return rf_reach_eirp_summary_finalize(summary);
}

// Azimuth-averaged EIRP-proxy: per (product, atten) cell, mean RSSI across all
// rotation samples first, then EIRP = mean_RSSI + atten, then median across
// atten steps in [5, 50] dB. Captures the EIRP an arbitrarily-oriented client
// would see on average. DFS still excluded.
function rf_reach_eirp_deviation_azimuth_compute(rows) {
	const windowed = rows.filter(r =>
		r.atten_db >= RF_REACH_EIRP_WINDOW[0]
		&& r.atten_db <= RF_REACH_EIRP_WINDOW[1]
		&& !RF_REACH_DFS_UNII.has(r.unii_band)
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
		summary.push({ ...g, median: rf_reach_median(g.values) });
	}
	return rf_reach_eirp_summary_finalize(summary);
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
	facets.forEach((facet, i) => {
		const order = rf_reach_y_order_by_mean_rssi(facet.rows, r => r.model_label);
		const pivot = rf_reach_pivot_mean(facet.rows, r => r.rssi_dbm);
		const y_keys_ordered = order.filter(k => pivot.y_keys.includes(k));
		const z_raw = rf_reach_z_matrix_build(y_keys_ordered, global_x_keys, pivot.cells);
		const z = config.z_transform ? z_raw.map(row => row.map(config.z_transform)) : z_raw;
		Plotly.newPlot(divs[i], [{
			type: 'heatmap',
			z,
			x: global_x_keys,
			y: y_keys_ordered,
			...config.trace
		}], {
			...rf_reach_layout_base(),
			...layout_overrides,
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
			yaxis: { ...rf_reach_axis_base(), autorange: 'reversed' }
		}, { responsive: true, displayModeBar: false });
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
	const swatches = [
		{ color: '#22c55e', label: '3 bars',  detail: '&ge; -65 dBm' },
		{ color: '#f59e0b', label: '2 bars',  detail: '&ge; -75 dBm' },
		{ color: '#dc2626', label: '1 bar',   detail: '&ge; -85 dBm' },
		{ color: '#5a1a2a', label: '0 bars',  detail: '&lt; -85 dBm' }
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

function chart_eirp_deviation_render_internal(container, summary, empty_message) {
	if (summary.length === 0) {
		container.innerHTML = `<div class="cross-report-empty">${empty_message}</div>`;
		return;
	}
	const facet_groups = new Map();
	for (const s of summary) {
		const fk = `${s.unii_band}|${s.bw_mhz}`;
		if (!facet_groups.has(fk)) facet_groups.set(fk, { unii_band: s.unii_band, bw_mhz: s.bw_mhz, items: [] });
		facet_groups.get(fk).items.push(s);
	}
	const facets = Array.from(facet_groups.values())
		.sort((a, b) => rf_reach_facet_sort_key(a.unii_band, a.bw_mhz) - rf_reach_facet_sort_key(b.unii_band, b.bw_mhz));
	const divs = rf_reach_facet_grid_make(container, facets.length, 420);
	rf_reach_last_facet_divs = rf_reach_last_facet_divs.concat(divs);
	facets.forEach((facet, i) => {
		const sorted = [...facet.items].sort((a, b) => a.deviation_db - b.deviation_db);
		const colors = sorted.map(s => s.deviation_db < 0 ? '#ef4444' : '#22c55e');
		const text_labels = sorted.map(s => `${s.deviation_db >= 0 ? '+' : ''}${s.deviation_db.toFixed(1)}`);
		const cohort_med = sorted[0].all_median;
		const max_abs = Math.max(1.0, ...sorted.map(s => Math.abs(s.deviation_db)));
		const y_pad = max_abs * 0.30;
		Plotly.newPlot(divs[i], [{
			type: 'bar',
			x: sorted.map(s => s.model_label),
			y: sorted.map(s => s.deviation_db),
			marker: {
				color: colors,
				cornerradius: 6,
				line: { width: 0 }
			},
			text: text_labels,
			textposition: 'outside',
			textfont: { color: rf_reach_palette().text_primary, size: 12, family: rf_reach_mono_font() },
			cliponaxis: false,
			hovertemplate: '<b>%{x}</b><br>deviation: %{y:.2f} dB<br>cohort median: ' + cohort_med.toFixed(1) + ' dB<extra></extra>',
			showlegend: false
		}], {
			...rf_reach_layout_base(),
			hovermode: 'closest',
			title: {
				text: `${rf_reach_facet_label(facet.unii_band, facet.bw_mhz)}  (cohort median = ${cohort_med.toFixed(1)} dB)`,
				font: rf_reach_title_font(),
				x: 0.02,
				xanchor: 'left',
				y: 0.97
			},
			xaxis: {
				...rf_reach_axis_base(),
				tickangle: -30,
				gridcolor: 'transparent',
				linecolor: 'transparent'
			},
			yaxis: {
				...rf_reach_axis_base(),
				title: { text: 'deviation from cohort median (dB)', font: { color: rf_reach_palette().text_tertiary, family: rf_reach_mono_font(), size: 11 } },
				zeroline: true,
				zerolinewidth: 1,
				zerolinecolor: rf_reach_palette().zero_line,
				griddash: 'dot',
				range: [-(max_abs + y_pad), max_abs + y_pad]
			},
			margin: { l: 80, r: 40, t: 56, b: 120 }
		}, { responsive: true, displayModeBar: false });
	});
}

function chart_eirp_deviation_render(container, rows) {
	chart_eirp_deviation_render_internal(
		container,
		rf_reach_eirp_deviation_compute(rows),
		'No data in [5, 50] dB attenuation window (DFS bands excluded)'
	);
}

function chart_eirp_deviation_azimuth_render(container, rows) {
	chart_eirp_deviation_render_internal(
		container,
		rf_reach_eirp_deviation_azimuth_compute(rows),
		'No 360deg_tx rotation-sweep data in [5, 50] dB (DFS bands excluded)'
	);
}

function rf_reach_bar_drop_atten(attens, bars, threshold) {
	let last_ok = -Infinity;
	for (let i = 0; i < attens.length; i++) {
		const v = bars[i];
		if (v !== null && v >= threshold) last_ok = attens[i];
	}
	return last_ok;
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
		const product_scores = new Map();
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
				const valid_bars = bars.filter(v => v !== null);
				const item = {
					...p,
					rotation,
					bars,
					customdata,
					drop2_atten: rf_reach_bar_drop_atten(attens, bars, 2),
					drop1_atten: rf_reach_bar_drop_atten(attens, bars, 1),
					mean_bars: valid_bars.reduce((sum, v) => sum + v, 0) / valid_bars.length
				};
				product_rows.push(item);
			}
			if (product_rows.length === 0) continue;
			rows_by_product.set(p.label, product_rows);
			const avg = (arr, prop) => arr.reduce((sum, item) => sum + item[prop], 0) / arr.length;
			product_scores.set(p.label, {
				vendor: p.vendor,
				label: p.label,
				drop2_atten: avg(product_rows, 'drop2_atten'),
				drop1_atten: avg(product_rows, 'drop1_atten'),
				mean_bars: avg(product_rows, 'mean_bars')
			});
		}
		const sorted_products = Array.from(product_scores.values()).sort((a, b) => {
			if (b.drop2_atten !== a.drop2_atten) return b.drop2_atten - a.drop2_atten;
			if (b.drop1_atten !== a.drop1_atten) return b.drop1_atten - a.drop1_atten;
			if (b.mean_bars !== a.mean_bars) return b.mean_bars - a.mean_bars;
			return a.label.localeCompare(b.label);
		});
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
		const y_keys = row_items.map(item => item.y_key);
		const y_labels = row_items.map(item => item.y_text);
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
	}
}

// Deterministic per (vendor, model) so the legend chip and trace line stay in
// sync, and so the same product keeps the same colour across facets. Original
// qualifi RF Reach cohort palette.
const RF_REACH_POLAR_COLORS = [
	'#22d3ee', '#ef4444', '#a78bfa', '#34d399', '#fb923c',
	'#60a5fa', '#f472b6', '#fbbf24', '#f97316', '#facc15', '#94a3b8'
];

function rf_reach_polar_color_map(model_labels_with_vendor) {
	const map = new Map();
	const sorted = [...model_labels_with_vendor].sort((a, b) => a.label.localeCompare(b.label));
	sorted.forEach((m, i) => {
		map.set(m.label, RF_REACH_POLAR_COLORS[i % RF_REACH_POLAR_COLORS.length]);
	});
	return map;
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

function rf_reach_polar_legend_create(products_with_source, color_map, trace_index_map) {
	const wrap = document.createElement('div');
	wrap.className = 'rf-bars-legend rf-polar-legend';
	const sorted = [...products_with_source].sort((a, b) => a.label.localeCompare(b.label));
	for (const p of sorted) {
		const color = color_map.get(p.label) || '#94a3b8';
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
	const color_map = rf_reach_polar_color_map(Array.from(all_products.values()));
	const divs = rf_reach_facet_grid_make(container, non_empty.length, 800, 1);
	rf_reach_last_facet_divs = rf_reach_last_facet_divs.concat(divs);
	const trace_index_map = [];
	non_empty.forEach((facet, i) => {
		const traces = [];
		const label_to_idx = {};
		const all_rssi = [];
		for (const p of facet.products.values()) {
			const pairs = p.rotations.map((θ, idx) => ({ θ, r: p.rssi[idx] }))
				.filter(d => Number.isFinite(d.θ) && Number.isFinite(d.r))
				.sort((a, b) => a.θ - b.θ);
			if (pairs.length < 2) continue;
			for (const d of pairs) all_rssi.push(d.r);
			pairs.push({ θ: pairs[0].θ + 360, r: pairs[0].r });
			const color = color_map.get(p.model_label) || '#94a3b8';
			const dash = p.source === 'azimuth_fallback' ? 'dot' : 'solid';
			label_to_idx[p.model_label] = traces.length;
			traces.push({
				type: 'scatterpolar',
				mode: 'lines+markers',
				r: pairs.map(d => d.r),
				theta: pairs.map(d => d.θ),
				name: p.model_label + (p.source === 'azimuth_fallback' ? ` (atten ${p.fallback_atten_db} dB)` : ''),
				line: { color, width: 1.5, dash },
				marker: { color, size: 4 },
				hovertemplate: `<b>${p.model_label}</b><br>θ %{theta:.0f}°<br>RSSI %{r:.1f} dBm<extra></extra>`,
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
	});
	const legend = rf_reach_polar_legend_create(
		Array.from(all_products.values()), color_map, trace_index_map
	);
	container.insertBefore(legend, container.firstChild);
}

function rf_reach_render_cached() {
	const status_div = document.getElementById('crossReportStatus');
	if (!rf_reach_cached_context) return;

	rf_reach_last_facet_divs = [];
	const { normalized, paths, local_suffix, err_suffix } = rf_reach_cached_context;
	const selected_labels = rf_reach_selected_band_labels();
	if (selected_labels.length === 0) {
		status_div.textContent = `No bands selected; ${paths.length} report${paths.length === 1 ? '' : 's'} loaded${local_suffix}${err_suffix}`;
		rf_reach_charts_clear('No bands selected');
		return;
	}

	const filtered = rf_reach_band_filter_apply(normalized);
	const rvr_rows = rf_reach_filter_rvr(filtered);
	const azimuth_rows = rf_reach_filter_azimuth(filtered);
	const polar_rows = rf_reach_filter_polar(filtered);
	status_div.textContent =
		`${paths.length} report${paths.length === 1 ? '' : 's'} loaded; `
		+ `${rvr_rows.length} RvR / ${azimuth_rows.length} azimuth-sweep / ${polar_rows.length} polar rows; `
		+ `bands ${selected_labels.join(', ')}`
		+ `${local_suffix}${err_suffix}`;

	chart_rssi_heatmap_render(document.getElementById('rssiHeatmapDiv'), rvr_rows);
	chart_iphone_bars_render(document.getElementById('iphoneBarsDiv'), rvr_rows);
	chart_eirp_deviation_render(document.getElementById('eirpDeviationDiv'), rvr_rows);
	chart_eirp_deviation_azimuth_render(document.getElementById('eirpDeviationAzimuthDiv'), azimuth_rows);
	chart_iphone_bars_rotation_render(document.getElementById('iphoneBarsRotationDiv'), azimuth_rows);
	chart_polar_render(document.getElementById('polarDiv'), polar_rows, azimuth_rows);
}

function rf_reach_render() {
	rf_reach_band_filter_init();
	const status_div = document.getElementById('crossReportStatus');
	const { paths, local_count } = rf_reach_paths_collect();
	const local_suffix = local_count > 0 ? ` (${local_count} local file${local_count === 1 ? '' : 's'} skipped)` : '';

	if (paths.length === 0) {
		rf_reach_cached_context = null;
		status_div.textContent = local_count > 0
			? `No server-loaded reports. RF Reach requires server-loaded reports.${local_suffix}`
			: 'No reports loaded. Load server reports to use RF Reach.';
		rf_reach_charts_clear('No data');
		return;
	}

	status_div.textContent = `Loading ${paths.length} report${paths.length === 1 ? '' : 's'}...${local_suffix}`;
	rf_reach_last_facet_divs = [];

	const url = '/api/rf-reach-data?paths=' + encodeURIComponent(paths.join(','));
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

			const err_suffix = errs.length > 0 ? ` (${errs.length} report${errs.length === 1 ? '' : 's'} skipped)` : '';
			rf_reach_cached_context = { normalized, paths, local_suffix, err_suffix };
			rf_reach_render_cached();

			if (errs.length > 0) console.warn('rf-reach data errors:', errs);
		})
		.catch(err => {
			console.error('rf-reach data fetch failed:', err);
			rf_reach_cached_context = null;
			status_div.textContent = `Error loading data: ${err.message}`;
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
