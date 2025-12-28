from PIL import Image
import os

path = "public/icons/dosa.png"
if os.path.exists(path):
    try:
        img = Image.open(path)
        print(f"Original size: {img.size}")
        
        # Resize maintaining aspect ratio
        img.thumbnail((300, 300))
        
        # Save overwrite
        img.save(path, "PNG", optimize=True)
        print(f"Resized to: {img.size}")
        print("Done.")
    except Exception as e:
        print(f"Error: {e}")
else:
    print(f"File not found: {path}")
