import os
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

models_dir = os.path.join(os.path.dirname(__file__), "models")
face_path = os.path.join(models_dir, "face_landmarker.task")
hand_path = os.path.join(models_dir, "hand_landmarker.task")

print("Initializing FaceLandmarker...")
face_options = vision.FaceLandmarkerOptions(
    base_options=python.BaseOptions(model_asset_path=face_path),
    output_face_blendshapes=True,
    num_faces=1
)
face_landmarker = vision.FaceLandmarker.create_from_options(face_options)
print("FaceLandmarker initialized successfully!")

print("Initializing HandLandmarker...")
hand_options = vision.HandLandmarkerOptions(
    base_options=python.BaseOptions(model_asset_path=hand_path),
    num_hands=2
)
hand_landmarker = vision.HandLandmarker.create_from_options(hand_options)
print("HandLandmarker initialized successfully!")

# Let's clean up
face_landmarker.close()
hand_landmarker.close()
print("All cleaned up.")
