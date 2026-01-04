import torch
import torch.nn as nn
from torchvision import transforms
from PIL import Image
import os
import json
import numpy as np

# Re-import architectures (simplified for prediction)
from dashboard_classifier import DashboardCNN, DashboardConfig
from train_digital_ocr import DigitalOCRCNN

class DashboardPredictor:
    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        
        # Load Dashboard Model
        self.dash_model = DashboardCNN(num_classes=10).to(self.device)
        if os.path.exists("./models/dashboard_net.pth"):
            self.dash_model.load_state_dict(torch.load("./models/dashboard_net.pth", map_location=self.device))
        self.dash_model.eval()
        
        # Load OCR Model
        if os.path.exists("./models/digital_ocr_classes.json"):
            with open("./models/digital_ocr_classes.json", "r") as f:
                self.ocr_classes = json.load(f)
            self.ocr_model = DigitalOCRCNN(len(self.ocr_classes)).to(self.device)
            if os.path.exists("./models/digital_ocr_net.pth"):
                self.ocr_model.load_state_dict(torch.load("./models/digital_ocr_net.pth", map_location=self.device))
            self.ocr_model.eval()
        else:
            self.ocr_model = None

        # Load Diagnostic Knowledge Base
        if os.path.exists("diagnostic_kb.json"):
            with open("diagnostic_kb.json", "r") as f:
                self.kb = json.load(f)
        else:
            self.kb = {}

    def predict_light(self, image_path):
        transform = transforms.Compose([
            transforms.Resize((64, 64)),
            transforms.ToTensor(),
            transforms.Normalize((0.5, 0.5, 0.5), (0.5, 0.5, 0.5))
        ])
        image = Image.open(image_path).convert('RGB')
        image = transform(image).unsqueeze(0).to(self.device)
        
        with torch.no_grad():
            outputs = self.dash_model(image)
            _, predicted = torch.max(outputs, 1)
            confidence = torch.nn.functional.softmax(outputs, dim=1)[0][predicted].item()
            
        class_name = DashboardConfig.classes[predicted.item()]
        
        # Enrich with diagnostic info
        diag_info = self.kb.get(class_name, {})
        return {
            "light": class_name,
            "confidence": confidence,
            "details": diag_info
        }

    def predict_text(self, image_path):
        if not self.ocr_model:
            return "OCR Model not trained"
            
        # This is a placeholder for actual text region detection.
        # Ideally, we would detect regions with text first.
        # For now, we'll just try to predict the whole image as one char (demonstration).
        transform = transforms.Compose([
            transforms.Resize((32, 32)),
            transforms.ToTensor(),
            transforms.Normalize((0.5,), (0.5,))
        ])
        image = Image.open(image_path).convert('L')
        image = transform(image).unsqueeze(0).to(self.device)
        
        with torch.no_grad():
            outputs = self.ocr_model(image)
            _, predicted = torch.max(outputs, 1)
            
        char = self.ocr_classes[str(predicted.item())]
        return char

if __name__ == "__main__":
    predictor = DashboardPredictor()
    # Test on a provided image if exists
    test_img = "/home/asahiner/.gemini/antigravity/brain/3fcfaf50-740a-43c7-aa0f-4aa1ec070fd0/uploaded_image_1_1766726693943.png"
    if os.path.exists(test_img):
        result = predictor.predict_light(test_img)
        print(f"--- DIAGNOSTIC REPORT ---")
        print(f"Detected Light: {result['light']} ({result['confidence']*100:.2f}% confidence)")
        
        details = result['details']
        if details:
            print(f"Full Name: {details.get('name')}")
            print(f"Severity: {details.get('severity')}")
            print(f"Description: {details.get('description')}")
            print(f"Possible Causes: {', '.join(details.get('causes', []))}")
            print(f"Recommended Action: {details.get('action')}")
        print(f"-------------------------")
