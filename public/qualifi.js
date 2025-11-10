let chart_instance = null;
let is_batch_loading = false;
let loaded_files = new Map();
let chart_type = 'line';
let server_reports = null;
let selected_server_reports = new Set();
let active_notifications = [];
let current_view_mode = 'cartesian';
let polar_attenuation_values = [];
let current_polar_attenuation = 0;

// Touch and responsive detection
let is_touch_device = false;
let is_mobile = false;

// Detect touch capability and mobile device
function detect_device_capabilities() {
	is_touch_device = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
	is_mobile = window.innerWidth <= 768;

	// Add CSS classes for device-specific styling
	document.body.classList.toggle('touch-device', is_touch_device);
	document.body.classList.toggle('mobile-device', is_mobile);

	console.log('Device capabilities:', { is_touch_device, is_mobile });
}

// Touch gesture handlers
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
	const min_swipe_distance = 80; // Increased from 50 to be less sensitive
	const max_vertical_drift = 100; // Maximum vertical movement allowed for horizontal swipe

	// Only allow horizontal swipes with minimal vertical movement
	// and require a more significant horizontal distance
	if (Math.abs(x_diff) > min_swipe_distance &&
		Math.abs(y_diff) < max_vertical_drift &&
		Math.abs(x_diff) > Math.abs(y_diff) * 2) { // Horizontal movement must be 2x greater than vertical

		const tabs = document.querySelectorAll('.tab-button');
		const active_tab = document.querySelector('.tab-button.active');

		if (x_diff > 0 && active_tab === tabs[1]) {
			// Swipe left: switch to server tab
			switch_tab('server');
		} else if (x_diff < 0 && active_tab === tabs[0]) {
			// Swipe right: switch to local tab
			switch_tab('local');
		}
	}
}

// Responsive chart configuration
function get_responsive_chart_config() {
	const is_small_screen = window.innerWidth <= 768;
	const is_tablet = window.innerWidth <= 1024 && window.innerWidth > 768;
	const is_very_small = window.innerWidth <= 480;

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
				backgroundColor: 'rgba(0, 0, 0, 0.95)',
				titleColor: '#ffffff',
				bodyColor: '#e0e0e0',
				borderColor: '#333333',
				borderWidth: 1,
				cornerRadius: 6,
				padding: is_small_screen ? 8 : 12,
				titleFont: {
					size: is_small_screen ? 11 : 13,
					weight: 'bold'
				},
				bodyFont: {
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
					color: '#e0e0e0',
					font: {
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
					color: '#e0e0e0',
					font: {
						size: is_small_screen ? 10 : 12,
						weight: 'bold'
					}
				},
				ticks: {
					color: '#a0a0a0',
					font: {
						size: is_small_screen ? 9 : 11
					},
					maxTicksLimit: is_small_screen ? 6 : 10
				},
				grid: {
					color: '#2a2a2a'
				}
			},
			y: {
				title: {
					display: true,
					text: 'Throughput (Mbps)',
					color: '#e0e0e0',
					font: {
						size: is_small_screen ? 10 : 12,
						weight: 'bold'
					}
				},
				ticks: {
					color: '#a0a0a0',
					font: {
						size: is_small_screen ? 9 : 11
					},
					maxTicksLimit: is_small_screen ? 6 : 8
				},
				grid: {
					color: '#2a2a2a'
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
		// Optimize for mobile performance
		animation: {
			duration: is_small_screen ? 500 : 1000
		}
	};
}

// Window resize handler for responsive updates
function handle_resize() {
	const was_mobile = is_mobile;
	detect_device_capabilities();

	// Update chart if screen size category changed
	if (was_mobile !== is_mobile && chart_instance) {
		chart_instance.options = {
			...chart_instance.options,
			...get_responsive_chart_config()
		};
		chart_instance.update('resize');
	}
}

// Debounced resize handler
let resize_timeout;
function debounced_resize() {
	clearTimeout(resize_timeout);
	resize_timeout = setTimeout(handle_resize, 250);
}

// Set Chart.js global font - will be updated when font loads
Chart.defaults.font.family = "var(--primary-font)";
Chart.defaults.color = '#e0e0e0';

// Listen for font loading completion and update Chart.js
window.addEventListener('fontLoaded', function(event) {
	const fontFamily = event.detail.font === 'Berkeley Mono' ?
		"'Berkeley Mono', 'Courier New', monospace" :
		"'Poppins', sans-serif";

	Chart.defaults.font.family = fontFamily;
	console.log('Chart.js font updated to:', fontFamily);

	// Redraw chart if it exists
	if (chart_instance) {
		chart_instance.update();
	}
});

// Helper function to create image element with fallback
function create_image_element(src, className, alt = '') {
	const img = document.createElement('img');
	img.className = className;
	img.alt = alt;
	img.style.objectFit = 'contain';

	// Add error handling for missing images
	img.onerror = function() {
		this.style.display = 'none';
	};

	img.src = `/reports/${src}`;
	return img;
}

// Helper function to determine band from frequency
function determine_band(frequency) {
	if (frequency >= 2412 && frequency <= 2484) {
		return '2G';
	} else if (frequency >= 5160 && frequency <= 5885) {
		return '5G';
	} else if (frequency >= 5925 && frequency <= 7125) {
		return '6G';
	} else {
		return 'UNK';
	}
}

// Helper function to format channel number correctly for display
function format_channel_number(channel, band) {
	if (band === '6G' && channel >= 191) {
		// Convert 6G channel from continuation format to correct format
		return channel - 190;
	}
	return channel;
}

// Helper function to get display channel string
function get_channel_display(channel, band) {
	const displayChannel = format_channel_number(channel, band);
	return `CH${displayChannel}`;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
	// Initialize device capabilities
	detect_device_capabilities();

	// Set up touch event listeners for swipe gestures (only on tabs)
	if (is_touch_device) {
		const source_tabs = document.querySelector('.source-tabs');
		if (source_tabs) {
			source_tabs.addEventListener('touchstart', handle_touch_start, { passive: true });
			source_tabs.addEventListener('touchend', handle_touch_end, { passive: true });
		}
	}

	// Set up resize listener
	window.addEventListener('resize', debounced_resize);

	// Load reports and initialize file upload
	load_server_reports();
	initialize_local_file_upload();
});

// Tab switching
function switch_tab(tab) {
	const serverTab = document.getElementById('serverTab');
	const localTab = document.getElementById('localTab');
	const tabButtons = document.querySelectorAll('.tab-button');

	tabButtons.forEach(btn => btn.classList.remove('active'));

	if (tab === 'server') {
		serverTab.style.display = 'block';
		localTab.style.display = 'none';
		tabButtons[0].classList.add('active');
	} else {
		serverTab.style.display = 'none';
		localTab.style.display = 'block';
		tabButtons[1].classList.add('active');
	}
}

// Load server reports
async function load_server_reports() {
	try {
		const response = await fetch('/api/reports');
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		const data = await response.json();
		server_reports = data;
		render_report_browser(data);
	} catch (error) {
		console.error('Error loading server reports:', error);
		document.getElementById('reportBrowser').innerHTML = `
			<div class="error">Failed to load server reports: ${error.message}</div>
		`;
	}
}

// Refresh reports
function refresh_reports() {
	load_server_reports();
}

// Search reports
async function search_reports(query) {
	if (!query.trim()) {
		render_report_browser(server_reports);
		return;
	}

	try {
		const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
		const results = await response.json();
		render_search_results(results);
	} catch (error) {
		console.error('Error searching reports:', error);
	}
}

// Render report browser with image support - version level selection
function render_report_browser(data) {
	const browser = document.getElementById('reportBrowser');

	if (!data || Object.keys(data.vendors).length === 0) {
		browser.innerHTML = `
			<div class="empty-state">
				<h4>No Reports Found</h4>
				<p>No test reports are available on the server.</p>
			</div>
		`;
		return;
	}

	let html = '';

	Object.entries(data.vendors).forEach(([vendor, vendor_data]) => {
		const vendor_id = vendor.replace(/\s+/g, '_');
		html += `
			<div class="vendor-group">
				<div class="vendor-header" onclick="toggle_vendor('${vendor_id}')">
					<span class="toggle-icon">▶</span>
					${vendor_data.logo ? `<img src="/reports/${vendor_data.logo}" class="vendor-logo" alt="${vendor} logo" onerror="this.style.display='none'">` : ''}
					<span style="flex: 1;">${vendor}</span>
					<span class="file-count">${count_vendor_test_configs(vendor_data)} test configs</span>
				</div>
				<div class="vendor-content" id="vendor-${vendor_id}">
		`;

		Object.entries(vendor_data.models).forEach(([model, model_data]) => {
			const model_id = `${vendor_id}_${model.replace(/\s+/g, '_')}`;
			html += `
				<div class="model-group">
					<div class="model-header" onclick="toggle_model('${model_id}')">
						<span class="toggle-icon">▶</span>
						${model_data.image ? `<img src="/reports/${model_data.image}" class="model-image" alt="${model} device" onerror="this.style.display='none'">` : ''}
						<span style="flex: 1;">${model}</span>
						<span class="file-count">${count_model_test_configs(model_data)} test configs</span>
					</div>
					<div class="model-content" id="model-${model_id}">
			`;

			Object.entries(model_data.versions).forEach(([version, version_data]) => {
				const testConfigCount = Object.keys(version_data.test_configs).length;

				if (testConfigCount > 0) {
					const report_id = `${vendor}|${model}|${version}`;
					html += `
						<div class="version-item">
							<input type="checkbox" class="version-checkbox"
								   id="report-${report_id.replace(/[|\/\s]/g, '_')}"
								   value="${report_id}"
								   onchange="toggle_report_selection('${report_id}')">
							<div class="version-info">
								<span class="version-label">v${version}</span>
								<span class="file-count">${testConfigCount} test config${testConfigCount > 1 ? 's' : ''}</span>
							</div>
						</div>
					`;
				}
			});

			html += `
					</div>
				</div>
			`;
		});

		html += `
				</div>
			</div>
		`;
	});

	browser.innerHTML = html;
}

// Render search results with image support
function render_search_results(results) {
	const browser = document.getElementById('reportBrowser');

	if (results.length === 0) {
		browser.innerHTML = `
			<div class="empty-state">
				<h4>No Results Found</h4>
				<p>Try searching for vendor names, model numbers, or version numbers.</p>
			</div>
		`;
		return;
	}

	let html = '<div class="search-results">';

	results.forEach(result => {
		const report_id = `${result.vendor}|${result.model}|${result.version}`;
		html += `
			<div class="search-result-item">
				<input type="checkbox" class="version-checkbox"
					   id="search-${report_id.replace(/[|\/\s]/g, '_')}"
					   value="${report_id}"
					   ${selected_server_reports.has(report_id) ? 'checked' : ''}
					   onchange="toggle_report_selection('${report_id}')">
				<div class="search-result-images">
					${result.vendor_logo ? `<img src="/reports/${result.vendor_logo}" class="search-vendor-logo" alt="${result.vendor} logo" onerror="this.style.display='none'">` : ''}
					${result.model_image ? `<img src="/reports/${result.model_image}" class="search-model-image" alt="${result.model} device" onerror="this.style.display='none'">` : ''}
				</div>
				<div class="version-info" style="flex-direction: column; align-items: flex-start;">
					<div><strong>${result.vendor} ${result.model}</strong> v${result.version}</div>
					<div style="font-size: 0.85em; color: #666;">${result.file}</div>
				</div>
			</div>
		`;
	});

	html += '</div>';
	browser.innerHTML = html;
}

// Helper function to format file sizes
function format_file_size(bytes) {
	if (bytes === 0) return '0 Bytes';
	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper functions for counting test configurations
function count_vendor_test_configs(vendor_data) {
	let count = 0;
	Object.values(vendor_data.models).forEach(model_data => {
		Object.values(model_data.versions).forEach(version_data => {
			count += Object.keys(version_data.test_configs || {}).length;
		});
	});
	return count;
}

function count_model_test_configs(model_data) {
	let count = 0;
	Object.values(model_data.versions).forEach(version_data => {
		count += Object.keys(version_data.test_configs || {}).length;
	});
	return count;
}

// Legacy helper functions (updated for new structure)
function count_vendor_files(vendor_data) {
	let count = 0;
	Object.values(vendor_data.models).forEach(model_data => {
		Object.values(model_data.versions).forEach(version_data => {
			count += Object.keys(version_data.test_configs || {}).length;
		});
	});
	return count;
}

function count_model_files(model_data) {
	let count = 0;
	Object.values(model_data.versions).forEach(version_data => {
		count += Object.keys(version_data.test_configs || {}).length;
	});
	return count;
}

// Toggle vendor expansion
function toggle_vendor(vendor_id) {
	const header = event.currentTarget;
	const content = document.getElementById(`vendor-${vendor_id}`);
	header.classList.toggle('expanded');
	content.classList.toggle('expanded');
}

// Toggle model expansion
function toggle_model(model_id) {
	const header = event.currentTarget;
	const content = document.getElementById(`model-${model_id}`);
	header.classList.toggle('expanded');
	content.classList.toggle('expanded');
	event.stopPropagation();
}

// Toggle report selection
function toggle_report_selection(report_id) {
	if (selected_server_reports.has(report_id)) {
		selected_server_reports.delete(report_id);
	} else {
		selected_server_reports.add(report_id);
	}
	update_selected_reports_list();
}

// Update selected reports list
function update_selected_reports_list() {
	const container = document.getElementById('selectedReports');
	const list = document.getElementById('selectedReportsList');

	if (selected_server_reports.size === 0) {
		container.style.display = 'none';
		return;
	}

	container.style.display = 'block';
	let html = '';

	selected_server_reports.forEach(report_id => {
		const [vendor, model, version] = report_id.split('|');
		html += `
			<div class="selected-report-item">
				<span>${vendor} ${model} v${version}</span>
				<button class="btn-small btn-remove" onclick="remove_selected_report('${report_id}')">Remove</button>
			</div>
		`;
	});

	list.innerHTML = html;
}

// Remove selected report
function remove_selected_report(report_id) {
	selected_server_reports.delete(report_id);
	// Uncheck the checkbox
	const checkbox = document.querySelector(`input[value="${report_id}"]`);
	if (checkbox) checkbox.checked = false;
	update_selected_reports_list();
}

// Expand all vendors
function expand_all_vendors() {
	document.querySelectorAll('.vendor-header').forEach(header => {
		header.classList.add('expanded');
		const vendor_id = header.onclick.toString().match(/toggle_vendor\('(.+?)'\)/)[1];
		const content = document.getElementById(`vendor-${vendor_id}`);
		if (content) content.classList.add('expanded');
	});
}

// Collapse all vendors
function collapse_all_vendors() {
	document.querySelectorAll('.vendor-header').forEach(header => {
		header.classList.remove('expanded');
	});
	document.querySelectorAll('.vendor-content').forEach(content => {
		content.classList.remove('expanded');
	});
	document.querySelectorAll('.model-header').forEach(header => {
		header.classList.remove('expanded');
	});
	document.querySelectorAll('.model-content').forEach(content => {
		content.classList.remove('expanded');
	});
}

// Select latest version from each model
function select_latest_versions() {
	if (!server_reports) return;

	selected_server_reports.clear();

	Object.entries(server_reports.vendors).forEach(([vendor, vendor_data]) => {
		Object.entries(vendor_data.models).forEach(([model, model_data]) => {
			// Get versions and sort them (assuming semantic versioning)
			const versions = Object.keys(model_data.versions).sort((a, b) => {
				return compare_versions(b, a); // Sort descending
			});

			if (versions.length > 0 && Object.keys(model_data.versions[versions[0]].test_configs).length > 0) {
				const report_id = `${vendor}|${model}|${versions[0]}`;
				selected_server_reports.add(report_id);

				// Check the checkbox
				const checkbox = document.querySelector(`input[value="${report_id}"]`);
				if (checkbox) checkbox.checked = true;
			}
		});
	});

	update_selected_reports_list();
}

// Compare version strings
function compare_versions(a, b) {
	const parts_a = a.split('.').map(num => parseInt(num) || 0);
	const parts_b = b.split('.').map(num => parseInt(num) || 0);

	for (let i = 0; i < Math.max(parts_a.length, parts_b.length); i++) {
		const num_a = parts_a[i] || 0;
		const num_b = parts_b[i] || 0;

		if (num_a !== num_b) {
			return num_a - num_b;
		}
	}

	return 0;
}

async function load_selected_reports() {
	if (selected_server_reports.size === 0) {
		console.log('No reports selected');
		return;
	}

	console.log('Loading selected reports:', Array.from(selected_server_reports));

	const loading_msg = document.createElement('div');
	loading_msg.className = 'loading';
	loading_msg.textContent = 'Loading reports from server...';
	document.body.appendChild(loading_msg);

	// Set batch loading flag to prevent DOM updates
	is_batch_loading = true;

	try {
		let loaded_count = 0;

		for (const report_id of selected_server_reports) {
			console.log('Processing report_id:', report_id);

			// Split into 3 parts (vendor, model, version)
			const [vendor, model, version] = report_id.split('|');

			if (!vendor || !model || !version) {
				console.error('Invalid report_id format:', report_id);
				continue;
			}

			// Get version data for this selection
			const version_data = server_reports?.vendors?.[vendor]?.models?.[model]?.versions?.[version];
			if (!version_data || !version_data.test_configs) {
				console.error('Version data not found for:', report_id);
				continue;
			}

			console.log('Found test configs:', Object.keys(version_data.test_configs));

			// Load all test configurations for this version
			for (const [test_config, test_config_data] of Object.entries(version_data.test_configs)) {
				console.log(`Loading test config: ${test_config}`, test_config_data);

				try {
					const response = await fetch(`/reports/${test_config_data.path}`);
					if (!response.ok) {
						console.error(`Failed to fetch ${test_config_data.path}: ${response.status}`);
						continue;
					}

					const blob = await response.blob();
					const file_name = `${vendor}_${model}_v${version}_${test_config}_${test_config_data.name}`;
					const virtualFile = new File([blob], file_name, { type: blob.type });

					await load_excel_file(virtualFile, true, test_config_data.path); // true indicates from server, pass original path
					loaded_count++;
					console.log(`Successfully loaded: ${file_name}`);

				} catch (fetchError) {
					console.error(`Error loading test config ${test_config}:`, fetchError);
				}
			}
		}

		console.log(`Loaded ${loaded_count} test configuration files`);

		// Clear selections after loading
		selected_server_reports.clear();
		update_selected_reports_list();

		// Uncheck all checkboxes
		document.querySelectorAll('.version-checkbox:checked').forEach(cb => {
			cb.checked = false;
		});

		// Re-enable DOM updates and update everything once
		is_batch_loading = false;
		update_file_list();
		update_test_options();

		// Switch to test selector if files loaded
		if (loaded_files.size > 0) {
			show_success(`Successfully loaded ${loaded_count} test configurations from server`);

			// Delay scrolling until after all DOM updates are complete
			setTimeout(() => {
				document.querySelector('.test-selector').scrollIntoView({ behavior: 'smooth' });
			}, 100);
		} else {
			show_error('No valid test configurations were loaded');
		}

	} catch (error) {
		console.error('Error loading reports:', error);
		show_error(`Failed to load reports from server: ${error.message}`);
	} finally {
		// Always re-enable DOM updates and remove loading message
		is_batch_loading = false;
		loading_msg.remove();
	}
}

// Initialize local file upload
function initialize_local_file_upload() {
	document.getElementById('excelFile').addEventListener('change', handle_file_select);

	// Enable drag and drop
	const file_label = document.querySelector('.file-input-label');
	if (file_label) {
		['dragenter', 'dragover', 'dragleave', 'drop'].forEach(event_name => {
			file_label.addEventListener(event_name, prevent_defaults, false);
		});

		['dragenter', 'dragover'].forEach(event_name => {
			file_label.addEventListener(event_name, highlight, false);
		});

		['dragleave', 'drop'].forEach(event_name => {
			file_label.addEventListener(event_name, unhighlight, false);
		});

		file_label.addEventListener('drop', handle_drop, false);
	}
}

function prevent_defaults(e) {
	e.preventDefault();
	e.stopPropagation();
}

function highlight(e) {
	const file_label = document.querySelector('.file-input-label');
	if (file_label) {
		file_label.style.borderColor = '#00a0c8';
		file_label.style.background = '#333';
	}
}

function unhighlight(e) {
	const file_label = document.querySelector('.file-input-label');
	if (file_label) {
		file_label.style.borderColor = '#444';
		file_label.style.background = '#2a2a2a';
	}
}

function handle_drop(e) {
	const dt = e.dataTransfer;
	const files = dt.files;
	handle_files(files);
}

function handle_file_select(e) {
	const files = e.target.files;
	handle_files(files);
}

async function handle_files(files) {
	for (let file of files) {
		if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
			await load_excel_file(file);
		} else {
			show_error(`${file.name} is not an Excel file`);
		}
	}
}

async function load_excel_file(file, from_server = false, server_path = null) {
	console.log(`Loading file: ${file.name}${from_server ? ' (from server)' : ' (local)'}`);
	try {
		const array_buffer = await file.arrayBuffer();
		const workbook = XLSX.read(array_buffer, {
			cellDates: true,
			cellNF: true,
			cellStyles: true
		});

		// Extract device information
		const device_info = extract_device_info(workbook);

		// Extract RvR data
		const rvrResult = extract_rvr_data(workbook);
		const rvr_data = rvrResult.tests;
		const skipped_count = rvrResult.skipped_count;

		if (rvr_data.length === 0) {
			console.error(`No RvR data found in ${file.name}`);
			console.log('Available sheets:', workbook.SheetNames);
			show_error(`No RvR data found in ${file.name}. Please ensure the file contains "Rate vs Range" sheets with Attenuation and Throughput columns.`);
			return;
		}

		// Add server path information to each test if loaded from server
		if (from_server && server_path) {
			rvr_data.forEach(test => {
				test.server_path = server_path;
			});
		}

		// Store the loaded file data
		loaded_files.set(file.name, {
			device_info: device_info,
			rvr_data: rvr_data,
			file_name: file.name,
			from_server: from_server,
			server_path: server_path
		});

		// Only update UI if not in batch loading mode
		if (!is_batch_loading) {
			update_file_list();
			update_test_options();

			// Show success message with data summary
			const total_data_points = rvr_data.reduce((sum, test) => sum + test.data.length, 0);
			console.log(`Successfully loaded ${file.name}: ${rvr_data.length} test configurations, ${total_data_points} data points`);

			// Show brief success notification
			show_success(`Loaded ${file.name} - ${rvr_data.length} test configurations`);
		}

	} catch (error) {
		console.error('Error loading Excel file:', error);
		show_error(`Failed to load ${file.name}: ${error.message}`);
	}
}

function extract_device_info(workbook) {
	const info = {};

	// Try to find Device Under Test Information sheet
	const dut_sheet = workbook.Sheets['Device Under Test Information'] ||
				   workbook.Sheets['DUT Information'] ||
				   workbook.Sheets['Device Info'];

	if (dut_sheet) {
		const data = XLSX.utils.sheet_to_json(dut_sheet, { header: 1 });

		// Convert to key-value pairs
		data.forEach(row => {
			if (row.length >= 2 && row[0]) {
				info[row[0]] = row[1];
			}
		});
	}

	return info;
}

function extract_rvr_data(workbook) {
	const tests = [];
	let total_skipped = 0;

	// Look for Rate vs Range, Rate vs Orientation, or Rate vs Range vs Orientation sheets
	workbook.SheetNames.forEach(sheet_name => {
		const lowerName = sheet_name.toLowerCase();
		if (lowerName.includes('rate') &&
			(lowerName.includes('range') || lowerName.includes('orientation'))) {

			console.log(`Processing sheet: ${sheet_name}`);

			const sheet = workbook.Sheets[sheet_name];
			const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

			// Find header row
			let header_row = -1;
			for (let i = 0; i < data.length; i++) {
				const row = data[i];
				if (row && row.length > 0) {
					// Check if row contains both Attenuation and Throughput (partial match)
					const hasAttenuation = row.some(cell =>
						cell && cell.toString().includes('Attenuation')
					);
					const hasThroughput = row.some(cell =>
						cell && cell.toString().toLowerCase().includes('throughput')
					);

					if (hasAttenuation && hasThroughput) {
						header_row = i;
						break;
					}
				}
			}

			if (header_row === -1) {
				console.error(`No header row found in sheet: ${sheet_name}`);
				console.log('First 10 rows:', data.slice(0, 10));
				return;
			}

			console.log(`Found header row at index ${header_row}`);
			const headers = data[header_row];

			// Find column indices using partial matching
			const findColumnIndex = (headers, search_term) => {
				// First try exact match (case insensitive)
				let index = headers.findIndex(header =>
					header && header.toString().toLowerCase() === search_term.toLowerCase()
				);

				// If not found, try partial match
				if (index === -1) {
					index = headers.findIndex(header =>
						header && header.toString().toLowerCase().includes(search_term.toLowerCase())
					);
				}

				return index;
			};

			const attIndex = findColumnIndex(headers, 'attenuation');
			const throughputIndex = findColumnIndex(headers, 'throughput');
			const directionIndex = findColumnIndex(headers, 'direction');
			const channelIndex = findColumnIndex(headers, 'channel');
			const frequencyIndex = findColumnIndex(headers, 'frequency');
			const bwIndex = findColumnIndex(headers, 'bw');
			const nssIndex = findColumnIndex(headers, 'nss');
			const securityIndex = findColumnIndex(headers, 'security');
			const modeIndex = findColumnIndex(headers, 'mode');
			const angleIndex = findColumnIndex(headers, 'angle');

			// TX-specific columns - try multiple variations
			let txModeIndex = findColumnIndex(headers, 'tx mode');
			if (txModeIndex === -1) txModeIndex = findColumnIndex(headers, 'txmode');
			if (txModeIndex === -1) txModeIndex = findColumnIndex(headers, 'tx_mode');

			let txNssIndex = findColumnIndex(headers, 'tx nss');
			if (txNssIndex === -1) txNssIndex = findColumnIndex(headers, 'txnss');
			if (txNssIndex === -1) txNssIndex = findColumnIndex(headers, 'tx_nss');

			let txBwIndex = findColumnIndex(headers, 'tx bw');
			if (txBwIndex === -1) txBwIndex = findColumnIndex(headers, 'txbw');
			if (txBwIndex === -1) txBwIndex = findColumnIndex(headers, 'tx_bw');
			if (txBwIndex === -1) txBwIndex = findColumnIndex(headers, 'tx bandwidth');

			// RX-specific columns - try multiple variations
			let rxModeIndex = findColumnIndex(headers, 'rx mode');
			if (rxModeIndex === -1) rxModeIndex = findColumnIndex(headers, 'rxmode');
			if (rxModeIndex === -1) rxModeIndex = findColumnIndex(headers, 'rx_mode');

			let rxNssIndex = findColumnIndex(headers, 'rx nss');
			if (rxNssIndex === -1) rxNssIndex = findColumnIndex(headers, 'rxnss');
			if (rxNssIndex === -1) rxNssIndex = findColumnIndex(headers, 'rx_nss');

			let rxBwIndex = findColumnIndex(headers, 'rx bw');
			if (rxBwIndex === -1) rxBwIndex = findColumnIndex(headers, 'rxbw');
			if (rxBwIndex === -1) rxBwIndex = findColumnIndex(headers, 'rx_bw');
			if (rxBwIndex === -1) rxBwIndex = findColumnIndex(headers, 'rx bandwidth');

			// MCS columns
			let txMcsIndex = findColumnIndex(headers, 'tx mcs');
			if (txMcsIndex === -1) txMcsIndex = findColumnIndex(headers, 'txmcs');
			if (txMcsIndex === -1) txMcsIndex = findColumnIndex(headers, 'tx_mcs');

			let rxMcsIndex = findColumnIndex(headers, 'rx mcs');
			if (rxMcsIndex === -1) rxMcsIndex = findColumnIndex(headers, 'rxmcs');
			if (rxMcsIndex === -1) rxMcsIndex = findColumnIndex(headers, 'rx_mcs');

			console.log('Column indices:', {
				regular: { bw: bwIndex, nss: nssIndex, mode: modeIndex },
				tx: { txBw: txBwIndex, txNss: txNssIndex, txMode: txModeIndex, txMcs: txMcsIndex },
				rx: { rxBw: rxBwIndex, rxNss: rxNssIndex, rxMode: rxModeIndex, rxMcs: rxMcsIndex },
				txColumnsFound: {
					'TX BW': txBwIndex !== -1,
					'TX NSS': txNssIndex !== -1,
					'TX Mode': txModeIndex !== -1,
					'TX MCS': txMcsIndex !== -1
				},
				rxColumnsFound: {
					'RX BW': rxBwIndex !== -1,
					'RX NSS': rxNssIndex !== -1,
					'RX Mode': rxModeIndex !== -1,
					'RX MCS': rxMcsIndex !== -1
				},
				totalColumns: headers.length
			});

			const has_rotation = angleIndex !== -1;
			const has_attenuation = attIndex !== -1;

			if (throughputIndex === -1) {
				console.error('Missing required throughput column in sheet:', sheet_name);
				return;
			}

			if (!has_attenuation && !has_rotation) {
				console.error('Sheet must have either Attenuation or Angle column:', sheet_name);
				return;
			}

			// Group data by test configuration
			const testGroups = new Map();
			let skipped_count = 0;

			// First pass: collect all data points
			const allDataPoints = [];

			for (let i = header_row + 1; i < data.length; i++) {
				const row = data[i];
				if (!row || row[throughputIndex] === undefined) continue;

				const throughputValue = row[throughputIndex];
				const channelValue = row[channelIndex];
				const frequencyValue = row[frequencyIndex];
				const attValue = has_attenuation ? row[attIndex] : null;
				const angleValue = has_rotation ? row[angleIndex] : null;

				if (throughputValue === null || throughputValue === '') continue;

				const cleanThroughputValue = throughputValue.toString().replace(/,/g, '');
				const cleanChannelValue = channelValue ? channelValue.toString().replace(/,/g, '') : '0';
				const cleanFrequencyValue = frequencyValue ? frequencyValue.toString().replace(/,/g, '') : '0';

				const throughput = parseFloat(cleanThroughputValue);
				const channel = parseFloat(cleanChannelValue) || 0;
				const frequency = parseFloat(cleanFrequencyValue) || 0;

				let attenuation = 0;
				if (has_attenuation && attValue !== null && attValue !== undefined && attValue !== '') {
					const cleanAttValue = attValue.toString().replace(/,/g, '');
					attenuation = parseFloat(cleanAttValue);
					if (isNaN(attenuation)) attenuation = 0;
				}

				let angle = null;
				if (has_rotation && angleValue !== null && angleValue !== undefined && angleValue !== '') {
					const cleanAngleValue = angleValue.toString().replace(/,/g, '');
					angle = parseFloat(cleanAngleValue);
					if (isNaN(angle)) angle = null;
				}

				if (isNaN(throughput)) continue;

				if (channel === 0 || throughput === 0) {
					console.log(`Skipping invalid data point: channel=${channel}, throughput=${throughput}`);
					skipped_count++;
					continue;
				}

				const direction = row[directionIndex] || 'Unknown';

				// Use direction-specific columns when available, otherwise use regular columns
				// IMPORTANT: Column names are from test equipment perspective!
				// DUT-TX = test equipment receives = use Rx columns
				// DUT-RX = test equipment transmits = use Tx columns
				let bandwidth, nss, mode, mcs;
				const isTxDirection = direction.includes('TX');
				const isRxDirection = direction.includes('RX');

				// Check if specific columns exist
				const hasTxNss = txNssIndex !== -1;
				const hasRxNss = rxNssIndex !== -1;
				const hasTxBw = txBwIndex !== -1;
				const hasRxBw = rxBwIndex !== -1;
				const hasTxMode = txModeIndex !== -1;
				const hasRxMode = rxModeIndex !== -1;
				const hasTxMcs = txMcsIndex !== -1;
				const hasRxMcs = rxMcsIndex !== -1;

				// Test configuration identification uses configured parameters (NSS, BW) + appropriate mode
				let configBandwidth, configNss, configMode;
				if (isTxDirection) {
					// For DUT-TX direction, use configured test parameters and RX mode
					configBandwidth = row[bwIndex] || 'Unknown';
					configNss = row[nssIndex] || 'Unknown';
					configMode = hasRxMode ? row[rxModeIndex] : row[modeIndex] || 'Unknown';
				} else if (isRxDirection) {
					// For DUT-RX direction, use configured test parameters and TX mode
					configBandwidth = row[bwIndex] || 'Unknown';
					configNss = row[nssIndex] || 'Unknown';
					configMode = hasTxMode ? row[txModeIndex] : row[modeIndex] || 'Unknown';

				} else {
					// Use regular columns as fallback
					configBandwidth = row[bwIndex] || 'Unknown';
					configNss = row[nssIndex] || 'Unknown';
					configMode = row[modeIndex] || 'Unknown';
				}

				// Plot data uses actual measured values from direction-specific columns
				if (isTxDirection) {
					// For DUT-TX direction, use RX columns (test equipment perspective)
					bandwidth = hasRxBw ? row[rxBwIndex] : row[bwIndex] || 'Unknown';
					nss = hasRxNss ? row[rxNssIndex] : row[nssIndex] || 'Unknown';
					mode = hasRxMode ? row[rxModeIndex] : row[modeIndex] || 'Unknown';
					mcs = hasRxMcs ? row[rxMcsIndex] : 'Unknown';
				} else if (isRxDirection) {
					// For DUT-RX direction, use TX columns (test equipment perspective)
					bandwidth = hasTxBw ? row[txBwIndex] : row[bwIndex] || 'Unknown';
					nss = hasTxNss ? row[txNssIndex] : row[nssIndex] || 'Unknown';
					mode = hasTxMode ? row[txModeIndex] : row[modeIndex] || 'Unknown';
					mcs = hasTxMcs ? row[txMcsIndex] : 'Unknown';
				} else {
					// Use regular columns as fallback
					bandwidth = row[bwIndex] || 'Unknown';
					nss = row[nssIndex] || 'Unknown';
					mode = row[modeIndex] || 'Unknown';
					mcs = 'Unknown';
				}

				const security = row[securityIndex] || 'Unknown';

				// Clean up values
				const cleanBandwidth = bandwidth.toString().replace(/,/g, '');
				const cleanNss = nss.toString().replace(/,/g, '');
				const cleanConfigBandwidth = configBandwidth.toString().replace(/,/g, '');
				const cleanConfigNss = configNss.toString().replace(/,/g, '');

				allDataPoints.push({
					attenuation,
					throughput,
					frequency,
					mode,
					mcs,
					channel,
					bandwidth: cleanBandwidth,
					nss: cleanNss,
					security,
					direction,
					band: determine_band(frequency),
					angle,
					configBandwidth: cleanConfigBandwidth,
					configNss: cleanConfigNss,
					configMode
				});

			}

			const unique_angles = [...new Set(allDataPoints.map(p => p.angle).filter(a => a !== null))].sort((a, b) => a - b);
			const angle_increment = unique_angles.length > 1 ? unique_angles[1] - unique_angles[0] : 0;
			const has_actual_rotation = has_rotation && unique_angles.length > 0;

			const unique_attenuations = [...new Set(allDataPoints.map(p => p.attenuation).filter(a => a !== 0))];
			const has_varying_attenuation = unique_attenuations.length > 0;

			const test_type = has_actual_rotation && !has_varying_attenuation ? 'rotation' :
			                   has_actual_rotation && has_varying_attenuation ? 'rvr_rotation' : 'rvr';

			allDataPoints.sort((a, b) => {
				if (a.direction !== b.direction) return a.direction.localeCompare(b.direction);
				if (a.channel !== b.channel) return a.channel - b.channel;
				if (a.angle !== null && b.angle !== null && a.angle !== b.angle) return a.angle - b.angle;
				return a.attenuation - b.attenuation;
			});

			allDataPoints.forEach(point => {
				let baselinePoint;
				if (test_type === 'rotation') {
					const minAngle = Math.min(...allDataPoints
						.filter(dp => dp.direction === point.direction && dp.channel === point.channel && dp.angle !== null)
						.map(dp => dp.angle));
					baselinePoint = allDataPoints.find(p =>
						p.direction === point.direction &&
						p.channel === point.channel &&
						p.angle === minAngle
					);
				} else {
					const minAtten = Math.min(...allDataPoints
						.filter(dp => dp.direction === point.direction && dp.channel === point.channel &&
						              (test_type === 'rvr_rotation' ? dp.angle === point.angle : true))
						.map(dp => dp.attenuation));
					baselinePoint = allDataPoints.find(p =>
						p.direction === point.direction &&
						p.channel === point.channel &&
						(test_type === 'rvr_rotation' ? p.angle === point.angle : true) &&
						p.attenuation === minAtten
					);
				}

				if (!baselinePoint) return;

				let testKey = `${point.direction}_CH${point.channel}_${baselinePoint.configBandwidth}MHz_${baselinePoint.configNss}SS_${point.security}`;

				if (!testGroups.has(testKey)) {
					const testObj = {
						name: testKey,
						direction: point.direction,
						channel: point.channel.toString(),
						frequency: baselinePoint.frequency,
						band: baselinePoint.band,
						bandwidth: baselinePoint.configBandwidth,
						nss: baselinePoint.configNss,
						security: point.security,
						mode: baselinePoint.configMode,
						sheet_name: sheet_name,
						has_rotation: has_actual_rotation,
						test_type,
						angles: test_type === 'rotation' || test_type === 'rvr_rotation' ? unique_angles : [],
						angle_increment,
						data: []
					};
					testGroups.set(testKey, testObj);
				}

				const testGroup = testGroups.get(testKey);
				testGroup.data.push(point);
			});

			testGroups.forEach(test => {
				if (test.data.length > 0) {
					if (test.test_type === 'rotation') {
						test.data.sort((a, b) => (a.angle || 0) - (b.angle || 0));
					} else {
						test.data.sort((a, b) => a.attenuation - b.attenuation);
					}

					const baselinePoint = test.data.find(point => point.attenuation === 0) || test.data[0];
					if (baselinePoint) {
						test.mode = baselinePoint.mode;
					}

					tests.push(test);
				} else {
					console.log(`Skipping test configuration with no valid data: ${test.name}`);
				}
			});

			console.log(`Found ${tests.length} valid test configurations in ${sheet_name}`);
			if (skipped_count > 0) {
				console.log(`Filtered out ${skipped_count} invalid data points (channel=0 or throughput=0)`);
				total_skipped += skipped_count;
			}
		}
	});

	console.log(`Total tests found: ${tests.length}`);
	return { tests, skipped_count: total_skipped };
}

function update_file_list() {
	const fileList = document.getElementById('fileList');
	const fileItems = document.getElementById('fileItems');
	const fileCount = document.getElementById('fileCount');

	fileItems.innerHTML = '';

	// Count unique devices and file sources
	const uniqueDevices = new Set();
	let serverCount = 0;
	let localCount = 0;

	loaded_files.forEach(data => {
		uniqueDevices.add(data.device_info?.Name || data.file_name);
		if (data.from_server) {
			serverCount++;
		} else {
			localCount++;
		}
	});

	let countText = `${loaded_files.size} file${loaded_files.size !== 1 ? 's' : ''} from ${uniqueDevices.size} device${uniqueDevices.size !== 1 ? 's' : ''}`;
	if (loaded_files.size > 0) {
		countText += ` (${serverCount} server, ${localCount} local)`;
	}
	fileCount.textContent = countText;

	// Group files by device model
	const modelGroups = new Map();
	loaded_files.forEach((data, file_name) => {
		const deviceName = data.device_info?.Name || 'Unknown Device';
		const model = data.device_info?.['Model Number'] || 'Unknown Model';
		const modelKey = `${deviceName}|${model}`;

		if (!modelGroups.has(modelKey)) {
			modelGroups.set(modelKey, {
				deviceName,
				model,
				files: [],
				versions: new Set(),
				totalTests: 0,
				serverFiles: 0,
				localFiles: 0
			});
		}

		const group = modelGroups.get(modelKey);
		group.files.push({ file_name, data });
		group.totalTests += data.rvr_data.length;
		if (data.from_server) {
			group.serverFiles++;
		} else {
			group.localFiles++;
		}

		const version = data.device_info?.['Software Version'];
		if (version) {
			group.versions.add(version);
		}
	});

	// Display streamlined device summaries
	modelGroups.forEach((group, modelKey) => {
		const item = document.createElement('div');
		item.className = 'file-item';
		item.style.padding = '15px';
		item.style.marginBottom = '10px';

		const versionText = group.versions.size > 0 ?
			Array.from(group.versions).map(v => `v${v}`).join(', ') :
			'Unknown version';

		const sourceText = [];
		if (group.serverFiles > 0) sourceText.push(`${group.serverFiles} server`);
		if (group.localFiles > 0) sourceText.push(`${group.localFiles} local`);

		item.innerHTML = `
			<div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
				<div style="flex: 1;">
					<div style="display: flex; align-items: center; margin-bottom: 8px;">
						<strong style="color: #00a0c8; font-size: 1.1em; margin-right: 15px;">
							${group.deviceName}
						</strong>
						<span style="color: #888; font-size: 0.9em;">
							${group.model} • ${versionText}
						</span>
					</div>
					<div style="color: #aaa; font-size: 0.85em;">
						${group.totalTests} test configurations from ${group.files.length} file${group.files.length > 1 ? 's' : ''} (${sourceText.join(', ')})
					</div>
				</div>
				<div style="display: flex; gap: 10px; align-items: center;">
					<button class="btn-small" onclick="clearDeviceModel('${modelKey}')"
							style="background: rgba(220, 38, 38, 0.2); border: 1px solid rgba(220, 38, 38, 0.3);">
						Clear Device
					</button>
				</div>
			</div>
		`;
		fileItems.appendChild(item);
	});

	fileList.style.display = loaded_files.size > 0 ? 'block' : 'none';
}

function removeFile(file_name) {
	loaded_files.delete(file_name);
	update_file_list();
	update_test_options();
}

function clearAllFiles() {
	if (loaded_files.size > 0 && confirm('Remove all loaded files?')) {
		loaded_files.clear();
		update_file_list();
		update_test_options();
		document.querySelector('.chart-container').style.display = 'none';
		document.querySelector('.stats-panel').style.display = 'none';
		document.querySelector('#comparisonPanel').style.display = 'none';
		// Reset file input
		document.getElementById('excelFile').value = '';
	}
}

function clear_server_files() {
	const serverFiles = Array.from(loaded_files.entries()).filter(([_, data]) => data.from_server);
	if (serverFiles.length > 0 && confirm(`Remove ${serverFiles.length} server files?`)) {
		serverFiles.forEach(([file_name, _]) => {
			loaded_files.delete(file_name);
		});
		update_file_list();
		update_test_options();
	}
}

function clearDeviceModel(modelKey) {
	// Extract device name and model from the key
	const [deviceName, model] = modelKey.split('|');

	// Find all files for this device/model combination
	const filesToRemove = [];
	loaded_files.forEach((data, file_name) => {
		const fileDeviceName = data.device_info?.Name || 'Unknown Device';
		const fileModel = data.device_info?.['Model Number'] || 'Unknown Model';
		const fileModelKey = `${fileDeviceName}|${fileModel}`;

		if (fileModelKey === modelKey) {
			filesToRemove.push(file_name);
		}
	});

	if (filesToRemove.length > 0 && confirm(`Remove all files for ${deviceName}?`)) {
		filesToRemove.forEach(file_name => {
			loaded_files.delete(file_name);
		});
		update_file_list();
		update_test_options();
	}
}

function clear_local_files() {
	const localFiles = Array.from(loaded_files.entries()).filter(([_, data]) => !data.from_server);
	if (localFiles.length > 0 && confirm(`Remove ${localFiles.length} local files?`)) {
		localFiles.forEach(([file_name, _]) => {
			loaded_files.delete(file_name);
		});
		update_file_list();
		update_test_options();
		// Reset file input
		document.getElementById('excelFile').value = '';
	}
}

function update_test_options() {
	const container = document.getElementById('testOptions');
	container.innerHTML = '';

	if (loaded_files.size === 0) {
		document.querySelector('.test-selector').style.display = 'none';
		return;
	}

	document.querySelector('.test-selector').style.display = 'block';

	// Group all tests by device name (not filename)
	const deviceGroups = new Map();

	loaded_files.forEach((fileData, file_name) => {
		const deviceName = fileData.device_info?.Name || file_name.split('_')[0] || 'Unknown Device';

		console.log(`Processing file: ${file_name}, Device name: ${deviceName}`);

		if (!deviceGroups.has(deviceName)) {
			deviceGroups.set(deviceName, {
				files: [],
				tests: [],
				device_info: fileData.device_info
			});
		}

		const deviceGroup = deviceGroups.get(deviceName);
		deviceGroup.files.push(file_name);

		// Add all tests from this file to the device group
		fileData.rvr_data.forEach(test => {
			console.log(`Adding test: ${test.name} from ${file_name} to device ${deviceName}`);
			deviceGroup.tests.push({
				...test,
				file_name: file_name,
				device_info: fileData.device_info,
				from_server: fileData.from_server,
				server_path: test.server_path // Preserve server path for download URLs
			});
		});
	});

	console.log(`Device groups created:`, Array.from(deviceGroups.keys()));
	console.log(`Total device groups: ${deviceGroups.size}`);

	// Add summary info
	const summary = document.createElement('div');
	summary.style.marginBottom = '15px';
	summary.style.color = '#888';
	const totalTests = Array.from(deviceGroups.values()).reduce((sum, dg) => sum + dg.tests.length, 0);
	summary.innerHTML = `${deviceGroups.size} device(s) loaded with ${totalTests} total test configurations`;
	container.appendChild(summary);

	// Add quick actions
	const quickActions = document.createElement('div');
	quickActions.style.marginBottom = '20px';
	quickActions.innerHTML = `
		<button class="btn-small" onclick="select_all_tests()">Select All</button>
		<button class="btn-small" onclick="selectNoneTests()">Clear All</button>
		<button class="btn-small" onclick="select_matching_tests()">Select Matching</button>
	`;
	container.appendChild(quickActions);

	let testIndex = 0;

	// Display tests grouped by device
	deviceGroups.forEach((deviceGroup, deviceName) => {
		// Create device test group container
		const deviceContainer = document.createElement('div');
		deviceContainer.className = 'device-test-group';

		// Create device header
		const deviceHeader = document.createElement('div');
		deviceHeader.className = 'device-group-header';

		const model = deviceGroup.device_info?.['Model Number'] || '';
		const versions = new Set();
		deviceGroup.tests.forEach(test => {
			const version = test.device_info?.['Software Version'];
			if (version) versions.add(version);
		});

		const escapeQuotes = (str) => str.replace(/'/g, "\\'").replace(/"/g, '\\"');

		deviceHeader.innerHTML = `
			<div class="device-group-info">
				<div class="device-group-title">
					${deviceName} ${model ? `(${model})` : ''}
				</div>
				<div class="device-group-meta">
					${deviceGroup.files.length} file(s) |
					${deviceGroup.tests.length} tests |
					Version(s): ${Array.from(versions).join(', ')}
				</div>
			</div>
			<div>
				<button class="btn-small" onclick="selectAllDevice('${escapeQuotes(deviceName)}')">Select All</button>
				<button class="btn-small" onclick="selectNoneDevice('${escapeQuotes(deviceName)}')">Clear</button>
			</div>
		`;
		deviceContainer.appendChild(deviceHeader);

		// Separate TX and RX tests
		const txTests = deviceGroup.tests.filter(test => test.direction.includes('TX'));
		const rxTests = deviceGroup.tests.filter(test => test.direction.includes('RX'));

		// Create two-column layout
		const columnsContainer = document.createElement('div');
		columnsContainer.className = 'test-config-columns';

		// TX Column
		const txColumn = document.createElement('div');
		txColumn.className = 'test-column tx-column';
		const txHeader = document.createElement('div');
		txHeader.className = 'test-column-header';
		txHeader.innerHTML = '📥 DUT-TX Tests';
		txColumn.appendChild(txHeader);

		if (txTests.length > 0) {
			const txTable = createTestTable(txTests, deviceName, testIndex);
			txColumn.appendChild(txTable.table);
			testIndex = txTable.nextIndex;
		} else {
			const emptyMsg = document.createElement('div');
			emptyMsg.style.cssText = 'color: #666; font-style: italic; padding: 20px; text-align: center;';
			emptyMsg.textContent = 'No TX tests available';
			txColumn.appendChild(emptyMsg);
		}

		// RX Column
		const rxColumn = document.createElement('div');
		rxColumn.className = 'test-column rx-column';
		const rxHeader = document.createElement('div');
		rxHeader.className = 'test-column-header';
		rxHeader.innerHTML = '📥 DUT-RX Tests';
		rxColumn.appendChild(rxHeader);

		if (rxTests.length > 0) {
			const rxTable = createTestTable(rxTests, deviceName, testIndex);
			rxColumn.appendChild(rxTable.table);
			testIndex = rxTable.nextIndex;
		} else {
			const emptyMsg = document.createElement('div');
			emptyMsg.style.cssText = 'color: #666; font-style: italic; padding: 20px; text-align: center;';
			emptyMsg.textContent = 'No RX tests available';
			rxColumn.appendChild(emptyMsg);
		}

		// Add columns to columns container
		columnsContainer.appendChild(txColumn);
		columnsContainer.appendChild(rxColumn);

		// Add columns container to device container
		deviceContainer.appendChild(columnsContainer);

		// Add device container to main container
		container.appendChild(deviceContainer);
	});
}

// Helper function to create test tables
function createTestTable(tests, deviceName, startIndex) {
	let testIndex = startIndex;

	const table = document.createElement('table');
	table.className = 'test-table';

	// Create table header
	const thead = document.createElement('thead');
	thead.innerHTML = `
		<tr>
			<th style="width: 30px;"></th>
			<th>Band</th>
			<th>Channel</th>
			<th>BW</th>
			<th>NSS</th>
			<th>Mode</th>
			<th style="width: 70px;">Rotation</th>
			<th>Version</th>
			<th style="width: 55px; white-space: nowrap;">Files</th>
		</tr>
	`;
	table.appendChild(thead);

	// Create table body
	const tbody = document.createElement('tbody');

	tests.forEach(test => {
		const row = document.createElement('tr');

		// Checkbox cell
		const checkboxCell = document.createElement('td');
		const checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.className = 'test-checkbox';
		checkbox.id = `test-${testIndex}`;
		checkbox.value = `${test.file_name}|${test.name}`;
		checkbox.setAttribute('data-devicename', deviceName);
		checkbox.addEventListener('change', updateChart);
		checkboxCell.appendChild(checkbox);
		row.appendChild(checkboxCell);

		// Band cell
		const bandCell = document.createElement('td');
		bandCell.setAttribute('data-label', 'Band');
		bandCell.textContent = test.band || 'UNK';
		bandCell.style.fontWeight = '700';
		bandCell.style.color = test.band === '2G' ? '#f72585' : test.band === '5G' ? '#00a0c8' : test.band === '6G' ? '#4361ee' : '#888';
		row.appendChild(bandCell);

		// Channel cell with 6G conversion
		const channelCell = document.createElement('td');
		channelCell.setAttribute('data-label', 'Channel');
		channelCell.textContent = get_channel_display(test.channel, test.band);
		channelCell.style.fontWeight = '700';
		channelCell.style.color = '#e0e0e0';
		row.appendChild(channelCell);

		// Bandwidth cell
		const bwCell = document.createElement('td');
		bwCell.setAttribute('data-label', 'BW');
		bwCell.textContent = `${test.bandwidth}MHz`;
		bwCell.style.color = '#ccc';
		row.appendChild(bwCell);

		// NSS cell
		const nssCell = document.createElement('td');
		nssCell.setAttribute('data-label', 'NSS');
		nssCell.textContent = `${test.nss}SS`;
		nssCell.style.color = '#ccc';
		row.appendChild(nssCell);

		// Mode cell
		const modeCell = document.createElement('td');
		modeCell.setAttribute('data-label', 'Mode');
		modeCell.textContent = test.mode || 'Unknown';
		modeCell.style.color = '#ccc';
		modeCell.style.fontWeight = '700';
		row.appendChild(modeCell);

		// Rotation cell
		const rotationCell = document.createElement('td');
		rotationCell.setAttribute('data-label', 'Rotation');
		if (test.has_rotation && test.angle_increment > 0) {
			rotationCell.textContent = `${test.angle_increment}°`;
			rotationCell.style.color = '#ccc';
			rotationCell.style.fontWeight = '700';
		} else {
			rotationCell.textContent = '-';
			rotationCell.style.color = '#666';
		}
		row.appendChild(rotationCell);

		// Version cell
		const versionCell = document.createElement('td');
		versionCell.className = 'version-cell';
		versionCell.setAttribute('data-label', 'Version');
		versionCell.style.whiteSpace = 'nowrap';
		const version = test.device_info?.['Software Version'] || 'Unknown';
		versionCell.textContent = `v${version}`;
		row.appendChild(versionCell);

		// Files cell with download icons
		const fileCell = document.createElement('td');
		fileCell.className = 'file-cell';
		fileCell.setAttribute('data-label', 'Files');
		fileCell.style.textAlign = 'left';
		fileCell.style.whiteSpace = 'nowrap';

		if (test.from_server && test.server_path) {
			// Use the original server path to construct download URLs
			const server_path = test.server_path;

			// For Excel: use the exact path the file was loaded from
			const excelPath = `/reports/${server_path}`;

			// For PDF: use the new API endpoint that finds the PDF with wildcard matching
			const pdfPath = `/api/pdf/${server_path}`;

			fileCell.innerHTML = `
				<a href="${excelPath}" download title="Download Excel Report" style="margin-right: 8px; color: #00a0c8; text-decoration: none;">
					📊
				</a>
				<a href="${pdfPath}" download title="Download PDF Report" style="color: #f72585; text-decoration: none;">
					📄
				</a>
			`;
		} else {
			// For local files, show indicator that files are not available for download
			fileCell.innerHTML = `
				<span title="Local file - server downloads not available" style="color: #666;">
					📁
				</span>
			`;
		}
		row.appendChild(fileCell);

		// Add hover effect to row
		row.addEventListener('mouseenter', () => {
			row.style.backgroundColor = '#2a2a2a';
		});
		row.addEventListener('mouseleave', () => {
			row.style.backgroundColor = 'transparent';
		});

		// Make row clickable to toggle checkbox
		row.addEventListener('click', (e) => {
			if (e.target.type !== 'checkbox') {
				checkbox.checked = !checkbox.checked;
				checkbox.dispatchEvent(new Event('change'));
			}
		});
		row.style.cursor = 'pointer';

		tbody.appendChild(row);
		testIndex++;
	});

	table.appendChild(tbody);

	return { table, nextIndex: testIndex };
}

// Helper functions for select all/none
window.selectAllDevice = function(deviceName) {
	const checkboxes = document.querySelectorAll(`.test-checkbox[data-devicename="${deviceName}"]`);
	checkboxes.forEach(cb => cb.checked = true);
	updateChart();
};

window.selectNoneDevice = function(deviceName) {
	const checkboxes = document.querySelectorAll(`.test-checkbox[data-devicename="${deviceName}"]`);
	checkboxes.forEach(cb => cb.checked = false);
	updateChart();
};

window.select_all_tests = function() {
	const checkboxes = document.querySelectorAll('.test-checkbox');
	checkboxes.forEach(cb => cb.checked = true);
	updateChart();
};

window.selectNoneTests = function() {
	const checkboxes = document.querySelectorAll('.test-checkbox');
	checkboxes.forEach(cb => cb.checked = false);
	updateChart();
};

window.clear_chart_selection = function() {
	// Clear all test selections
	const checkboxes = document.querySelectorAll('.test-checkbox');
	checkboxes.forEach(cb => cb.checked = false);

	// Hide chart and related panels
	document.querySelector('.chart-container').style.display = 'none';
	document.querySelector('.stats-panel').style.display = 'none';
	document.querySelector('#comparisonPanel').style.display = 'none';

	// Show a success notification
	show_success('All test selections cleared');
};

window.select_matching_tests = function() {
	// Select one test from each device that has the same configuration
	const checkboxes = document.querySelectorAll('.test-checkbox');

	// First, clear all
	checkboxes.forEach(cb => cb.checked = false);

	// Group by configuration
	const configMap = new Map();
	checkboxes.forEach(cb => {
		const [file_name, test_name] = cb.value.split('|');
		const deviceName = cb.getAttribute('data-devicename');

		// Extract config from test_name (remove device-specific parts)
		const configMatch = test_name.match(/(DUT-[TR]X)_CH(\d+)_(\d+MHz)_(\d+SS)_(\w+)/);
		if (configMatch) {
			const configKey = configMatch[0];
			if (!configMap.has(configKey)) {
				configMap.set(configKey, new Map());
			}
			const deviceMap = configMap.get(configKey);
			if (!deviceMap.has(deviceName)) {
				deviceMap.set(deviceName, cb);
			}
		}
	});

	// Select configs that exist for multiple devices
	configMap.forEach((deviceMap, config) => {
		if (deviceMap.size > 1) {
			deviceMap.forEach(cb => cb.checked = true);
		}
	});

	updateChart();
};

function formatTestName(test) {
	const displayChannel = format_channel_number(test.channel, test.band);
	let base_name = `${test.band || 'UNK'} CH${displayChannel} ${test.bandwidth}MHz ${test.nss}SS ${test.mode}`;
	if (test.has_rotation && test.angle_increment > 0) {
		base_name += ` (Rotation: ${test.angle_increment}° steps)`;
	}
	return base_name;
}

function updateChart() {
	const selected_tests = [];
	const checkboxes = document.querySelectorAll('.test-checkbox:checked');

	checkboxes.forEach(cb => {
		const [file_name, test_name] = cb.value.split('|');
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
			hint.style.color = '#888';
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
					const slider_input = document.getElementById('polarAttenuationInput');
					slider_input.max = 100;
					slider_input.value = 0;
					current_polar_attenuation = polar_attenuation_values[0];
					document.getElementById('polarAttenuationValue').textContent = `${current_polar_attenuation} dB`;
					draw_polar_chart(selected_tests, current_polar_attenuation);
				} else {
					polar_slider.style.display = 'none';
					draw_polar_chart(selected_tests, null);
				}
			} else {
				polar_slider.style.display = 'none';
				draw_polar_chart(selected_tests, null);
			}
		} else {
			document.getElementById('cartesianChartWrapper').style.display = 'block';
			document.getElementById('polarChartWrapper').style.display = 'none';
			polar_slider.style.display = 'none';
			if (show_angle_selector) {
				document.getElementById('rotationControls').style.display = 'block';
			}
			drawChart(selected_tests);
		}
	} else {
		view_mode_toggle.style.display = 'none';
		polar_slider.style.display = 'none';
		document.getElementById('cartesianChartWrapper').style.display = 'block';
		document.getElementById('polarChartWrapper').style.display = 'none';
		current_view_mode = 'cartesian';
		drawChart(selected_tests);
	}

	updateStats(selected_tests);

	// Show comparison panel if comparing multiple devices
	const uniqueDevices = new Set(selected_tests.map(t => t.device_info?.Name || t.file_name));
	if (uniqueDevices.size > 1) {
		document.querySelector('#comparisonPanel').style.display = 'block';
		updateComparisonTable(selected_tests);
	} else {
		document.querySelector('#comparisonPanel').style.display = 'none';
	}
}

// Updated chart drawing function with unique colors for each test configuration
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

	// Define expanded color palette for different test configurations
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

	// First pass: identify unique device + test configuration + software version combinations
	const uniqueConfigs = new Set();
	tests_to_render.forEach(test => {
		const deviceName = test.device_info?.Name || test.file_name;
		const softwareVersion = test.device_info?.['Software Version'] || '';
		const test_config = formatTestName(test);
		const configKey = `${deviceName}|${softwareVersion}|${test_config}`;
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
		const deviceName = test.device_info?.Name || test.file_name;
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
				const test_config = formatTestName(test);
				const configKey = `${softwareVersion}|${test_config}`;

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
					const testKey = `${modelKey}|${softwareVersion}|${formatTestName(test)}|${test.direction}`;
					modelStyleMap.set(testKey, pointStyle);
				});

				configIndex++;
			});
		} else {
			// Single test for this model gets default circle style
			const test = tests[0];
			const softwareVersion = test.device_info?.['Software Version'] || '';
			const testKey = `${modelKey}|${softwareVersion}|${formatTestName(test)}|${test.direction}`;
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
		const deviceName = test.device_info?.Name || test.file_name;
		const softwareVersion = test.device_info?.['Software Version'] || '';
		const modelNumber = test.device_info?.['Model Number'] || '';
		const test_config = formatTestName(test);
		const configKey = `${deviceName}|${softwareVersion}|${test_config}`;
		let baseColor = configColorMap.get(configKey);

		const modelKey = `${deviceName}|${modelNumber}`;
		const testKey = `${modelKey}|${softwareVersion}|${test_config}|${test.direction}`;
		const pointStyle = modelStyleMap.get(testKey) || 'circle';

		let label = `${deviceName} ${softwareVersion ? `v${softwareVersion}` : ''} - ${test_config} ${test.direction}`;
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
			software_version: softwareVersion
		};
	});

	// Get responsive configuration
	const responsive_config = get_responsive_chart_config();
	const is_small_screen = window.innerWidth <= 768;

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
					color: '#e0e0e0',
					font: {
						size: is_small_screen ? 14 : 18,
						weight: '700',
						family: window.QUALIFI_FONT === 'Berkeley Mono' ? "'Berkeley Mono', 'Courier New', monospace" : "'Poppins', sans-serif"
					}
				},
				subtitle: {
					display: !is_small_screen,
					text: `Comparing ${uniqueConfigs.size} test configuration(s) across ${Array.from(new Set(tests_to_render.map(t => t.device_info?.Name || t.file_name))).length} device(s) | Solid: TX, Dotted: RX | Different point styles for multiple tests per DUT model`,
					color: '#aaa',
					font: {
						size: is_small_screen ? 10 : 14,
						family: window.QUALIFI_FONT === 'Berkeley Mono' ? "'Berkeley Mono', 'Courier New', monospace" : "'Poppins', sans-serif"
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
						color: '#888',
						font: {
							size: 10,
							family: window.QUALIFI_FONT === 'Berkeley Mono' ? "'Berkeley Mono', 'Courier New', monospace" : "'Poppins', sans-serif",
							weight: 'normal'
						},
						padding: 5
					},
					labels: {
						...responsive_config.plugins.legend.labels,
						color: '#e0e0e0',
						padding: is_small_screen ? 6 : 10,
						boxWidth: is_small_screen ? 15 : 20,
						boxHeight: is_small_screen ? 8 : 10,
						font: {
							size: is_small_screen ? 9 : 10,
							family: window.QUALIFI_FONT === 'Berkeley Mono' ? "'Berkeley Mono', 'Courier New', monospace" : "'Poppins', sans-serif"
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
									const group_key = `${dataset.deviceName}|${dataset.software_version}|${dataset.test_config}|${dataset.fullTest.direction}`;

									if (!grouped.has(group_key)) {
										let header_text = `${dataset.deviceName} ${dataset.software_version ? `v${dataset.software_version}` : ''} - ${dataset.test_config} ${dataset.fullTest.direction}`;

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
										fontColor: '#e0e0e0',
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
						color: '#e0e0e0',
						font: {
							size: 14,
							family: window.QUALIFI_FONT === 'Berkeley Mono' ? "'Berkeley Mono', 'Courier New', monospace" : "'Poppins', sans-serif"
						}
					},
					grid: {
						color: '#333',
						borderColor: '#555'
					},
					ticks: {
						color: '#e0e0e0'
					},
					...(is_pure_rotation ? {
						min: 0,
						max: 360,
						ticks: {
							color: '#e0e0e0',
							stepSize: 45
						}
					} : {})
				},
				y: {
					display: true,
					title: {
						display: true,
						text: 'Throughput (Mbps)',
						color: '#e0e0e0',
						font: {
							size: 14,
							family: window.QUALIFI_FONT === 'Berkeley Mono' ? "'Berkeley Mono', 'Courier New', monospace" : "'Poppins', sans-serif"
						}
					},
					grid: {
						color: '#333',
						borderColor: '#555'
					},
					ticks: {
						color: '#e0e0e0'
					}
				}
			}
		}
	});
}

function draw_polar_chart(selected_tests, attenuation_filter = null) {
	const polar_chart_div = document.getElementById('polarChart');

	const test_types = new Set(selected_tests.map(t => t.test_type || 'rvr'));
	const is_pure_rotation = test_types.has('rotation') && test_types.size === 1;
	const has_rvr_rotation = test_types.has('rvr_rotation');

	const traces = [];
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

		const device_name = test.device_info?.Name || test.file_name || 'Unknown';
		const software_version = test.device_info?.['Software Version'] || '';
		const test_config = formatTestName(test);
		const direction = test.direction || 'Unknown';
		let trace_name = `${device_name} ${software_version ? `v${software_version}` : ''} - ${test_config} ${direction}`;

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
		polar_chart_div.innerHTML = '<div style="text-align: center; padding: 100px; color: #888;">No rotation data available for polar plot</div>';
		return;
	}

	const layout = {
		polar: {
			radialaxis: {
				title: {
					text: 'Throughput (Mbps)',
					font: {
						family: window.QUALIFI_FONT === 'Berkeley Mono' ? "'Berkeley Mono', monospace" : "'Poppins', sans-serif",
						size: 14,
						color: '#e0e0e0'
					}
				},
				visible: true,
				range: [0, null],
				color: '#e0e0e0',
				gridcolor: '#333',
				tickfont: {
					color: '#e0e0e0'
				}
			},
			angularaxis: {
				direction: 'clockwise',
				rotation: 90,
				thetaunit: 'degrees',
				tickmode: 'linear',
				tick0: 0,
				dtick: 45,
				color: '#e0e0e0',
				gridcolor: '#333',
				tickfont: {
					color: '#e0e0e0'
				}
			},
			bgcolor: 'rgba(0, 0, 0, 0)'
		},
		showlegend: true,
		legend: {
			font: {
				family: window.QUALIFI_FONT === 'Berkeley Mono' ? "'Berkeley Mono', monospace" : "'Poppins', sans-serif",
				size: 10,
				color: '#e0e0e0'
			},
			bgcolor: 'rgba(20, 20, 20, 0.8)',
			bordercolor: '#333',
			borderwidth: 1,
			orientation: 'h',
			x: 0.5,
			y: 1.15,
			xanchor: 'center',
			yanchor: 'bottom'
		},
		paper_bgcolor: '#0a0a0a',
		plot_bgcolor: '#0a0a0a',
		font: {
			family: window.QUALIFI_FONT === 'Berkeley Mono' ? "'Berkeley Mono', monospace" : "'Poppins', sans-serif",
			color: '#e0e0e0'
		},
		margin: {
			l: 80,
			r: 80,
			t: 120,
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

function toggle_view_mode() {
	const toggle_btn = document.getElementById('viewModeToggle');
	const cartesian_wrapper = document.getElementById('cartesianChartWrapper');
	const polar_wrapper = document.getElementById('polarChartWrapper');
	const toggle_chart_type_btn = document.querySelector('.chart-button[onclick="toggleChartType()"]');

	if (current_view_mode === 'cartesian') {
		current_view_mode = 'polar';
		toggle_btn.textContent = 'Switch to Standard View';
		cartesian_wrapper.style.display = 'none';
		polar_wrapper.style.display = 'block';
		if (toggle_chart_type_btn) toggle_chart_type_btn.style.display = 'none';
		updateChart();
	} else {
		current_view_mode = 'cartesian';
		toggle_btn.textContent = 'Switch to Polar View';
		cartesian_wrapper.style.display = 'block';
		polar_wrapper.style.display = 'none';
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
			const [file_name, test_name] = cb.value.split('|');
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

function updateStats(selected_tests) {
	const statsGrid = document.getElementById('statsGrid');
	statsGrid.innerHTML = '';

	// Find best values across all tests
	let bestMaxRate = 0;
	let bestAvgRate = 0;
	let bestRange = 0;

	const testStats = selected_tests.map(test => {
		const throughputs = test.data.map(d => d.throughput).filter(t => t > 0);
		const maxRate = Math.max(...throughputs);
		const avgRate = Math.round(throughputs.reduce((a, b) => a + b, 0) / throughputs.length);

		// Find effective range (last attenuation with throughput > 10 Mbps)
		let effective_range = 0;
		for (let i = test.data.length - 1; i >= 0; i--) {
			if (test.data[i].throughput > 10) {
				effective_range = test.data[i].attenuation;
				break;
			}
		}

		bestMaxRate = Math.max(bestMaxRate, maxRate);
		bestAvgRate = Math.max(bestAvgRate, avgRate);
		bestRange = Math.max(bestRange, effective_range);

		return { test, maxRate, avgRate, effective_range };
	});

	// Create stat cards
	testStats.forEach(({ test, maxRate, avgRate, effective_range }) => {
		const card = document.createElement('div');
		card.className = 'stat-card';

		const isBestMax = maxRate === bestMaxRate && selected_tests.length > 1;
		const isBestAvg = avgRate === bestAvgRate && selected_tests.length > 1;
		const isBestRange = effective_range === bestRange && selected_tests.length > 1;

		card.innerHTML = `
			<h4 style="color: #00a0c8; margin-bottom: 15px;">
				${test.device_info?.Name || test.file_name}<br>
				<span style="font-size: 0.75em; color: #888;">
					v${test.device_info?.['Software Version'] || 'Unknown'}
				</span><br>
				<span style="font-size: 0.8em; color: #aaa;">
					${formatTestName(test)} ${test.direction}
				</span>
			</h4>
			<div style="margin-bottom: 10px;">
				<div class="stat-label">Max Throughput ${isBestMax ? '🏆' : ''}</div>
				<div class="stat-value">${maxRate} Mbps</div>
			</div>
			<div style="margin-bottom: 10px;">
				<div class="stat-label">Average Throughput ${isBestAvg ? '🏆' : ''}</div>
				<div class="stat-value">${avgRate} Mbps</div>
			</div>
			<div>
				<div class="stat-label">Effective Range (>10 Mbps) ${isBestRange ? '🏆' : ''}</div>
				<div class="stat-value">${effective_range} dB</div>
			</div>
		`;
		statsGrid.appendChild(card);
	});
}

function toggleChartType() {
	chart_type = chart_type === 'line' ? 'bar' : 'line';
	updateChart();
}

function export_chart() {
	if (!chart_instance) return;

	const link = document.createElement('a');
	link.download = 'wifi-rvr-comparison.png';
	link.href = chart_instance.toBase64Image();
	link.click();
}

function updateComparisonTable(selected_tests) {
	const container = document.getElementById('comparisonTable');

	// Group tests by configuration
	const configGroups = new Map();
	selected_tests.forEach(test => {
		const configKey = `${formatTestName(test)} ${test.direction}`;
		if (!configGroups.has(configKey)) {
			configGroups.set(configKey, []);
		}
		configGroups.get(configKey).push(test);
	});

	// Create comparison table (desktop)
	let html = '<table class="comparison-table">';

	// Create mobile cards (mobile)
	let mobileHtml = '<div class="mobile-comparison-cards">';
	html += '<thead><tr>';
	html += '<th>Test Configuration</th>';
	html += '<th>Device</th>';
	html += '<th>Software Version</th>';
	html += '<th>Band</th>';
	html += '<th>Mode (0dB)</th>';
	html += '<th>Max Throughput</th>';
	html += '<th>Avg Throughput</th>';
	html += '<th>Range (>10Mbps)</th>';
	html += '</tr></thead>';
	html += '<tbody>';

	configGroups.forEach((tests, config) => {
		// Find best values for highlighting
		const maxThroughputs = tests.map(t => Math.max(...t.data.map(d => d.throughput)));
		const bestMaxThroughput = Math.max(...maxThroughputs);

		const ranges = tests.map(t => {
			for (let i = t.data.length - 1; i >= 0; i--) {
				if (t.data[i].throughput > 10) {
					return t.data[i].attenuation;
				}
			}
			return 0;
		});
		const bestRange = Math.max(...ranges);

		tests.forEach((test, index) => {
			const deviceName = test.device_info?.Name || test.file_name;
			const softwareVersion = test.device_info?.['Software Version'] || 'Unknown';
			const throughputs = test.data.map(d => d.throughput).filter(t => t > 0);
			const maxRate = Math.max(...throughputs);
			const avgRate = Math.round(throughputs.reduce((a, b) => a + b, 0) / throughputs.length);
			const range = ranges[index];
			const band = test.band || 'UNK';

			// Color coding for band
			const bandColor = band === '2G' ? '#f72585' : band === '5G' ? '#00a0c8' : band === '6G' ? '#4361ee' : '#888';

			// Desktop table row
			html += '<tr>';
			if (index === 0) {
				html += `<td rowspan="${tests.length}" class="test-config" data-label="Test Configuration">${config}</td>`;
			}
			html += `<td data-label="Device">${deviceName}</td>`;
			html += `<td data-label="Software Version">${softwareVersion}</td>`;
			html += `<td data-label="Band" style="color: ${bandColor}; font-weight: 700;">${band}</td>`;
			html += `<td data-label="Mode (0dB)">${test.mode || 'Unknown'}</td>`;
			html += `<td data-label="Max Throughput" class="${maxRate === bestMaxThroughput ? 'best-value' : ''}">${maxRate} Mbps</td>`;
			html += `<td data-label="Avg Throughput">${avgRate} Mbps</td>`;
			html += `<td data-label="Range (>10Mbps)" class="${range === bestRange ? 'best-value' : ''}">${range} dB</td>`;
			html += '</tr>';

			// Mobile card
			mobileHtml += `
			<div class="mobile-comparison-card">
				<div class="mobile-card-header">
					<div class="mobile-card-title">
						${deviceName}<br>
						<small style="font-size: 0.75em; color: var(--text-tertiary);">${config}</small>
					</div>
					<div class="mobile-card-band" style="background-color: ${bandColor}20; color: ${bandColor};">
						${band}
					</div>
				</div>
				<div class="mobile-card-content">
					<div class="mobile-card-item full-width">
						<div class="mobile-card-label">Software Version</div>
						<div class="mobile-card-value">${softwareVersion}</div>
					</div>
					<div class="mobile-card-item">
						<div class="mobile-card-label">Mode (0dB)</div>
						<div class="mobile-card-value">${test.mode || 'Unknown'}</div>
					</div>
					<div class="mobile-card-item">
						<div class="mobile-card-label">Max Throughput</div>
						<div class="mobile-card-value ${maxRate === bestMaxThroughput ? 'best-value' : ''}">${maxRate} Mbps</div>
					</div>
					<div class="mobile-card-item">
						<div class="mobile-card-label">Avg Throughput</div>
						<div class="mobile-card-value">${avgRate} Mbps</div>
					</div>
					<div class="mobile-card-item">
						<div class="mobile-card-label">Range (>10Mbps)</div>
						<div class="mobile-card-value ${range === bestRange ? 'best-value' : ''}">${range} dB</div>
					</div>
				</div>
			</div>`;
		});

		// Add separator between config groups in desktop table
		html += '<tr style="height: 10px;"><td colspan="8" style="border: none;"></td></tr>';
	});

	html += '</tbody></table>';
	mobileHtml += '</div>';

	// Combine both layouts
	container.innerHTML = html + mobileHtml;
}

function export_csv() {
	const selected_tests = [];
	const checkboxes = document.querySelectorAll('.test-checkbox:checked');

	checkboxes.forEach(cb => {
		const [file_name, test_name] = cb.value.split('|');
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

	// Create CSV data
	let csv = 'Device,Model,Software Version,Test Configuration,Direction,Band,Mode (0dB),';

	// Get all unique attenuation values
	const allAttenuations = new Set();
	selected_tests.forEach(test => {
		test.data.forEach(point => {
			allAttenuations.add(point.attenuation);
		});
	});
	const attenuations = Array.from(allAttenuations).sort((a, b) => a - b);

	// Add attenuation headers
	csv += attenuations.map(att => `${att}dB`).join(',') + '\n';

	// Add data rows
	selected_tests.forEach(test => {
		const deviceName = test.device_info?.Name || test.file_name;
		const model = test.device_info?.['Model Number'] || 'Unknown';
		const version = test.device_info?.['Software Version'] || 'Unknown';
		const config = formatTestName(test);
		const band = test.band || 'UNK';
		const mode = test.mode || 'Unknown';

		csv += `"${deviceName}","${model}","${version}","${config}","${test.direction}","${band}","${mode}",`;

		// Add throughput values for each attenuation
		const throughputMap = new Map(test.data.map(p => [p.attenuation, p.throughput]));
		csv += attenuations.map(att => throughputMap.get(att) || '').join(',');
		csv += '\n';
	});

	// Download CSV
	const blob = new Blob([csv], { type: 'text/csv' });
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.download = `wifi_rvr_comparison_${new Date().toISOString().split('T')[0]}.csv`;
	link.href = url;
	link.click();
	URL.revokeObjectURL(url);
}

function show_error(message) {
	const error = document.createElement('div');
	error.className = 'error';
	error.textContent = message;
	document.querySelector('.container').prepend(error);
	setTimeout(() => error.remove(), 5000);
}

function calculateNotificationPosition() {
	let totalOffset = 20; // Initial top margin

	for (let i = 0; i < active_notifications.length; i++) {
		const notification = active_notifications[i];
		if (i > 0) {
			// Add the height of the previous notification plus spacing
			const prevNotification = active_notifications[i - 1];
			const prevHeight = prevNotification.offsetHeight || 50; // Default height if not rendered yet
			totalOffset += prevHeight + 10; // 10px spacing between notifications
		}
	}

	return totalOffset;
}

function repositionNotifications() {
	let currentTop = 20;

	active_notifications.forEach((notification, index) => {
		notification.style.top = `${currentTop}px`;
		currentTop += notification.offsetHeight + 10; // Add height plus spacing
	});
}

function show_success(message) {
	const success = document.createElement('div');
	const fontFamily = window.QUALIFI_FONT === 'Berkeley Mono' ?
		"'Berkeley Mono', 'Courier New', monospace" :
		"'Poppins', sans-serif";

	success.style.cssText = `
		position: fixed;
		top: 20px;
		right: 20px;
		background: rgba(34, 197, 94, 0.4);
		border: 1px solid rgba(34, 197, 94, 0.6);
		color: #86efac;
		padding: 15px;
		border-radius: 8px;
		font-family: ${fontFamily};
		font-weight: 400;
		z-index: 1000;
		max-width: 400px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		transition: all 0.3s ease;
		opacity: 0;
	`;
	success.textContent = message;
	document.body.appendChild(success);

	// Add to active notifications
	active_notifications.push(success);

	// Force layout calculation before positioning
	success.offsetHeight;

	// Position based on existing notifications
	const topOffset = calculateNotificationPosition();
	success.style.top = `${topOffset}px`;

	// Fade in
	setTimeout(() => {
		success.style.opacity = '1';
	}, 10);

	// Remove after 3 seconds and update positions
	setTimeout(() => {
		success.style.opacity = '0';
		setTimeout(() => {
			const index = active_notifications.indexOf(success);
			if (index > -1) {
				active_notifications.splice(index, 1);
				success.remove();

				// Reposition remaining notifications
				repositionNotifications();
			}
		}, 300);
	}, 6000);
}
