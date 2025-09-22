let chart_instance = null;
let is_batch_loading = false;
let loaded_files = new Map();
let chart_type = 'line';
let server_reports = null;
let selected_server_reports = new Set();
let active_notifications = [];

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

	// Look for Rate vs Range sheets
	workbook.SheetNames.forEach(sheet_name => {
		if (sheet_name.toLowerCase().includes('rate') &&
			sheet_name.toLowerCase().includes('range')) {

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
			const modeIndex = findColumnIndex(headers, 'mode'); // Fallback for when TX Mode isn't available

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

			// Validate required columns
			if (attIndex === -1 || throughputIndex === -1) {
				console.error('Missing required columns in sheet:', sheet_name);
				return;
			}

			// Group data by test configuration
			const testGroups = new Map();
			let skipped_count = 0;

			// First pass: collect all data points
			const allDataPoints = [];

			for (let i = header_row + 1; i < data.length; i++) {
				const row = data[i];
				if (!row || row[attIndex] === undefined || row[throughputIndex] === undefined) continue;

				// Skip rows where attenuation or throughput are not valid numbers
				const attValue = row[attIndex];
				const throughputValue = row[throughputIndex];
				const channelValue = row[channelIndex];
				const frequencyValue = row[frequencyIndex];

				if (attValue === null || attValue === '' || throughputValue === null || throughputValue === '') continue;

				// Remove commas from numeric values before parsing
				const cleanAttValue = attValue.toString().replace(/,/g, '');
				const cleanThroughputValue = throughputValue.toString().replace(/,/g, '');
				const cleanChannelValue = channelValue ? channelValue.toString().replace(/,/g, '') : '0';
				const cleanFrequencyValue = frequencyValue ? frequencyValue.toString().replace(/,/g, '') : '0';

				const attenuation = parseFloat(cleanAttValue);
				const throughput = parseFloat(cleanThroughputValue);
				const channel = parseFloat(cleanChannelValue) || 0;
				const frequency = parseFloat(cleanFrequencyValue) || 0;

				// Skip if parsing failed
				if (isNaN(attenuation) || isNaN(throughput)) continue;

				// Skip invalid data points (channel 0 or throughput 0)
				if (channel === 0 || throughput === 0) {
					console.log(`Skipping invalid data point: channel=${channel}, throughput=${throughput}, attenuation=${attenuation}`);
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
					// Config values for test identification
					configBandwidth: cleanConfigBandwidth,
					configNss: cleanConfigNss,
					configMode
				});

			}

			// Second pass: group by baseline configuration (attenuation 0 or lowest attenuation)
			// Sort by direction and channel first
			allDataPoints.sort((a, b) => {
				if (a.direction !== b.direction) return a.direction.localeCompare(b.direction);
				if (a.channel !== b.channel) return a.channel - b.channel;
				return a.attenuation - b.attenuation;
			});

			// Create test groups based on baseline configuration
			allDataPoints.forEach(point => {
				// Find the baseline configuration for this direction/channel
				const baselinePoint = allDataPoints.find(p =>
					p.direction === point.direction &&
					p.channel === point.channel &&
					p.attenuation === Math.min(...allDataPoints
						.filter(dp => dp.direction === point.direction && dp.channel === point.channel)
						.map(dp => dp.attenuation))
				);

				if (!baselinePoint) return;

				// Create test key based on BASELINE configuration using config values
				const testKey = `${point.direction}_CH${point.channel}_${baselinePoint.configBandwidth}MHz_${baselinePoint.configNss}SS_${point.security}`;


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
						data: []
					};


					testGroups.set(testKey, testObj);
				}

				const testGroup = testGroups.get(testKey);
				testGroup.data.push(point);
			});

			// Convert to array and sort data points by attenuation
			testGroups.forEach(test => {
				// Only include tests that have valid data points
				if (test.data.length > 0) {
					test.data.sort((a, b) => a.attenuation - b.attenuation);

					// Update mode based on data points (bandwidth and nss already set correctly from config values)
					const baselinePoint = test.data.find(point => point.attenuation === 0);
					if (baselinePoint) {
						test.mode = baselinePoint.mode;
						// Keep existing bandwidth and nss from config values
					} else if (test.data.length > 0) {
						// Use mode from the first (lowest attenuation) data point
						test.mode = test.data[0].mode;
						// Keep existing bandwidth and nss from config values
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
			<th>Version</th>
			<th style="width: 80px;">Files</th>
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

		// Version cell
		const versionCell = document.createElement('td');
		versionCell.className = 'version-cell';
		versionCell.setAttribute('data-label', 'Version');
		const version = test.device_info?.['Software Version'] || 'Unknown';
		versionCell.textContent = `v${version}`;
		row.appendChild(versionCell);

		// Files cell with download icons
		const fileCell = document.createElement('td');
		fileCell.className = 'file-cell';
		fileCell.setAttribute('data-label', 'Files');
		fileCell.style.textAlign = 'left';

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
	// Format test name based on baseline (attenuation 0) configuration
	// Include indicator if this is using TX-specific parameters
	const prefix = test.direction && test.direction.includes('TX') ? '' : '';
	const displayChannel = format_channel_number(test.channel, test.band);
	return `${test.band || 'UNK'} CH${displayChannel} ${test.bandwidth}MHz ${test.nss}SS ${test.mode}`;
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
		return;
	}

	document.querySelector('.chart-container').style.display = 'block';
	document.querySelector('.stats-panel').style.display = 'block';

	drawChart(selected_tests);
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
	selected_tests.forEach(test => {
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
	selected_tests.forEach(test => {
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

	const datasets = selected_tests.map((test, index) => {
		const deviceName = test.device_info?.Name || test.file_name;
		const softwareVersion = test.device_info?.['Software Version'] || '';
		const modelNumber = test.device_info?.['Model Number'] || '';
		const test_config = formatTestName(test);
		const configKey = `${deviceName}|${softwareVersion}|${test_config}`;
		const baseColor = configColorMap.get(configKey);

		// Get point style for this test
		const modelKey = `${deviceName}|${modelNumber}`;
		const testKey = `${modelKey}|${softwareVersion}|${test_config}|${test.direction}`;
		const pointStyle = modelStyleMap.get(testKey) || 'circle';

		// Create detailed label based on attenuation 0 data (or first available)
		const label = `${deviceName} ${softwareVersion ? `v${softwareVersion}` : ''} - ${test_config} ${test.direction}`;

		// Determine line style based on direction
		let borderDash = [];
		if (test.direction.includes('RX')) {
			borderDash = [5, 5]; // Dotted line for RX
		} else {
			borderDash = []; // Solid line for TX
		}

		return {
			label: label,
			data: test.data.map(point => ({
				x: point.attenuation,
				y: point.throughput,
				// Store the full point data for tooltip access
				pointData: point
			})),
			borderColor: baseColor,
			backgroundColor: baseColor + '20',
			borderWidth: 2.5,
			pointRadius: 4,
			pointHoverRadius: 6,
			pointStyle: pointStyle,
			tension: 0.2,
			// Line style based on direction
			borderDash: borderDash,
			// Add custom properties for grouping
			deviceName: deviceName,
			test_config: test_config,
			// Store reference to the full test for tooltip access
			fullTest: test
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
					text: `Comparing ${uniqueConfigs.size} test configuration(s) across ${Array.from(new Set(selected_tests.map(t => t.device_info?.Name || t.file_name))).length} device(s) | Solid: TX, Dotted: RX | Different point styles for multiple tests per DUT model`,
					color: '#aaa',
					font: {
						size: is_small_screen ? 10 : 14,
						family: window.QUALIFI_FONT === 'Berkeley Mono' ? "'Berkeley Mono', 'Courier New', monospace" : "'Poppins', sans-serif"
					}
				},
				legend: {
					...responsive_config.plugins.legend,
					align: 'start',
					fullSize: false,
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
							// Get default labels
							const labels = Chart.defaults.plugins.legend.labels.generateLabels(chart);
							// Truncate long labels if needed
							const maxLength = is_small_screen ? 40 : 60;
							return labels.map(label => {
								if (label.text.length > maxLength) {
									label.text = label.text.substring(0, maxLength - 3) + '...';
								}
								return label;
							});
						}
					}
				},
				tooltip: {
					...responsive_config.plugins.tooltip,
					callbacks: {
						title: function(tooltipItems) {
							if (tooltipItems.length > 0) {
								return `Attenuation: ${tooltipItems[0].parsed.x} dB`;
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
						text: 'Attenuation (dB)',
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
