# Vehicle Warning Lights Classifier - Quick Start Guide

## 🚀 5-Minute Setup

### 1. Extract Package
```bash
# Extract to your desired location
unzip vehicle_warning_lights_package.zip
cd vehicle_warning_lights_package
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Test Inference
```bash
cd inference
python predict.py --image path/to/your/warning_light.jpg
```

**Done!** 🎉

---

## 📦 Package Contents

```
vehicle_warning_lights_package/
├── README.md                          # Main documentation
├── MODEL_DETAILS.md                   # Architecture & training details
├── USAGE_EXAMPLES.md                  # Code examples & tutorials
├── QUICKSTART.md                      # This file
├── requirements.txt                   # Python dependencies
│
├── model/
│   ├── best_epoch_57_acc_96.58.pth   # PyTorch checkpoint (93.7 MB)
│   ├── warning_lights_resnet50.onnx  # ONNX export (93.7 MB)
│   └── model_architecture.py         # Model class definition
│
├── classes/
│   └── warning_light_classes.json    # 68 class names (alphabetically sorted)
│
├── training/
│   └── train_model.py                # Standalone training script
│
├── inference/
│   ├── predict.py                    # Easy inference script
│   └── export_onnx.py                # PyTorch → ONNX converter
│
└── results/
    ├── training_20260103_111934.png  # Training curves
    └── report_20260103_111934.json   # Detailed metrics
```

---

## 🎯 Common Use Cases

### 1. Classify a Warning Light

```bash
cd inference
python predict.py --image dashboard.jpg
```

**Output**:
```
Predicting: dashboard.jpg
============================================================
1. check_engine                    98.75%
2. tire_pressure                    0.82%
3. oil_pressure                     0.31%
============================================================
```

### 2. Batch Process Images

```python
from predict import WarningLightClassifier

classifier = WarningLightClassifier(
    checkpoint_path='../model/best_epoch_57_acc_96.58.pth',
    classes_path='../classes/warning_light_classes.json'
)

# Process all images in folder
import glob
images = glob.glob('test_images/*.jpg')
results = classifier.predict_batch(images)
```

### 3. Export to ONNX (Mobile)

```bash
cd inference
python export_onnx.py \
    --checkpoint ../model/best_epoch_57_acc_96.58.pth \
    --output ../model/my_model.onnx
```

### 4. Retrain on Custom Data

```python
# Edit training/train_model.py
class TrainingConfig:
    TRAIN_DIR = "path/to/your/train"
    VAL_DIR = "path/to/your/val"
    NUM_CLASSES = 68  # Update if different

# Run training
cd training
python train_model.py
```

---

## 📊 Model Performance

| Metric | Value |
|--------|-------|
| **Validation Accuracy** | **96.58%** |
| **Test Accuracy** | **94.31%** |
| Parameters | 24.6M |
| Model Size | 93.7 MB |
| Inference Speed (GTX 1070) | 12 ms/image |

**Best Checkpoint**: Epoch 57/77

---

## 🛠️ System Requirements

### Minimum
- **Python**: 3.8+
- **RAM**: 4 GB
- **Storage**: 500 MB
- **OS**: Linux, macOS, Windows

### Recommended
- **Python**: 3.10+
- **GPU**: NVIDIA with 4GB+ VRAM (GTX 1060+)
- **CUDA**: 11.8+ (for GPU acceleration)
- **RAM**: 8 GB
- **Storage**: 1 GB

---

## 📚 Documentation Overview

| File | Description | When to Read |
|------|-------------|--------------|
| **README.md** | Complete package overview | Start here |
| **QUICKSTART.md** | 5-minute setup guide | You're reading it! |
| **MODEL_DETAILS.md** | Architecture, training, hyperparameters | Understanding the model |
| **USAGE_EXAMPLES.md** | Code examples, mobile deployment | Implementing inference |

---

## 🔧 Troubleshooting

### "ModuleNotFoundError: No module named 'torch'"
```bash
pip install -r requirements.txt
```

### "CUDA out of memory"
Reduce batch size in training config:
```python
BATCH_SIZE = 32  # or 16
```

### "Model predictions are wrong"
Check preprocessing:
```python
# MUST use ImageNet normalization
transforms.Normalize(
    mean=[0.485, 0.456, 0.406],
    std=[0.229, 0.224, 0.225]
)
```

### Mobile predictions show low confidence (<1%)
Missing normalization in mobile app! See [USAGE_EXAMPLES.md](USAGE_EXAMPLES.md#mobile-deployment)

---

## 🚀 Next Steps

1. ✅ **Test inference**: `python inference/predict.py --image test.jpg`
2. 📖 **Read MODEL_DETAILS.md**: Understand how the model works
3. 💻 **Try USAGE_EXAMPLES.md**: Code examples for your use case
4. 🔄 **Retrain on your data**: Customize for your specific needs

---

## 📞 Support

- **Documentation**: Read all `.md` files in this package
- **Issues**: Check troubleshooting sections
- **Dataset**: [Roboflow Dashboard Warnings](https://universe.roboflow.com/dashboard-dxss7/dashboard-dxss7-4fyet)

---

## 📄 License

MIT License - Free for commercial and research use

**Model**: MIT  
**Dataset**: Roboflow CC BY 4.0

---

**Package Version**: 1.0  
**Release Date**: January 6, 2026  
**Model Checkpoint**: best_epoch_57_acc_96.58.pth (Epoch 57, Val Acc 96.58%)

---

**🎉 Happy Classifying!**
