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
					usePointStyle: true,
					pointStyle: 'line'
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

	let csv = 'Device,Model,Software Version,Test Configuration,Direction,Band,Mode (0dB),Attenuation (dB),Throughput (Mbps)\n';

	selected_tests.forEach(test => {
		const deviceName = test.device_info?.Name || test.file_name;
		const model = test.device_info?.['Model Number'] || 'Unknown';
		const version = test.device_info?.['Software Version'] || 'Unknown';
		const config = formatTestName(test);
		const band = test.band || 'UNK';
		const mode = test.mode || 'Unknown';

		const sorted_data = [...test.data].sort((a, b) => a.attenuation - b.attenuation);

		sorted_data.forEach(point => {
			csv += `"${deviceName}","${model}","${version}","${config}","${test.direction}","${band}","${mode}",`;
			csv += `${point.attenuation},${point.throughput}\n`;
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

	const test_types = new Set(selected_tests.map(t => t.test_type || 'rvr'));
	const is_pure_rotation = test_types.has('rotation') && test_types.size === 1;
	const has_rvr_rotation = test_types.has('rvr_rotation');

	const traces = [];
	const palette = chart_palette();
	const colors = ['#0080ff', '#ff3b30', '#00c896', '#ff9500', '#5856d6', '#ff2d55', '#ffcc00', '#34c759'];
	let color_index = 0;

	selected_tests.forEach((test, test_idx) => {
		if (!test.has_rotation) {
			return;
		}

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

		const color = colors[color_index % colors.length];
		color_index++;

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

	if (chart_instance) {
		chart_instance.destroy();
	}

	const test_types = new Set(selected_tests.map(t => t.test_type || 'rvr'));
	const is_pure_rotation = test_types.has('rotation') && test_types.size === 1;
	const has_rvr_rotation = test_types.has('rvr_rotation');
	const is_mixed = test_types.size > 1;

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

	// Original qualifi categorical palette: 36 distinct entries for
	// many-device comparisons; visually-similar shades are spaced so adjacent
	// traces never share a hue.
	const allColors = [
		'#00a0c8', '#f72585', '#4361ee', '#ffbe0b', '#fb5607', '#3a0ca3',
		'#3da9db', '#e01e70', '#3651de', '#f0b000', '#ec4800', '#2b0c94',
		'#2e8cc5', '#c9185b', '#2941ce', '#e0a200', '#dd3a00', '#1c0c85',
		'#1f6fb0', '#b21246', '#1c31be', '#d09400', '#ce2c00', '#0d0c76',
		'#06ffa5', '#8338ec', '#ff6b35', '#f77f00', '#fcbf49', '#eae2b7',
		'#003049', '#d62828', '#f77f00', '#fcbf49', '#eae2b7', '#ffffff'
	];

	// Create a map to assign unique colors to each device + software version + test configuration combination
	const configColorMap = new Map();
	let colorIndex = 0;

	// First pass: identify unique device + test configuration + software version + country combinations
	const uniqueConfigs = new Set();
	tests_to_render.forEach(test => {
		const deviceName = test.device_info?.['Model Number'] || test.device_info?.Name || test.file_name;
		const softwareVersion = test.device_info?.['Software Version'] || '';
		const country = get_country_code(test.device_info?.Country);
		const test_config = formatTestName(test);
		const configKey = `${deviceName}|${softwareVersion}|${country}|${test_config}`;
		uniqueConfigs.add(configKey);
	});

	// Assign colors to unique configurations
	Array.from(uniqueConfigs).forEach(configKey => {
		configColorMap.set(configKey, allColors[colorIndex % allColors.length]);
		colorIndex++;
	});

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

	const angle_dash_patterns = [
		[],
		[10, 5],
		[5, 3],
		[15, 5, 5, 5],
		[20, 5],
		[10, 5, 2, 5],
		[2, 2],
		[15, 10]
	];

	const angle_index_map = new Map();

	const datasets = tests_to_render.map((test, index) => {
		const deviceName = test.device_info?.['Model Number'] || test.device_info?.Name || test.file_name;
		const softwareVersion = test.device_info?.['Software Version'] || '';
		const country = get_country_code(test.device_info?.Country);
		const modelNumber = test.device_info?.['Model Number'] || '';
		const test_config = formatTestName(test);
		const configKey = `${deviceName}|${softwareVersion}|${country}|${test_config}`;
		let baseColor = configColorMap.get(configKey);

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
			borderDash = angle_dash_patterns[angle_idx % angle_dash_patterns.length];

			const color_variation = angle_idx * 15;
			const r = parseInt(baseColor.substring(1, 3), 16);
			const g = parseInt(baseColor.substring(3, 5), 16);
			const b = parseInt(baseColor.substring(5, 7), 16);

			const new_r = Math.min(255, Math.max(0, r + color_variation));
			const new_g = Math.min(255, Math.max(0, g + color_variation));
			const new_b = Math.min(255, Math.max(0, b + color_variation));

			baseColor = `#${new_r.toString(16).padStart(2, '0')}${new_g.toString(16).padStart(2, '0')}${new_b.toString(16).padStart(2, '0')}`;
		} else if (test.direction.includes('RX')) {
			borderDash = [5, 5];
		}

		return {
			label: label,
			data: test.data.map(point => ({
				x: is_pure_rotation ? (point.angle !== null ? point.angle : 0) : point.attenuation,
				y: point.throughput,
				pointData: point
			})),
			borderColor: baseColor,
			backgroundColor: baseColor + '20',
			borderWidth: 2.5,
			pointRadius: 4,
			pointHoverRadius: 6,
			pointStyle: pointStyle,
			tension: 0.2,
			borderDash: borderDash,
			deviceName: deviceName,
			test_config: test_config,
			fullTest: test,
			display_angle: test.display_angle,
			software_version: softwareVersion,
			country: country
		};
	});

	// Get responsive configuration
	const responsive_config = get_responsive_chart_config();
	const is_small_screen = window.innerWidth <= 768;
	const palette_opt = chart_palette();
	const font_family_opt = chart_font_family();

	chart_instance = new Chart(ctx, {
		type: chart_type,
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
					text: `Comparing ${uniqueConfigs.size} test configuration(s) across ${Array.from(new Set(tests_to_render.map(t => t.device_info?.Name || t.file_name))).length} device(s) | Solid: TX, Dotted: RX | Different point styles for multiple tests per DUT model`,
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
						if (legendItem.index === -1) {
							return;
						}
						const index = legendItem.datasetIndex;
						const chart = legend.chart;
						const meta = chart.getDatasetMeta(index);
						meta.hidden = !meta.hidden;
						chart.update();
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

							original.forEach((item, idx) => {
								const dataset = chart.data.datasets[item.datasetIndex];
								if (!dataset) {
									return;
								}

								const has_angle = dataset.display_angle !== undefined && dataset.display_angle !== null;

								if (has_angle) {
							const group_key = `${dataset.deviceName}|${dataset.software_version}|${dataset.country}|${dataset.test_config}|${dataset.fullTest.direction}`;

									if (!grouped.has(group_key)) {
									let header_text = `${dataset.deviceName} ${dataset.software_version ? `v${dataset.software_version}` : ''}${dataset.country ? ` - ${dataset.country}` : ''} - ${dataset.test_config} ${dataset.fullTest.direction}`;

										const rotation_match = header_text.match(/\(Rotation: [^)]+\)/);
										if (rotation_match) {
											const rotation_part = rotation_match[0];
											header_text = header_text.replace(rotation_part, '').replace(/\s+/g, ' ').trim();
											header_text = `${header_text} ${rotation_part}`;
										}

										grouped.set(group_key, {
											header: header_text,
											items: []
										});
									}

									grouped.get(group_key).items.push({
										...item,
										text: `  Rotation: ${dataset.display_angle}°`,
										angle: dataset.display_angle
									});
								} else {
									let text = item.text;

									const rotation_match = text.match(/\(Rotation: [^)]+\)/);
									if (rotation_match) {
										const rotation_part = rotation_match[0];
										text = text.replace(rotation_part, '').replace(/\s+/g, ' ').trim();
										text = `${text} ${rotation_part}`;
									}

									const maxLength = is_small_screen ? 40 : 90;
									if (text.length > maxLength) {
										text = text.substring(0, maxLength - 3) + '...';
									}
									grouped.set(`ungrouped_${idx}`, {
										header: null,
										items: [{...item, text}]
									});
								}
							});

							const result = [];
							grouped.forEach((group, key) => {
								if (group.header) {
									result.push({
										text: group.header,
										fillStyle: 'transparent',
										strokeStyle: 'transparent',
										lineWidth: 0,
										hidden: false,
										index: -1,
										datasetIndex: -1,
										fontColor: palette_opt.text_primary,
										fontStyle: 'bold'
									});

									group.items.sort((a, b) => a.angle - b.angle);
								}

								group.items.forEach(item => {
									result.push(item);
								});
							});

							return result;
						}
					}
				},
				tooltip: {
					...responsive_config.plugins.tooltip,
					callbacks: {
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

								// Show if parameters have degraded from test configuration
								if (dataIndex > 0 && fullTest.data && fullTest.data[0]) {
									const degradations = [];
									const direction = point.direction || fullTest.direction;
									const paramType = direction && direction.includes('TX') ? 'TX' :
											 direction && direction.includes('RX') ? 'RX' : 'PHY';

									// Check for NSS degradation against configured values
									if (fullTest.nss && point.nss && point.nss !== fullTest.nss) {
										degradations.push(`${paramType} NSS: ${fullTest.nss}→${point.nss}`);
									}

									// Check for bandwidth degradation against configured values
									if (fullTest.bandwidth && point.bandwidth &&
										parseFloat(point.bandwidth) !== parseFloat(fullTest.bandwidth)) {
										degradations.push(`${paramType} BW: ${fullTest.bandwidth}→${point.bandwidth}MHz`);
									}

									// Check for mode change (still compare against first data point since mode comes from measured data)
									const baselinePoint = fullTest.data[0];
									if (baselinePoint.mode && point.mode && point.mode !== baselinePoint.mode) {
										degradations.push(`${paramType} Mode: ${baselinePoint.mode}→${point.mode}`);
									}

									if (degradations.length > 0) {
										lines.push(`⚠️ Degraded: ${degradations.join(', ')}`);
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
}
