import re
with open("CustomScreen.js", "r") as f:
    text = f.read()

# Only removing pure console.log that are unnecessary. The ones we just added in catch(console.error) are actually good for debugging fetches, but let's see if there are standard console.logs.
matches = re.finditer(r'console\.log\(.*?\);?', text)
for m in matches:
    print(m.group(0))

text = re.sub(r'console\.log\(.*?\);?', '', text)
with open("CustomScreen.js", "w") as f:
    f.write(text)
