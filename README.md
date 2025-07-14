# QualiFi - WiFi RvR Analysis Tool

:warning: The code for this tool was written by AI. I simply provided adult supervision and emotional support. :warning:

## Overview

QualiFi is a web-based WiFi Rate vs Range (RvR) analysis tool for SDG testing. It provides a modern interface for visualizing and comparing WiFi performance data across different devices, software versions, and test configurations.

## Tool Components

1. **Web Interface** (`public/index.html`) - The main user interface
2. **Node.js Server** (`server.js`) - Serves reports and provides API endpoints
3. **Template Creator** (`tools/template.py`) - Generates sample Excel reports
4. **Excel Reports** - LANforge test data in hierarchical directory structure

## Directory Structure

The server uses a hierarchical report storage system with test configuration folders. Each test configuration folder contains exactly one file named `report.xlsx`:

```
reports/
├── [Vendor Name]/
│   ├── logo.png             (optional vendor logo)
│   ├── [Model Name]/
│   │   ├── model.png        (optional device image)
│   │   ├── [Software Version]/
│   │   │   ├── [Test Config 1]/
│   │   │   │   └── report.xlsx
│   │   │   ├── [Test Config 2]/
│   │   │   │   └── report.xlsx
│   │   │   └── [Test Config N]/
│   │   │       └── report.xlsx
│   │   └── [Another Version]/
│   │       └── [Test Config]/
│   │           └── report.xlsx
│   └── [Another Model]/
│       ├── model.png        (optional device image)
│       └── [Software Version]/
│           └── [Test Config]/
│               └── report.xlsx
└── [Another Vendor]/
    ├── logo.png             (optional vendor logo)
    └── ...
```

### Example Structure

```
reports/
├── Adtran/
│   ├── logo.png             (Adtran company logo - 64x64px recommended)
│   ├── SDG-8612/
│   │   ├── model.png        (SDG-8612 device photo - 128x96px recommended)
│   │   ├── 25.6.3.1/
│   │   │   ├── 5g_2x2_ch44/
│   │   │   │   └── report.xlsx
│   │   │   ├── 5g_2x2_ch149/
│   │   │   │   └── report.xlsx
│   │   │   └── 2g_2x2_ch6/
│   │   │       └── report.xlsx
│   │   └── 25.6.4.0/
│   │       └── 5g_2x2_ch44/
│   │           └── report.xlsx
│   └── SDG-8622/
│       ├── model.png
│       └── 3.1.0/
│           └── 5g_4x4_ch44/
│               └── report.xlsx
├── Eero/
│   ├── logo.png
│   └── Max7/
│       ├── model.png
│       └── 1.2.3/
│           └── 5g_4x4_ch149/
│               └── report.xlsx
└── Netgear/
    ├── logo.png
    └── RAX80/
        ├── model.png
        └── 3.0.1.4/
            └── 5g_4x4_ch44/
                └── report.xlsx
```

## Test Configuration Naming Convention

Test configuration folder names should be descriptive and follow a consistent pattern:

### Recommended Format
```
{band}_{spatial_streams}_{channel}[_{additional_info}]
```

### Examples:
- **5g_2x2_ch44** - 5GHz, 2x2 MIMO, Channel 44
- **5g_4x4_ch149** - 5GHz, 4x4 MIMO, Channel 149
- **2g_2x2_ch6** - 2.4GHz, 2x2 MIMO, Channel 6
- **6g_2x2_ch37** - 6GHz, 2x2 MIMO, Channel 37
- **5g_2x2_ch44_80mhz** - 5GHz, 2x2 MIMO, Channel 44, 80MHz bandwidth
- **5g_4x4_ch149_wpa3** - 5GHz, 4x4 MIMO, Channel 149, WPA3 security

### Band Identifiers:
- **2g** - 2.4GHz
- **5g** - 5GHz
- **6g** - 6GHz

### Spatial Stream Format:
- **1x1** - 1 spatial stream (SISO)
- **2x2** - 2 spatial streams
- **4x4** - 4 spatial streams
- **8x8** - 8 spatial streams

## Quick Start

### 1. Install Node.js
Ensure Node.js is installed on your system. Download from [nodejs.org](https://nodejs.org/) if needed.

### 2. Set Up the Server

```bash
# Clone project
git clone git@bitbucket.org:smartrg-openwrt/qualifi.git
cd qualifi

# Create reports directory
mkdir reports
```

### 3. Start the Server

```bash
node server.js
```

The server will start on http://localhost:3000

### 4. Add Test Reports

Use the provided Python script to create sample reports:

```bash
# Create sample reports for a device
python tools/template.py

# Create multiple test configurations
python tools/template.py --multiple

# Create comparison example with multiple devices
python tools/template.py --comparison

# Create custom template
python tools/template.py --custom Adtran SDG-8612 25.6.3.1 5g_2x2_ch44
```

## Web Interface Features

### 1. Server Reports Tab
- **Hierarchical Browser**: Navigate vendors → models → versions
- **Version Selection**: Select entire versions (all test configs included)
- **Visual Elements**: Vendor logos and device images displayed
- **Search**: Find reports by vendor, model, version, or test config
- **Quick Filters**:
  - Expand/Collapse All
  - Select Latest Versions (automatically selects newest version of each model)

### 2. Local Files Tab
- **Drag & Drop**: Upload Excel files directly
- **Multiple Files**: Load multiple reports for comparison
- **File Management**: Clear server files, local files, or all

### 3. Test Configuration Selection
After loading reports, you can:
- View test configurations grouped by device
- See tests organized in TX/RX columns
- Select specific tests to compare
- View test details (Band, Channel, Bandwidth, NSS, Mode, Version)

### 4. Visualization & Analysis
- **Interactive Charts**: Line or bar charts with zoom capability
- **Performance Statistics**: Max/Average throughput, effective range
- **Device Comparison**: Side-by-side comparison table
- **Export Options**: 
  - Export chart as PNG
  - Export comparison data as CSV

## Excel Report Format

Reports must be Excel files (.xlsx) containing:

### Required Sheets:
1. **Device Under Test Information** - Device metadata
2. **Rate vs Range [N]** - Test data (can have multiple)

### Required Columns in RvR Sheets:
- **Attenuation** - Signal attenuation in dB
- **Throughput** - Data rate in Mbps
- **Direction** - DUT-TX or DUT-RX
- **Channel** - WiFi channel number
- **Frequency** - Center frequency in MHz
- **BW** - Bandwidth in MHz
- **NSS** - Number of spatial streams
- **Security** - Security protocol (e.g., WPA3)
- **Tx Mode** - Transmission mode (e.g., HE, OFDM)

### Data Validation:
- Invalid data points (channel=0 or throughput=0) are automatically filtered
- The tool determines band (2G/5G/6G) from frequency
- Tests are grouped by configuration parameters

## API Endpoints

### GET /api/reports
Returns the complete hierarchical structure of all reports.

```json
{
  "vendors": {
    "Adtran": {
      "logo": "Adtran/logo.png",
      "models": {
        "SDG-8612": {
          "image": "Adtran/SDG-8612/model.png",
          "versions": {
            "25.6.3.1": {
              "testConfigs": {
                "5g_2x2_ch44": {
                  "name": "report.xlsx",
                  "path": "Adtran/SDG-8612/25.6.3.1/5g_2x2_ch44/report.xlsx",
                  "size": 45678,
                  "modified": "2025-01-15T10:30:00.000Z"
                }
              }
            }
          }
        }
      }
    }
  }
}
```

### GET /api/search?q=searchterm
Search for reports matching the query across all hierarchy levels.

### GET /reports/[path]
Download report files or retrieve images:
- Excel reports: `/reports/vendor/model/version/testconfig/report.xlsx`
- Images: `/reports/vendor/logo.png` or `/reports/vendor/model/model.png`

## Setting Up Reports

### Manual Setup

```bash
# Create vendor directory
mkdir -p reports/Adtran

# Add vendor logo (optional)
cp company_logo.png reports/Adtran/logo.png

# Create model directory
mkdir -p reports/Adtran/SDG-8612

# Add device image (optional)
cp device_photo.png reports/Adtran/SDG-8612/model.png

# Create version and test config directories
mkdir -p reports/Adtran/SDG-8612/25.6.3.1/5g_2x2_ch44

# Copy test report
cp test_data.xlsx reports/Adtran/SDG-8612/25.6.3.1/5g_2x2_ch44/report.xlsx
```

### Batch Setup Script

```bash
#!/bin/bash
# setup_reports.sh

VENDOR="Adtran"
MODEL="SDG-8612"
VERSION="25.6.3.1"

# Test configurations to set up
CONFIGS="5g_2x2_ch44 5g_2x2_ch149 2g_2x2_ch6"

for CONFIG in $CONFIGS; do
    DIR="reports/$VENDOR/$MODEL/$VERSION/$CONFIG"
    mkdir -p "$DIR"
    
    # Copy your test file to the standard name
    cp "test_${CONFIG}.xlsx" "$DIR/report.xlsx"
    echo "Created: $DIR/report.xlsx"
done
```

## Image Guidelines

### Vendor Logos (logo.png)
- **Size**: 64x64 pixels recommended
- **Format**: PNG with transparency preferred
- **Location**: `reports/[Vendor]/logo.png`

### Device Images (model.png)
- **Size**: 128x96 pixels recommended
- **Format**: PNG or JPG
- **Location**: `reports/[Vendor]/[Model]/model.png`

Images are optional but enhance the visual experience when browsing reports.

## Best Practices

1. **Consistent Naming**: Use standardized names across all reports
2. **Version Control**: Keep original test files separately as backup
3. **Test Organization**: Group similar tests logically
4. **Data Quality**: Ensure Excel files have all required columns
5. **Regular Updates**: Keep software versions current
6. **Documentation**: Document any custom test configurations

## Troubleshooting

### Reports Not Appearing
- Verify file is named exactly `report.xlsx`
- Check directory structure (5 levels: vendor/model/version/testconfig/report.xlsx)
- Ensure proper read permissions

### Missing Data
- Check Excel file has required sheets and columns
- Verify column headers match expected names (case-insensitive, partial match)
- Look for console errors in browser developer tools

### Performance Issues
- Limit number of simultaneous comparisons
- Consider data point density in reports
- Check server console for errors

### Validation Script

```bash
#!/bin/bash
# validate_reports.sh

echo "Validating report structure..."

# Check for report files
find reports -name "report.xlsx" | while read -r file; do
    echo "✓ Found: $file"
done

# Check for images
echo -e "\nChecking for images..."
find reports -name "logo.png" -o -name "model.png" | while read -r img; do
    echo "✓ Image: $img"
done

# Count statistics
echo -e "\nStatistics:"
echo "Vendors: $(find reports -maxdepth 1 -type d | tail -n +2 | wc -l)"
echo "Reports: $(find reports -name "report.xlsx" | wc -l)"
echo "Images: $(find reports \( -name "logo.png" -o -name "model.png" \) | wc -l)"
```

## Support

For issues or questions:
1. Check the browser console for errors (F12)
2. Review server console output
3. Validate directory structure and file formats
4. Ensure all dependencies are installed

The tool provides comprehensive WiFi performance analysis with an intuitive interface for comparing multiple devices and test configurations.
