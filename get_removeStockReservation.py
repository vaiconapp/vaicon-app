import re
with open("CustomScreen.js", "r") as f:
    text = f.read()

match = re.search(r'const removeStockReservation = async.*?\{.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\n.*?\}', text, flags=re.DOTALL)
if match:
    print(match.group(0))
