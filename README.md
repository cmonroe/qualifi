# QualiFi - WiFi RvR Analysis Tool

:warning: The code for this tool was written by AI. I simply provided adult supervision and emotional support. :warning:

## Overview

QualiFi is a web-based WiFi Rate vs Range (RvR) analysis tool for SDG testing. It provides a modern dark-themed interface for visualizing and comparing WiFi performance data across different devices, software versions, and test configurations. The tool supports 2.4GHz, 5GHz, and 6GHz bands with comprehensive TX/RX analysis capabilities.

## Key Features

- **Multi-Band Support**: 2.4GHz (2G), 5GHz (5G), and 6GHz (6G) WiFi bands
- **TX/RX Specific Analysis**: Separate columns and parameters for DUT-TX and DUT-RX tests
- **Dual Report Formats**: Supports both Excel (.xlsx) and PDF report downloads
- **Modern UI**: Dark theme with Berkeley Mono font (falls back to Poppins)
- **Batch Loading**: Load multiple test configurations from server simultaneously
- **Interactive Visualization**: Line/bar charts with detailed hover tooltips showing PHY degradation
- **Smart Filtering**: Automatically filters invalid data points (channel=0 or throughput=0)

## Tool Components

1. **Web Interface** (`public/index.html`) - Modern dark-themed user interface
2. **Node.js Server** (`server.js`) - Serves reports and provides API endpoints
3. **Styling** (`public/qualifi.css`) - Technical precision dark theme
4. **Client Logic** (`public/qualifi.js`) - Interactive visualization and analysis
5. **Excel/PDF Reports** - LANforge test data in hierarchical directory structure

## Directory Structure

The server uses a hierarchical report storage system with test configuration folders. Each test configuration folder contains:
- **report.xlsx** - Required Excel test data file
- **Rate-vs-Range-Report*.pdf** - Optional PDF report (wildcard matching supported)

```
reports/
├── [Vendor Name]/
│   ├── logo.png             (optional vendor logo - 64x64px)
│   ├── [Model Name]/
│   │   ├── device.png        (optional device image - 128x96px)
│   │   ├── [Software Version]/
│   │   │   ├── [Test Config 1]/
│   │   │   │   ├── report.xlsx
│   │   │   │   └── Rate-vs-Range-Report-[details].pdf (optional)
│   │   │   ├── [Test Config 2]/
│   │   │   │   ├── report.xlsx
│   │   │   │   └── Rate-vs-Range-Report-[details].pdf (optional)
│   │   │   └── [Test Config N]/
│   │   │       ├── report.xlsx
│   │   │       └── Rate-vs-Range-Report-[details].pdf (optional)
│   │   └── [Another Version]/
│   │       └── [Test Config]/
│   │           ├── report.xlsx
│   │           └── Rate-vs-Range-Report-[details].pdf (optional)
│   └── [Another Model]/
│       ├── device.png        (optional device image)
│       └── [Software Version]/
│           └── [Test Config]/
│               ├── report.xlsx
│               └── Rate-vs-Range-Report-[details].pdf (optional)
└── [Another Vendor]/
    ├── logo.png             (optional vendor logo)
    └── ...
```

### Example Structure

```
reports/
├── Adtran/
│   ├── logo.png
│   ├── SDG-8612/
│   │   ├── device.png
│   │   ├── 25.6.4.1/
│   │   │   ├── 5g_2x2_ch44/
│   │   │   │   ├── report.xlsx
│   │   │   │   └── Rate-vs-Range-Report-5g-2x2-ch44.pdf
│   │   │   ├── 5g_2x2_ch149/
│   │   │   │   ├── report.xlsx
│   │   │   │   └── Rate-vs-Range-Report-5g-2x2-ch149.pdf
│   │   │   └── 6g_2x2_ch37/
│   │   │       ├── report.xlsx
│   │   │       └── Rate-vs-Range-Report-6g-2x2-ch37.pdf
│   │   └── 25.9.1.1/
│   │       └── 5g_4x4_ch44/
│   │           └── report.xlsx
├── Eero/
│   ├── logo.png
│   └── Max7/
│       ├── device.png
│       └── 1.2.3/
│           └── 5g_4x4_ch149/
│               └── report.xlsx
└── Netgear/
    ├── logo.png
    └── RAX80/
        ├── device.png
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
- **6g_4x4_ch1** - 6GHz, 4x4 MIMO, Channel 1 (displayed as CH1 in UI)
- **5g_2x2_ch44_80mhz** - 5GHz, 2x2 MIMO, Channel 44, 80MHz bandwidth
- **5g_4x4_ch149_wpa3** - 5GHz, 4x4 MIMO, Channel 149, WPA3 security

### Band Identifiers:
- **2g** - 2.4GHz (2412-2484 MHz)
- **5g** - 5GHz (5160-5885 MHz)
- **6g** - 6GHz (5925-7125 MHz)

### 6GHz Channel Note:
6GHz channels are automatically converted for display (e.g., channel 191 → CH1)

## Quick Start

### 1. Install Node.js
Ensure Node.js is installed on your system. Download from [nodejs.org](https://nodejs.org/) if needed.

### 2. Set Up the Server

```bash
# Clone project
git clone git@github.com:cmonroe/qualifi.git
cd qualifi

# Create reports directory
mkdir reports

# Optional: Add logo image
cp logo.png public/logo.png
```

### 3. Start the Server

```bash
node server.js
```

The server will start on http://localhost:3000

### 4. Add Test Reports

Place your Excel test reports and optional PDF reports in the hierarchical directory structure as shown above.

## Web Interface Features

### 1. Server Reports Tab
- **Hierarchical Browser**: Navigate vendors → models → versions
- **Version-Level Selection**: Select entire versions (all test configs included automatically)
- **Visual Elements**: Vendor logos and device images with automatic fallback
- **Search**: Real-time search across vendors, models, versions, and test configs
- **Quick Filters**:
  - Expand/Collapse All navigation
  - Select Latest Versions (auto-selects newest version per model)
  - Batch loading with progress notifications

### 2. Local Files Tab
- **Drag & Drop**: Upload Excel files directly from your computer
- **Multiple Files**: Load and compare multiple local reports
- **File Management**:
  - Clear server files only
  - Clear local files only
  - Clear all loaded files
  - Clear by device model

### 3. Test Configuration Selection
After loading reports:
- **Device Grouping**: Tests organized by device with metadata display
- **TX/RX Columns**: Separate columns for DUT-TX and DUT-RX tests
- **Smart Selection**:
  - Select All/Clear All
  - Select by device
  - Select Matching (finds common configs across devices)
- **Download Links**: Direct Excel and PDF download icons for server files
- **Test Details**: Band, Channel, BW, NSS, Mode, Version display

### 4. Visualization & Analysis
- **Interactive Charts**:
  - Line or bar chart toggle
  - Zoom and pan capabilities
  - Solid lines for TX, dotted for RX
  - Unique colors per device/configuration
- **Advanced Tooltips**:
  - PHY parameters at each attenuation point
  - Degradation indicators (NSS, BW, Mode changes)
  - TX/RX specific parameter display
- **Performance Statistics**:
  - Max throughput with trophy indicators
  - Average throughput calculations
  - Effective range (>10 Mbps threshold)
- **Device Comparison**:
  - Side-by-side comparison table
  - Best value highlighting
  - Configuration grouping
- **Export Options**:
  - Chart export as PNG
  - Full comparison data as CSV

### 5. UI Features
- **Typography**: Berkeley Mono font with Poppins fallback
- **Dark Theme**: Technical precision design with high contrast
- **Notifications**: Success/error notifications with stacking support
- **Responsive**: Adapts to different screen sizes

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
- **Mode** - PHY mode (e.g., HE, VHT, HT, OFDM)

### Optional TX/RX Specific Columns:
For more precise analysis, include direction-specific columns:
- **TX Mode**, **TX BW**, **TX NSS** - Used for DUT-TX tests
- **RX Mode**, **RX BW**, **RX NSS** - Used for DUT-RX tests

The tool automatically uses direction-specific columns when available, falling back to standard columns if not present.

### Data Validation:
- Invalid data points (channel=0 or throughput=0) are automatically filtered
- Band (2G/5G/6G) determined from frequency
- Tests grouped by baseline configuration (attenuation 0 or lowest)
- 6GHz channels converted for display (191+ → 1+)

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
          "image": "Adtran/SDG-8612/device.png",
          "versions": {
            "25.6.4.1": {
              "testConfigs": {
                "5g_2x2_ch44": {
                  "name": "report.xlsx",
                  "path": "Adtran/SDG-8612/25.6.4.1/5g_2x2_ch44/report.xlsx",
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

### GET /api/pdf/[path]
Finds and serves PDF report files using wildcard matching.
- Searches for files matching pattern: `rate-vs-range-report*.pdf`
- Case-insensitive matching
- Returns first matching PDF in the directory

### GET /reports/[path]
Download report files or retrieve images:
- Excel reports: `/reports/vendor/model/version/testconfig/report.xlsx`
- Images: `/reports/vendor/logo.png` or `/reports/vendor/model/device.png`

## PDF Report Support

The tool automatically detects PDF reports in test configuration directories:
- **Naming Pattern**: `Rate-vs-Range-Report*.pdf` (case-insensitive)
- **Wildcard Support**: Any suffix after the base name is accepted
- **Examples**:
  - `Rate-vs-Range-Report-5g-2x2-ch44.pdf`
  - `rate-vs-range-report_2025_01_15.pdf`
  - `Rate-VS-Range-Report-FINAL.pdf`

## Image Guidelines

### Vendor Logos (logo.png)
- **Size**: 64x64 pixels recommended
- **Format**: PNG with transparency preferred
- **Location**: `reports/[Vendor]/logo.png`

### Device Images (device.png)
- **Size**: 128x96 pixels recommended
- **Format**: PNG or JPG
- **Location**: `reports/[Vendor]/[Model]/device.png`

Images are optional but enhance the visual experience. Missing images are handled gracefully with automatic hiding.

## Best Practices

1. **Consistent Naming**: Use standardized folder and file names
2. **Version Control**: Keep original test files separately as backup
3. **Test Organization**: Group related tests logically by configuration
4. **Data Quality**: Ensure Excel files have all required columns
5. **TX/RX Columns**: Include direction-specific columns for accurate analysis
6. **Regular Updates**: Keep software versions current
7. **PDF Reports**: Include PDF versions for complete documentation
8. **Image Assets**: Add logos and device images for better visual navigation
9. **6GHz Testing**: Use proper channel numbers (raw values will be converted)

## Troubleshooting

### Reports Not Appearing
- Verify file is named exactly `report.xlsx`
- Check directory structure (5 levels: vendor/model/version/testconfig/report.xlsx)
- Ensure proper read permissions
- Check server console for error messages

### Missing Data
- Verify Excel has required sheets: "Device Under Test Information" and "Rate vs Range"
- Check column headers (case-insensitive, partial matching supported)
- Look for filtered data notifications (channel=0 or throughput=0)
- Review browser console (F12) for detailed errors

### PDF Downloads Not Working
- Ensure PDF follows naming pattern: `Rate-vs-Range-Report*.pdf`
- Check file exists in same directory as report.xlsx
- Verify read permissions on PDF file

### Font Display Issues
- Berkeley Mono loads if available, falls back to Poppins
- Google Fonts loads automatically for Poppins fallback
- Check browser console for font loading messages
