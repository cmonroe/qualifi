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

function format_channel_number(channel, band) {
	if (band === '6G' && channel >= 191) {
		return channel - 190;
	}
	return channel;
}

function get_channel_display(channel, band) {
	const displayChannel = format_channel_number(channel, band);
	return `CH${displayChannel}`;
}

function format_file_size(bytes) {
	if (bytes === 0) return '0 Bytes';
	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

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

function refresh_reports() {
	load_server_reports();
}

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

	is_batch_loading = true;

	try {
		let loaded_count = 0;

		for (const report_id of selected_server_reports) {
			console.log('Processing report_id:', report_id);

			const [vendor, model, version] = report_id.split('|');

			if (!vendor || !model || !version) {
				console.error('Invalid report_id format:', report_id);
				continue;
			}

			const version_data = server_reports?.vendors?.[vendor]?.models?.[model]?.versions?.[version];
			if (!version_data || !version_data.test_configs) {
				console.error('Version data not found for:', report_id);
				continue;
			}

			console.log('Found test configs:', Object.keys(version_data.test_configs));

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

					await load_excel_file(virtualFile, true, test_config_data.path);
					loaded_count++;
					console.log(`Successfully loaded: ${file_name}`);

				} catch (fetchError) {
					console.error(`Error loading test config ${test_config}:`, fetchError);
				}
			}
		}

		console.log(`Loaded ${loaded_count} test configuration files`);

		selected_server_reports.clear();
		update_selected_reports_list();

		document.querySelectorAll('.version-checkbox:checked').forEach(cb => {
			cb.checked = false;
		});

		is_batch_loading = false;
		update_file_list();
		update_test_options();

		if (loaded_files.size > 0) {
			show_success(`Successfully loaded ${loaded_count} test configurations from server`);

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
		is_batch_loading = false;
		loading_msg.remove();
	}
}

function initialize_local_file_upload() {
	document.getElementById('excelFile').addEventListener('change', handle_file_select);

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

async function load_excel_file(file, from_server = false, server_path = null, suppress_notification = false) {
	console.log(`Loading file: ${file.name}${from_server ? ' (from server)' : ' (local)'}`);
	try {
		const array_buffer = await file.arrayBuffer();
		const workbook = XLSX.read(array_buffer, {
			cellDates: true,
			cellNF: true,
			cellStyles: true
		});

		const device_info = extract_device_info(workbook);

		const rvrResult = extract_rvr_data(workbook);
		const rvr_data = rvrResult.tests;
		const skipped_count = rvrResult.skipped_count;

		if (rvr_data.length === 0) {
			console.error(`No RvR data found in ${file.name}`);
			console.log('Available sheets:', workbook.SheetNames);
			show_error(`No RvR data found in ${file.name}. Please ensure the file contains "Rate vs Range" sheets with Attenuation and Throughput columns.`);
			return;
		}

		if (from_server && server_path) {
			rvr_data.forEach(test => {
				test.server_path = server_path;
			});
		}

		loaded_files.set(file.name, {
			device_info: device_info,
			rvr_data: rvr_data,
			file_name: file.name,
			from_server: from_server,
			server_path: server_path
		});

		if (!is_batch_loading) {
			update_file_list();
			update_test_options();

			const total_data_points = rvr_data.reduce((sum, test) => sum + test.data.length, 0);
			console.log(`Successfully loaded ${file.name}: ${rvr_data.length} test configurations, ${total_data_points} data points`);

			if (!suppress_notification) {
				show_success(`Loaded ${file.name} - ${rvr_data.length} test configurations`);
			}
		}

		return rvr_data.length;

	} catch (error) {
		console.error('Error loading Excel file:', error);
		show_error(`Failed to load ${file.name}: ${error.message}`);
		return 0;
	}
}

function extract_device_info(workbook) {
	const info = {};

	const dut_sheet = workbook.Sheets['Device Under Test Information'] ||
				   workbook.Sheets['DUT Information'] ||
				   workbook.Sheets['Device Info'];

	if (dut_sheet) {
		const data = XLSX.utils.sheet_to_json(dut_sheet, { header: 1 });

		data.forEach(row => {
			if (row.length >= 2 && row[0]) {
				info[row[0]] = row[1];
			}
		});

		for (const value of Object.values(info)) {
			if (value === null || value === undefined) continue;
			const text = value.toString().trim();
			const match = text.match(/country\s*:\s*(.+)/i);
			if (match && match[1]) {
				info.Country = match[1].trim();
				break;
			}
		}
	}

	return info;
}

function extract_rvr_data(workbook) {
	const tests = [];
	let total_skipped = 0;

	workbook.SheetNames.forEach(sheet_name => {
		const lowerName = sheet_name.toLowerCase();
		if (lowerName.includes('rate') &&
			(lowerName.includes('range') || lowerName.includes('orientation'))) {

			console.log(`Processing sheet: ${sheet_name}`);

			const sheet = workbook.Sheets[sheet_name];
			const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

			let header_row = -1;
			for (let i = 0; i < data.length; i++) {
				const row = data[i];
				if (row && row.length > 0) {
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

			const findColumnIndex = (headers, search_term) => {
				let index = headers.findIndex(header =>
					header && header.toString().toLowerCase() === search_term.toLowerCase()
				);

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

			const testGroups = new Map();
			let skipped_count = 0;

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

				let bandwidth, nss, mode, mcs;
				const isTxDirection = direction.includes('TX');
				const isRxDirection = direction.includes('RX');

				const hasTxNss = txNssIndex !== -1;
				const hasRxNss = rxNssIndex !== -1;
				const hasTxBw = txBwIndex !== -1;
				const hasRxBw = rxBwIndex !== -1;
				const hasTxMode = txModeIndex !== -1;
				const hasRxMode = rxModeIndex !== -1;
				const hasTxMcs = txMcsIndex !== -1;
				const hasRxMcs = rxMcsIndex !== -1;

				let configBandwidth, configNss, configMode;
				if (isTxDirection) {
					configBandwidth = row[bwIndex] || 'Unknown';
					configNss = row[nssIndex] || 'Unknown';
					configMode = (hasRxMode ? row[rxModeIndex] : row[modeIndex]) || 'Unknown';
				} else if (isRxDirection) {
					configBandwidth = row[bwIndex] || 'Unknown';
					configNss = row[nssIndex] || 'Unknown';
					configMode = (hasTxMode ? row[txModeIndex] : row[modeIndex]) || 'Unknown';

				} else {
					configBandwidth = row[bwIndex] || 'Unknown';
					configNss = row[nssIndex] || 'Unknown';
					configMode = row[modeIndex] || 'Unknown';
				}

				if (isTxDirection) {
					bandwidth = (hasRxBw ? row[rxBwIndex] : row[bwIndex]) || 'Unknown';
					nss = (hasRxNss ? row[rxNssIndex] : row[nssIndex]) || 'Unknown';
					mode = (hasRxMode ? row[rxModeIndex] : row[modeIndex]) || 'Unknown';
					mcs = (hasRxMcs ? row[rxMcsIndex] : null) || 'Unknown';
				} else if (isRxDirection) {
					bandwidth = (hasTxBw ? row[txBwIndex] : row[bwIndex]) || 'Unknown';
					nss = (hasTxNss ? row[txNssIndex] : row[nssIndex]) || 'Unknown';
					mode = (hasTxMode ? row[txModeIndex] : row[modeIndex]) || 'Unknown';
					mcs = (hasTxMcs ? row[txMcsIndex] : null) || 'Unknown';
				} else {
					bandwidth = row[bwIndex] || 'Unknown';
					nss = row[nssIndex] || 'Unknown';
					mode = row[modeIndex] || 'Unknown';
					mcs = 'Unknown';
				}

				const security = row[securityIndex] || 'Unknown';

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
