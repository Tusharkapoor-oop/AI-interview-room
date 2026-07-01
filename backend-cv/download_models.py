import os
import urllib.request

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(MODELS_DIR, exist_ok=True)

FACE_LANDMARKER_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
HAND_LANDMARKER_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"

def download_file(url, filename):
    filepath = os.path.join(MODELS_DIR, filename)
    if os.path.exists(filepath):
        print(f"{filename} already exists, skipping download.")
        return filepath
    print(f"Downloading {filename} from {url}...")
    urllib.request.urlretrieve(url, filepath)
    print(f"Downloaded {filename} to {filepath}.")
    return filepath

if __name__ == "__main__":
    download_file(FACE_LANDMARKER_URL, "face_landmarker.task")
    download_file(HAND_LANDMARKER_URL, "hand_landmarker.task")
