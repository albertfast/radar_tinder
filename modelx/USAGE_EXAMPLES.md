# Usage Examples

## Table of Contents
1. [Quick Start](#quick-start)
2. [Python Inference](#python-inference)
3. [ONNX Inference](#onnx-inference)
4. [Mobile Deployment](#mobile-deployment)
5. [Batch Processing](#batch-processing)
6. [Training Custom Model](#training-custom-model)

---

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Run Inference

```bash
cd inference
python predict.py --image path/to/warning_light.jpg
```

**Output**:
```
Using device: cuda
Loaded 68 classes
✅ Model loaded from ../model/best_epoch_57_acc_96.58.pth
   Epoch: 57, Val Acc: 96.58%

Predicting: path/to/warning_light.jpg
============================================================
1. check_engine                    98.75%
2. tire_pressure                    0.82%
3. oil_pressure                     0.31%
============================================================
```

---

## Python Inference

### Single Image Prediction

```python
import sys
sys.path.insert(0, 'model')
from model_architecture import WarningLightsResNet50
import torch
from PIL import Image
from torchvision import transforms
import torch.nn.functional as F
import json

# Load model
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
model = WarningLightsResNet50(num_classes=68, pretrained=False)
checkpoint = torch.load('model/best_epoch_57_acc_96.58.pth', map_location=device)
model.load_state_dict(checkpoint['model_state_dict'])
model = model.to(device)
model.eval()

# Load classes
with open('classes/warning_light_classes.json', 'r') as f:
    classes = json.load(f)

# Preprocessing
transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])

# Load and predict
image = Image.open('path/to/image.jpg').convert('RGB')
image_tensor = transform(image).unsqueeze(0).to(device)

with torch.no_grad():
    outputs = model(image_tensor)
    probabilities = F.softmax(outputs, dim=1)
    top_prob, top_idx = torch.max(probabilities, 1)

predicted_class = classes[top_idx.item()]
confidence = top_prob.item() * 100

print(f"Prediction: {predicted_class} ({confidence:.2f}%)")
```

### Using the Classifier Wrapper

```python
import sys
sys.path.insert(0, 'inference')
from predict import WarningLightClassifier

# Initialize
classifier = WarningLightClassifier(
    checkpoint_path='model/best_epoch_57_acc_96.58.pth',
    classes_path='classes/warning_light_classes.json'
)

# Single prediction
results = classifier.predict('image.jpg', top_k=3)
for class_name, confidence in results:
    print(f"{class_name}: {confidence:.2f}%")
```

---

## ONNX Inference

### Export to ONNX

```bash
cd inference
python export_onnx.py \
    --checkpoint ../model/best_epoch_57_acc_96.58.pth \
    --output ../model/warning_lights_resnet50.onnx \
    --num-classes 68
```

### Use ONNX with onnxruntime

```python
import onnxruntime as ort
import numpy as np
from PIL import Image
import json

# Load ONNX model
session = ort.InferenceSession('model/warning_lights_resnet50.onnx')

# Load classes
with open('classes/warning_light_classes.json', 'r') as f:
    classes = json.load(f)

# Preprocessing
def preprocess_image(image_path):
    from torchvision import transforms
    
    transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225]
        )
    ])
    
    image = Image.open(image_path).convert('RGB')
    image_tensor = transform(image)
    return image_tensor.unsqueeze(0).numpy()

# Inference
input_name = session.get_inputs()[0].name
output_name = session.get_outputs()[0].name

image_array = preprocess_image('image.jpg')
outputs = session.run([output_name], {input_name: image_array})

# Get prediction
logits = outputs[0][0]
probabilities = np.exp(logits) / np.sum(np.exp(logits))  # Softmax
top_idx = np.argmax(probabilities)

print(f"Prediction: {classes[top_idx]} ({probabilities[top_idx]*100:.2f}%)")
```

---

## Mobile Deployment

### React Native with TensorFlow.js

**1. Convert ONNX to TensorFlow.js**

```bash
# Install converter
pip install tensorflowjs

# Convert
tensorflowjs_converter \
    --input_format=onnx \
    --output_format=tfjs_graph_model \
    model/warning_lights_resnet50.onnx \
    model/tfjs_model
```

**2. Load Model in React Native**

```javascript
import * as tf from '@tensorflow/tfjs';
import { fetch } from '@tensorflow/tfjs-react-native';

// Load model
const model = await tf.loadGraphModel('path/to/tfjs_model/model.json');

// Preprocessing function (CRITICAL!)
function preprocessImage(imageData) {
    // Resize to 224x224 (use react-native-image-resizer)
    // Convert to tensor
    let tensor = tf.browser.fromPixels(imageData);
    
    // Resize if needed
    tensor = tf.image.resizeBilinear(tensor, [224, 224]);
    
    // Normalize to [0, 1]
    tensor = tensor.div(255.0);
    
    // ImageNet normalization (THIS IS CRITICAL!)
    const mean = tf.tensor1d([0.485, 0.456, 0.406]);
    const std = tf.tensor1d([0.229, 0.224, 0.225]);
    
    tensor = tensor.sub(mean).div(std);
    
    // Add batch dimension
    tensor = tensor.expandDims(0);
    
    return tensor;
}

// Inference
async function predictWarningLight(imageUri) {
    // Load image (use expo-image-picker or react-native-fs)
    const imageData = await loadImage(imageUri);
    
    // Preprocess
    const inputTensor = preprocessImage(imageData);
    
    // Predict
    const predictions = await model.predict(inputTensor);
    
    // Get probabilities
    const probabilities = await predictions.softmax().data();
    
    // Get top class
    const topClassIdx = probabilities.indexOf(Math.max(...probabilities));
    const confidence = probabilities[topClassIdx] * 100;
    
    console.log(`Prediction: ${CLASS_NAMES[topClassIdx]} (${confidence.toFixed(2)}%)`);
    
    return {
        class: CLASS_NAMES[topClassIdx],
        confidence: confidence
    };
}
```

**⚠️ Common Mobile Deployment Issues**:

1. **Low Confidence (<1%)**:
   - **Cause**: Missing ImageNet normalization
   - **Fix**: Apply `(pixel/255 - mean) / std` preprocessing

2. **Wrong Predictions**:
   - **Cause**: Incorrect class order
   - **Fix**: Use exact same class order as `warning_light_classes.json`

3. **Expo Go Compatibility**:
   - ❌ ONNX Runtime NOT supported
   - ✅ TensorFlow.js works with Expo Go
   - ✅ Or use Expo Dev Client with ONNX Runtime

---

## Batch Processing

### Process Multiple Images

```python
import sys
sys.path.insert(0, 'inference')
from predict import WarningLightClassifier
import glob

# Initialize classifier
classifier = WarningLightClassifier(
    checkpoint_path='model/best_epoch_57_acc_96.58.pth',
    classes_path='classes/warning_light_classes.json'
)

# Get all images
image_paths = glob.glob('test_images/*.jpg')

# Batch predict
results = classifier.predict_batch(image_paths)

# Print results
for img_path, predictions in results.items():
    print(f"\n{img_path}:")
    for class_name, confidence in predictions[:3]:
        print(f"  {class_name}: {confidence:.2f}%")
```

### Save Results to CSV

```python
import csv

with open('predictions.csv', 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['Image', 'Predicted Class', 'Confidence (%)'])
    
    for img_path, predictions in results.items():
        class_name, confidence = predictions[0]
        writer.writerow([img_path, class_name, f"{confidence:.2f}"])

print("✅ Results saved to predictions.csv")
```

---

## Training Custom Model

### Prepare Your Dataset

Organize images in this structure:

```
dataset/
├── train/
│   ├── class1/
│   │   ├── img1.jpg
│   │   └── img2.jpg
│   ├── class2/
│   │   └── ...
│   └── ...
├── val/
│   └── ...
└── test/
    └── ...
```

### Update Configuration

Edit `training/train_model.py`:

```python
class TrainingConfig:
    TRAIN_DIR = "path/to/dataset/train"
    VAL_DIR = "path/to/dataset/val"
    TEST_DIR = "path/to/dataset/test"
    
    NUM_CLASSES = 68  # Update if different
    BATCH_SIZE = 64   # Reduce if GPU memory error
    LEARNING_RATE = 0.001
```

### Run Training

```bash
cd training
python train_model.py
```

**Output**:
```
Loading datasets...
Train samples: 2484
Val samples: 438
Number of classes: 68

Initializing model...
Total parameters: 24,593,028
Device: cuda

Starting training for 100 epochs...
======================================================================
Epoch [1/100] (12.3s) | Train Loss: 3.8234, Acc: 15.23% | Val Loss: 3.2156, Acc: 22.41%
Epoch [2/100] (12.1s) | Train Loss: 2.9847, Acc: 28.67% | Val Loss: 2.5432, Acc: 35.62%
...
Epoch [57/100] (11.8s) | Train Loss: 0.0089, Acc: 99.84% | Val Loss: 0.1234, Acc: 96.58%
  ✅ New best model saved! Val Acc: 96.58%
...
```

### Monitor Training

Training curves and metrics saved to:
- `output/training_curves_YYYYMMDD_HHMMSS.png`
- `output/training_report_YYYYMMDD_HHMMSS.json`

---

## Advanced: Custom Preprocessing

### For Different Image Sizes

If your images are not 224×224:

```python
# Option 1: Resize (may distort)
transform = transforms.Compose([
    transforms.Resize((224, 224)),
    # ...
])

# Option 2: Center crop (may lose context)
transform = transforms.Compose([
    transforms.Resize(256),
    transforms.CenterCrop(224),
    # ...
])

# Option 3: Pad to square then resize (preserves aspect ratio)
def pad_to_square(image):
    width, height = image.size
    max_dim = max(width, height)
    new_image = Image.new('RGB', (max_dim, max_dim), (0, 0, 0))
    new_image.paste(image, ((max_dim - width) // 2, (max_dim - height) // 2))
    return new_image

transform = transforms.Compose([
    transforms.Lambda(pad_to_square),
    transforms.Resize((224, 224)),
    # ...
])
```

---

## Troubleshooting

### Issue: "RuntimeError: CUDA out of memory"

**Solution**: Reduce batch size

```python
BATCH_SIZE = 32  # or 16
```

### Issue: "ImportError: No module named 'onnx'"

**Solution**: Install dependencies

```bash
pip install -r requirements.txt
```

### Issue: Model predictions are random

**Check**:
1. ImageNet normalization applied? ✅
2. Correct class order? ✅
3. Image in RGB format? ✅
4. Input size 224×224? ✅

---

## Performance Benchmarks

### Inference Speed

| Device | Framework | Batch Size | Speed (ms/image) |
|--------|-----------|------------|------------------|
| GTX 1070 | PyTorch | 1 | 12 ms |
| GTX 1070 | PyTorch | 64 | 3 ms |
| GTX 1070 | ONNX Runtime | 1 | 8 ms |
| CPU (i7-9700K) | PyTorch | 1 | 45 ms |
| CPU (i7-9700K) | ONNX Runtime | 1 | 32 ms |
| iPhone 13 Pro | TensorFlow.js | 1 | ~100 ms |

### Memory Usage

| Component | GPU Memory | RAM |
|-----------|------------|-----|
| Model | 380 MB | 94 MB |
| Batch (64) | 1.2 GB | 200 MB |
| Total (training) | ~2.5 GB | ~1 GB |

---

## FAQ

**Q: Can I use this model for other vehicle-related tasks?**  
A: Yes, but fine-tuning recommended. The backbone is general-purpose.

**Q: How do I add new warning light classes?**  
A: Retrain with updated dataset. Update `NUM_CLASSES` in config.

**Q: Is the model production-ready?**  
A: Yes, 94.31% test accuracy is suitable for most applications. For safety-critical systems, consider ensemble methods or human-in-the-loop.

**Q: Can I deploy on mobile without internet?**  
A: Yes! Both ONNX and TensorFlow.js models run locally.

---

**Need Help?**  
Open an issue or contact: your.email@example.com
