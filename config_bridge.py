"""Small YAML bridge for the Electron main process. Requires PyYAML."""
import json
import sys
import yaml

operation, filename = sys.argv[1:3]
if operation == 'read':
    with open(filename, encoding='utf-8') as stream:
        print(json.dumps(yaml.safe_load(stream) or {}))
elif operation == 'write':
    data = json.load(sys.stdin)
    with open(filename, 'w', encoding='utf-8') as stream:
        yaml.safe_dump(data, stream, sort_keys=False, allow_unicode=True)
else:
    raise ValueError('Unsupported operation')
