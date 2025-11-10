let chart_instance = null;
let is_batch_loading = false;
let loaded_files = new Map();
let chart_type = 'line';
let server_reports = null;
let selected_server_reports = new Set();
let report_files_map = new Map();
let active_notifications = [];
let current_view_mode = 'cartesian';
let polar_attenuation_values = [];
let current_polar_attenuation = 0;

let is_touch_device = false;
let is_mobile = false;

function detect_device_capabilities() {
	is_touch_device = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
	is_mobile = window.innerWidth <= 768;

	document.body.classList.toggle('touch-device', is_touch_device);
	document.body.classList.toggle('mobile-device', is_mobile);

	console.log('Device capabilities:', { is_touch_device, is_mobile });
}

let touch_start_x = 0;
let touch_start_y = 0;
let touch_end_x = 0;
let touch_end_y = 0;

function handle_touch_start(e) {
	touch_start_x = e.changedTouches[0].screenX;
	touch_start_y = e.changedTouches[0].screenY;
}

function handle_touch_end(e) {
	touch_end_x = e.changedTouches[0].screenX;
	touch_end_y = e.changedTouches[0].screenY;
	handle_swipe();
}

function handle_swipe() {
	const x_diff = touch_start_x - touch_end_x;
	const y_diff = touch_start_y - touch_end_y;
	const min_swipe_distance = 80;
	const max_vertical_drift = 100;

	if (Math.abs(x_diff) > min_swipe_distance &&
		Math.abs(y_diff) < max_vertical_drift &&
		Math.abs(x_diff) > Math.abs(y_diff) * 2) {

		const tabs = document.querySelectorAll('.tab-button');
		const active_tab = document.querySelector('.tab-button.active');

		if (x_diff > 0 && active_tab === tabs[1]) {
			switch_tab('server');
		} else if (x_diff < 0 && active_tab === tabs[0]) {
			switch_tab('local');
		}
	}
}

Chart.defaults.font.family = "var(--primary-font)";
Chart.defaults.color = '#e0e0e0';

window.addEventListener('fontLoaded', function(event) {
	const fontFamily = event.detail.font === 'Berkeley Mono' ?
		"'Berkeley Mono', 'Courier New', monospace" :
		"'Poppins', sans-serif";

	Chart.defaults.font.family = fontFamily;
	console.log('Chart.js font updated to:', fontFamily);

	if (chart_instance) {
		chart_instance.update();
	}
});

document.addEventListener('DOMContentLoaded', () => {
	detect_device_capabilities();

	if (is_touch_device) {
		const source_tabs = document.querySelector('.source-tabs');
		if (source_tabs) {
			source_tabs.addEventListener('touchstart', handle_touch_start, { passive: true });
			source_tabs.addEventListener('touchend', handle_touch_end, { passive: true });
		}
	}

	window.addEventListener('resize', debounced_resize);

	load_server_reports();
	initialize_local_file_upload();
});
