import pandas as pd
import numpy as np
from datetime import datetime
import sys
import os

def create_excel_template(vendor="Adtran", model="SDG-8612", version="25.6.3.1", test_config="5g_2x2_ch44"):
    """
    Create a template Excel file in the expected format for the new WiFi RvR tool structure
    """
    
    # Create directory structure
    base_path = os.path.join("reports", vendor, model, version, test_config)
    os.makedirs(base_path, exist_ok=True)
    
    filename = os.path.join(base_path, "report.xlsx")
    
    # Create Excel writer
    with pd.ExcelWriter(filename, engine='xlsxwriter') as writer:
        
        # 1. Create Summary sheet
        summary_data = {
            'Test': ['Rate vs Range Test'],
            'Result': ['Complete'],
            'Score': ['N/A'],
            'Elapsed': ['00:15:00'],
            'Details': [f'Automated test run for {test_config}']
        }
        summary_df = pd.DataFrame(summary_data)
        summary_df.to_excel(writer, sheet_name='Summary', index=False)
        
        # 2. Create Device Under Test Information sheet
        device_info = {
            'Item': [
                'Name',
                'Software Version',
                'Hardware Version',
                'Model Number',
                'Serial Number',
                'Test Date',
                'Tester'
            ],
            'Value': [
                f'{vendor} {model}',
                version,
                'Rev A',
                model,
                'SN123456',
                datetime.now().strftime('%Y-%m-%d'),
                'Test Engineer'
            ]
        }
        device_df = pd.DataFrame(device_info)
        device_df.to_excel(writer, sheet_name='Device Under Test Information', index=False)
        
        # 3. Create Rate vs Range data sheet
        # Parse test config to extract parameters
        test_params = parse_test_config(test_config)
        
        # Generate sample test data based on test configuration
        attenuations = list(range(0, 61, 3))  # 0 to 60 dB in 3 dB steps
        
        rvr_data = []
        
        # Add header rows
        rvr_data.append(['Test Case Description', '', '', '', '', '', '', '', '', '', '', '', '', ''])
        rvr_data.append([f'Rate vs Range Loop: 1 - {test_config}\nDownstream port: 1.1.18 wlan2 with OS: Linux', '', '', '', '', '', '', '', '', '', '', '', '', ''])
        rvr_data.append(['', '', '', '', '', '', '', '', '', '', '', '', '', ''])
        rvr_data.append(['', '', '', '', '', '', '', '', '', '', '', '', '', ''])
        rvr_data.append(['', '', '', '', '', '', '', '', '', '', '', '', '', ''])
        
        # Add column headers
        headers = [
            'Test Band Configuration',
            'STA Reported',
            'Throughput (Mbps)',
            'Direction',
            'Type',
            'Payload Size',
            'Channel',
            'Frequency',
            'NSS',
            'BW',
            'Security',
            'Angle',
            'Attenuation',
            'Tilt',
            'Tx Mode'
        ]
        rvr_data.append(headers)
        rvr_data.append(['', '', '', '', '', '', '', '', '', '', '', '', '', ''])  # Empty row
        
        # Generate test data for both TX and RX directions
        for direction in ['DUT-TX', 'DUT-RX']:
            for att in attenuations:
                # Simulate realistic throughput degradation
                base_throughput = test_params['max_throughput']
                if direction == 'DUT-RX':
                    base_throughput *= 0.98  # Slightly lower for RX
                
                # Apply attenuation effect
                if att <= 15:
                    throughput = base_throughput - (att * 2)
                elif att <= 30:
                    throughput = base_throughput - 30 - ((att - 15) * 20)
                elif att <= 45:
                    throughput = max(50, base_throughput - 330 - ((att - 30) * 30))
                else:
                    throughput = max(0, 50 - ((att - 45) * 10))
                
                # Add some random variation
                throughput = int(throughput + np.random.normal(0, 10))
                throughput = max(0, throughput)
                
                # Simulate RSSI
                rssi = -40 - att
                
                # Create row
                row = [
                    'AUTO',
                    f'STA-RSSI Data/Beacon: {rssi}/{rssi+5} Rx-Rate: 1.201G Tx-Rate: 1.201G',
                    throughput,
                    direction,
                    'TCP',
                    'MTU',
                    test_params['channel'],
                    test_params['frequency'],
                    test_params['nss'],
                    test_params['bandwidth'],
                    'WPA3',
                    'NA',
                    float(att),
                    'NA',
                    'HE' if throughput > 10 else 'OFDM'
                ]
                rvr_data.append(row)
        
        # Convert to DataFrame
        rvr_df = pd.DataFrame(rvr_data)
        rvr_df.to_excel(writer, sheet_name='Rate vs Range 1', index=False, header=False)
        
        # 4. Create Testbed Information sheet
        testbed_info = {
            'Item': [
                'Current Date',
                'Testbed Manufacturer',
                'Build Date',
                'Modes',
                'Test Environment',
                'Temperature',
                'Humidity'
            ],
            'Value': [
                datetime.now().strftime('%a %b %d %H:%M:%S %Z %Y'),
                'Test Equipment Vendor',
                datetime.now().strftime('%a %b %d %I:%M:%S %p %Z %Y'),
                'AUTO',
                'RF Chamber',
                '23°C',
                '45%'
            ]
        }
        testbed_df = pd.DataFrame(testbed_info)
        testbed_df.to_excel(writer, sheet_name='Testbed Information', index=False)
        
        # Get the workbook and worksheets
        workbook = writer.book
        
        # Format the sheets
        for sheet_name in writer.sheets:
            worksheet = writer.sheets[sheet_name]
            worksheet.set_column('A:B', 25)  # Set column width
            worksheet.set_column('C:O', 15)
    
    print(f"Excel template created: {filename}")
    print(f"Test configuration: {test_config}")
    print(f"Parameters: {test_params}")
    return filename

def parse_test_config(test_config):
    """
    Parse test configuration string to extract parameters
    Examples: 5g_2x2_ch44, 2g_1x1_ch6, 6g_4x4_ch37
    """
    parts = test_config.lower().split('_')
    params = {
        'max_throughput': 1000,
        'bandwidth': 80,
        'nss': 2,
        'channel': 44,
        'frequency': 5220
    }
    
    for part in parts:
        if part.startswith('ch'):
            # Extract channel number
            channel = int(part[2:])
            params['channel'] = channel
            
            # Calculate frequency from channel
            if channel <= 14:  # 2.4 GHz
                params['frequency'] = 2412 + (channel - 1) * 5
                params['max_throughput'] = 200  # Lower for 2.4GHz
                params['bandwidth'] = 20
            elif channel >= 36 and channel <= 64:  # 5 GHz low
                params['frequency'] = 5180 + (channel - 36) * 5
            elif channel >= 100 and channel <= 144:  # 5 GHz mid
                params['frequency'] = 5500 + (channel - 100) * 5
            elif channel >= 149 and channel <= 165:  # 5 GHz high
                params['frequency'] = 5745 + (channel - 149) * 5
            elif channel >= 1 and channel <= 233:  # 6 GHz
                params['frequency'] = 5955 + (channel - 1) * 5
                params['max_throughput'] = 1200  # Higher for 6GHz
                params['bandwidth'] = 160
        
        elif 'x' in part:
            # Extract spatial streams (e.g., 2x2, 4x4)
            nss = int(part.split('x')[0])
            params['nss'] = nss
            params['max_throughput'] = min(params['max_throughput'] * nss / 2, 2000)
        
        elif part.startswith('2g'):
            params['max_throughput'] = 200
            params['bandwidth'] = 20
        elif part.startswith('5g'):
            params['max_throughput'] = 1000
            params['bandwidth'] = 80
        elif part.startswith('6g'):
            params['max_throughput'] = 1200
            params['bandwidth'] = 160
    
    return params

def create_multiple_test_configs(vendor="Adtran", model="SDG-8612", version="25.6.3.1"):
    """
    Create multiple test configuration templates for a device
    """
    test_configs = [
        "5g_2x2_ch44",
        "5g_2x2_ch149", 
        "2g_2x2_ch6",
        "5g_4x4_ch44",
        "5g_4x4_ch149",
        "6g_2x2_ch37"
    ]
    
    created_files = []
    
    for test_config in test_configs:
        try:
            filename = create_excel_template(vendor, model, version, test_config)
            created_files.append(filename)
        except Exception as e:
            print(f"Error creating {test_config}: {e}")
    
    print(f"\nCreated {len(created_files)} test configuration templates:")
    for f in created_files:
        print(f"  {f}")
    
    return created_files

def create_device_comparison_example():
    """
    Create example data for multiple devices to demonstrate comparison functionality
    """
    devices = [
        ("Adtran", "SDG-8612", "25.6.3.1"),
        ("Adtran", "SDG-8612", "25.6.4.0"),
        ("Eero", "Max7", "1.2.3"),
        ("Netgear", "RAX80", "3.0.1.4")
    ]
    
    common_test_configs = ["5g_2x2_ch44", "5g_2x2_ch149"]
    
    print("Creating device comparison example...")
    
    for vendor, model, version in devices:
        print(f"\nCreating templates for {vendor} {model} v{version}...")
        for test_config in common_test_configs:
            create_excel_template(vendor, model, version, test_config)
    
    print("\nExample comparison structure created!")
    print("All devices have common test configurations for easy comparison.")

def create_directory_structure_only():
    """
    Create just the directory structure without Excel files
    """
    base_structure = [
        ("Adtran", "SDG-8612", ["25.6.3.1", "25.6.4.0"], ["5g_2x2_ch44", "5g_2x2_ch149", "2g_2x2_ch6"]),
        ("Eero", "Max7", ["1.2.3", "1.3.0"], ["5g_4x4_ch44", "5g_4x4_ch149"]),
        ("Netgear", "RAX80", ["3.0.1.4", "3.0.2.0"], ["5g_4x4_ch44", "5g_4x4_ch149"])
    ]
    
    for vendor, model, versions, test_configs in base_structure:
        for version in versions:
            for test_config in test_configs:
                dir_path = os.path.join("reports", vendor, model, version, test_config)
                os.makedirs(dir_path, exist_ok=True)
                print(f"Created directory: {dir_path}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        command = sys.argv[1]
        
        if command == '--multiple':
            create_multiple_test_configs()
        elif command == '--comparison':
            create_device_comparison_example()
        elif command == '--structure':
            create_directory_structure_only()
        elif command == '--custom':
            if len(sys.argv) >= 6:
                vendor = sys.argv[2]
                model = sys.argv[3] 
                version = sys.argv[4]
                test_config = sys.argv[5]
                create_excel_template(vendor, model, version, test_config)
            else:
                print("Usage: python script.py --custom <vendor> <model> <version> <test_config>")
                print("Example: python script.py --custom Adtran SDG-8612 25.6.3.1 5g_2x2_ch44")
        else:
            print("Unknown command. Available options:")
            print("  --multiple    : Create multiple test configs for default device")
            print("  --comparison  : Create comparison example with multiple devices")
            print("  --structure   : Create directory structure only")
            print("  --custom      : Create custom template")
    else:
        # Default: create single template
        create_excel_template()
        print("\nTip: Run with different flags to create multiple templates:")
        print("  --multiple    : Create multiple test configurations")
        print("  --comparison  : Create multi-device comparison example")
        print("  --structure   : Create directory structure only")
        print("  --custom      : Create custom template")