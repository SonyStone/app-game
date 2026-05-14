import sys

file_path = 'packages/typegpu-examples/4-webgpu-storage-buffers/index.tsx'
with open(file_path, 'r') as f:
    lines = f.readlines()

new_lines = []
skip = 0
for i, line in enumerate(lines):
    if skip > 0:
        skip -= 1
        continue
    
    # 4. Create storage buffer for one bind group
    if 'const ourStruct = root' in line and '.createBuffer(' in lines[i+1]:
        new_lines.append(line)
        new_lines.append('    .createBuffer(ourStructShema(1000))\n')
        new_lines.append("    .$usage('storage');\n")
        
        # Extract initial data
        data_lines = []
        j = i + 2
        while j < len(lines) and '    )' not in lines[j]:
            data_lines.append(lines[j])
            j += 1
        
        data_str = "".join(data_lines).strip()
        if data_str.endswith(','):
             data_str = data_str[:-1]
             
        new_lines.append(f'  ourStruct.write({data_str});\n')
        skip = j - i + 1 # skip until usage
        if skip < len(lines) and '.$usage' in lines[j+1]:
             skip += 1
        continue

    new_lines.append(line)

with open(file_path, 'w') as f:
    f.writelines(new_lines)
