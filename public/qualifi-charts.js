function get_responsive_chart_config() {
	const is_small_screen = window.innerWidth <= 768;
	const is_tablet = window.innerWidth <= 1024 && window.innerWidth > 768;
	const is_very_small = window.innerWidth <= 480;
	const palette = chart_palette();
	const font_family = chart_font_family();

	return {
		responsive: true,
		maintainAspectRatio: false,
		interaction: {
			intersect: false,
			mode: 'index',
		},
		plugins: {
			tooltip: {
				enabled: true,
				mode: 'index',
				intersect: false,
				displayColors: true,
				backgroundColor: palette.tooltip_bg,
				titleColor: palette.text_primary,
				bodyColor: palette.text_secondary,
				borderColor: palette.tooltip_border,
				borderWidth: 1,
				cornerRadius: 6,
				padding: is_small_screen ? 8 : 12,
				titleFont: {
					family: font_family,
					size: is_small_screen ? 11 : 13,
					weight: 'bold'
				},
				bodyFont: {
					family: font_family,
					size: is_small_screen ? 10 : 12
				},
				callbacks: {
					title: function(context) {
						const point = context[0];
						return `Attenuation: ${point.parsed.x} dB`;
					},
					label: function(context) {
						const dataset = context.dataset;
						const value = context.parsed.y;
						return `${dataset.label}: ${value.toFixed(1)} Mbps`;
					}
				}
			},
			legend: {
				display: !is_small_screen,
				position: is_tablet ? 'bottom' : 'top',
				labels: {
					color: palette.text_secondary,
					font: {
						family: font_family,
						size: is_small_screen ? 10 : 12
					},
					padding: is_small_screen ? 8 : 16,
					usePointStyle: true
				}
			},
			zoom: {
				zoom: {
					// Wheel gated on Ctrl so page scroll over the chart is not
					// hijacked; plain drag pans, Shift+drag box-zooms.
					wheel: { enabled: true, modifierKey: 'ctrl' },
					pinch: { enabled: true },
					drag: { enabled: true, modifierKey: 'shift' },
					mode: 'xy',
					onZoomComplete: chart_zoom_mark
				},
				pan: {
					enabled: true,
					mode: 'xy',
					onPanComplete: chart_zoom_mark
				}
			}
		},
		scales: {
			x: {
				type: 'linear',
				title: {
					display: true,
					text: 'Attenuation (dB)',
					color: palette.text_secondary,
					font: {
						family: font_family,
						size: is_small_screen ? 10 : 12,
						weight: 'bold'
					}
				},
				ticks: {
					color: palette.text_tertiary,
					font: {
						family: font_family,
						size: is_small_screen ? 9 : 11
					},
					maxTicksLimit: is_small_screen ? 6 : 10
				},
				grid: {
					color: palette.grid
				}
			},
			y: {
				title: {
					display: true,
					text: 'Throughput (Mbps)',
					color: palette.text_secondary,
					font: {
						family: font_family,
						size: is_small_screen ? 10 : 12,
						weight: 'bold'
					}
				},
				ticks: {
					color: palette.text_tertiary,
					font: {
						family: font_family,
						size: is_small_screen ? 9 : 11
					},
					maxTicksLimit: is_small_screen ? 6 : 8
				},
				grid: {
					color: palette.grid
				}
			}
		},
		elements: {
			line: {
				borderWidth: is_very_small ? 1.5 : is_small_screen ? 2 : 3,
				tension: 0.1
			},
			point: {
				radius: is_very_small ? 2 : is_touch_device ? 4 : 3,
				hoverRadius: is_very_small ? 6 : is_touch_device ? 8 : 6,
				hitRadius: is_touch_device ? 12 : 8
			}
		},
		animation: {
			duration: is_small_screen ? 500 : 1000
		}
	};
}

function get_country_code(country_value) {
	if (!country_value) return '';
	const text = country_value.toString().trim();
	if (!text || text.toLowerCase() === 'unknown') return '';
	const match = text.match(/^country\s*:\s*(.+)$/i);
	return (match ? match[1] : text).trim();
}

function device_key_get(device_info, file_name) {
	return device_info?.['Model Number'] || device_info?.Name || file_name;
}

// Sticky device -> palette-slot map. A device keeps its slot for as long as
// any of its files stay loaded, so changing the selection never repaints
// surviving series. Slots free up only when the device's files are removed
// (device_slots_prune, hooked into update_test_options).
const device_slot_map = new Map();

function device_slot_acquire(device_key) {
	if (device_slot_map.has(device_key)) return device_slot_map.get(device_key);
	const used = new Set(device_slot_map.values());
	let slot = 0;
	while (used.has(slot)) slot++;
	device_slot_map.set(device_key, slot);
	return slot;
}

function device_slots_prune() {
	const present = new Set();
	loaded_files.forEach(entry => {
		present.add(device_key_get(entry.device_info, entry.file_name));
	});
	for (const key of Array.from(device_slot_map.keys())) {
		if (!present.has(key)) device_slot_map.delete(key);
	}
}

function series_identity_key(test) {
	const device = device_key_get(test.device_info, test.file_name);
	const sw = test.device_info?.['Software Version'] || '';
	const country = get_country_code(test.device_info?.Country);
	return `${device}|${sw}|${country}|${formatTestName(test)}`;
}

// Color follows the entity under comparison. Two or more devices selected:
// hue per device (config/direction stay distinguishable via marker shape and
// dash), older software versions of a device step toward the surface so the
// newest build owns the full hue. Single device selected: the configs are
// the compared entities, so each (version, config) takes its own slot hue,
// like the tool always did for one-device analysis.
function assign_series_identity(tests_to_render) {
	const palette = categorical_palette();
	const overflow_color = get_css_var('--chart-cat-overflow', '#8a8a8a');
	const surface = get_css_var('--bg-secondary', '#141414');
	const infos = tests_to_render.map(test => ({
		key: series_identity_key(test),
		device_key: device_key_get(test.device_info, test.file_name),
		sw: test.device_info?.['Software Version'] || '',
		country: get_country_code(test.device_info?.Country),
		config: formatTestName(test)
	}));
	const device_keys = new Set(infos.map(i => i.device_key));
	const identity = new Map();
	const overflow_devices = new Set();
	if (device_keys.size <= 1) {
		const config_slots = new Map();
		for (const i of infos) {
			const ckey = `${i.sw}|${i.country}|${i.config}`;
			if (!config_slots.has(ckey)) config_slots.set(ckey, config_slots.size);
			const slot = config_slots.get(ckey);
			identity.set(i.key, {
				color: slot < palette.length ? palette[slot] : overflow_color,
				device_key: i.device_key
			});
			if (slot >= palette.length) overflow_devices.add(i.config);
		}
		return { identity, overflow: overflow_devices, device_count: device_keys.size };
	}
	const versions_per_device = new Map();
	for (const i of infos) {
		if (!versions_per_device.has(i.device_key)) versions_per_device.set(i.device_key, new Set());
		versions_per_device.get(i.device_key).add(i.sw);
	}
	for (const i of infos) {
		const slot = device_slot_acquire(i.device_key);
		let color = slot < palette.length ? palette[slot] : overflow_color;
		if (slot >= palette.length) overflow_devices.add(i.device_key);
		const versions = Array.from(versions_per_device.get(i.device_key)).sort(compare_versions);
		const steps_back = versions.length - 1 - versions.indexOf(i.sw);
		if (steps_back > 0) color = color_blend(color, surface, Math.min(steps_back, 2) * 0.22);
		identity.set(i.key, { color, device_key: i.device_key });
	}
	return { identity, overflow: overflow_devices, device_count: device_keys.size };
}

// Measured PHY vs the configured baseline. Shared by the tooltip text and
// the open-marker styling so both always agree on what "degraded" means.
function point_degradations(point, fullTest) {
	const degradations = [];
	const direction = point.direction || fullTest.direction;
	const param_type = direction && direction.includes('TX') ? 'TX'
		: direction && direction.includes('RX') ? 'RX' : 'PHY';
	if (fullTest.nss && point.nss && point.nss !== fullTest.nss) {
		degradations.push(`${param_type} NSS: ${fullTest.nss}→${point.nss}`);
	}
	if (fullTest.bandwidth && point.bandwidth
		&& parseFloat(point.bandwidth) !== parseFloat(fullTest.bandwidth)) {
		degradations.push(`${param_type} BW: ${fullTest.bandwidth}→${point.bandwidth}MHz`);
	}
	const baseline_point = fullTest.data && fullTest.data[0];
	if (baseline_point && baseline_point.mode && point.mode && point.mode !== baseline_point.mode) {
		degradations.push(`${param_type} Mode: ${baseline_point.mode}→${point.mode}`);
	}
	return degradations;
}

function point_is_degraded(ctx) {
	if (!ctx.raw || !ctx.raw.pointData || ctx.dataIndex === 0) return false;
	const fullTest = ctx.dataset.fullTest;
	return fullTest ? point_degradations(ctx.raw.pointData, fullTest).length > 0 : false;
}

let legend_pin_key = null;

function legend_highlight_apply(chart, legendItem) {
	chart.data.datasets.forEach((ds, i) => {
		const keep = legendItem.datasetIndex === -1
			? ds.device_key === legendItem.device_key
			: i === legendItem.datasetIndex;
		ds.borderColor = keep ? ds._baseColor : series_alpha(ds._baseColor, 0.15);
	});
	chart.update('none');
}

function legend_highlight_clear(chart) {
	chart.data.datasets.forEach(ds => { ds.borderColor = ds._baseColor; });
	chart.update('none');
}

let chart_zoom_active = false;

function chart_zoom_mark() {
	chart_zoom_active = true;
	const btn = document.getElementById('resetZoomButton');
	if (btn) btn.style.display = 'inline-block';
}

function chart_reset_zoom() {
	chart_zoom_active = false;
	const btn = document.getElementById('resetZoomButton');
	if (btn) btn.style.display = 'none';
	if (chart_instance && typeof chart_instance.resetZoom === 'function') {
		chart_instance.resetZoom();
	}
}

// Index-mode tooltips list every series at the hovered X; past ~10 that stops
// being readable. Keep the top values (itemSort orders them descending) and
// point at the table view for the rest. The cache avoids recomputing the
// cutoff for every item of one tooltip.
const CHART_TOOLTIP_CAP = 10;
const chart_tooltip_rank_cache = { x: null, cutoff: -Infinity, total: 0 };

function chart_tooltip_rank_filter(item) {
	if (chart_tooltip_rank_cache.x !== item.parsed.x) {
		const ys = [];
		item.chart.data.datasets.forEach((ds, di) => {
			if (item.chart.getDatasetMeta(di).hidden) return;
			for (const p of ds.data) {
				if (p.x === item.parsed.x) {
					ys.push(p.y);
					break;
				}
			}
		});
		ys.sort((a, b) => b - a);
		chart_tooltip_rank_cache.x = item.parsed.x;
		chart_tooltip_rank_cache.total = ys.length;
		chart_tooltip_rank_cache.cutoff =
			ys.length > CHART_TOOLTIP_CAP ? ys[CHART_TOOLTIP_CAP - 1] : -Infinity;
	}
	return item.parsed.y >= chart_tooltip_rank_cache.cutoff;
}

function chart_tooltip_footer(items) {
	const hidden = chart_tooltip_rank_cache.total - items.length;
	return hidden > 0 ? `+ ${hidden} more series (see table view)` : '';
}

const qualifi_crosshair_plugin = {
	id: 'qualifi_crosshair',
	afterDraw(chart) {
		if (chart.config.type !== 'line') return;
		const active = chart.tooltip ? chart.tooltip.getActiveElements() : [];
		if (!active.length) return;
		const x = active[0].element.x;
		const ctx = chart.ctx;
		ctx.save();
		ctx.strokeStyle = chart_palette().grid;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(x, chart.chartArea.top);
		ctx.lineTo(x, chart.chartArea.bottom);
		ctx.stroke();
		ctx.restore();
	}
};

let chart_table_visible = false;

function chart_table_toggle() {
	chart_table_visible = !chart_table_visible;
	const container = document.getElementById('chartDataTable');
	if (container) container.style.display = chart_table_visible ? 'block' : 'none';
	const btn = document.getElementById('tableViewToggle');
	if (btn) btn.textContent = chart_table_visible ? 'Hide Table' : 'Table View';
	if (chart_table_visible) chart_table_render();
}

// Table twin of the RvR chart: every plotted value reachable without hover.
function chart_table_render() {
	const container = document.getElementById('chartDataTable');
	if (!container) return;
	container.textContent = '';
	if (!chart_instance || chart_instance.data.datasets.length === 0) return;
	const datasets = chart_instance.data.datasets;
	const x_set = new Set();
	const lookups = datasets.map(ds => {
		const map = new Map();
		ds.data.forEach(p => {
			x_set.add(p.x);
			map.set(p.x, p.y);
		});
		return map;
	});
	const xs = Array.from(x_set).sort((a, b) => a - b);
	const first_test = datasets[0].fullTest;
	const x_label = first_test && first_test.test_type === 'rotation' ? 'Angle (deg)' : 'Atten (dB)';
	const table = document.createElement('table');
	const thead = document.createElement('thead');
	const head_row = document.createElement('tr');
	const x_th = document.createElement('th');
	x_th.textContent = x_label;
	head_row.appendChild(x_th);
	datasets.forEach(ds => {
		const th = document.createElement('th');
		const dot = document.createElement('span');
		dot.className = 'rf-table-dot';
		dot.style.background = ds._baseColor;
		th.appendChild(dot);
		th.appendChild(document.createTextNode(ds.label));
		head_row.appendChild(th);
	});
	thead.appendChild(head_row);
	const tbody = document.createElement('tbody');
	for (const x of xs) {
		const tr = document.createElement('tr');
		const x_td = document.createElement('td');
		x_td.textContent = String(x);
		tr.appendChild(x_td);
		lookups.forEach(map => {
			const td = document.createElement('td');
			const y = map.get(x);
			td.textContent = y === undefined ? '—' : y.toFixed(1);
			tr.appendChild(td);
		});
		tbody.appendChild(tr);
	}
	table.append(thead, tbody);
	container.appendChild(table);
}

function chart_notice_render(messages) {
	const div = document.getElementById('chartNotice');
	if (!div) return;
	if (!messages || messages.length === 0 || div.dataset.dismissed === '1') {
		div.style.display = 'none';
		return;
	}
	div.textContent = '';
	const text = document.createElement('span');
	text.textContent = messages.join(' · ');
	const close = document.createElement('button');
	close.type = 'button';
	close.className = 'chart-notice-close';
	close.textContent = 'x';
	close.title = 'Dismiss for this session';
	close.addEventListener('click', () => {
		div.dataset.dismissed = '1';
		div.style.display = 'none';
	});
	div.append(text, close);
	div.style.display = 'flex';
}

function handle_resize() {
	const was_mobile = is_mobile;
	detect_device_capabilities();

	if (was_mobile !== is_mobile && chart_instance) {
		chart_instance.options = {
			...chart_instance.options,
			...get_responsive_chart_config()
		};
		chart_instance.update('resize');
	}
}

let resize_timeout;
function debounced_resize() {
	clearTimeout(resize_timeout);
	resize_timeout = setTimeout(handle_resize, 250);
}

function toggleChartType() {
	chart_type = chart_type === 'line' ? 'bar' : 'line';
	updateChart();
}

function export_chart() {
	const link = document.createElement('a');

	if (current_view_mode === 'polar') {
		const polar_chart_div = document.getElementById('polarChart');
		if (!polar_chart_div) return;

		Plotly.toImage(polar_chart_div, {
			format: 'png',
			width: 1200,
			height: 1200
		}).then(url => {
			link.download = 'wifi-rvr-polar-comparison.png';
			link.href = url;
			link.click();
		});
	} else {
		if (!chart_instance) return;

		link.download = 'wifi-rvr-comparison.png';
		link.href = chart_instance.toBase64Image();
		link.click();
	}
}

async function export_polar_gif() {
	if (polar_attenuation_values.length === 0) {
		show_error('No attenuation data available for GIF export');
		return;
	}

	if (typeof gifshot === 'undefined') {
		show_error('GIF library not loaded. Please refresh the page and try again.');
		return;
	}

	const loading_msg = document.createElement('div');
	loading_msg.className = 'loading';
	loading_msg.textContent = 'Creating animated GIF...';
	document.body.appendChild(loading_msg);

	try {
		const polar_chart_div = document.getElementById('polarChart');
		const checkboxes = document.querySelectorAll('.test-checkbox:checked');
		const selected_tests = [];

		checkboxes.forEach(cb => {
			const [file_name, test_name] = cb.value.split(':::');
			const fileData = loaded_files.get(file_name);
			const test = fileData.rvr_data.find(t => t.name === test_name);
			if (test) {
				selected_tests.push({
					...test,
					file_name: file_name,
					device_info: fileData.device_info
				});
			}
		});

		const total_duration_seconds = 10;
		const gif_width = 1200;
		const gif_height = 1200;
		const images = [];

		console.log('Creating GIF with', polar_attenuation_values.length, 'frames');

		for (let i = 0; i < polar_attenuation_values.length; i++) {
			const attenuation = polar_attenuation_values[i];

			loading_msg.textContent = `Capturing frames... ${i + 1}/${polar_attenuation_values.length}`;
			console.log('Capturing frame', i + 1, 'at attenuation', attenuation, 'dB');

			draw_polar_chart(selected_tests, attenuation);

			await new Promise(resolve => setTimeout(resolve, 100));

			const image_data_url = await Plotly.toImage(polar_chart_div, {
				format: 'png',
				width: gif_width,
				height: gif_height
			});

			images.push(image_data_url);
		}

		console.log('All frames captured, adding end pause...');

		const last_frame = images[images.length - 1];
		const frame_duration = total_duration_seconds / polar_attenuation_values.length;
		const pause_frames = Math.ceil(5 / frame_duration);

		for (let i = 0; i < pause_frames; i++) {
			images.push(last_frame);
		}

		console.log('Creating GIF...');
		loading_msg.textContent = 'Creating GIF...';

		gifshot.createGIF({
			images: images,
			gifWidth: gif_width,
			gifHeight: gif_height,
			interval: frame_duration,
			frameDuration: 1,
			sampleInterval: 10,
			numWorkers: 2,
			loop: 1
		}, (obj) => {
			if (!obj.error) {
				console.log('GIF created successfully');
				const link = document.createElement('a');
				link.download = 'wifi-rvr-polar-animation.gif';
				link.href = obj.image;
				document.body.appendChild(link);
				link.click();
				document.body.removeChild(link);

				loading_msg.remove();
				show_success('GIF exported successfully');

				draw_polar_chart(selected_tests, current_polar_attenuation);
			} else {
				console.error('GIF creation error:', obj.error);
				loading_msg.remove();
				show_error(`Failed to create GIF: ${obj.errorMsg}`);
			}
		});

	} catch (error) {
		console.error('Error creating GIF:', error);
		loading_msg.remove();
		show_error(`Failed to create GIF: ${error.message}`);
	}
}

function export_csv() {
	const selected_tests = [];
	const checkboxes = document.querySelectorAll('.test-checkbox:checked');

	checkboxes.forEach(cb => {
		const [file_name, test_name] = cb.value.split(':::');
		const fileData = loaded_files.get(file_name);
		const test = fileData.rvr_data.find(t => t.name === test_name);

		if (test) {
			selected_tests.push({
				...test,
				file_name: file_name,
				device_info: fileData.device_info
			});
		}
	});

	if (selected_tests.length === 0) return;

	const csv_escape = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
	let csv = 'Device,Model,Software Version,Test Configuration,Direction,Band,Mode (0dB),Attenuation (dB),Throughput (Mbps),Angle (deg),Point Mode,Point MCS,Point NSS,Point BW (MHz),Frequency (MHz)\n';

	selected_tests.forEach(test => {
		const deviceName = test.device_info?.Name || test.file_name;
		const model = test.device_info?.['Model Number'] || 'Unknown';
		const version = test.device_info?.['Software Version'] || 'Unknown';
		const config = formatTestName(test);
		const band = test.band || 'UNK';
		const mode = test.mode || 'Unknown';

		const sorted_data = test.test_type === 'rotation'
			? test.data
			: [...test.data].sort((a, b) => a.attenuation - b.attenuation);

		sorted_data.forEach(point => {
			const attenuation = test.test_type === 'rotation' ? '' : point.attenuation;
			const fields = [
				deviceName,
				model,
				version,
				config,
				test.direction,
				band,
				mode,
				attenuation,
				point.throughput,
				point.angle,
				point.mode,
				point.mcs,
				point.nss,
				point.bandwidth,
				point.frequency
			];
			csv += `${fields.map(csv_escape).join(',')}\n`;
		});
	});

	const blob = new Blob([csv], { type: 'text/csv' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.download = `wifi_rvr_comparison_${new Date().toISOString().split('T')[0]}.csv`;
	link.href = url;
	link.click();
	URL.revokeObjectURL(url);
}

function toggle_view_mode() {
	const toggle_btn = document.getElementById('viewModeToggle');
	const cartesian_wrapper = document.getElementById('cartesianChartWrapper');
	const polar_wrapper = document.getElementById('polarChartWrapper');
	const toggle_chart_type_btn = document.querySelector('.chart-button[onclick="toggleChartType()"]');
	const chart_container = document.querySelector('.chart-container');

	if (current_view_mode === 'cartesian') {
		current_view_mode = 'polar';
		toggle_btn.textContent = 'Switch to Standard View';
		cartesian_wrapper.style.display = 'none';
		polar_wrapper.style.display = 'block';
		if (toggle_chart_type_btn) toggle_chart_type_btn.style.display = 'none';
		if (chart_container) chart_container.classList.add('polar-mode');
		updateChart();
	} else {
		current_view_mode = 'cartesian';
		toggle_btn.textContent = 'Switch to Polar View';
		cartesian_wrapper.style.display = 'block';
		polar_wrapper.style.display = 'none';
		if (chart_container) chart_container.classList.remove('polar-mode');
		if (toggle_chart_type_btn) toggle_chart_type_btn.style.display = 'inline-block';
		updateChart();
	}
}

function update_polar_attenuation() {
	const slider = document.getElementById('polarAttenuationInput');
	const value_display = document.getElementById('polarAttenuationValue');
	const slider_value = parseFloat(slider.value);

	if (polar_attenuation_values.length > 0) {
		const idx = Math.round((slider_value / 100) * (polar_attenuation_values.length - 1));
		current_polar_attenuation = polar_attenuation_values[idx];
		value_display.textContent = `${current_polar_attenuation} dB`;

		const selected_tests = [];
		const checkboxes = document.querySelectorAll('.test-checkbox:checked');
		checkboxes.forEach(cb => {
			const [file_name, test_name] = cb.value.split(':::');
			const fileData = loaded_files.get(file_name);
			const test = fileData.rvr_data.find(t => t.name === test_name);
			if (test) {
				selected_tests.push({
					...test,
					file_name: file_name,
					device_info: fileData.device_info
				});
			}
		});

		draw_polar_chart(selected_tests, current_polar_attenuation);
	}
}

function draw_polar_chart(selected_tests, attenuation_filter = null) {
	const polar_chart_div = document.getElementById('polarChart');

	const traces = [];
	const palette = chart_palette();
	const rotation_tests = selected_tests.filter(t => t.has_rotation);
	const polar_identity = assign_series_identity(rotation_tests).identity;

	rotation_tests.forEach((test) => {

		let data_to_plot = test.data;

		if (attenuation_filter !== null && test.test_type === 'rvr_rotation') {
			data_to_plot = test.data.filter(point =>
				point.attenuation !== null &&
				Math.abs(point.attenuation - attenuation_filter) < 0.1
			);
		}

		const angle_map = new Map();
		data_to_plot.forEach(point => {
			if (point.angle !== null && point.throughput !== null) {
				if (!angle_map.has(point.angle)) {
					angle_map.set(point.angle, []);
				}
				angle_map.set(point.angle, [...angle_map.get(point.angle), point.throughput]);
			}
		});

		const angles = [];
		const throughputs = [];
		Array.from(angle_map.keys()).sort((a, b) => a - b).forEach(angle => {
			const values = angle_map.get(angle);
			const avg_throughput = values.reduce((sum, val) => sum + val, 0) / values.length;
			angles.push(angle);
			throughputs.push(avg_throughput);
		});

		if (angles.length > 0 && angles[angles.length - 1] !== angles[0]) {
			angles.push(angles[0]);
			throughputs.push(throughputs[0]);
		}

		const device_name = test.device_info?.['Model Number'] || test.device_info?.Name || test.file_name || 'Unknown';
		const software_version = test.device_info?.['Software Version'] || '';
		const country = get_country_code(test.device_info?.Country);
		const test_config = formatTestName(test);
		const direction = test.direction || 'Unknown';
		let trace_name = `${device_name} ${software_version ? `v${software_version}` : ''}${country ? ` - ${country}` : ''} - ${test_config} ${direction}`;

		const rotation_match = trace_name.match(/\(Rotation: [^)]+\)/);
		if (rotation_match) {
			const rotation_part = rotation_match[0];
			trace_name = trace_name.replace(rotation_part, '').replace(/\s+/g, ' ').trim();
			trace_name = `${trace_name} ${rotation_part}`;
		}

		const identity = polar_identity.get(series_identity_key(test));
		const color = identity ? identity.color : get_css_var('--chart-cat-overflow', '#8a8a8a');

		const is_rx = direction.toLowerCase().includes('rx');
		const line_style = is_rx ? 'dash' : 'solid';

		traces.push({
			type: 'scatterpolar',
			mode: 'lines+markers',
			r: throughputs,
			theta: angles,
			name: trace_name,
			line: {
				color: color,
				width: 2,
				dash: line_style
			},
			marker: {
				size: 6,
				color: color,
				symbol: 'circle'
			}
		});
	});

	if (traces.length === 0) {
		polar_chart_div.innerHTML = `<div style="text-align: center; padding: 100px; color: ${palette.text_tertiary};">No rotation data available for polar plot</div>`;
		return;
	}

	const font_family = chart_font_family();

	const layout = {
		polar: {
			radialaxis: {
				title: {
					text: 'Throughput (Mbps)',
					font: {
						family: font_family,
						size: 14,
						color: palette.text_secondary
					}
				},
				visible: true,
				range: [0, null],
				color: palette.text_secondary,
				gridcolor: palette.grid,
				tickfont: {
					family: font_family,
					color: palette.text_tertiary
				}
			},
			angularaxis: {
				direction: 'clockwise',
				rotation: 90,
				thetaunit: 'degrees',
				tickmode: 'linear',
				tick0: 0,
				dtick: 45,
				color: palette.text_secondary,
				gridcolor: palette.grid,
				tickfont: {
					family: font_family,
					color: palette.text_tertiary
				}
			},
			bgcolor: 'rgba(0, 0, 0, 0)'
		},
		showlegend: true,
		legend: {
			font: {
				family: font_family,
				size: 10,
				color: palette.text_secondary
			},
			bgcolor: get_css_var('--bg-elevated', '#1a2236'),
			bordercolor: palette.tooltip_border,
			borderwidth: 1,
			orientation: 'h',
			x: 0.5,
			y: 1.18,
			xanchor: 'center',
			yanchor: 'bottom'
		},
		title: attenuation_filter !== null ? {
			text: `Attenuation: ${attenuation_filter} dB`,
			font: {
				family: font_family,
				size: 16,
				color: palette.text_primary
			},
			x: 0.5,
			xanchor: 'center',
			y: 1.02,
			yanchor: 'bottom'
		} : undefined,
		paper_bgcolor: 'transparent',
		plot_bgcolor: 'transparent',
		font: {
			family: font_family,
			color: palette.text_secondary
		},
		margin: {
			l: 80,
			r: 80,
			t: 140,
			b: 80
		},
		hovermode: 'closest'
	};

	const config = {
		responsive: true,
		displayModeBar: true,
		displaylogo: false,
		modeBarButtonsToRemove: ['lasso2d', 'select2d']
	};

	Plotly.newPlot(polar_chart_div, traces, layout, config);
}
function updateChart() {
	const selected_tests = [];
	const checkboxes = document.querySelectorAll('.test-checkbox:checked');

	checkboxes.forEach(cb => {
		const [file_name, test_name] = cb.value.split(':::');
		const fileData = loaded_files.get(file_name);
		const test = fileData.rvr_data.find(t => t.name === test_name);

		if (test) {
			selected_tests.push({
				...test,
				file_name: file_name,
				device_info: fileData.device_info
			});
		}
	});

	if (selected_tests.length === 0) {
		document.querySelector('.chart-container').style.display = 'none';
		document.querySelector('.stats-panel').style.display = 'none';
		document.querySelector('#comparisonPanel').style.display = 'none';
		document.getElementById('rotationControls').style.display = 'none';
		return;
	}

	const has_rvr_rotation = selected_tests.some(t => t.test_type === 'rvr_rotation');
	const min_angle_increment = Math.min(...selected_tests
		.filter(t => t.angle_increment > 0)
		.map(t => t.angle_increment), Infinity);

	const show_angle_selector = has_rvr_rotation && min_angle_increment > 20;

	if (show_angle_selector) {
		const all_angles = new Set();
		selected_tests.forEach(t => {
			if (t.test_type === 'rvr_rotation' && t.angles && t.angles.length > 0) {
				t.angles.forEach(angle => all_angles.add(angle));
			}
		});
		const sorted_angles = Array.from(all_angles).sort((a, b) => a - b);

		const angle_checkboxes_container = document.getElementById('angleCheckboxes');

		const currently_selected = [];
		const existingSelect = document.getElementById('angleSelect');
		if (existingSelect) {
			Array.from(existingSelect.selectedOptions).forEach(opt => {
				currently_selected.push(parseFloat(opt.value));
			});
		} else {
			const existingCheckboxes = document.querySelectorAll('#angleCheckboxes input[type="checkbox"]:checked');
			existingCheckboxes.forEach(cb => {
				currently_selected.push(parseFloat(cb.value));
			});
		}

		if (currently_selected.length === 0) {
			currently_selected.push(0);
		}

		angle_checkboxes_container.innerHTML = '';

		if (sorted_angles.length <= 8) {
			sorted_angles.forEach((angle, idx) => {
				const checkbox_wrapper = document.createElement('label');
				checkbox_wrapper.className = 'angle-checkbox-label';
				const checkbox = document.createElement('input');
				checkbox.type = 'checkbox';
				checkbox.value = angle;
				checkbox.checked = currently_selected.includes(angle);
				checkbox.onchange = updateChart;
				checkbox_wrapper.appendChild(checkbox);
				checkbox_wrapper.appendChild(document.createTextNode(` ${angle}°`));
				angle_checkboxes_container.appendChild(checkbox_wrapper);
			});
		} else {
			const select = document.createElement('select');
			select.id = 'angleSelect';
			select.multiple = true;
			select.size = Math.min(8, sorted_angles.length);
			select.style.width = '100%';
			select.onchange = updateChart;
			sorted_angles.forEach(angle => {
				const option = document.createElement('option');
				option.value = angle;
				option.textContent = `${angle}°`;
				option.selected = currently_selected.includes(angle);
				select.appendChild(option);
			});
			angle_checkboxes_container.appendChild(select);

			const hint = document.createElement('div');
			hint.style.fontSize = '0.85em';
			hint.style.color = get_css_var('--text-tertiary', '#9ca3af');
			hint.style.marginTop = '8px';
			hint.textContent = 'Hold Ctrl/Cmd to select multiple angles';
			angle_checkboxes_container.appendChild(hint);
		}

		document.getElementById('rotationControls').style.display = 'block';
	} else {
		document.getElementById('rotationControls').style.display = 'none';
	}

	document.querySelector('.chart-container').style.display = 'block';
	document.querySelector('.stats-panel').style.display = 'block';

	const has_rotation_data = selected_tests.some(t => t.has_rotation);
	const view_mode_toggle = document.getElementById('viewModeToggle');
	const polar_slider = document.getElementById('polarAttenuationSlider');
	const export_gif_button = document.getElementById('exportGifButton');

	if (has_rotation_data) {
		view_mode_toggle.style.display = 'inline-block';

		if (current_view_mode === 'polar') {
			document.getElementById('cartesianChartWrapper').style.display = 'none';
			document.getElementById('polarChartWrapper').style.display = 'block';
			document.getElementById('rotationControls').style.display = 'none';

			if (has_rvr_rotation) {
				const all_attenuations = new Set();
				selected_tests.forEach(t => {
					if (t.test_type === 'rvr_rotation') {
						t.data.forEach(point => {
							if (point.attenuation !== null) {
								all_attenuations.add(point.attenuation);
							}
						});
					}
				});
				polar_attenuation_values = Array.from(all_attenuations).sort((a, b) => a - b);

				if (polar_attenuation_values.length > 0) {
					polar_slider.style.display = 'flex';
					export_gif_button.style.display = 'inline-block';
					const slider_input = document.getElementById('polarAttenuationInput');
					slider_input.max = 100;
					slider_input.value = 0;
					current_polar_attenuation = polar_attenuation_values[0];
					document.getElementById('polarAttenuationValue').textContent = `${current_polar_attenuation} dB`;
					draw_polar_chart(selected_tests, current_polar_attenuation);
				} else {
					polar_slider.style.display = 'none';
					export_gif_button.style.display = 'none';
					draw_polar_chart(selected_tests, null);
				}
			} else {
				polar_slider.style.display = 'none';
				export_gif_button.style.display = 'none';
				draw_polar_chart(selected_tests, null);
			}
		} else {
			document.getElementById('cartesianChartWrapper').style.display = 'block';
			document.getElementById('polarChartWrapper').style.display = 'none';
			polar_slider.style.display = 'none';
			export_gif_button.style.display = 'none';
			if (show_angle_selector) {
				document.getElementById('rotationControls').style.display = 'block';
			}
			drawChart(selected_tests);
		}
	} else {
		view_mode_toggle.style.display = 'none';
		polar_slider.style.display = 'none';
		export_gif_button.style.display = 'none';
		document.getElementById('cartesianChartWrapper').style.display = 'block';
		document.getElementById('polarChartWrapper').style.display = 'none';
		current_view_mode = 'cartesian';
		drawChart(selected_tests);
	}

	updateStats(selected_tests);

	// Show comparison panel if comparing multiple devices/versions
	const uniqueDevices = new Set(selected_tests.map(t => {
		const name = t.device_info?.Name || '';
		const model = t.device_info?.['Model Number'] || '';
		const version = t.device_info?.['Software Version'] || '';
		return [name, model, version].filter(Boolean).join('|') || t.file_name;
	}));
	if (uniqueDevices.size > 1) {
		document.querySelector('#comparisonPanel').style.display = 'block';
		updateComparisonTable(selected_tests);
	} else {
		document.querySelector('#comparisonPanel').style.display = 'none';
	}
}
function drawChart(selected_tests) {
	const ctx = document.getElementById('rvrChart').getContext('2d');

	let zoom_restore = null;
	if (chart_instance) {
		// The chart is destroyed and rebuilt on every selection change; keep
		// the analyst's zoom viewport across that rebuild.
		if (chart_zoom_active && chart_instance.scales && chart_instance.scales.x) {
			zoom_restore = {
				x: { min: chart_instance.scales.x.min, max: chart_instance.scales.x.max },
				y: { min: chart_instance.scales.y.min, max: chart_instance.scales.y.max }
			};
		}
		chart_instance.destroy();
	}
	legend_pin_key = null;

	const test_types = new Set(selected_tests.map(t => t.test_type || 'rvr'));
	const is_pure_rotation = test_types.has('rotation') && test_types.size === 1;
	const has_rvr_rotation = test_types.has('rvr_rotation');

	let selected_angles = [];
	if (has_rvr_rotation) {
		const rotationControlsVisible = document.getElementById('rotationControls').style.display !== 'none';
		if (rotationControlsVisible) {
			const angleSelect = document.getElementById('angleSelect');
			if (angleSelect) {
				const selectedOptions = Array.from(angleSelect.selectedOptions);
				selected_angles = selectedOptions.map(opt => parseFloat(opt.value));
			} else {
				const angle_checkboxes = document.querySelectorAll('#angleCheckboxes input[type="checkbox"]:checked');
				selected_angles = Array.from(angle_checkboxes).map(cb => parseFloat(cb.value));
			}
			if (selected_angles.length === 0) {
				selected_angles = [0];
			}
		} else {
			const all_angles = new Set();
			selected_tests.forEach(t => {
				if (t.test_type === 'rvr_rotation' && t.angles && t.angles.length > 0) {
					t.angles.forEach(angle => all_angles.add(angle));
				}
			});
			selected_angles = Array.from(all_angles).sort((a, b) => a - b);
		}
	}

	const tests_to_render = [];
	selected_tests.forEach(test => {
		if (test.test_type === 'rvr_rotation' && selected_angles.length > 0) {
			selected_angles.forEach(angle => {
				const filtered_data = test.data.filter(point => point.angle === angle);
				if (filtered_data.length > 0) {
					tests_to_render.push({
						...test,
						data: filtered_data,
						display_angle: angle
					});
				}
			});
		} else {
			tests_to_render.push(test);
		}
	});

	const series_identity = assign_series_identity(tests_to_render);
	const uniqueConfigs = new Set(tests_to_render.map(test => series_identity_key(test)));

	// Create point style assignment for DUT models with multiple tests
	const pointStyles = ['circle', 'triangle', 'rect', 'star', 'cross', 'crossRot', 'dash', 'line', 'rectRounded', 'rectRot'];
	const modelStyleMap = new Map();
	let styleIndex = 0;

	// Group tests by DUT model to assign point styles
	const modelGroups = new Map();
	tests_to_render.forEach(test => {
		const deviceName = test.device_info?.['Model Number'] || test.device_info?.Name || test.file_name;
		const modelNumber = test.device_info?.['Model Number'] || '';
		const modelKey = `${deviceName}|${modelNumber}`;

		if (!modelGroups.has(modelKey)) {
			modelGroups.set(modelKey, []);
		}
		modelGroups.get(modelKey).push(test);
	});

	// Assign point styles to models that have multiple tests
	// Group by TX/RX pairs to ensure synchronized point styles
	modelGroups.forEach((tests, modelKey) => {
		if (tests.length > 1) {
			// Group tests by configuration (excluding direction) to pair TX/RX
			const configGroups = new Map();
			tests.forEach(test => {
				const softwareVersion = test.device_info?.['Software Version'] || '';
				const country = get_country_code(test.device_info?.Country);
				const test_config = formatTestName(test);
				const configKey = `${softwareVersion}|${country}|${test_config}`;

				if (!configGroups.has(configKey)) {
					configGroups.set(configKey, []);
				}
				configGroups.get(configKey).push(test);
			});

			// Assign the same point style to TX/RX pairs
			let configIndex = 0;
			configGroups.forEach((configTests, configKey) => {
				const pointStyle = pointStyles[configIndex % pointStyles.length];

				// Apply the same point style to all tests in this configuration (TX and RX)
				configTests.forEach(test => {
					const softwareVersion = test.device_info?.['Software Version'] || '';
					const country = get_country_code(test.device_info?.Country);
					const testKey = `${modelKey}|${softwareVersion}|${country}|${formatTestName(test)}|${test.direction}`;
					modelStyleMap.set(testKey, pointStyle);
				});

				configIndex++;
			});
		} else {
			// Single test for this model gets default circle style
			const test = tests[0];
			const softwareVersion = test.device_info?.['Software Version'] || '';
			const country = get_country_code(test.device_info?.Country);
			const testKey = `${modelKey}|${softwareVersion}|${country}|${formatTestName(test)}|${test.direction}`;
			modelStyleMap.set(testKey, 'circle');
		}
	});

	const angle_index_map = new Map();

	const datasets = tests_to_render.map((test, index) => {
		const deviceName = test.device_info?.['Model Number'] || test.device_info?.Name || test.file_name;
		const softwareVersion = test.device_info?.['Software Version'] || '';
		const country = get_country_code(test.device_info?.Country);
		const modelNumber = test.device_info?.['Model Number'] || '';
		const test_config = formatTestName(test);
		const configKey = `${deviceName}|${softwareVersion}|${country}|${test_config}`;
		const base_identity = series_identity.identity.get(configKey);
		let baseColor = base_identity ? base_identity.color : get_css_var('--chart-cat-overflow', '#8a8a8a');

		const modelKey = `${deviceName}|${modelNumber}`;
		const testKey = `${modelKey}|${softwareVersion}|${country}|${test_config}|${test.direction}`;
		const pointStyle = modelStyleMap.get(testKey) || 'circle';

		let label = `${deviceName} ${softwareVersion ? `v${softwareVersion}` : ''}${country ? ` - ${country}` : ''} - ${test_config} ${test.direction}`;
		if (test.display_angle !== undefined) {
			label += ` @ ${test.display_angle}°`;
		}

		let borderDash = [];

		if (test.display_angle !== undefined) {
			const angle_group_key = `${configKey}|${test.direction}`;
			if (!angle_index_map.has(angle_group_key)) {
				angle_index_map.set(angle_group_key, new Map());
			}
			const angle_map = angle_index_map.get(angle_group_key);

			if (!angle_map.has(test.display_angle)) {
				angle_map.set(test.display_angle, angle_map.size);
			}

			const angle_idx = angle_map.get(test.display_angle);
			borderDash = ANGLE_DASH_PATTERNS[angle_idx % ANGLE_DASH_PATTERNS.length];
		} else if (test.direction.includes('RX')) {
			borderDash = SERIES_DASH.rx;
		}

		return {
			label: label,
			data: test.data.map(point => ({
				x: is_pure_rotation ? (point.angle !== null ? point.angle : 0) : point.attenuation,
				y: point.throughput,
				pointData: point
			})),
			borderColor: baseColor,
			_baseColor: baseColor,
			backgroundColor: series_alpha(baseColor, 0.13),
			borderWidth: 2,
			// A point whose measured PHY fell below the configured baseline
			// renders as an open marker, visible without hovering.
			pointBackgroundColor: (c) => point_is_degraded(c) ? 'transparent' : c.dataset.borderColor,
			pointBorderColor: (c) => c.dataset.borderColor,
			pointBorderWidth: (c) => point_is_degraded(c) ? 2 : 1,
			pointRadius: (c) => point_is_degraded(c) ? 4 : 3,
			pointHoverRadius: 6,
			pointStyle: pointStyle,
			tension: 0.2,
			borderDash: borderDash,
			deviceName: deviceName,
			device_key: base_identity ? base_identity.device_key : deviceName,
			test_config: test_config,
			fullTest: test,
			display_angle: test.display_angle,
			software_version: softwareVersion,
			country: country
		};
	});

	const notice_messages = [];
	if (datasets.length > 24) {
		notice_messages.push(`${datasets.length} series plotted; consider narrowing the selection`);
	}
	if (series_identity.overflow.size > 0) {
		notice_messages.push(`out of palette slots, shown in gray: ${Array.from(series_identity.overflow).join(', ')}`);
	}
	chart_notice_render(notice_messages);

	// Get responsive configuration
	const responsive_config = get_responsive_chart_config();
	const is_small_screen = window.innerWidth <= 768;
	const palette_opt = chart_palette();
	const font_family_opt = chart_font_family();

	chart_instance = new Chart(ctx, {
		type: chart_type,
		plugins: [qualifi_crosshair_plugin],
		data: {
			datasets: datasets
		},
		options: {
			...responsive_config,
			plugins: {
				...responsive_config.plugins,
				title: {
					display: !is_small_screen,
					text: 'WiFi Rate vs Range',
					color: palette_opt.text_primary,
					font: {
						size: is_small_screen ? 14 : 18,
						weight: '700',
						family: font_family_opt
					}
				},
				subtitle: {
					display: !is_small_screen,
					text: `${series_identity.device_count} device(s) · ${uniqueConfigs.size} config(s) · TX solid / RX dashed`,
					color: palette_opt.text_tertiary,
					font: {
						size: is_small_screen ? 10 : 14,
						family: font_family_opt
					}
				},
				legend: {
					...responsive_config.plugins.legend,
					align: 'start',
					onClick: function(e, legendItem, legend) {
						const chart = legend.chart;
						if (legendItem.datasetIndex === -1) {
							if (!legendItem.device_key) return;
							// Shift+click pins the highlight on one device
							// instead of toggling its visibility.
							if (e.native && e.native.shiftKey) {
								legend_pin_key = legend_pin_key === legendItem.device_key
									? null : legendItem.device_key;
								if (legend_pin_key) {
									legend_highlight_apply(chart, { datasetIndex: -1, device_key: legend_pin_key });
								} else {
									legend_highlight_clear(chart);
								}
								return;
							}
							const metas = [];
							chart.data.datasets.forEach((ds, i) => {
								if (ds.device_key === legendItem.device_key) metas.push(chart.getDatasetMeta(i));
							});
							const any_visible = metas.some(m => !m.hidden);
							metas.forEach(m => { m.hidden = any_visible; });
							chart.update();
							return;
						}
						const meta = chart.getDatasetMeta(legendItem.datasetIndex);
						meta.hidden = !meta.hidden;
						chart.update();
					},
					onHover: function(e, legendItem, legend) {
						legend_highlight_apply(legend.chart, legendItem);
					},
					onLeave: function(e, legendItem, legend) {
						if (legend_pin_key) {
							legend_highlight_apply(legend.chart, { datasetIndex: -1, device_key: legend_pin_key });
						} else {
							legend_highlight_clear(legend.chart);
						}
					},
					title: {
						display: false,
						text: 'Legend shows baseline (0dB) configuration - hover points for actual PHY parameters',
						color: palette_opt.text_muted || palette_opt.text_tertiary,
						font: {
							size: 10,
							family: font_family_opt,
							weight: 'normal'
						},
						padding: 5
					},
					labels: {
						...responsive_config.plugins.legend.labels,
						color: palette_opt.text_secondary,
						padding: is_small_screen ? 6 : 10,
						boxWidth: is_small_screen ? 15 : 20,
						boxHeight: is_small_screen ? 8 : 10,
						font: {
							size: is_small_screen ? 9 : 10,
							family: font_family_opt
						},
						generateLabels: function(chart) {
							const original = Chart.defaults.plugins.legend.labels.generateLabels(chart);
							const grouped = new Map();

							original.forEach(item => {
								const dataset = chart.data.datasets[item.datasetIndex];
								if (!dataset) return;
								const dkey = dataset.device_key || dataset.deviceName;
								if (!grouped.has(dkey)) {
									grouped.set(dkey, {
										device: dataset.deviceName,
										country: dataset.country,
										color: dataset.borderColor,
										versions: new Set(),
										items: []
									});
								}
								const group = grouped.get(dkey);
								group.versions.add(dataset.software_version);
								const version_part = dataset.software_version ? `v${dataset.software_version} ` : '';
								let text = `${dataset.test_config} ${dataset.fullTest.direction}`;
								const has_angle = dataset.display_angle !== undefined && dataset.display_angle !== null;
								if (has_angle) text += ` @ ${dataset.display_angle}°`;
								const rotation_match = text.match(/\(Rotation: [^)]+\)/);
								if (rotation_match) {
									text = text.replace(rotation_match[0], '').replace(/\s+/g, ' ').trim();
								}
								const maxLength = is_small_screen ? 34 : 64;
								if (text.length > maxLength) text = text.substring(0, maxLength - 3) + '...';
								group.items.push({
									...item,
									text,
									version_part,
									angle: has_angle ? dataset.display_angle : null
								});
							});

							const result = [];
							grouped.forEach((group, dkey) => {
								// The device header owns metadata shared by every
								// series of the device; version moves down to the
								// rows only when several versions are on screen.
								const single_version = group.versions.size === 1;
								const version = single_version ? Array.from(group.versions)[0] : '';
								const header_text = `${group.device}${version ? ` v${version}` : ''}${group.country ? ` - ${group.country}` : ''}`;
								result.push({
									text: header_text,
									fillStyle: group.color,
									strokeStyle: 'transparent',
									pointStyle: 'rectRounded',
									lineWidth: 0,
									hidden: group.items.every(i => i.hidden),
									index: -1,
									datasetIndex: -1,
									device_key: dkey,
									fontColor: palette_opt.text_primary,
									fontStyle: 'bold'
								});
								group.items.sort((a, b) =>
									(a.angle ?? -1) - (b.angle ?? -1) || a.text.localeCompare(b.text)
								);
								group.items.forEach(item => {
									const prefix = single_version ? '' : item.version_part;
									result.push({ ...item, text: `  ${prefix}${item.text}` });
								});
							});

							return result;
						}
					}
				},
				tooltip: {
					...responsive_config.plugins.tooltip,
					itemSort: function(a, b) {
						return b.parsed.y - a.parsed.y;
					},
					filter: chart_tooltip_rank_filter,
					callbacks: {
						footer: chart_tooltip_footer,
						title: function(tooltipItems) {
							if (tooltipItems.length > 0) {
								if (is_pure_rotation) {
									return `Angle: ${tooltipItems[0].parsed.x}°`;
								} else {
									return `Attenuation: ${tooltipItems[0].parsed.x} dB`;
								}
							}
							return '';
						},
						labelColor: function(context) {
							const dataset = context.dataset;
							return {
								borderColor: dataset.borderColor,
								backgroundColor: dataset.backgroundColor,
								borderWidth: 2,
								borderDash: dataset.borderDash || [], // Use the same dash pattern as the line
								borderDashOffset: 0
							};
						},
						label: function(context) {
							const dataset = context.dataset;
							const deviceName = dataset.deviceName;
							const dataIndex = context.dataIndex;
							const fullTest = dataset.fullTest;
							const point = context.raw.pointData;

							if (fullTest && point) {
								const lines = [];

								// Device and throughput info
								lines.push(` ${deviceName}: ${context.parsed.y} Mbps`);

								// Show actual PHY parameters at this attenuation level
								if (point.band || point.channel) {
									const displayChannel = format_channel_number(point.channel || fullTest.channel, point.band || fullTest.band);
									lines.push(` Band: ${point.band || fullTest.band || 'UNK'} | Channel: ${displayChannel}`);
								}

								// Show combined TX/RX parameters on a single line
								const actualBW = point.bandwidth || fullTest.bandwidth;
								const actualNSS = point.nss || fullTest.nss;
								const direction = point.direction || fullTest.direction;
								const paramType = direction && direction.includes('TX') ? 'TX' :
										 direction && direction.includes('RX') ? 'RX' : 'PHY';

								// Build combined mode display: "TX Mode: 20MHz HE MCS11 1SS"
								let modeDisplay = point.mode || 'Unknown';
								if (point.mcs && point.mcs !== 'Unknown' && !modeDisplay.includes('OFDM')) {
									modeDisplay += ` MCS${point.mcs}`;
								}

								lines.push(` ${paramType} Mode: ${actualBW}MHz ${modeDisplay} ${actualNSS}SS`);

								// Show security on separate line if available
								if (point.security) {
									lines.push(` Security: ${point.security || fullTest.security}`);
								}

								// Show frequency if available
								if (point.frequency && point.frequency > 0) {
									lines.push(` Frequency: ${point.frequency} MHz`);
								}

								// Show angle if available (for rotation tests)
								if (point.angle !== null && point.angle !== undefined) {
									lines.push(` Angle: ${point.angle}°`);
								}

								if (dataIndex > 0 && fullTest.data && fullTest.data[0]) {
									const degradations = point_degradations(point, fullTest);
									if (degradations.length > 0) {
										lines.push(`[!] Degraded: ${degradations.join(', ')}`);
									}
								}

								return lines;
							}

							// Fallback to simple display
							return [` ${deviceName}: ${context.parsed.y} Mbps @ ${context.parsed.x} dB`];
						},
						beforeLabel: function(context) {
							// Add a separator line before each dataset's info for clarity
							return '';
						}
					}
				}
			},
			scales: {
				x: {
					type: 'linear',
					display: true,
					title: {
						display: true,
						text: is_pure_rotation ? 'Rotation Angle (degrees)' : 'Attenuation (dB)',
						color: palette_opt.text_secondary,
						font: {
							size: 14,
							family: font_family_opt
						}
					},
					grid: {
						color: palette_opt.grid,
						borderColor: palette_opt.axis_line
					},
					ticks: {
						color: palette_opt.text_tertiary,
						font: { family: font_family_opt }
					},
					...(is_pure_rotation ? {
						min: 0,
						max: 360,
						ticks: {
							color: palette_opt.text_tertiary,
							font: { family: font_family_opt },
							stepSize: 45
						}
					} : {})
				},
				y: {
					display: true,
					title: {
						display: true,
						text: 'Throughput (Mbps)',
						color: palette_opt.text_secondary,
						font: {
							size: 14,
							family: font_family_opt
						}
					},
					grid: {
						color: palette_opt.grid,
						borderColor: palette_opt.axis_line
					},
					ticks: {
						color: palette_opt.text_tertiary,
						font: { family: font_family_opt }
					}
				}
			}
		}
	});

	if (zoom_restore && typeof chart_instance.zoomScale === 'function') {
		chart_instance.zoomScale('x', zoom_restore.x, 'none');
		chart_instance.zoomScale('y', zoom_restore.y, 'none');
	}
	if (chart_table_visible) chart_table_render();
}
