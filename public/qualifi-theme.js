// Resolve a CSS custom property from <html> at call time. Used to keep chart
// colors/fonts in sync with the qualifi.css design tokens after the font
// loader IIFE finishes (--mono-font in particular changes between Berkeley
// Mono and IBM Plex Mono depending on what is installed on the server).
function get_css_var(name, fallback) {
	const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	return value || fallback || '';
}

function chart_font_family() {
	return get_css_var('--mono-font', "'IBM Plex Mono', 'SF Mono', monospace");
}

function chart_palette() {
	return {
		text_primary: get_css_var('--text-primary', '#ffffff'),
		text_secondary: get_css_var('--text-secondary', '#a0a0a0'),
		text_tertiary: get_css_var('--text-tertiary', '#707070'),
		grid: get_css_var('--border-subtle', '#2a2a2a'),
		axis_line: get_css_var('--border-default', '#333333'),
		tooltip_bg: get_css_var('--bg-tooltip', '#1f1f1f'),
		tooltip_border: get_css_var('--border-default', '#333333'),
		tx: get_css_var('--tx-color', '#0080ff'),
		rx: get_css_var('--rx-color', '#ff3b30'),
		cyan: get_css_var('--accent-cyan', '#0080ff'),
		green: get_css_var('--accent-success', '#00c896'),
		amber: get_css_var('--accent-warning', '#ff9500'),
		red: get_css_var('--accent-danger', '#ff3b30'),
		blue: get_css_var('--accent-blue', '#0080ff'),
		purple: get_css_var('--accent-purple', '#845ef7')
	};
}

function categorical_palette() {
	return [
		get_css_var('--chart-cat-1', '#3987e5'),
		get_css_var('--chart-cat-2', '#d95926'),
		get_css_var('--chart-cat-3', '#199e70'),
		get_css_var('--chart-cat-4', '#c98500'),
		get_css_var('--chart-cat-5', '#d55181'),
		get_css_var('--chart-cat-6', '#008300'),
		get_css_var('--chart-cat-7', '#9085e9'),
		get_css_var('--chart-cat-8', '#e66767')
	];
}

function band_color(band) {
	if (band === '2G' || band === '2.4') {
		return get_css_var('--band-2g', '#ff6b6b');
	}

	if (band === '5G' || band === '5L') {
		return get_css_var('--band-5g', '#4dabf7');
	}

	if (band === '5H') {
		return get_css_var('--band-5g-high', '#4dabf7');
	}

	if (band === '6G' || band === '6') {
		return get_css_var('--band-6g', '#845ef7');
	}

	return get_css_var('--text-tertiary', '#707070');
}

function series_alpha(hex, alpha) {
	const clamped_alpha = Math.min(1, Math.max(0, alpha));
	const alpha_hex = Math.round(clamped_alpha * 255).toString(16).padStart(2, '0');
	return `${hex}${alpha_hex}`;
}

const SERIES_DASH = { tx: [], rx: [5, 5] };

const ANGLE_DASH_PATTERNS = [
	[],
	[10, 5],
	[5, 3],
	[15, 5, 5, 5],
	[20, 5],
	[10, 5, 2, 5],
	[2, 2],
	[15, 10]
];

function plotly_dash(dash_array) {
	if (!dash_array || dash_array.length === 0) {
		return 'solid';
	}

	if (dash_array.length === 2 && dash_array[0] === 5 && dash_array[1] === 5) {
		return 'dash';
	}

	if (dash_array.length === 2 && dash_array[0] === 2 && dash_array[1] === 2) {
		return 'dot';
	}

	return dash_array.map(length => `${length}px`).join(',');
}

const RAMP_BLUE = [
	[0.0, '#0d366b'], [0.2, '#184f95'], [0.4, '#256abf'],
	[0.6, '#3987e5'], [0.8, '#86b6ef'], [1.0, '#cde2fb']
];

const RAMP_ORANGE = [
	[0.0, '#3d1c07'], [0.2, '#7c2d12'], [0.4, '#b45309'],
	[0.6, '#d95926'], [0.8, '#fb923c'], [1.0, '#fed7aa']
];

const BARS_COLORS = ['#2c2c2a', '#d03b3b', '#fab219', '#0ca30c'];

const SLOT_SHADES = [
	['#3987e5', '#6ba5ec', '#92bdf1', '#2c69b3'],
	['#d95926', '#e3835c', '#eaa488', '#a9451e'],
	['#199e70', '#53b694', '#81cab0', '#147b57'],
	['#c98500', '#d7a440', '#e1bc73', '#9d6800'],
	['#d55181', '#e07da1', '#e89fba', '#a63f65'],
	['#008300', '#40a240', '#73bb73', '#006600'],
	['#9085e9', '#aca4ef', '#c2bcf3', '#7068b6'],
	['#e66767', '#ec8d8d', '#f1abab', '#b35050']
];

const MODEL_MARKERS = ['circle', 'square', 'diamond', 'triangle-up', 'cross', 'x'];

function atten_at_threshold(points, threshold) {
	let crossing_index = -1;

	points.forEach((point, index) => {
		if (point.value >= threshold) {
			crossing_index = index;
		}
	});

	if (crossing_index === -1) {
		return null;
	}

	const p1 = points[crossing_index];
	if (crossing_index === points.length - 1) {
		return { atten: p1.atten, censored: true };
	}

	const p2 = points[crossing_index + 1];
	if (p1.value === p2.value) {
		return { atten: p2.atten, censored: false };
	}

	const atten = p1.atten + (p1.value - threshold) * (p2.atten - p1.atten) / (p1.value - p2.value);
	return { atten, censored: false };
}
