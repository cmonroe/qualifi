function create_image_element(src, className, alt = '') {
	const img = document.createElement('img');
	img.className = className;
	img.alt = alt;
	img.style.objectFit = 'contain';

	img.onerror = function() {
		this.style.display = 'none';
	};

	img.src = `/reports/${src}`;
	return img;
}

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
								   ${selected_server_reports.has(report_id) ? 'checked' : ''}
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

function toggle_vendor(vendor_id) {
	const header = event.currentTarget;
	const content = document.getElementById(`vendor-${vendor_id}`);
	header.classList.toggle('expanded');
	content.classList.toggle('expanded');
}

function toggle_model(model_id) {
	const header = event.currentTarget;
	const content = document.getElementById(`model-${model_id}`);
	header.classList.toggle('expanded');
	content.classList.toggle('expanded');
	event.stopPropagation();
}

async function toggle_report_selection(report_id) {
	const checkbox = document.getElementById(`report-${report_id.replace(/[|\/\s]/g, '_')}`);

	if (selected_server_reports.has(report_id)) {
		selected_server_reports.delete(report_id);

		const files_to_remove = report_files_map.get(report_id) || [];
		files_to_remove.forEach(file_name => {
			loaded_files.delete(file_name);
		});
		report_files_map.delete(report_id);

		if (files_to_remove.length > 0) {
			update_file_list();
			update_test_options();
		}
	} else {
		selected_server_reports.add(report_id);

		checkbox.disabled = true;

		const [vendor, model, version] = report_id.split('|');
		const version_data = server_reports?.vendors?.[vendor]?.models?.[model]?.versions?.[version];

		if (!version_data || !version_data.test_configs) {
			console.error('Version data not found for:', report_id);
			selected_server_reports.delete(report_id);
			checkbox.checked = false;
			checkbox.disabled = false;
			return;
		}

		const loaded_file_names = [];
		let total_test_configs = 0;

		for (const [test_config, test_config_data] of Object.entries(version_data.test_configs)) {
			try {
				const response = await fetch(`/reports/${test_config_data.path}`);
				if (!response.ok) {
					console.error(`Failed to fetch ${test_config_data.path}: ${response.status}`);
					continue;
				}

				const blob = await response.blob();
				const file_name = `${vendor}_${model}_v${version}_${test_config}_${test_config_data.name}`;
				const virtualFile = new File([blob], file_name, { type: blob.type });

				const test_config_count = await load_excel_file(virtualFile, true, test_config_data.path, true);
				if (test_config_count > 0) {
					loaded_file_names.push(file_name);
					total_test_configs += test_config_count;
				}
			} catch (fetchError) {
				console.error(`Error loading test config ${test_config}:`, fetchError);
			}
		}

		report_files_map.set(report_id, loaded_file_names);
		checkbox.disabled = false;

		if (total_test_configs > 0) {
			show_success(`Loaded ${total_test_configs} test configuration${total_test_configs > 1 ? 's' : ''} from ${vendor} ${model} v${version}`);
		}
	}

	update_selected_reports_list();
}

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

function remove_selected_report(report_id) {
	const files_to_remove = report_files_map.get(report_id) || [];
	files_to_remove.forEach(file_name => {
		loaded_files.delete(file_name);
	});
	report_files_map.delete(report_id);

	selected_server_reports.delete(report_id);

	const checkbox = document.querySelector(`input[value="${report_id}"]`);
	if (checkbox) checkbox.checked = false;

	if (files_to_remove.length > 0) {
		update_file_list();
		update_test_options();
	}

	update_selected_reports_list();
}

function expand_all_vendors() {
	document.querySelectorAll('.vendor-header').forEach(header => {
		header.classList.add('expanded');
		const vendor_id = header.onclick.toString().match(/toggle_vendor\('(.+?)'\)/)[1];
		const content = document.getElementById(`vendor-${vendor_id}`);
		if (content) content.classList.add('expanded');
	});
}

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

async function select_latest_versions() {
	if (!server_reports) return;

	const latest_report_ids = [];

	Object.entries(server_reports.vendors).forEach(([vendor, vendor_data]) => {
		Object.entries(vendor_data.models).forEach(([model, model_data]) => {
			const versions = Object.keys(model_data.versions).sort((a, b) => {
				return compare_versions(b, a);
			});

			if (versions.length > 0 && Object.keys(model_data.versions[versions[0]].test_configs).length > 0) {
				const report_id = `${vendor}|${model}|${versions[0]}`;
				latest_report_ids.push(report_id);
			}
		});
	});

	for (const report_id of latest_report_ids) {
		const checkbox = document.querySelector(`input[value="${report_id}"]`);
		if (checkbox && !checkbox.checked) {
			checkbox.checked = true;
			await toggle_report_selection(report_id);
		}
	}
}

function update_file_list() {
	const fileList = document.getElementById('fileList');
	const fileItems = document.getElementById('fileItems');
	const fileCount = document.getElementById('fileCount');

	fileItems.innerHTML = '';

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

	modelGroups.forEach((group, modelKey) => {
		const item = document.createElement('div');
		item.className = 'file-item';
		item.style.padding = '15px';
		item.style.marginBottom = '10px';

		const primaryLabel = group.model !== 'Unknown Model' ? group.model : group.deviceName;

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
							${primaryLabel}
						</strong>
						<span style="color: #888; font-size: 0.9em;">
							${group.deviceName} • ${versionText}
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
		report_files_map.clear();
		selected_server_reports.clear();

		document.querySelectorAll('.version-checkbox:checked').forEach(cb => {
			cb.checked = false;
		});

		update_file_list();
		update_test_options();
		update_selected_reports_list();
		document.querySelector('.chart-container').style.display = 'none';
		document.querySelector('.stats-panel').style.display = 'none';
		document.querySelector('#comparisonPanel').style.display = 'none';

		document.getElementById('excelFile').value = '';
	}
}

function clear_server_files() {
	const serverFiles = Array.from(loaded_files.entries()).filter(([_, data]) => data.from_server);
	if (serverFiles.length > 0 && confirm(`Remove ${serverFiles.length} server files?`)) {
		serverFiles.forEach(([file_name, _]) => {
			loaded_files.delete(file_name);
		});

		report_files_map.clear();
		selected_server_reports.clear();

		document.querySelectorAll('.version-checkbox:checked').forEach(cb => {
			cb.checked = false;
		});

		update_file_list();
		update_test_options();
		update_selected_reports_list();
	}
}

function clearDeviceModel(modelKey) {
	const [deviceName, model] = modelKey.split('|');

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

		const report_ids_to_remove = [];
		report_files_map.forEach((file_list, report_id) => {
			const has_removed_files = file_list.some(fn => filesToRemove.includes(fn));
			if (has_removed_files) {
				report_ids_to_remove.push(report_id);
			}
		});

		report_ids_to_remove.forEach(report_id => {
			report_files_map.delete(report_id);
			selected_server_reports.delete(report_id);
			const checkbox = document.querySelector(`input[value="${report_id}"]`);
			if (checkbox) checkbox.checked = false;
		});

		update_file_list();
		update_test_options();
		update_selected_reports_list();
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

	const deviceGroups = new Map();

	loaded_files.forEach((fileData, file_name) => {
		const name = fileData.device_info?.Name || file_name.split('_')[0] || 'Unknown Device';
		const model = fileData.device_info?.['Model Number'] || '';
		const version = fileData.device_info?.['Software Version'] || '';
		const groupKey = [name, model, version].filter(Boolean).join('|');

		console.log(`Processing file: ${file_name}, Device name: ${name}, Group key: ${groupKey}`);

		if (!deviceGroups.has(groupKey)) {
			deviceGroups.set(groupKey, {
				files: [],
				tests: [],
				device_info: fileData.device_info,
				displayName: name
			});
		}

		const deviceGroup = deviceGroups.get(groupKey);
		deviceGroup.files.push(file_name);

		fileData.rvr_data.forEach(test => {
			console.log(`Adding test: ${test.name} from ${file_name} to device ${name}`);
			deviceGroup.tests.push({
				...test,
				file_name: file_name,
				device_info: fileData.device_info,
				from_server: fileData.from_server,
				server_path: test.server_path
			});
		});
	});

	console.log(`Device groups created:`, Array.from(deviceGroups.keys()));
	console.log(`Total device groups: ${deviceGroups.size}`);

	const summary = document.createElement('div');
	summary.style.marginBottom = '15px';
	summary.style.color = '#888';
	const totalTests = Array.from(deviceGroups.values()).reduce((sum, dg) => sum + dg.tests.length, 0);
	summary.innerHTML = `${deviceGroups.size} device(s) loaded with ${totalTests} total test configurations`;
	container.appendChild(summary);

	const quickActions = document.createElement('div');
	quickActions.style.marginBottom = '20px';
	quickActions.innerHTML = `
		<button class="btn-small" onclick="select_all_tests()">Select All</button>
		<button class="btn-small" onclick="selectNoneTests()">Clear All</button>
		<button class="btn-small" onclick="select_matching_tests()">Select Matching</button>
	`;
	container.appendChild(quickActions);

	let testIndex = 0;

	deviceGroups.forEach((deviceGroup, groupKey) => {
		const deviceContainer = document.createElement('div');
		deviceContainer.className = 'device-test-group';

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
					${model || deviceGroup.displayName} ${model ? `(${deviceGroup.displayName})` : ''}
				</div>
				<div class="device-group-meta">
					${deviceGroup.files.length} file(s) |
					${deviceGroup.tests.length} tests |
					Version(s): ${Array.from(versions).join(', ')}
				</div>
			</div>
			<div>
				<button class="btn-small" onclick="selectAllDevice('${escapeQuotes(groupKey)}')">Select All</button>
				<button class="btn-small" onclick="selectNoneDevice('${escapeQuotes(groupKey)}')">Clear</button>
			</div>
		`;
		deviceContainer.appendChild(deviceHeader);

		const txTests = deviceGroup.tests.filter(test => test.direction.includes('TX'));
		const rxTests = deviceGroup.tests.filter(test => test.direction.includes('RX'));

		const columnsContainer = document.createElement('div');
		columnsContainer.className = 'test-config-columns';

		const txColumn = document.createElement('div');
		txColumn.className = 'test-column tx-column';
		const txHeader = document.createElement('div');
		txHeader.className = 'test-column-header';
		txHeader.innerHTML = '📥 DUT-TX Tests';
		txColumn.appendChild(txHeader);

		if (txTests.length > 0) {
			const txTable = createTestTable(txTests, groupKey, testIndex);
			txColumn.appendChild(txTable.table);
			testIndex = txTable.nextIndex;
		} else {
			const emptyMsg = document.createElement('div');
			emptyMsg.style.cssText = 'color: #666; font-style: italic; padding: 20px; text-align: center;';
			emptyMsg.textContent = 'No TX tests available';
			txColumn.appendChild(emptyMsg);
		}

		const rxColumn = document.createElement('div');
		rxColumn.className = 'test-column rx-column';
		const rxHeader = document.createElement('div');
		rxHeader.className = 'test-column-header';
		rxHeader.innerHTML = '📥 DUT-RX Tests';
		rxColumn.appendChild(rxHeader);

		if (rxTests.length > 0) {
			const rxTable = createTestTable(rxTests, groupKey, testIndex);
			rxColumn.appendChild(rxTable.table);
			testIndex = rxTable.nextIndex;
		} else {
			const emptyMsg = document.createElement('div');
			emptyMsg.style.cssText = 'color: #666; font-style: italic; padding: 20px; text-align: center;';
			emptyMsg.textContent = 'No RX tests available';
			rxColumn.appendChild(emptyMsg);
		}

		columnsContainer.appendChild(txColumn);
		columnsContainer.appendChild(rxColumn);

		deviceContainer.appendChild(columnsContainer);

		container.appendChild(deviceContainer);
	});
}

function createTestTable(tests, deviceName, startIndex) {
	let testIndex = startIndex;

	const table = document.createElement('table');
	table.className = 'test-table';

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

	const tbody = document.createElement('tbody');

	tests.forEach(test => {
		const row = document.createElement('tr');

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

		const bandCell = document.createElement('td');
		bandCell.setAttribute('data-label', 'Band');
		bandCell.textContent = test.band || 'UNK';
		bandCell.style.fontWeight = '700';
		bandCell.style.color = test.band === '2G' ? '#f72585' : test.band === '5G' ? '#00a0c8' : test.band === '6G' ? '#4361ee' : '#888';
		row.appendChild(bandCell);

		const channelCell = document.createElement('td');
		channelCell.setAttribute('data-label', 'Channel');
		channelCell.textContent = get_channel_display(test.channel, test.band);
		channelCell.style.fontWeight = '700';
		channelCell.style.color = '#e0e0e0';
		row.appendChild(channelCell);

		const bwCell = document.createElement('td');
		bwCell.setAttribute('data-label', 'BW');
		bwCell.textContent = `${test.bandwidth}MHz`;
		bwCell.style.color = '#ccc';
		row.appendChild(bwCell);

		const nssCell = document.createElement('td');
		nssCell.setAttribute('data-label', 'NSS');
		nssCell.textContent = `${test.nss}SS`;
		nssCell.style.color = '#ccc';
		row.appendChild(nssCell);

		const modeCell = document.createElement('td');
		modeCell.setAttribute('data-label', 'Mode');
		modeCell.textContent = test.mode || 'Unknown';
		modeCell.style.color = '#ccc';
		modeCell.style.fontWeight = '700';
		row.appendChild(modeCell);

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

		const versionCell = document.createElement('td');
		versionCell.className = 'version-cell';
		versionCell.setAttribute('data-label', 'Version');
		versionCell.style.whiteSpace = 'nowrap';
		const version = test.device_info?.['Software Version'] || 'Unknown';
		versionCell.textContent = `v${version}`;
		row.appendChild(versionCell);

		const fileCell = document.createElement('td');
		fileCell.className = 'file-cell';
		fileCell.setAttribute('data-label', 'Files');
		fileCell.style.textAlign = 'left';
		fileCell.style.whiteSpace = 'nowrap';

		if (test.from_server && test.server_path) {
			const server_path = test.server_path;

			const excelPath = `/reports/${server_path}`;

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
			fileCell.innerHTML = `
				<span title="Local file - server downloads not available" style="color: #666;">
					📁
				</span>
			`;
		}
		row.appendChild(fileCell);

		row.addEventListener('mouseenter', () => {
			row.style.backgroundColor = '#2a2a2a';
		});
		row.addEventListener('mouseleave', () => {
			row.style.backgroundColor = 'transparent';
		});

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
	const checkboxes = document.querySelectorAll('.test-checkbox');
	checkboxes.forEach(cb => cb.checked = false);

	document.querySelector('.chart-container').style.display = 'none';
	document.querySelector('.stats-panel').style.display = 'none';
	document.querySelector('#comparisonPanel').style.display = 'none';

	show_success('All test selections cleared');
};

window.select_matching_tests = function() {
	const checkboxes = document.querySelectorAll('.test-checkbox');

	checkboxes.forEach(cb => cb.checked = false);

	const configMap = new Map();
	checkboxes.forEach(cb => {
		const [file_name, test_name] = cb.value.split('|');
		const deviceName = cb.getAttribute('data-devicename');

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

function updateStats(selected_tests) {
	const statsGrid = document.getElementById('statsGrid');
	statsGrid.innerHTML = '';

	let bestMaxRate = 0;
	let bestAvgRate = 0;
	let bestRange = 0;

	const testStats = selected_tests.map(test => {
		const throughputs = test.data.map(d => d.throughput).filter(t => t > 0);
		const maxRate = Math.max(...throughputs);
		const avgRate = Math.round(throughputs.reduce((a, b) => a + b, 0) / throughputs.length);

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

		testStats.forEach(({ test, maxRate, avgRate, effective_range }) => {
			const card = document.createElement('div');
			card.className = 'stat-card';
			const modelName = test.device_info?.['Model Number'] || test.device_info?.Name || test.file_name;

		const isBestMax = maxRate === bestMaxRate && selected_tests.length > 1;
		const isBestAvg = avgRate === bestAvgRate && selected_tests.length > 1;
		const isBestRange = effective_range === bestRange && selected_tests.length > 1;

			card.innerHTML = `
				<h4 style="color: #00a0c8; margin-bottom: 15px;">
					${modelName}<br>
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

function updateComparisonTable(selected_tests) {
	const container = document.getElementById('comparisonTable');

	const configGroups = new Map();
	selected_tests.forEach(test => {
		const configKey = `${formatTestName(test)} ${test.direction}`;
		if (!configGroups.has(configKey)) {
			configGroups.set(configKey, []);
		}
		configGroups.get(configKey).push(test);
	});

	let html = '<table class="comparison-table">';

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
				const deviceName = test.device_info?.['Model Number'] || test.device_info?.Name || test.file_name;
				const softwareVersion = test.device_info?.['Software Version'] || 'Unknown';
			const throughputs = test.data.map(d => d.throughput).filter(t => t > 0);
			const maxRate = Math.max(...throughputs);
			const avgRate = Math.round(throughputs.reduce((a, b) => a + b, 0) / throughputs.length);
			const range = ranges[index];
			const band = test.band || 'UNK';

			const bandColor = band === '2G' ? '#f72585' : band === '5G' ? '#00a0c8' : band === '6G' ? '#4361ee' : '#888';

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

		html += '<tr style="height: 10px;"><td colspan="8" style="border: none;"></td></tr>';
	});

	html += '</tbody></table>';
	mobileHtml += '</div>';

	container.innerHTML = html + mobileHtml;
}

function show_error(message) {
	const error = document.createElement('div');
	error.className = 'error';
	error.textContent = message;
	document.querySelector('.container').prepend(error);
	setTimeout(() => error.remove(), 5000);
}

function calculateNotificationPosition() {
	let totalOffset = 20;

	for (let i = 0; i < active_notifications.length; i++) {
		const notification = active_notifications[i];
		if (i > 0) {
			const prevNotification = active_notifications[i - 1];
			const prevHeight = prevNotification.offsetHeight || 50;
			totalOffset += prevHeight + 10;
		}
	}

	return totalOffset;
}

function repositionNotifications() {
	let currentTop = 20;

	active_notifications.forEach((notification, index) => {
		notification.style.top = `${currentTop}px`;
		currentTop += notification.offsetHeight + 10;
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

	active_notifications.push(success);

	success.offsetHeight;

	const topOffset = calculateNotificationPosition();
	success.style.top = `${topOffset}px`;

	setTimeout(() => {
		success.style.opacity = '1';
	}, 10);

	setTimeout(() => {
		success.style.opacity = '0';
		setTimeout(() => {
			const index = active_notifications.indexOf(success);
			if (index > -1) {
				active_notifications.splice(index, 1);
				success.remove();

				repositionNotifications();
			}
		}, 300);
	}, 6000);
}
