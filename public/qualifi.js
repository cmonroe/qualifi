let chartInstance = null;
let loadedFiles = new Map();
let chartType = 'line';
let serverReports = null;
let selectedServerReports = new Set();

// Set Chart.js global font
Chart.defaults.font.family = "'Poppins', sans-serif";
Chart.defaults.color = '#e0e0e0';

// Helper function to create image element with fallback
function createImageElement(src, className, alt = '') {
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
function determineBand(frequency) {
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

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
	loadServerReports();
	initializeLocalFileUpload();
});

// Tab switching
function switchTab(tab) {
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
async function loadServerReports() {
	try {
		const response = await fetch('/api/reports');
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}
		const data = await response.json();
		serverReports = data;
		renderReportBrowser(data);
	} catch (error) {
		console.error('Error loading server reports:', error);
		document.getElementById('reportBrowser').innerHTML = `
			<div class="error">Failed to load server reports: ${error.message}</div>
		`;
	}
}

// Refresh reports
function refreshReports() {
	loadServerReports();
}

// Search reports
async function searchReports(query) {
	if (!query.trim()) {
		renderReportBrowser(serverReports);
		return;
	}

	try {
		const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
		const results = await response.json();
		renderSearchResults(results);
	} catch (error) {
		console.error('Error searching reports:', error);
	}
}

// Render report browser with image support - version level selection
function renderReportBrowser(data) {
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
	
	Object.entries(data.vendors).forEach(([vendor, vendorData]) => {
		const vendorId = vendor.replace(/\s+/g, '_');
		html += `
			<div class="vendor-group">
				<div class="vendor-header" onclick="toggleVendor('${vendorId}')">
					<span class="toggle-icon">▶</span>
					${vendorData.logo ? `<img src="/reports/${vendorData.logo}" class="vendor-logo" alt="${vendor} logo" onerror="this.style.display='none'">` : ''}
					<span style="flex: 1;">${vendor}</span>
					<span class="file-count">${countVendorTestConfigs(vendorData)} test configs</span>
				</div>
				<div class="vendor-content" id="vendor-${vendorId}">
		`;
		
		Object.entries(vendorData.models).forEach(([model, modelData]) => {
			const modelId = `${vendorId}_${model.replace(/\s+/g, '_')}`;
			html += `
				<div class="model-group">
					<div class="model-header" onclick="toggleModel('${modelId}')">
						<span class="toggle-icon">▶</span>
						${modelData.image ? `<img src="/reports/${modelData.image}" class="model-image" alt="${model} device" onerror="this.style.display='none'">` : ''}
						<span style="flex: 1;">${model}</span>
						<span class="file-count">${countModelTestConfigs(modelData)} test configs</span>
					</div>
					<div class="model-content" id="model-${modelId}">
			`;
			
			Object.entries(modelData.versions).forEach(([version, versionData]) => {
				const testConfigCount = Object.keys(versionData.testConfigs).length;
				
				if (testConfigCount > 0) {
					const reportId = `${vendor}|${model}|${version}`;
					html += `
						<div class="version-item">
							<input type="checkbox" class="version-checkbox" 
								   id="report-${reportId.replace(/[|\/\s]/g, '_')}"
								   value="${reportId}"
								   onchange="toggleReportSelection('${reportId}')">
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
function renderSearchResults(results) {
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
		const reportId = `${result.vendor}|${result.model}|${result.version}`;
		html += `
			<div class="search-result-item">
				<input type="checkbox" class="version-checkbox" 
					   id="search-${reportId.replace(/[|\/\s]/g, '_')}"
					   value="${reportId}"
					   ${selectedServerReports.has(reportId) ? 'checked' : ''}
					   onchange="toggleReportSelection('${reportId}')">
				<div class="search-result-images">
					${result.vendorLogo ? `<img src="/reports/${result.vendorLogo}" class="search-vendor-logo" alt="${result.vendor} logo" onerror="this.style.display='none'">` : ''}
					${result.modelImage ? `<img src="/reports/${result.modelImage}" class="search-model-image" alt="${result.model} device" onerror="this.style.display='none'">` : ''}
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
function formatFileSize(bytes) {
	if (bytes === 0) return '0 Bytes';
	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper functions for counting test configurations
function countVendorTestConfigs(vendorData) {
	let count = 0;
	Object.values(vendorData.models).forEach(modelData => {
		Object.values(modelData.versions).forEach(versionData => {
			count += Object.keys(versionData.testConfigs || {}).length;
		});
	});
	return count;
}

function countModelTestConfigs(modelData) {
	let count = 0;
	Object.values(modelData.versions).forEach(versionData => {
		count += Object.keys(versionData.testConfigs || {}).length;
	});
	return count;
}

// Legacy helper functions (updated for new structure)
function countVendorFiles(vendorData) {
	let count = 0;
	Object.values(vendorData.models).forEach(modelData => {
		Object.values(modelData.versions).forEach(versionData => {
			count += Object.keys(versionData.testConfigs || {}).length;
		});
	});
	return count;
}

function countModelFiles(modelData) {
	let count = 0;
	Object.values(modelData.versions).forEach(versionData => {
		count += Object.keys(versionData.testConfigs || {}).length;
	});
	return count;
}

// Toggle vendor expansion
function toggleVendor(vendorId) {
	const header = event.currentTarget;
	const content = document.getElementById(`vendor-${vendorId}`);
	header.classList.toggle('expanded');
	content.classList.toggle('expanded');
}

// Toggle model expansion
function toggleModel(modelId) {
	const header = event.currentTarget;
	const content = document.getElementById(`model-${modelId}`);
	header.classList.toggle('expanded');
	content.classList.toggle('expanded');
	event.stopPropagation();
}

// Toggle report selection
function toggleReportSelection(reportId) {
	if (selectedServerReports.has(reportId)) {
		selectedServerReports.delete(reportId);
	} else {
		selectedServerReports.add(reportId);
	}
	updateSelectedReportsList();
}

// Update selected reports list
function updateSelectedReportsList() {
	const container = document.getElementById('selectedReports');
	const list = document.getElementById('selectedReportsList');
	
	if (selectedServerReports.size === 0) {
		container.style.display = 'none';
		return;
	}
	
	container.style.display = 'block';
	let html = '';
	
	selectedServerReports.forEach(reportId => {
		const [vendor, model, version] = reportId.split('|');
		html += `
			<div class="selected-report-item">
				<span>${vendor} ${model} v${version}</span>
				<button class="btn-small btn-remove" onclick="removeSelectedReport('${reportId}')">Remove</button>
			</div>
		`;
	});
	
	list.innerHTML = html;
}

// Remove selected report
function removeSelectedReport(reportId) {
	selectedServerReports.delete(reportId);
	// Uncheck the checkbox
	const checkbox = document.querySelector(`input[value="${reportId}"]`);
	if (checkbox) checkbox.checked = false;
	updateSelectedReportsList();
}

// Expand all vendors
function expandAllVendors() {
	document.querySelectorAll('.vendor-header').forEach(header => {
		header.classList.add('expanded');
		const vendorId = header.onclick.toString().match(/toggleVendor\('(.+?)'\)/)[1];
		const content = document.getElementById(`vendor-${vendorId}`);
		if (content) content.classList.add('expanded');
	});
}

// Collapse all vendors
function collapseAllVendors() {
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
function selectLatestVersions() {
	if (!serverReports) return;
	
	selectedServerReports.clear();
	
	Object.entries(serverReports.vendors).forEach(([vendor, vendorData]) => {
		Object.entries(vendorData.models).forEach(([model, modelData]) => {
			// Get versions and sort them (assuming semantic versioning)
			const versions = Object.keys(modelData.versions).sort((a, b) => {
				return compareVersions(b, a); // Sort descending
			});
			
			if (versions.length > 0 && Object.keys(modelData.versions[versions[0]].testConfigs).length > 0) {
				const reportId = `${vendor}|${model}|${versions[0]}`;
				selectedServerReports.add(reportId);
				
				// Check the checkbox
				const checkbox = document.querySelector(`input[value="${reportId}"]`);
				if (checkbox) checkbox.checked = true;
			}
		});
	});
	
	updateSelectedReportsList();
}

// Compare version strings
function compareVersions(a, b) {
	const partsA = a.split('.').map(num => parseInt(num) || 0);
	const partsB = b.split('.').map(num => parseInt(num) || 0);
	
	for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
		const numA = partsA[i] || 0;
		const numB = partsB[i] || 0;
		
		if (numA !== numB) {
			return numA - numB;
		}
	}
	
	return 0;
}

// Fixed loadSelectedReports function
async function loadSelectedReports() {
	if (selectedServerReports.size === 0) {
		console.log('No reports selected');
		return;
	}
	
	console.log('Loading selected reports:', Array.from(selectedServerReports));
	
	const loadingMsg = document.createElement('div');
	loadingMsg.className = 'loading';
	loadingMsg.textContent = 'Loading reports from server...';
	document.body.appendChild(loadingMsg);
	
	try {
		let loadedCount = 0;
		
		for (const reportId of selectedServerReports) {
			console.log('Processing reportId:', reportId);
			
			// Split into 3 parts (vendor, model, version)
			const [vendor, model, version] = reportId.split('|');
			
			if (!vendor || !model || !version) {
				console.error('Invalid reportId format:', reportId);
				continue;
			}
			
			// Get version data for this selection
			const versionData = serverReports?.vendors?.[vendor]?.models?.[model]?.versions?.[version];
			if (!versionData || !versionData.testConfigs) {
				console.error('Version data not found for:', reportId);
				continue;
			}
			
			console.log('Found test configs:', Object.keys(versionData.testConfigs));
			
			// Load all test configurations for this version
			for (const [testConfig, testConfigData] of Object.entries(versionData.testConfigs)) {
				console.log(`Loading test config: ${testConfig}`, testConfigData);
				
				try {
					const response = await fetch(`/reports/${testConfigData.path}`);
					if (!response.ok) {
						console.error(`Failed to fetch ${testConfigData.path}: ${response.status}`);
						continue;
					}
					
					const blob = await response.blob();
					const fileName = `${vendor}_${model}_v${version}_${testConfig}_${testConfigData.name}`;
					const virtualFile = new File([blob], fileName, { type: blob.type });
					
					await loadExcelFile(virtualFile, true, testConfigData.path); // true indicates from server, pass original path
					loadedCount++;
					console.log(`Successfully loaded: ${fileName}`);
					
				} catch (fetchError) {
					console.error(`Error loading test config ${testConfig}:`, fetchError);
				}
			}
		}
		
		console.log(`Loaded ${loadedCount} test configuration files`);
		
		// Clear selections after loading
		selectedServerReports.clear();
		updateSelectedReportsList();
		
		// Uncheck all checkboxes
		document.querySelectorAll('.version-checkbox:checked').forEach(cb => {
			cb.checked = false;
		});
		
		// Switch to test selector if files loaded
		if (loadedFiles.size > 0) {
			document.querySelector('.test-selector').scrollIntoView({ behavior: 'smooth' });
			showSuccess(`Successfully loaded ${loadedCount} test configurations from server`);
		} else {
			showError('No valid test configurations were loaded');
		}
		
	} catch (error) {
		console.error('Error loading reports:', error);
		showError(`Failed to load reports from server: ${error.message}`);
	} finally {
		loadingMsg.remove();
	}
}

// Initialize local file upload
function initializeLocalFileUpload() {
	document.getElementById('excelFile').addEventListener('change', handleFileSelect);

	// Enable drag and drop
	const fileLabel = document.querySelector('.file-input-label');
	if (fileLabel) {
		['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
			fileLabel.addEventListener(eventName, preventDefaults, false);
		});

		['dragenter', 'dragover'].forEach(eventName => {
			fileLabel.addEventListener(eventName, highlight, false);
		});

		['dragleave', 'drop'].forEach(eventName => {
			fileLabel.addEventListener(eventName, unhighlight, false);
		});

		fileLabel.addEventListener('drop', handleDrop, false);
	}
}

function preventDefaults(e) {
	e.preventDefault();
	e.stopPropagation();
}

function highlight(e) {
	const fileLabel = document.querySelector('.file-input-label');
	if (fileLabel) {
		fileLabel.style.borderColor = '#00a0c8';
		fileLabel.style.background = '#333';
	}
}

function unhighlight(e) {
	const fileLabel = document.querySelector('.file-input-label');
	if (fileLabel) {
		fileLabel.style.borderColor = '#444';
		fileLabel.style.background = '#2a2a2a';
	}
}

function handleDrop(e) {
	const dt = e.dataTransfer;
	const files = dt.files;
	handleFiles(files);
}

function handleFileSelect(e) {
	const files = e.target.files;
	handleFiles(files);
}

async function handleFiles(files) {
	for (let file of files) {
		if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
			await loadExcelFile(file);
		} else {
			showError(`${file.name} is not an Excel file`);
		}
	}
}

async function loadExcelFile(file, fromServer = false, serverPath = null) {
	console.log(`Loading file: ${file.name}${fromServer ? ' (from server)' : ' (local)'}`);
	try {
		const arrayBuffer = await file.arrayBuffer();
		const workbook = XLSX.read(arrayBuffer, { 
			cellDates: true,
			cellNF: true,
			cellStyles: true
		});

		// Extract device information
		const deviceInfo = extractDeviceInfo(workbook);
		
		// Extract RvR data
		const rvrResult = extractRvRData(workbook);
		const rvrData = rvrResult.tests;
		const skippedCount = rvrResult.skippedCount;

		if (rvrData.length === 0) {
			console.error(`No RvR data found in ${file.name}`);
			console.log('Available sheets:', workbook.SheetNames);
			showError(`No RvR data found in ${file.name}. Please ensure the file contains "Rate vs Range" sheets with Attenuation and Throughput columns.`);
			return;
		}

		// Add server path information to each test if loaded from server
		if (fromServer && serverPath) {
			rvrData.forEach(test => {
				test.serverPath = serverPath;
			});
		}

		// Store the loaded file data
		loadedFiles.set(file.name, {
			deviceInfo: deviceInfo,
			rvrData: rvrData,
			fileName: file.name,
			fromServer: fromServer,
			serverPath: serverPath
		});

		// Update UI
		updateFileList();
		updateTestOptions();
		
		// Show success message with data summary
		const totalDataPoints = rvrData.reduce((sum, test) => sum + test.data.length, 0);
		console.log(`Successfully loaded ${file.name}: ${rvrData.length} test configurations, ${totalDataPoints} data points`);
		
		// Show brief success notification
		showSuccess(`Loaded ${file.name} - ${rvrData.length} test configurations`);

	} catch (error) {
		console.error('Error loading Excel file:', error);
		showError(`Failed to load ${file.name}: ${error.message}`);
	}
}

function extractDeviceInfo(workbook) {
	const info = {};
	
	// Try to find Device Under Test Information sheet
	const dutSheet = workbook.Sheets['Device Under Test Information'] || 
				   workbook.Sheets['DUT Information'] ||
				   workbook.Sheets['Device Info'];
	
	if (dutSheet) {
		const data = XLSX.utils.sheet_to_json(dutSheet, { header: 1 });
		
		// Convert to key-value pairs
		data.forEach(row => {
			if (row.length >= 2 && row[0]) {
				info[row[0]] = row[1];
			}
		});
	}
	
	return info;
}

function extractRvRData(workbook) {
	const tests = [];
	let totalSkipped = 0;
	
	// Look for Rate vs Range sheets
	workbook.SheetNames.forEach(sheetName => {
		if (sheetName.toLowerCase().includes('rate') && 
			sheetName.toLowerCase().includes('range')) {
			
			console.log(`Processing sheet: ${sheetName}`);
			
			const sheet = workbook.Sheets[sheetName];
			const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
			
			// Find header row
			let headerRow = -1;
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
						headerRow = i;
						break;
					}
				}
			}
			
			if (headerRow === -1) {
				console.error(`No header row found in sheet: ${sheetName}`);
				console.log('First 10 rows:', data.slice(0, 10));
				return;
			}
			
			console.log(`Found header row at index ${headerRow}`);
			const headers = data[headerRow];
			
			// Find column indices using partial matching
			const findColumnIndex = (headers, searchTerm) => {
				// First try exact match (case insensitive)
				let index = headers.findIndex(header =>
					header && header.toString().toLowerCase() === searchTerm.toLowerCase()
				);

				// If not found, try partial match
				if (index === -1) {
					index = headers.findIndex(header =>
						header && header.toString().toLowerCase().includes(searchTerm.toLowerCase())
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

			console.log('Column indices:', {
				regular: { bw: bwIndex, nss: nssIndex, mode: modeIndex },
				tx: { txBw: txBwIndex, txNss: txNssIndex, txMode: txModeIndex },
				rx: { rxBw: rxBwIndex, rxNss: rxNssIndex, rxMode: rxModeIndex },
				txColumnsFound: {
					'TX BW': txBwIndex !== -1,
					'TX NSS': txNssIndex !== -1,
					'TX Mode': txModeIndex !== -1
				},
				rxColumnsFound: {
					'RX BW': rxBwIndex !== -1,
					'RX NSS': rxNssIndex !== -1,
					'RX Mode': rxModeIndex !== -1
				},
				totalColumns: headers.length
			});
			
			// Validate required columns
			if (attIndex === -1 || throughputIndex === -1) {
				console.error('Missing required columns in sheet:', sheetName);
				return;
			}
			
			// Group data by test configuration
			const testGroups = new Map();
			let skippedCount = 0;
			
			// First pass: collect all data points
			const allDataPoints = [];

			for (let i = headerRow + 1; i < data.length; i++) {
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
					skippedCount++;
					continue;
				}

				const direction = row[directionIndex] || 'Unknown';

				// Use direction-specific columns when available, otherwise use regular columns
				let bandwidth, nss, mode;
				const isTxDirection = direction.includes('TX');
				const isRxDirection = direction.includes('RX');
				const hasTxColumns = (txBwIndex !== -1 || txNssIndex !== -1 || txModeIndex !== -1);
				const hasRxColumns = (rxBwIndex !== -1 || rxNssIndex !== -1 || rxModeIndex !== -1);

				if (isTxDirection && hasTxColumns) {
					// Use TX columns when available, fall back to regular columns
					bandwidth = (txBwIndex !== -1 ? row[txBwIndex] : row[bwIndex]) || 'Unknown';
					nss = (txNssIndex !== -1 ? row[txNssIndex] : row[nssIndex]) || 'Unknown';
					mode = (txModeIndex !== -1 ? row[txModeIndex] : row[modeIndex]) || 'Unknown';
				} else if (isRxDirection && hasRxColumns) {
					// Use RX columns when available, fall back to regular columns
					bandwidth = (rxBwIndex !== -1 ? row[rxBwIndex] : row[bwIndex]) || 'Unknown';
					nss = (rxNssIndex !== -1 ? row[rxNssIndex] : row[nssIndex]) || 'Unknown';
					mode = (rxModeIndex !== -1 ? row[rxModeIndex] : row[modeIndex]) || 'Unknown';
				} else {
					// Use regular columns as fallback
					bandwidth = row[bwIndex] || 'Unknown';
					nss = row[nssIndex] || 'Unknown';
					mode = row[modeIndex] || 'Unknown';
				}

				const security = row[securityIndex] || 'Unknown';
				
				// Clean up values
				const cleanBandwidth = bandwidth.toString().replace(/,/g, '');
				const cleanNss = nss.toString().replace(/,/g, '');
				
				allDataPoints.push({
					attenuation,
					throughput,
					frequency,
					mode,
					channel,
					bandwidth: cleanBandwidth,
					nss: cleanNss,
					security,
					direction,
					band: determineBand(frequency)
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

				// Create test key based on BASELINE configuration
				const testKey = `${point.direction}_CH${point.channel}_${baselinePoint.bandwidth}MHz_${baselinePoint.nss}SS_${point.security}`;

				if (!testGroups.has(testKey)) {
					testGroups.set(testKey, {
						name: testKey,
						direction: point.direction,
						channel: point.channel.toString(),
						frequency: baselinePoint.frequency,
						band: baselinePoint.band,
						bandwidth: baselinePoint.bandwidth,
						nss: baselinePoint.nss,
						security: point.security,
						mode: baselinePoint.mode,
						sheetName: sheetName,
						data: []
					});
				}

				const testGroup = testGroups.get(testKey);
				testGroup.data.push(point);
			});

			// Convert to array and sort data points by attenuation
			testGroups.forEach(test => {
				// Only include tests that have valid data points
				if (test.data.length > 0) {
					test.data.sort((a, b) => a.attenuation - b.attenuation);
					
					// Set mode based on the mode at attenuation 0 (or closest to 0)
					const modeAtZero = test.data.find(point => point.attenuation === 0);
					if (modeAtZero) {
						test.mode = modeAtZero.mode;
					} else if (test.data.length > 0) {
						// Use the mode from the first (lowest attenuation) data point
						test.mode = test.data[0].mode;
					}
					
					tests.push(test);
				} else {
					console.log(`Skipping test configuration with no valid data: ${test.name}`);
				}
			});

			console.log(`Found ${tests.length} valid test configurations in ${sheetName}`);
			if (skippedCount > 0) {
				console.log(`Filtered out ${skippedCount} invalid data points (channel=0 or throughput=0)`);
				totalSkipped += skippedCount;
			}
		}
	});

	console.log(`Total tests found: ${tests.length}`);
	return { tests, skippedCount: totalSkipped };
}

function updateFileList() {
	const fileList = document.getElementById('fileList');
	const fileItems = document.getElementById('fileItems');
	const fileCount = document.getElementById('fileCount');
	
	fileItems.innerHTML = '';
	
	// Count unique devices and file sources
	const uniqueDevices = new Set();
	let serverCount = 0;
	let localCount = 0;
	
	loadedFiles.forEach(data => {
		uniqueDevices.add(data.deviceInfo?.Name || data.fileName);
		if (data.fromServer) {
			serverCount++;
		} else {
			localCount++;
		}
	});

	let countText = `${loadedFiles.size} file${loadedFiles.size !== 1 ? 's' : ''} from ${uniqueDevices.size} device${uniqueDevices.size !== 1 ? 's' : ''}`;
	if (loadedFiles.size > 0) {
		countText += ` (${serverCount} server, ${localCount} local)`;
	}
	fileCount.textContent = countText;

	// Group files by device model
	const modelGroups = new Map();
	loadedFiles.forEach((data, fileName) => {
		const deviceName = data.deviceInfo?.Name || 'Unknown Device';
		const model = data.deviceInfo?.['Model Number'] || 'Unknown Model';
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
		group.files.push({ fileName, data });
		group.totalTests += data.rvrData.length;
		if (data.fromServer) {
			group.serverFiles++;
		} else {
			group.localFiles++;
		}

		const version = data.deviceInfo?.['Software Version'];
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

	fileList.style.display = loadedFiles.size > 0 ? 'block' : 'none';
}

function removeFile(fileName) {
	loadedFiles.delete(fileName);
	updateFileList();
	updateTestOptions();
}

function clearAllFiles() {
	if (loadedFiles.size > 0 && confirm('Remove all loaded files?')) {
		loadedFiles.clear();
		updateFileList();
		updateTestOptions();
		document.querySelector('.chart-container').style.display = 'none';
		document.querySelector('.stats-panel').style.display = 'none';
		document.querySelector('#comparisonPanel').style.display = 'none';
		// Reset file input
		document.getElementById('excelFile').value = '';
	}
}

function clearServerFiles() {
	const serverFiles = Array.from(loadedFiles.entries()).filter(([_, data]) => data.fromServer);
	if (serverFiles.length > 0 && confirm(`Remove ${serverFiles.length} server files?`)) {
		serverFiles.forEach(([fileName, _]) => {
			loadedFiles.delete(fileName);
		});
		updateFileList();
		updateTestOptions();
	}
}

function clearDeviceModel(modelKey) {
	// Extract device name and model from the key
	const [deviceName, model] = modelKey.split('|');
	
	// Find all files for this device/model combination
	const filesToRemove = [];
	loadedFiles.forEach((data, fileName) => {
		const fileDeviceName = data.deviceInfo?.Name || 'Unknown Device';
		const fileModel = data.deviceInfo?.['Model Number'] || 'Unknown Model';
		const fileModelKey = `${fileDeviceName}|${fileModel}`;
		
		if (fileModelKey === modelKey) {
			filesToRemove.push(fileName);
		}
	});
	
	if (filesToRemove.length > 0 && confirm(`Remove all files for ${deviceName}?`)) {
		filesToRemove.forEach(fileName => {
			loadedFiles.delete(fileName);
		});
		updateFileList();
		updateTestOptions();
	}
}

function clearLocalFiles() {
	const localFiles = Array.from(loadedFiles.entries()).filter(([_, data]) => !data.fromServer);
	if (localFiles.length > 0 && confirm(`Remove ${localFiles.length} local files?`)) {
		localFiles.forEach(([fileName, _]) => {
			loadedFiles.delete(fileName);
		});
		updateFileList();
		updateTestOptions();
		// Reset file input
		document.getElementById('excelFile').value = '';
	}
}

function updateTestOptions() {
	const container = document.getElementById('testOptions');
	container.innerHTML = '';
	
	if (loadedFiles.size === 0) {
		document.querySelector('.test-selector').style.display = 'none';
		return;
	}
	
	document.querySelector('.test-selector').style.display = 'block';
	
	// Group all tests by device name (not filename)
	const deviceGroups = new Map();
	
	loadedFiles.forEach((fileData, fileName) => {
		const deviceName = fileData.deviceInfo?.Name || fileName.split('_')[0] || 'Unknown Device';
		
		console.log(`Processing file: ${fileName}, Device name: ${deviceName}`);
		
		if (!deviceGroups.has(deviceName)) {
			deviceGroups.set(deviceName, {
				files: [],
				tests: [],
				deviceInfo: fileData.deviceInfo
			});
		}
		
		const deviceGroup = deviceGroups.get(deviceName);
		deviceGroup.files.push(fileName);
		
		// Add all tests from this file to the device group
		fileData.rvrData.forEach(test => {
			console.log(`Adding test: ${test.name} from ${fileName} to device ${deviceName}`);
			deviceGroup.tests.push({
				...test,
				fileName: fileName,
				deviceInfo: fileData.deviceInfo,
				fromServer: fileData.fromServer,
				serverPath: test.serverPath // Preserve server path for download URLs
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
		<button class="btn-small" onclick="selectAllTests()">Select All</button>
		<button class="btn-small" onclick="selectNoneTests()">Clear All</button>
		<button class="btn-small" onclick="selectMatchingTests()">Select Matching</button>
	`;
	container.appendChild(quickActions);
	
	let testIndex = 0;
	
	// Display tests grouped by device
	deviceGroups.forEach((deviceGroup, deviceName) => {
		// Create device header
		const deviceHeader = document.createElement('div');
		deviceHeader.className = 'device-group-header';
		deviceHeader.style.marginTop = testIndex > 0 ? '20px' : '0';
		
		const model = deviceGroup.deviceInfo?.['Model Number'] || '';
		const versions = new Set();
		deviceGroup.tests.forEach(test => {
			const version = test.deviceInfo?.['Software Version'];
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
		container.appendChild(deviceHeader);
		
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
		txHeader.innerHTML = '📤 DUT-TX Tests';
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
		
		// Add columns to container
		columnsContainer.appendChild(txColumn);
		columnsContainer.appendChild(rxColumn);
		
		container.appendChild(columnsContainer);
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
		checkbox.value = `${test.fileName}|${test.name}`;
		checkbox.setAttribute('data-devicename', deviceName);
		checkbox.addEventListener('change', updateChart);
		checkboxCell.appendChild(checkbox);
		row.appendChild(checkboxCell);
		
		// Band cell
		const bandCell = document.createElement('td');
		bandCell.textContent = test.band || 'UNK';
		bandCell.style.fontWeight = '500';
		bandCell.style.color = test.band === '2G' ? '#f72585' : test.band === '5G' ? '#00a0c8' : test.band === '6G' ? '#4361ee' : '#888';
		row.appendChild(bandCell);
		
		// Channel cell
		const channelCell = document.createElement('td');
		channelCell.textContent = `CH${test.channel}`;
		channelCell.style.fontWeight = '500';
		channelCell.style.color = '#e0e0e0';
		row.appendChild(channelCell);
		
		// Bandwidth cell
		const bwCell = document.createElement('td');
		bwCell.textContent = `${test.bandwidth}MHz`;
		bwCell.style.color = '#ccc';
		row.appendChild(bwCell);
		
		// NSS cell
		const nssCell = document.createElement('td');
		nssCell.textContent = `${test.nss}SS`;
		nssCell.style.color = '#ccc';
		row.appendChild(nssCell);
		
		// Mode cell
		const modeCell = document.createElement('td');
		modeCell.textContent = test.mode || 'Unknown';
		modeCell.style.color = '#ccc';
		modeCell.style.fontWeight = '500';
		row.appendChild(modeCell);
		
		// Version cell
		const versionCell = document.createElement('td');
		versionCell.className = 'version-cell';
		const version = test.deviceInfo?.['Software Version'] || 'Unknown';
		versionCell.textContent = `v${version}`;
		row.appendChild(versionCell);
		
		// Files cell with download icons
		const fileCell = document.createElement('td');
		fileCell.className = 'file-cell';
		fileCell.style.textAlign = 'left';

		if (test.fromServer && test.serverPath) {
			// Use the original server path to construct download URLs
			const serverPath = test.serverPath;

			// For Excel: use the exact path the file was loaded from
			const excelPath = `/reports/${serverPath}`;

			// For PDF: use the new API endpoint that finds the PDF with wildcard matching
			const pdfPath = `/api/pdf/${serverPath}`;

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

window.selectAllTests = function() {
	const checkboxes = document.querySelectorAll('.test-checkbox');
	checkboxes.forEach(cb => cb.checked = true);
	updateChart();
};

window.selectNoneTests = function() {
	const checkboxes = document.querySelectorAll('.test-checkbox');
	checkboxes.forEach(cb => cb.checked = false);
	updateChart();
};

window.selectMatchingTests = function() {
	// Select one test from each device that has the same configuration
	const checkboxes = document.querySelectorAll('.test-checkbox');
	
	// First, clear all
	checkboxes.forEach(cb => cb.checked = false);
	
	// Group by configuration
	const configMap = new Map();
	checkboxes.forEach(cb => {
		const [fileName, testName] = cb.value.split('|');
		const deviceName = cb.getAttribute('data-devicename');
		
		// Extract config from testName (remove device-specific parts)
		const configMatch = testName.match(/(DUT-[TR]X)_CH(\d+)_(\d+MHz)_(\d+SS)_(\w+)/);
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
	return `${test.band || 'UNK'} CH${test.channel} ${test.bandwidth}MHz ${test.nss}SS ${test.mode}`;
}

function updateChart() {
	const selectedTests = [];
	const checkboxes = document.querySelectorAll('.test-checkbox:checked');
	
	checkboxes.forEach(cb => {
		const [fileName, testName] = cb.value.split('|');
		const fileData = loadedFiles.get(fileName);
		const test = fileData.rvrData.find(t => t.name === testName);
		
		if (test) {
			selectedTests.push({
				...test,
				fileName: fileName,
				deviceInfo: fileData.deviceInfo
			});
		}
	});

	if (selectedTests.length === 0) {
		document.querySelector('.chart-container').style.display = 'none';
		document.querySelector('.stats-panel').style.display = 'none';
		document.querySelector('#comparisonPanel').style.display = 'none';
		return;
	}

	document.querySelector('.chart-container').style.display = 'block';
	document.querySelector('.stats-panel').style.display = 'block';

	drawChart(selectedTests);
	updateStats(selectedTests);
	
	// Show comparison panel if comparing multiple devices
	const uniqueDevices = new Set(selectedTests.map(t => t.deviceInfo?.Name || t.fileName));
	if (uniqueDevices.size > 1) {
		document.querySelector('#comparisonPanel').style.display = 'block';
		updateComparisonTable(selectedTests);
	} else {
		document.querySelector('#comparisonPanel').style.display = 'none';
	}
}

// Updated chart drawing function with unique colors for each test configuration
function drawChart(selectedTests) {
	const ctx = document.getElementById('rvrChart').getContext('2d');
	
	if (chartInstance) {
		chartInstance.destroy();
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

	// Create a map to assign unique colors to each device + test configuration combination
	const configColorMap = new Map();
	let colorIndex = 0;
	
	// First pass: identify unique device + test configuration combinations
	const uniqueConfigs = new Set();
	selectedTests.forEach(test => {
		const deviceName = test.deviceInfo?.Name || test.fileName;
		const testConfig = formatTestName(test);
		const configKey = `${deviceName}|${testConfig}`;
		uniqueConfigs.add(configKey);
	});
	
	// Assign colors to unique configurations
	Array.from(uniqueConfigs).forEach(configKey => {
		configColorMap.set(configKey, allColors[colorIndex % allColors.length]);
		colorIndex++;
	});

	const datasets = selectedTests.map((test, index) => {
		const deviceName = test.deviceInfo?.Name || test.fileName;
		const softwareVersion = test.deviceInfo?.['Software Version'] || '';
		const testConfig = formatTestName(test);
		const configKey = `${deviceName}|${testConfig}`;
		const baseColor = configColorMap.get(configKey);
		
		// Create detailed label based on attenuation 0 data (or first available)
		const label = `${deviceName} ${softwareVersion ? `v${softwareVersion}` : ''} - ${testConfig} ${test.direction}`;
		
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
			tension: 0.2,
			// Line style based on direction
			borderDash: borderDash,
			// Add custom properties for grouping
			deviceName: deviceName,
			testConfig: testConfig,
			// Store reference to the full test for tooltip access
			fullTest: test
		};
	});

	chartInstance = new Chart(ctx, {
		type: chartType,
		data: {
			datasets: datasets
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			interaction: {
				mode: 'index',
				intersect: false,
			},
			plugins: {
				title: {
					display: true,
					text: 'WiFi Rate vs Range Comparison',
					color: '#e0e0e0',
					font: {
						size: 18,
						weight: '600',
						family: "'Poppins', sans-serif"
					}
				},
				subtitle: {
					display: true,
					text: `Comparing ${uniqueConfigs.size} test configuration(s) across ${Array.from(new Set(selectedTests.map(t => t.deviceInfo?.Name || t.fileName))).length} device(s) | Solid: TX, Dotted: RX | Hover for PHY details at each attenuation`,
					color: '#aaa',
					font: {
						size: 14,
						family: "'Poppins', sans-serif"
					}
				},
				legend: {
					display: true,
					position: 'top',
					title: {
						display: true,
						text: 'Legend shows baseline (0dB) configuration - hover points for actual PHY parameters',
						color: '#888',
						font: {
							size: 10,
							family: "'Poppins', sans-serif",
							weight: 'normal'
						},
						padding: 5
					},
					labels: {
						color: '#e0e0e0',
						padding: 15,
						font: {
							size: 11,
							family: "'Poppins', sans-serif"
						}
					}
				},
				tooltip: {
					backgroundColor: 'rgba(0, 0, 0, 0.9)',
					titleColor: '#e0e0e0',
					bodyColor: '#e0e0e0',
					borderColor: '#444',
					borderWidth: 1,
					cornerRadius: 8,
					padding: 12,
					displayColors: true,
					callbacks: {
						title: function(tooltipItems) {
							if (tooltipItems.length > 0) {
								return `Attenuation: ${tooltipItems[0].parsed.x} dB`;
							}
							return '';
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
								lines.push(`${deviceName}: ${context.parsed.y} Mbps`);

								// Show actual PHY parameters at this attenuation level
								if (point.band || point.channel) {
									lines.push(`Band: ${point.band || fullTest.band || 'UNK'} | Channel: ${point.channel || fullTest.channel}`);
								}

								// Show bandwidth and spatial streams with TX/RX indicator
								const actualBW = point.bandwidth || fullTest.bandwidth;
								const actualNSS = point.nss || fullTest.nss;
								const direction = point.direction || fullTest.direction;
								const paramType = direction && direction.includes('TX') ? 'TX' : 
										 direction && direction.includes('RX') ? 'RX' : 'PHY';
								lines.push(`${paramType} Config: ${actualBW}MHz ${actualNSS}SS`);

								// Show mode and security
								if (point.mode || point.security) {
									const direction = point.direction || fullTest.direction;
									const paramType = direction && direction.includes('TX') ? 'TX' : 
											 direction && direction.includes('RX') ? 'RX' : 'PHY';
									lines.push(`${paramType} Mode: ${point.mode || 'Unknown'} | Security: ${point.security || fullTest.security}`);
								}

								// Show frequency if available
								if (point.frequency && point.frequency > 0) {
									lines.push(`Frequency: ${point.frequency} MHz`);
								}

								// Show if parameters have degraded from baseline (attenuation 0 or first point)
								if (dataIndex > 0 && fullTest.data && fullTest.data[0]) {
									const baselinePoint = fullTest.data[0];
									const degradations = [];
									const direction = point.direction || fullTest.direction;
									const paramType = direction && direction.includes('TX') ? 'TX' : 
											 direction && direction.includes('RX') ? 'RX' : 'PHY';

									// Check for NSS degradation
									if (baselinePoint.nss && point.nss && point.nss !== baselinePoint.nss) {
										degradations.push(`${paramType} NSS: ${baselinePoint.nss}→${point.nss}`);
									}

									// Check for bandwidth degradation
									if (baselinePoint.bandwidth && point.bandwidth &&
										parseFloat(point.bandwidth) !== parseFloat(baselinePoint.bandwidth)) {
										degradations.push(`${paramType} BW: ${baselinePoint.bandwidth}→${point.bandwidth}MHz`);
									}

									// Check for mode change
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
							return [`${deviceName}: ${context.parsed.y} Mbps @ ${context.parsed.x} dB`];
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
							family: "'Poppins', sans-serif"
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
							family: "'Poppins', sans-serif"
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

function updateStats(selectedTests) {
	const statsGrid = document.getElementById('statsGrid');
	statsGrid.innerHTML = '';

	// Find best values across all tests
	let bestMaxRate = 0;
	let bestAvgRate = 0;
	let bestRange = 0;
	
	const testStats = selectedTests.map(test => {
		const throughputs = test.data.map(d => d.throughput).filter(t => t > 0);
		const maxRate = Math.max(...throughputs);
		const avgRate = Math.round(throughputs.reduce((a, b) => a + b, 0) / throughputs.length);
		
		// Find effective range (last attenuation with throughput > 10 Mbps)
		let effectiveRange = 0;
		for (let i = test.data.length - 1; i >= 0; i--) {
			if (test.data[i].throughput > 10) {
				effectiveRange = test.data[i].attenuation;
				break;
			}
		}
		
		bestMaxRate = Math.max(bestMaxRate, maxRate);
		bestAvgRate = Math.max(bestAvgRate, avgRate);
		bestRange = Math.max(bestRange, effectiveRange);
		
		return { test, maxRate, avgRate, effectiveRange };
	});

	// Create stat cards
	testStats.forEach(({ test, maxRate, avgRate, effectiveRange }) => {
		const card = document.createElement('div');
		card.className = 'stat-card';
		
		const isBestMax = maxRate === bestMaxRate && selectedTests.length > 1;
		const isBestAvg = avgRate === bestAvgRate && selectedTests.length > 1;
		const isBestRange = effectiveRange === bestRange && selectedTests.length > 1;
		
		card.innerHTML = `
			<h4 style="color: #00a0c8; margin-bottom: 15px;">
				${test.deviceInfo?.Name || test.fileName}<br>
				<span style="font-size: 0.75em; color: #888;">
					v${test.deviceInfo?.['Software Version'] || 'Unknown'}
				</span><br>
				<span style="font-size: 0.8em; color: #aaa;">
					${formatTestName(test)} ${test.direction}
				</span>
			</h4>
			<div style="margin-bottom: 10px;">
				<div class="stat-label">Max Throughput ${isBestMax ? '👑' : ''}</div>
				<div class="stat-value">${maxRate} Mbps</div>
			</div>
			<div style="margin-bottom: 10px;">
				<div class="stat-label">Average Throughput ${isBestAvg ? '👑' : ''}</div>
				<div class="stat-value">${avgRate} Mbps</div>
			</div>
			<div>
				<div class="stat-label">Effective Range (>10 Mbps) ${isBestRange ? '👑' : ''}</div>
				<div class="stat-value">${effectiveRange} dB</div>
			</div>
		`;
		statsGrid.appendChild(card);
	});
}

function toggleChartType() {
	chartType = chartType === 'line' ? 'bar' : 'line';
	updateChart();
}

function exportChart() {
	if (!chartInstance) return;
	
	const link = document.createElement('a');
	link.download = 'wifi-rvr-comparison.png';
	link.href = chartInstance.toBase64Image();
	link.click();
}

function resetZoom() {
	if (chartInstance) {
		chartInstance.resetZoom();
	}
}

function updateComparisonTable(selectedTests) {
	const container = document.getElementById('comparisonTable');
	
	// Group tests by configuration
	const configGroups = new Map();
	selectedTests.forEach(test => {
		const configKey = `${formatTestName(test)} ${test.direction}`;
		if (!configGroups.has(configKey)) {
			configGroups.set(configKey, []);
		}
		configGroups.get(configKey).push(test);
	});
	
	// Create comparison table
	let html = '<table class="comparison-table">';
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
			const deviceName = test.deviceInfo?.Name || test.fileName;
			const softwareVersion = test.deviceInfo?.['Software Version'] || 'Unknown';
			const throughputs = test.data.map(d => d.throughput).filter(t => t > 0);
			const maxRate = Math.max(...throughputs);
			const avgRate = Math.round(throughputs.reduce((a, b) => a + b, 0) / throughputs.length);
			const range = ranges[index];
			const band = test.band || 'UNK';
			
			// Color coding for band
			const bandColor = band === '2G' ? '#f72585' : band === '5G' ? '#00a0c8' : band === '6G' ? '#4361ee' : '#888';
			
			html += '<tr>';
			if (index === 0) {
				html += `<td rowspan="${tests.length}" class="test-config">${config}</td>`;
			}
			html += `<td>${deviceName}</td>`;
			html += `<td>${softwareVersion}</td>`;
			html += `<td style="color: ${bandColor}; font-weight: 500;">${band}</td>`;
			html += `<td>${test.mode || 'Unknown'}</td>`;
			html += `<td class="${maxRate === bestMaxThroughput ? 'best-value' : ''}">${maxRate} Mbps</td>`;
			html += `<td>${avgRate} Mbps</td>`;
			html += `<td class="${range === bestRange ? 'best-value' : ''}">${range} dB</td>`;
			html += '</tr>';
		});
		
		// Add separator between config groups
		html += '<tr style="height: 10px;"><td colspan="8" style="border: none;"></td></tr>';
	});
	
	html += '</tbody></table>';
	container.innerHTML = html;
}

function exportComparison() {
	const selectedTests = [];
	const checkboxes = document.querySelectorAll('.test-checkbox:checked');
	
	checkboxes.forEach(cb => {
		const [fileName, testName] = cb.value.split('|');
		const fileData = loadedFiles.get(fileName);
		const test = fileData.rvrData.find(t => t.name === testName);
		
		if (test) {
			selectedTests.push({
				...test,
				fileName: fileName,
				deviceInfo: fileData.deviceInfo
			});
		}
	});
	
	if (selectedTests.length === 0) return;
	
	// Create CSV data
	let csv = 'Device,Model,Software Version,Test Configuration,Direction,Band,Mode (0dB),';
	
	// Get all unique attenuation values
	const allAttenuations = new Set();
	selectedTests.forEach(test => {
		test.data.forEach(point => {
			allAttenuations.add(point.attenuation);
		});
	});
	const attenuations = Array.from(allAttenuations).sort((a, b) => a - b);
	
	// Add attenuation headers
	csv += attenuations.map(att => `${att}dB`).join(',') + '\n';
	
	// Add data rows
	selectedTests.forEach(test => {
		const deviceName = test.deviceInfo?.Name || test.fileName;
		const model = test.deviceInfo?.['Model Number'] || 'Unknown';
		const version = test.deviceInfo?.['Software Version'] || 'Unknown';
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

function showError(message) {
	const error = document.createElement('div');
	error.className = 'error';
	error.textContent = message;
	document.querySelector('.container').prepend(error);
	setTimeout(() => error.remove(), 5000);
}

function showSuccess(message) {
	const success = document.createElement('div');
	success.style.cssText = `
		background: rgba(34, 197, 94, 0.1);
		border: 1px solid rgba(34, 197, 94, 0.3);
		color: #86efac;
		padding: 15px;
		border-radius: 8px;
		margin: 20px 0;
		font-family: 'Poppins', sans-serif;
		font-weight: 400;
	`;
	success.textContent = message;
	document.querySelector('.container').prepend(success);
	setTimeout(() => success.remove(), 3000);
}
