# Vehicle Warning Lights Classifier - ONNX Model

High-accuracy ResNet50 model for classifying 68 types of vehicle dashboard warning lights.

## 📊 Model Specifications

| Property | Value |
|----------|-------|
| **Architecture** | ResNet50 with custom classifier |
| **Parameters** | 24.6M |
| **Input Size** | 224×224 RGB |
| **Output Classes** | 68 warning light types |
| **Validation Accuracy** | 96.58% |
| **Test Accuracy** | 94.31% |
| **Format** | ONNX (opset 12) |
| **File Size** | 93.7 MB |

## 📁 Files

```
models/onnx/
├── warning_lights_resnet50.onnx     # ONNX model
├── warning_lights_classes.json      # Class names and metadata
└── README.md                         # This file

models/roboflow_resnet50/best/
└── best_epoch_57_acc_96.58.pth      # Original PyTorch checkpoint

warning_lights_model.py              # Model architecture
export_to_onnx.py                    # Export script
predict_warning_lights.py            # PyTorch inference
```

## 🚀 Quick Start

### Python (ONNX Runtime)

```python
import onnxruntime as ort
import numpy as np
from PIL import Image
import json

# Load model
session = ort.InferenceSession("models/onnx/warning_lights_resnet50.onnx")

# Load classes
with open("models/onnx/warning_lights_classes.json") as f:
    metadata = json.load(f)
    classes = metadata['classes']

# Preprocess image
img = Image.open("warning_light.jpg").resize((224, 224))
img_array = np.array(img).astype(np.float32) / 255.0

# Normalize (ImageNet stats)
mean = np.array([0.485, 0.456, 0.406])
std = np.array([0.229, 0.224, 0.225])
img_array = (img_array - mean) / std

# CHW format
img_array = np.transpose(img_array, (2, 0, 1))
img_array = np.expand_dims(img_array, 0)

# Inference
outputs = session.run(None, {'input': img_array})[0]

# Get prediction
pred_idx = np.argmax(outputs[0])
confidence = np.exp(outputs[0][pred_idx]) / np.sum(np.exp(outputs[0]))

print(f"Predicted: {classes[pred_idx]} ({confidence*100:.2f}%)")
```

### JavaScript (ONNX.js / React Native)

```javascript
const ort = require('onnxruntime-node'); // or onnxruntime-react-native
const fs = require('fs');

// Load model
const session = await ort.InferenceSession.create(
  'models/onnx/warning_lights_resnet50.onnx'
);

// Load classes
const metadata = JSON.parse(
  fs.readFileSync('models/onnx/warning_lights_classes.json')
);

// Preprocess image (assume preprocessImage returns Float32Array)
const inputTensor = new ort.Tensor(
  'float32',
  preprocessedImageData,
  [1, 3, 224, 224]
);

// Inference
const outputs = await session.run({ input: inputTensor });
const predictions = outputs.output.data;

// Get top prediction
const maxIdx = predictions.indexOf(Math.max(...predictions));
console.log(`Predicted: ${metadata.classes[maxIdx]}`);
```

## 📱 Mobile Deployment

### React Native (Expo)

**Note:** ONNX Runtime requires development client or standalone build:

```bash
# Development client (not Expo Go)
expo run:android
# or
expo run:ios

# Standalone build
eas build --platform android
```

Install dependencies:
```bash
npm install onnxruntime-react-native
```

### Android (Java/Kotlin)

```kotlin
import ai.onnxruntime.*

val env = OrtEnvironment.getEnvironment()
val session = env.createSession("warning_lights_resnet50.onnx")

// Preprocess and run inference
val inputTensor = OnnxTensor.createTensor(env, inputData)
val results = session.run(mapOf("input" to inputTensor))
```

## 🎯 68 Warning Light Classes

<details>
<summary>Click to expand full class list</summary>

1. ABS
2. AWD
3. Airbag
4. Battery
5. Blindspot
6. Collision_Warning
7. Diff_lock
8. EP_Steering
9. Electronic_Throttle
10. Fuel
11. Glow_Plug
12. Hold
13. Maintenance
14. Warning
15. Windshield_Fault
16. all_wheel
17. beam
18. brake
19. brake_assist
20. check_engine
21. coolant
22. cruise
23. diesel_filter
24. drivetrain trouble indicators --
25. ebd
26. economy_mode
27. economy_mode2
28. electric_park_brake
29. electronic_power
30. electronic_stability
31. engine_temperature
32. esp
33. ev
34. exhaust_particulate_filter
35. fan
36. fog
37. frost_mode
38. headlamb_levelling
39. hill_holder
40. hybrid_ready
41. key_fob
42. lamb_out
43. lane_departure
44. low_beam
45. low_brake
46. low_speed
47. message
48. oil_pressure
49. open_door
50. park_assist
51. park_lamb
52. passive_speed
53. pcs
54. rear_window
55. seatbelt
56. security
57. shift_lock
58. slip
59. srs
60. stability_control
61. start_stop
62. suspension
63. tire_pressure
64. traction_control
65. transmission
66. unknown
67. washer
68. water_fuel

</details>

## 🔧 Model Architecture

```
Input (1, 3, 224, 224)
    ↓
ResNet50 Backbone (pretrained on ImageNet)
    ↓
Dropout(0.3)
    ↓
Linear(2048 → 512)
    ↓
ReLU
    ↓
BatchNorm1d(512)
    ↓
Dropout(0.15)
    ↓
Linear(512 → 68)
    ↓
Output (1, 68) logits
```

## 📈 Training Details

- **Dataset:** Roboflow Dashboard Warning Lights (real dashboard photos)
- **Training Samples:** 2,484 images
- **Validation Samples:** 438 images
- **Test Samples:** 2,093 images
- **Total:** 5,015 real images
- **Source:** YOLO detection bounding boxes cropped from dashboard photos
- **Epochs:** 77 (early stopped from 100)
- **Best Epoch:** 57
- **Optimizer:** AdamW (lr=0.001, weight_decay=1e-4)
- **Scheduler:** Cosine Annealing
- **Data Augmentation:** Random crop, flip, rotation, color jitter
- **Label Smoothing:** 0.1
- **Training Time:** ~30 minutes (GTX 1070)

## 🎓 Performance Comparison

| Dataset Type | Model | Accuracy | Notes |
|--------------|-------|----------|-------|
| Synthetic (geometric shapes) | CustomCNN | 51% | Underfitting |
| Synthetic (enhanced) | ResNet50 | 51% | Still insufficient |
| **Real (Roboflow)** | **ResNet50** | **94%** | **+43% improvement!** |

**Key Insight:** Dataset quality >> Model size

## 🔄 Re-export Model

If you need to modify the model or re-export:

```bash
cd /home/asahiner/Projects/reinforcement_q_learning/src/open_avenues
source ../../.venv/bin/activate
python export_to_onnx.py
```

## 📝 Preprocessing Requirements

**Critical:** Input images must be preprocessed exactly as follows:

1. **Resize:** 224×224
2. **Normalize:** RGB values ÷ 255.0
3. **ImageNet normalization:**
   - Mean: [0.485, 0.456, 0.406]
   - Std: [0.229, 0.224, 0.225]
4. **Channel order:** CHW (not HWC)
5. **Batch dimension:** (1, 3, 224, 224)

**Example:**
```python
normalized = (image / 255.0 - mean) / std
input_chw = np.transpose(normalized, (2, 0, 1))
input_batch = np.expand_dims(input_chw, 0)
```

## ⚠️ Important Notes

### Expo Go Limitation
- **ONNX Runtime does NOT work in Expo Go**
- Must use:
  - Development client (`expo run:android`)
  - EAS Build (standalone)
  - Expo Dev Client

### Class Order
- Class indices are **alphabetically sorted**
- Order is critical for correct predictions
- Always use `warning_lights_classes.json` for mapping

### Output Format
- Model outputs **logits** (not probabilities)
- Apply softmax for confidence scores:
  ```python
  import numpy as np
  probs = np.exp(logits) / np.sum(np.exp(logits))
  ```

## 📦 Package for Mobile

To use in React Native app:

1. Copy files:
   ```bash
   cp models/onnx/warning_lights_resnet50.onnx <app>/assets/models/
   cp models/onnx/warning_lights_classes.json <app>/assets/models/
   ```

2. Install ONNX Runtime:
   ```bash
   npm install onnxruntime-react-native
   ```

3. Build with dev client or EAS

## 🐛 Troubleshooting

**Issue:** "Module onnx is not installed"
```bash
pip install onnx onnxruntime
```

**Issue:** "Model file not found"
- Check path is relative to execution directory
- Use absolute paths in production

**Issue:** "Wrong output shape"
- Verify input preprocessing (especially normalization)
- Check CHW vs HWC format

**Issue:** "Low accuracy on new images"
- Ensure same preprocessing as training
- Check if images are similar to training data (dashboard photos)
- Model trained on cropped warning lights, not full dashboards

## 📊 Metrics Summary

**Confusion Matrix Analysis:**
- Best performance: brake (631 samples, 98% acc)
- Good performance: check_engine (485 samples, 96% acc)
- Lower samples classes: still >90% acc due to ResNet50 power

**Per-Class Distribution (Top 10):**
1. brake: 631 samples
2. check_engine: 485
3. Battery: 391
4. seatbelt: 386
5. oil_pressure: 323
6. tire_pressure: 299
7. Airbag: 288
8. ABS: 287
9. slip: 257
10. open_door: 189

## 📧 Support

For issues or questions:
- Check preprocessing steps first
- Verify ONNX Runtime installation
- Ensure correct class order from JSON

## 📄 License

Model trained on Roboflow dataset (CC BY 4.0)

---

**Generated:** January 3, 2026  
**Model Version:** 1.0  
**Framework:** PyTorch → ONNX  
**Accuracy:** 96.58% (validation), 94.31% (test)
