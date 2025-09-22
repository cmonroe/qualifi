const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3000;
const REPORTS_DIR = './reports'; // Hierarchical report storage: vendor/model/version/testconfig/report.xlsx
const PUBLIC_DIR = './public'; // Directory containing the HTML file

// MIME types
const mime_types = {
	'.html': 'text/html',
	'.css': 'text/css',
	'.js': 'text/javascript',
	'.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'.xls': 'application/vnd.ms-excel',
	'.json': 'application/json',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml'
};

// Helper function to check if image file exists
function check_image_file(file_path) {
	try {
		const stats = fs.statSync(file_path);
		return stats.isFile();
	} catch (err) {
		return false;
	}
}

// Helper function to recursively scan directory structure with image support and test config folders
function scan_reports_directory(dir, base_dir = dir) {
	const structure = {
		vendors: {}
	};

	try {
		// Scan for vendors
		const vendors = fs.readdirSync(dir).filter(item => {
			const item_path = path.join(dir, item);
			return fs.statSync(item_path).isDirectory() && !item.startsWith('.');
		});

		vendors.forEach(vendor => {
			structure.vendors[vendor] = { models: {} };
			const vendor_path = path.join(dir, vendor);

			// Check for vendor logo
			const logo_path = path.join(vendor_path, 'logo.png');
			const has_logo = check_image_file(logo_path);
			if (has_logo) {
				const relative_path = path.relative(base_dir, logo_path).replace(/\\/g, '/');
				structure.vendors[vendor].logo = relative_path;
			}

			// Scan for models
			const models = fs.readdirSync(vendor_path).filter(item => {
				const item_path = path.join(vendor_path, item);
				return fs.statSync(item_path).isDirectory() && !item.startsWith('.');
			});

			models.forEach(model => {
				structure.vendors[vendor].models[model] = { versions: {} };
				const model_path = path.join(vendor_path, model);

				// Check for model image
				const model_image_path = path.join(model_path, 'device.png');
				const has_model_image = check_image_file(model_image_path);
				if (has_model_image) {
					const relative_path = path.relative(base_dir, model_image_path).replace(/\\/g, '/');
					structure.vendors[vendor].models[model].image = relative_path;
				}

				// Scan for versions
				const versions = fs.readdirSync(model_path).filter(item => {
					const item_path = path.join(model_path, item);
					return fs.statSync(item_path).isDirectory() && !item.startsWith('.');
				});

				versions.forEach(version => {
					structure.vendors[vendor].models[model].versions[version] = { test_configs: {} };
					const version_path = path.join(model_path, version);

					// Scan for test configuration directories
					const test_configs = fs.readdirSync(version_path).filter(item => {
						const item_path = path.join(version_path, item);
						return fs.statSync(item_path).isDirectory() && !item.startsWith('.');
					});

					test_configs.forEach(test_config => {
						const test_config_path = path.join(version_path, test_config);
						const report_file = path.join(test_config_path, 'report.xlsx');

						// Check if report.xlsx exists
						if (fs.existsSync(report_file)) {
							try {
								const stats = fs.statSync(report_file);
								const relative_path = path.relative(base_dir, report_file).replace(/\\/g, '/');

								structure.vendors[vendor].models[model].versions[version].test_configs[test_config] = {
									name: 'report.xlsx',
									path: relative_path,
									size: stats.size,
									modified: stats.mtime.toISOString()
								};
							} catch (err) {
								console.error(`Error reading report file ${report_file}: ${err.message}`);
							}
						}
					});
				});
			});
		});
	} catch (err) {
		console.error('Error scanning reports directory:', err);
	}

	return structure;
}

// Create server
const server = http.createServer((req, res) => {
	const parsed_url = url.parse(req.url);
	let pathname = parsed_url.pathname;

	// CORS headers for all API responses
	const cors_headers = {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type'
	};

	// Handle preflight requests
	if (req.method === 'OPTIONS') {
		res.writeHead(204, cors_headers);
		res.end();
		return;
	}

	// API endpoint to get report structure
	if (pathname === '/api/reports') {
		const structure = scan_reports_directory(REPORTS_DIR);
		res.writeHead(200, {
			'Content-Type': 'application/json',
			...cors_headers
		});
		res.end(JSON.stringify(structure));
		return;
	}

	// API endpoint to search reports
	if (pathname === '/api/search') {
		const query = parsed_url.query;
		const search_params = new URLSearchParams(query);
		const search_term = search_params.get('q') || '';

		const structure = scan_reports_directory(REPORTS_DIR);
		const results = search_reports(structure, search_term);

		res.writeHead(200, {
			'Content-Type': 'application/json',
			...cors_headers
		});
		res.end(JSON.stringify(results));
		return;
	}

	// API endpoint to find and serve PDF files with wildcard matching
	if (pathname.startsWith('/api/pdf/')) {
		const requested_path = pathname.substring('/api/pdf/'.length);
		console.log(`PDF file requested: ${requested_path}`);

		// Extract directory path (remove report.xlsx if present)
		const dir_path = requested_path.replace('/report.xlsx', '');
		const full_dir_path = path.join(REPORTS_DIR, dir_path);

		console.log(`Looking for PDF in directory: ${full_dir_path}`);

		// Security check - ensure we're only serving files from REPORTS_DIR
		const resolved_reports_dir = path.resolve(REPORTS_DIR);
		const resolved_dir_path = path.resolve(full_dir_path);

		if (!resolved_dir_path.startsWith(resolved_reports_dir + path.sep) && resolved_dir_path !== resolved_reports_dir) {
			console.log('Security check failed: Path traversal attempt detected');
			res.writeHead(403, cors_headers);
			res.end('Forbidden: Path traversal not allowed');
			return;
		}

		// Check if directory exists
		if (!fs.existsSync(full_dir_path)) {
			console.log(`Directory not found: ${full_dir_path}`);
			res.writeHead(404, cors_headers);
			res.end('Directory not found');
			return;
		}

		try {
			// Read directory contents
			const files = fs.readdirSync(full_dir_path);

			// Find PDF file matching the pattern
			const pdf_file = files.find(file =>
				file.toLowerCase().startsWith('rate-vs-range-report') &&
				file.toLowerCase().endsWith('.pdf')
			);

			if (!pdf_file) {
				console.log(`No PDF file found in directory: ${full_dir_path}`);
				console.log('Available files:', files);
				res.writeHead(404, cors_headers);
				res.end('PDF file not found');
				return;
			}

			console.log(`Found PDF file: ${pdf_file}`);
			const pdf_path = path.join(full_dir_path, pdf_file);

			// Serve the PDF file
			fs.readFile(pdf_path, (read_err, data) => {
				if (read_err) {
					console.log(`Error reading PDF file: ${read_err.message}`);
					res.writeHead(500, cors_headers);
					res.end('Failed to read PDF file');
					return;
				}

				console.log(`Serving PDF file: ${pdf_path} (${data.length} bytes)`);

				const headers = {
					'Content-Type': 'application/pdf',
					'Content-Length': data.length,
					'Content-Disposition': `attachment; filename="${pdf_file}"`,
					...cors_headers
				};

				res.writeHead(200, headers);
				res.end(data);
			});

		} catch (error) {
			console.error(`Error accessing directory ${full_dir_path}:`, error);
			res.writeHead(500, cors_headers);
			res.end('Internal server error');
		}

		return;
	}

	// Serve report files and images
	if (pathname.startsWith('/reports/')) {
		const requested_path = pathname.substring('/reports/'.length);
		console.log(`Report file/image requested: ${requested_path}`);

		// Join with reports directory
		const file_path = path.join(REPORTS_DIR, requested_path);
		console.log(`Resolved file path: ${file_path}`);

		// Normalize paths for comparison
		const resolved_reports_dir = path.resolve(REPORTS_DIR);
		const resolved_file_path = path.resolve(file_path);

		console.log(`Reports directory: ${resolved_reports_dir}`);
		console.log(`Requested file: ${resolved_file_path}`);

		// Security check - ensure we're only serving files from REPORTS_DIR
		if (!resolved_file_path.startsWith(resolved_reports_dir + path.sep) && resolved_file_path !== resolved_reports_dir) {
			console.log('Security check failed: Path traversal attempt detected');
			res.writeHead(403, cors_headers);
			res.end('Forbidden: Path traversal not allowed');
			return;
		}

		// Check if file exists and is readable
		fs.access(file_path, fs.constants.F_OK | fs.constants.R_OK, (err) => {
			if (err) {
				console.log(`File access error: ${err.message}`);
				if (err.code === 'ENOENT') {
					res.writeHead(404, cors_headers);
					res.end('File not found');
				} else if (err.code === 'EACCES') {
					res.writeHead(403, cors_headers);
					res.end('Permission denied');
				} else {
					res.writeHead(500, cors_headers);
					res.end('Internal server error');
				}
				return;
			}

			// File exists and is readable, serve it
			fs.readFile(file_path, (read_err, data) => {
				if (read_err) {
					console.log(`File read error: ${read_err.message}`);
					res.writeHead(500, cors_headers);
					res.end('Failed to read file');
					return;
				}

				const ext = path.extname(file_path);
				console.log(`Serving file: ${file_path} (${data.length} bytes)`);

				// Set appropriate headers based on file type
				const content_type = mime_types[ext] || 'application/octet-stream';
				const headers = {
					'Content-Type': content_type,
					'Content-Length': data.length,
					...cors_headers
				};

				// For Excel files, add attachment header
				if (ext === '.xlsx' || ext === '.xls') {
					headers['Content-Disposition'] = `attachment; filename="${path.basename(file_path)}"`;
				}

				// For images, add cache headers
				if (content_type.startsWith('image/')) {
					headers['Cache-Control'] = 'public, max-age=3600'; // Cache for 1 hour
				}

				res.writeHead(200, headers);
				res.end(data);
			});
		});
		return;
	}

	// Serve static files
	if (pathname === '/') {
		pathname = '/index.html';
	}

	const file_path_static = path.join(PUBLIC_DIR, pathname);
	const ext = path.extname(file_path_static);

	fs.readFile(file_path_static, (err, data) => {
		if (err) {
			console.log(`Static file error: ${err.message}`);
			res.writeHead(404, cors_headers);
			res.end('404 Not Found');
			return;
		}

		res.writeHead(200, {
			'Content-Type': mime_types[ext] || 'text/plain',
			...cors_headers
		});
		res.end(data);
	});
});

// Search function (updated to include test configuration information)
function search_reports(structure, search_term) {
	const results = [];
	const term = search_term.toLowerCase();

	Object.entries(structure.vendors).forEach(([vendor, vendor_data]) => {
		Object.entries(vendor_data.models).forEach(([model, model_data]) => {
			Object.entries(model_data.versions).forEach(([version, version_data]) => {
				Object.entries(version_data.test_configs).forEach(([test_config, test_config_data]) => {
					// Check if search term matches vendor, model, version, or test config
					if (vendor.toLowerCase().includes(term) ||
						model.toLowerCase().includes(term) ||
						version.toLowerCase().includes(term) ||
						test_config.toLowerCase().includes(term)) {

						results.push({
							vendor,
							model,
							version,
							test_config,
							file: test_config_data.name,
							path: test_config_data.path,
							size: test_config_data.size,
							modified: test_config_data.modified,
							vendor_logo: vendor_data.logo,
							model_image: model_data.image
						});
					}
				});
			});
		});
	});

	return results;
}

// Start server
server.listen(PORT, () => {
	console.log(`WiFi RvR Server running at http://localhost:${PORT}`);
	console.log(`Reports directory: ${path.resolve(REPORTS_DIR)}`);
	console.log(`Public directory: ${path.resolve(PUBLIC_DIR)}`);

	// Create directories if they don't exist
	if (!fs.existsSync(REPORTS_DIR)) {
		fs.mkdirSync(REPORTS_DIR, { recursive: true });
		console.log(`Created reports directory: ${REPORTS_DIR}`);

		// Create example structure with test configuration folders
		console.log('\nCreating example directory structure...');
		const example_vendors = ['Adtran', 'Eero', 'Netgear'];
		example_vendors.forEach(vendor => {
			const vendor_path = path.join(REPORTS_DIR, vendor);
			if (!fs.existsSync(vendor_path)) {
				fs.mkdirSync(vendor_path, { recursive: true });
				console.log(`  Created: ${vendor_path}`);
			}
		});

		console.log('\nExample directory structure with test configuration folders:');
		console.log('  reports/');
		console.log('    ├── Adtran/');
		console.log('    │   ├── logo.png             (vendor logo - optional)');
		console.log('    │   ├── SDG-8612/');
		console.log('    │   │   ├── device.png        (device image - optional)');
		console.log('    │   │   ├── 25.6.3.1/');
		console.log('    │   │   │   ├── 5g_2x2_ch44/');
		console.log('    │   │   │   │   └── report.xlsx');
		console.log('    │   │   │   └── 5g_2x2_ch149/');
		console.log('    │   │   │       └── report.xlsx');
		console.log('    │   │   └── 25.6.4.0/');
		console.log('    │   │       └── 5g_2x2_ch44/');
		console.log('    │   │           └── report.xlsx');
		console.log('    │   └── SDG-8622/');
		console.log('    │       ├── device.png        (device image - optional)');
		console.log('    ├── Eero/');
		console.log('    │   ├── logo.png             (vendor logo - optional)');
		console.log('    │   └── Max7/');
		console.log('    │       ├── device.png        (device image - optional)');
		console.log('    │       └── 1.2.3/');
		console.log('    │           └── 5g_4x4_ch149/');
		console.log('    │               └── report.xlsx');
		console.log('    └── Netgear/');
		console.log('        ├── logo.png             (vendor logo - optional)');
		console.log('        └── RAX80/');
		console.log('            ├── device.png        (device image - optional)');
		console.log('            └── 3.0.1.4/');
		console.log('                └── 5g_4x4_ch44/');
		console.log('                    └── report.xlsx');
		console.log('\nStructure requirements:');
		console.log('  - Test configuration folders contain exactly one file: report.xlsx');
		console.log('  - Test config folder names should describe the test (e.g., 5g_2x2_ch44, 2g_1x1_ch6)');
		console.log('  - Image files: logo.png (vendor), device.png (device)');
		console.log('  - Supported image formats: PNG, JPG, JPEG, GIF, SVG');
		console.log('  - Recommended size: 64x64px for logos, 128x96px for device images');
	}

	if (!fs.existsSync(PUBLIC_DIR)) {
		fs.mkdirSync(PUBLIC_DIR, { recursive: true });
		console.log(`Created public directory: ${PUBLIC_DIR}`);
	}

	// Scan and display current report structure
	const structure = scan_reports_directory(REPORTS_DIR);
	const report_count = count_reports(structure);
	const image_count = count_images(structure);
	console.log(`\nFound ${report_count.vendors} vendors, ${report_count.models} models, ${report_count.versions} versions, ${report_count.test_configs} test configurations`);
	console.log(`Images: ${image_count.vendor_logos} vendor logos, ${image_count.model_images} device images`);
});

// Count reports in structure
function count_reports(structure) {
	let vendors = 0, models = 0, versions = 0, test_configs = 0;

	Object.values(structure.vendors).forEach(vendor => {
		vendors++;
		Object.values(vendor.models).forEach(model => {
			models++;
			Object.values(model.versions).forEach(version => {
				versions++;
				test_configs += Object.keys(version.test_configs).length;
			});
		});
	});

	return { vendors, models, versions, test_configs };
}

// Count images in structure
function count_images(structure) {
	let vendor_logos = 0, model_images = 0;

	Object.values(structure.vendors).forEach(vendor => {
		if (vendor.logo) vendor_logos++;
		Object.values(vendor.models).forEach(model => {
			if (model.image) model_images++;
		});
	});

	return { vendor_logos, model_images };
}
