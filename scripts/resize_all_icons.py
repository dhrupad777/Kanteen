from PIL import Image
import os

icons_dir = "public/icons"
max_size = (300, 300)

for filename in os.listdir(icons_dir):
    if filename.endswith('.png'):
        filepath = os.path.join(icons_dir, filename)
        try:
            img = Image.open(filepath)
            original_size = img.size
            file_size = os.path.getsize(filepath)
            
            # Only resize if larger than 100KB
            if file_size > 100000:
                img.thumbnail(max_size)
                img.save(filepath, "PNG", optimize=True)
                new_size = os.path.getsize(filepath)
                print(f"✅ {filename}: {original_size} -> {img.size} ({file_size//1024}KB -> {new_size//1024}KB)")
            else:
                print(f"⏭️  {filename}: Already optimized ({file_size//1024}KB)")
        except Exception as e:
            print(f"❌ {filename}: Error - {e}")

print("\nDone resizing all icons!")
