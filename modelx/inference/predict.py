"""
Inference script for Vehicle Warning Lights Classifier
Simple to use: python predict.py --image path/to/image.jpg
"""

import os
import sys
import json
import argparse
import torch
import torch.nn.functional as F
from torchvision import transforms
from PIL import Image

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'model'))
from model_architecture import WarningLightsResNet50


class WarningLightClassifier:
    """Easy-to-use classifier wrapper"""
    
    def __init__(self, checkpoint_path, classes_path, device=None):
        """
        Initialize classifier
        
        Args:
            checkpoint_path (str): Path to .pth checkpoint file
            classes_path (str): Path to classes JSON file
            device (str): 'cuda' or 'cpu' (auto-detected if None)
        """
        # Device setup
        if device is None:
            self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        else:
            self.device = torch.device(device)
        
        print(f"Using device: {self.device}")
        
        # Load class names
        with open(classes_path, 'r') as f:
            self.classes = json.load(f)
        
        num_classes = len(self.classes)
        print(f"Loaded {num_classes} classes")
        
        # Load model
        self.model = WarningLightsResNet50(
            num_classes=num_classes,
            dropout_rate=0.3,
            pretrained=False
        )
        
        checkpoint = torch.load(checkpoint_path, map_location=self.device)
        self.model.load_state_dict(checkpoint['model_state_dict'])
        self.model = self.model.to(self.device)
        self.model.eval()
        
        print(f"✅ Model loaded from {checkpoint_path}")
        if 'epoch' in checkpoint:
            print(f"   Epoch: {checkpoint['epoch']}, Val Acc: {checkpoint.get('val_acc', 'N/A'):.2f}%")
        
        # Image preprocessing
        self.transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],  # ImageNet stats
                std=[0.229, 0.224, 0.225]
            )
        ])
    
    def predict(self, image_path, top_k=3):
        """
        Predict warning light class from image
        
        Args:
            image_path (str): Path to image file
            top_k (int): Return top K predictions
        
        Returns:
            list: [(class_name, confidence), ...] sorted by confidence
        """
        # Load and preprocess image
        image = Image.open(image_path).convert('RGB')
        image_tensor = self.transform(image).unsqueeze(0).to(self.device)
        
        # Inference
        with torch.no_grad():
            outputs = self.model(image_tensor)
            probabilities = F.softmax(outputs, dim=1)
        
        # Get top K predictions
        top_probs, top_indices = torch.topk(probabilities, top_k, dim=1)
        top_probs = top_probs.cpu().numpy()[0]
        top_indices = top_indices.cpu().numpy()[0]
        
        # Format results
        results = [
            (self.classes[idx], float(prob) * 100)
            for idx, prob in zip(top_indices, top_probs)
        ]
        
        return results
    
    def predict_batch(self, image_paths):
        """
        Predict multiple images
        
        Args:
            image_paths (list): List of image paths
        
        Returns:
            dict: {image_path: [(class, confidence), ...]}
        """
        results = {}
        for img_path in image_paths:
            results[img_path] = self.predict(img_path, top_k=3)
        return results


def main():
    parser = argparse.ArgumentParser(
        description="Predict vehicle warning light class from image"
    )
    parser.add_argument(
        '--image', '-i',
        type=str,
        required=True,
        help='Path to input image'
    )
    parser.add_argument(
        '--checkpoint', '-c',
        type=str,
        default='../model/best_epoch_57_acc_96.58.pth',
        help='Path to model checkpoint'
    )
    parser.add_argument(
        '--classes', '-cls',
        type=str,
        default='../classes/warning_light_classes.json',
        help='Path to classes JSON'
    )
    parser.add_argument(
        '--top-k', '-k',
        type=int,
        default=3,
        help='Show top K predictions'
    )
    
    args = parser.parse_args()
    
    # Validate paths
    if not os.path.exists(args.image):
        print(f"❌ Error: Image not found: {args.image}")
        return
    
    if not os.path.exists(args.checkpoint):
        print(f"❌ Error: Checkpoint not found: {args.checkpoint}")
        return
    
    if not os.path.exists(args.classes):
        print(f"❌ Error: Classes file not found: {args.classes}")
        return
    
    # Initialize classifier
    classifier = WarningLightClassifier(
        checkpoint_path=args.checkpoint,
        classes_path=args.classes
    )
    
    # Predict
    print(f"\nPredicting: {args.image}")
    print("=" * 60)
    
    results = classifier.predict(args.image, top_k=args.top_k)
    
    for i, (class_name, confidence) in enumerate(results, 1):
        print(f"{i}. {class_name:<30} {confidence:6.2f}%")
    
    print("=" * 60)


if __name__ == "__main__":
    main()
