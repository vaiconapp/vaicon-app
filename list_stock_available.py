import re
with open("CustomScreen.js", "r") as f:
    text = f.read()

matches = re.finditer(r'const stockAvailable =.*?\}', text, flags=re.DOTALL)
for m in matches:
    print(m.group(0))
