with open("CustomScreen.js", "r") as f:
    text = f.read()

# Let's see how removeStockReservation looks
import re
match = re.search(r'const removeStockReservation = async.*?\{.*?\};', text, flags=re.DOTALL)
if match:
    print(match.group(0))
