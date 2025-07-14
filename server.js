const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3000;
const REPORTS_DIR = './reports'; // Hierarchical report storage: vendor/model/version/testconfig/report.xlsx
const PUBLIC_DIR = './public'; // Directory containing the HTML file

// MIME types
const mimeTypes = {
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
function checkImageFile(filePath) {
	try {
		const stats = fs.statSync(filePath);
		return stats.isFile();
	} catch (err) {
		return false;
	}
}

// Helper function to recursively scan directory structure with image support and test config folders
function scanReportsDirectory(dir, baseDir = dir) {
	const structure = {
		vendors: {}
	};
	
	try {
		// Scan for vendors
		const vendors = fs.readdirSync(dir).filter(item => {
			const itemPath = path.join(dir, item);
			return fs.statSync(itemPath).isDirectory() && !item.startsWith('.');
		});
		
		vendors.forEach(vendor => {
			structure.vendors[vendor] = { models: {} };
			const vendorPath = path.join(dir, vendor);
			
			// Check for vendor logo
			const logoPath = path.join(vendorPath, 'logo.png');
			const hasLogo = checkImageFile(logoPath);
			if (hasLogo) {
				const relativePath = path.relative(baseDir, logoPath).replace(/\\/g, '/');
				structure.vendors[vendor].logo = relativePath;
			}
			
			// Scan for models
			const models = fs.readdirSync(vendorPath).filter(item => {
				const itemPath = path.join(vendorPath, item);
				return fs.statSync(itemPath).isDirectory() && !item.startsWith('.');
			});
			
			models.forEach(model => {
				structure.vendors[vendor].models[model] = { versions: {} };
				const modelPath = path.join(vendorPath, model);
				
				// Check for model image
				const modelImagePath = path.join(modelPath, 'model.png');
				const hasModelImage = checkImageFile(modelImagePath);
				if (hasModelImage) {
					const relativePath = path.relative(baseDir, modelImagePath).replace(/\\/g, '/');
					structure.vendors[vendor].models[model].image = relativePath;
				}
				
				// Scan for versions
				const versions = fs.readdirSync(modelPath).filter(item => {
					const itemPath = path.join(modelPath, item);
					return fs.statSync(itemPath).isDirectory() && !item.startsWith('.');
				});
				
				versions.forEach(version => {
					structure.vendors[vendor].models[model].versions[version] = { testConfigs: {} };
					const versionPath = path.join(modelPath, version);
					
					// Scan for test configuration directories
					const testConfigs = fs.readdirSync(versionPath).filter(item => {
						const itemPath = path.join(versionPath, item);
						return fs.statSync(itemPath).isDirectory() && !item.startsWith('.');
					});
					
					testConfigs.forEach(testConfig => {
						const testConfigPath = path.join(versionPath, testConfig);
						const reportFile = path.join(testConfigPath, 'report.xlsx');
						
						// Check if report.xlsx exists
						if (fs.existsSync(reportFile)) {
							try {
								const stats = fs.statSync(reportFile);
								const relativePath = path.relative(baseDir, reportFile).replace(/\\/g, '/');
								
								structure.vendors[vendor].models[model].versions[version].testConfigs[testConfig] = {
									name: 'report.xlsx',
									path: relativePath,
									size: stats.size,
									modified: stats.mtime.toISOString()
								};
							} catch (err) {
								console.error(`Error reading report file ${reportFile}: ${err.message}`);
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
	const parsedUrl = url.parse(req.url);
	let pathname = parsedUrl.pathname;

	// CORS headers for all API responses
	const corsHeaders = {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type'
	};

	// Handle preflight requests
	if (req.method === 'OPTIONS') {
		res.writeHead(204, corsHeaders);
		res.end();
		return;
	}

	// API endpoint to get report structure
	if (pathname === '/api/reports') {
		const structure = scanReportsDirectory(REPORTS_DIR);
		res.writeHead(200, { 
			'Content-Type': 'application/json',
			...corsHeaders
		});
		res.end(JSON.stringify(structure));
		return;
	}

	// API endpoint to search reports
	if (pathname === '/api/search') {
		const query = parsedUrl.query;
		const searchParams = new URLSearchParams(query);
		const searchTerm = searchParams.get('q') || '';
		
		const structure = scanReportsDirectory(REPORTS_DIR);
		const results = searchReports(structure, searchTerm);
		
		res.writeHead(200, { 
			'Content-Type': 'application/json',
			...corsHeaders
		});
		res.end(JSON.stringify(results));
		return;
	}

	// Serve report files and images
	if (pathname.startsWith('/reports/')) {
		const requestedPath = pathname.substring('/reports/'.length);
		console.log(`Report file/image requested: ${requestedPath}`);
		
		// Join with reports directory
		const filePath = path.join(REPORTS_DIR, requestedPath);
		console.log(`Resolved file path: ${filePath}`);
		
		// Normalize paths for comparison
		const resolvedReportsDir = path.resolve(REPORTS_DIR);
		const resolvedFilePath = path.resolve(filePath);
		
		console.log(`Reports directory: ${resolvedReportsDir}`);
		console.log(`Requested file: ${resolvedFilePath}`);
		
		// Security check - ensure we're only serving files from REPORTS_DIR
		if (!resolvedFilePath.startsWith(resolvedReportsDir + path.sep) && resolvedFilePath !== resolvedReportsDir) {
			console.log('Security check failed: Path traversal attempt detected');
			res.writeHead(403, corsHeaders);
			res.end('Forbidden: Path traversal not allowed');
			return;
		}

		// Check if file exists and is readable
		fs.access(filePath, fs.constants.F_OK | fs.constants.R_OK, (err) => {
			if (err) {
				console.log(`File access error: ${err.message}`);
				if (err.code === 'ENOENT') {
					res.writeHead(404, corsHeaders);
					res.end('File not found');
				} else if (err.code === 'EACCES') {
					res.writeHead(403, corsHeaders);
					res.end('Permission denied');
				} else {
					res.writeHead(500, corsHeaders);
					res.end('Internal server error');
				}
				return;
			}

			// File exists and is readable, serve it
			fs.readFile(filePath, (readErr, data) => {
				if (readErr) {
					console.log(`File read error: ${readErr.message}`);
					res.writeHead(500, corsHeaders);
					res.end('Failed to read file');
					return;
				}

				const ext = path.extname(filePath);
				console.log(`Serving file: ${filePath} (${data.length} bytes)`);
				
				// Set appropriate headers based on file type
				const contentType = mimeTypes[ext] || 'application/octet-stream';
				const headers = {
					'Content-Type': contentType,
					'Content-Length': data.length,
					...corsHeaders
				};
				
				// For Excel files, add attachment header
				if (ext === '.xlsx' || ext === '.xls') {
					headers['Content-Disposition'] = `attachment; filename="${path.basename(filePath)}"`;
				}
				
				// For images, add cache headers
				if (contentType.startsWith('image/')) {
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

	const filepath = path.join(PUBLIC_DIR, pathname);
	const ext = path.extname(filepath);

	fs.readFile(filepath, (err, data) => {
		if (err) {
			console.log(`Static file error: ${err.message}`);
			res.writeHead(404, corsHeaders);
			res.end('404 Not Found');
			return;
		}

		res.writeHead(200, { 
			'Content-Type': mimeTypes[ext] || 'text/plain',
			...corsHeaders
		});
		res.end(data);
	});
});

// Search function (updated to include test configuration information)
function searchReports(structure, searchTerm) {
	const results = [];
	const term = searchTerm.toLowerCase();
	
	Object.entries(structure.vendors).forEach(([vendor, vendorData]) => {
		Object.entries(vendorData.models).forEach(([model, modelData]) => {
			Object.entries(modelData.versions).forEach(([version, versionData]) => {
				Object.entries(versionData.testConfigs).forEach(([testConfig, testConfigData]) => {
					// Check if search term matches vendor, model, version, or test config
					if (vendor.toLowerCase().includes(term) || 
						model.toLowerCase().includes(term) || 
						version.toLowerCase().includes(term) ||
						testConfig.toLowerCase().includes(term)) {
						
						results.push({
							vendor,
							model,
							version,
							testConfig,
							file: testConfigData.name,
							path: testConfigData.path,
							size: testConfigData.size,
							modified: testConfigData.modified,
							vendorLogo: vendorData.logo,
							modelImage: modelData.image
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
		const exampleVendors = ['Adtran', 'Eero', 'Netgear'];
		exampleVendors.forEach(vendor => {
			const vendorPath = path.join(REPORTS_DIR, vendor);
			if (!fs.existsSync(vendorPath)) {
				fs.mkdirSync(vendorPath, { recursive: true });
				console.log(`  Created: ${vendorPath}`);
			}
		});
		
		console.log('\nExample directory structure with test configuration folders:');
		console.log('  reports/');
		console.log('    ├── Adtran/');
		console.log('    │   ├── logo.png             (vendor logo - optional)');
		console.log('    │   ├── SDG-8612/');
		console.log('    │   │   ├── model.png        (device image - optional)');
		console.log('    │   │   ├── 25.6.3.1/');
		console.log('    │   │   │   ├── 5g_2x2_ch44/');
		console.log('    │   │   │   │   └── report.xlsx');
		console.log('    │   │   │   └── 5g_2x2_ch149/');
		console.log('    │   │   │       └── report.xlsx');
		console.log('    │   │   └── 25.6.4.0/');
		console.log('    │   │       └── 5g_2x2_ch44/');
		console.log('    │   │           └── report.xlsx');
		console.log('    │   └── SDG-8622/');
		console.log('    │       ├── model.png        (device image - optional)');
		console.log('    ├── Eero/');
		console.log('    │   ├── logo.png             (vendor logo - optional)');
		console.log('    │   └── Max7/');
		console.log('    │       ├── model.png        (device image - optional)');
		console.log('    │       └── 1.2.3/');
		console.log('    │           └── 5g_4x4_ch149/');
		console.log('    │               └── report.xlsx');
		console.log('    └── Netgear/');
		console.log('        ├── logo.png             (vendor logo - optional)');
		console.log('        └── RAX80/');
		console.log('            ├── model.png        (device image - optional)');
		console.log('            └── 3.0.1.4/');
		console.log('                └── 5g_4x4_ch44/');
		console.log('                    └── report.xlsx');
		console.log('\nStructure requirements:');
		console.log('  - Test configuration folders contain exactly one file: report.xlsx');
		console.log('  - Test config folder names should describe the test (e.g., 5g_2x2_ch44, 2g_1x1_ch6)');
		console.log('  - Image files: logo.png (vendor), model.png (device)');
		console.log('  - Supported image formats: PNG, JPG, JPEG, GIF, SVG');
		console.log('  - Recommended size: 64x64px for logos, 128x96px for device images');
	}
	
	if (!fs.existsSync(PUBLIC_DIR)) {
		fs.mkdirSync(PUBLIC_DIR, { recursive: true });
		console.log(`Created public directory: ${PUBLIC_DIR}`);
	}
	
	// Scan and display current report structure
	const structure = scanReportsDirectory(REPORTS_DIR);
	const reportCount = countReports(structure);
	const imageCount = countImages(structure);
	console.log(`\nFound ${reportCount.vendors} vendors, ${reportCount.models} models, ${reportCount.versions} versions, ${reportCount.testConfigs} test configurations`);
	console.log(`Images: ${imageCount.vendorLogos} vendor logos, ${imageCount.modelImages} device images`);
});

// Count reports in structure
function countReports(structure) {
	let vendors = 0, models = 0, versions = 0, testConfigs = 0;
	
	Object.values(structure.vendors).forEach(vendor => {
		vendors++;
		Object.values(vendor.models).forEach(model => {
			models++;
			Object.values(model.versions).forEach(version => {
				versions++;
				testConfigs += Object.keys(version.testConfigs).length;
			});
		});
	});
	
	return { vendors, models, versions, testConfigs };
}

// Count images in structure
function countImages(structure) {
	let vendorLogos = 0, modelImages = 0;
	
	Object.values(structure.vendors).forEach(vendor => {
		if (vendor.logo) vendorLogos++;
		Object.values(vendor.models).forEach(model => {
			if (model.image) modelImages++;
		});
	});
	
	return { vendorLogos, modelImages };
}